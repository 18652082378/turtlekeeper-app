// Execute the real lifecycle functions with synthetic records and a controlled clock.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
const slice = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b);
};
const DAY = 86400000, NOW = Date.parse('2026-10-21T00:00:00Z');
const iso = ago => new Date(NOW - ago).toISOString();
const db = { marketListings: [], users: { owner: { phone: 'owner' } } };
let writes = 0;
class Clock extends Date { static now() { return NOW; } constructor(...args) { super(...(args.length ? args : [NOW])); } }
const ctx = {
  Date: Clock, readJson: async body => body, readDatabase: () => db,
  requireReviewUser: (_, body, res) => {
    if (body.token !== 'synthetic') { res.status = 401; return null; }
    return { phone: body.phone };
  },
  sendJson: (res, status, json) => { res.status = status; return json; },
  writeDatabase: () => { writes++; }, isAdminUser: user => user?.phone === 'admin',
  isMarketProhibitedSpecies: code => code === 'restricted', marketSpeciesRestrictionMessage: () => 'restricted',
  publicMarketListings: db => db.marketListings.filter(item => item.status === 'active').sort((a, b) => Date.parse(b.refreshedAt) - Date.parse(a.refreshedAt)),
  ownMarketListings: (db, user) => db.marketListings.filter(item => item.sellerPhoneRaw === user.phone)
};
vm.createContext(ctx);
vm.runInContext(slice('const MARKET_REFRESH_WINDOW_MS', 'function autoOfflineRestrictedMarketListings') +
  slice('async function handleMarketConfirm(', 'async function handleMarketOffline('), ctx);
const item = (id, ago, extra = {}) => ({ id, status: 'active', sellerPhoneRaw: 'owner', refreshedAt: iso(ago), createdAt: iso(ago), ...extra });
(async () => {
  assert.equal(ctx.marketAvailabilityMeta(item('new', 0), NOW).needsConfirmation, false);
  assert.equal(ctx.marketAvailabilityMeta(item('before7', 7 * DAY - 1), NOW).needsConfirmation, false);
  assert.equal(ctx.marketAvailabilityMeta(item('at7', 7 * DAY), NOW).needsConfirmation, true);
  const recent = item('confirmed', 40 * DAY, { confirmedAt: iso(DAY) });
  assert.equal(ctx.marketAvailabilityMeta(recent, NOW).needsConfirmation, false);
  assert.equal(ctx.marketAvailabilityMeta(item('fallback', 8 * DAY, { confirmedAt: 'invalid' }), NOW).confirmedAt, iso(8 * DAY));
  const invalid = item('unknown-date', 0, { refreshedAt: '', createdAt: 'invalid' });
  assert.equal(ctx.marketAvailabilityMeta(invalid, NOW).expiresAt, '');
  assert.equal(ctx.marketAvailabilityMeta(invalid, NOW).needsConfirmation, true);
  db.marketListings = [item('7days', 7 * DAY), item('before30', 30 * DAY - 1), item('at30', 30 * DAY),
    item('older', 31 * DAY), recent, invalid, item('already-offline', 8 * DAY, { status: 'inactive', offlineReason: 'stale' }),
    item('sold', 40 * DAY, { status: 'sold' })];
  assert.equal(ctx.autoOfflineStaleMarketListings(db, NOW), true);
  assert.deepEqual(db.marketListings.filter(x => x.status === 'inactive').map(x => x.id), ['at30', 'older', 'already-offline']);
  assert.equal(ctx.autoOfflineStaleMarketListings(db, NOW), false, 'idempotent expiry');
  assert.equal(db.marketListings.find(x => x.id === 'at30').offlineAt, iso(0));
  const beforeRanking = ctx.publicMarketListings(db).map(x => x.id);
  const res = {};
  const call = (id, phone = 'owner', token = 'synthetic') => ctx.handleMarketConfirm({ listingId: id, phone, token }, res);
  await call('7days', 'other'); assert.equal(res.status, 403);
  await call('7days', 'owner', 'wrong'); assert.equal(res.status, 401);
  await call('missing'); assert.equal(res.status, 404);
  await call('sold'); assert.equal(res.status, 400);
  assert.equal(writes, 0);
  const original = structuredClone(db.marketListings[0]);
  await call('7days'); assert.equal(res.status, 200);
  assert.equal(db.marketListings[0].confirmedAt, iso(0));
  assert.equal(db.marketListings[0].refreshedAt, original.refreshedAt);
  assert.equal(db.marketListings[0].manualRefreshedAt, undefined);
  assert.deepEqual(ctx.publicMarketListings(db).map(x => x.id), beforeRanking, 'confirmation cannot boost ranking');
  assert.equal(ctx.marketAvailabilityMeta(db.marketListings[0], NOW).expiresAt, new Date(NOW + 30 * DAY).toISOString());
  await call('at30'); assert.equal(res.status, 200); // Explicit relisting, no automatic revival.
  assert.equal(db.marketListings.find(x => x.id === 'at30').refreshedAt, iso(30 * DAY));
  const manual = item('manual', DAY, { status: 'inactive', offlineReason: 'manual' });
  const report = item('report', DAY, { status: 'inactive', offlineReason: 'report' });
  const restricted = item('restricted', DAY, { speciesCode: 'restricted' });
  db.marketListings.push(manual, report, restricted);
  await call('manual'); assert.equal(res.status, 200);
  await call('report'); assert.equal(res.status, 400); assert.equal(report.status, 'inactive');
  await call('restricted'); assert.equal(res.status, 400);
  await ctx.handleMarketRefresh({ listingId: '7days', phone: 'owner', token: 'synthetic' }, res);
  assert.equal(res.status, 200, 'confirmation does not consume refresh quota');
  assert.equal(db.marketListings[0].confirmedAt, db.marketListings[0].refreshedAt);
  await call('7days'); assert.equal(res.status, 200, 'confirmation is allowed during refresh cooldown');
  await ctx.handleMarketRefresh({ listingId: '7days', phone: 'owner', token: 'synthetic' }, res);
  assert.equal(res.status, 429, 'confirmation does not reset refresh quota');
  console.log('Market availability passed: 7/30 day boundaries, legacy dates, no revival, ownership, sold/restricted/moderated records, unchanged ranking and refresh quota.');
})().catch(error => { console.error(error); process.exitCode = 1; });
