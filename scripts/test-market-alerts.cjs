'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createMarketAlerts, CONSENT_VERSION, quotaAvailable, reserveQuota, deviceKey } = require('../server/market-alerts');
const { createDailyCommunityDispatcher, reviewHash } = require('../server/community-daily-push');
const { runtime } = require('./mediation-test-runtime.cjs');
const { createAndroidPush } = require('../server/android-push');
const copy = value => JSON.parse(JSON.stringify(value));
const catalog = [{ code: 'GHG', name: '果核蛋龟' }, { code: 'HNG', name: '虎泥蛋龟' }, { code: 'NO', name: '禁止交易' }];
function harness() {
  let time = Date.parse('2026-11-07T02:00:00Z'), db = { users: { buyer: { phone: 'buyer', data: { turtles: [{ speciesCode: 'GHG' }, { speciesCode: 'HNG', status: '已死亡' }] }, device: { platform: 'ios', token: 'a', sessionHash: 's' } }, seller: { phone: 'seller' } }, marketListings: [] }, writes = 0, hook;
  const sent = [], devices = user => user.device ? [user.device] : [];
  const options = { read: () => copy(db), write: async next => { writes++; if (hook) await hook(next, writes); db = copy(next); }, catalog, allowed: item => item.code !== 'NO', devices, configured: () => true,
    send: async (device, data) => { sent.push({ device, data }); return { ok: true }; }, canView: (_db, item) => !item.blocked && !item.expired, now: () => time };
  const service = createMarketAlerts(options);
  const subscribe = (enabled = true, codes = ['GHG']) => { const user = db.users.buyer; const result = service.preference(user, { enabled, speciesCodes: codes, revision: user.marketAlertSettings?.revision || 0, confirmed: true, consentVersion: CONSENT_VERSION }); return result; };
  const add = (id, extra = {}) => db.marketListings.push({ id, title: '商品' + id, speciesCode: 'GHG', sellerPhoneRaw: 'seller', status: 'active', createdAt: new Date(time - 11 * 60000).toISOString(), marketAlertPublishedAt: new Date(time - 11 * 60000).toISOString(), ...extra });
  return { service, sent, options, subscribe, add, get db() { return db; }, set db(value) { db = value; }, get time() { return time; }, advance: ms => time += ms, hook: fn => hook = fn };
}
(async () => {
  let h = harness(); h.add('historic'); await h.service.dispatch(); assert.equal(h.sent.length, 0);
  const initial = h.service.preference(h.db.users.buyer); assert.equal(initial.settings.enabled, false); assert.deepEqual(initial.suggestedSpeciesCodes, ['GHG']);
  for (const bad of [{ enabled: true, speciesCodes: ['NO'], revision: 0 }, { enabled: true, speciesCodes: ['GHG'], revision: 0 }, { enabled: true, speciesCodes: ['GHG'], revision: 10, confirmed: true, consentVersion: CONSENT_VERSION }]) assert.throws(() => h.service.preference(h.db.users.buyer, bad));
  h.subscribe(); h.advance(12 * 60000);
  h.add('1'); h.add('2'); h.add('3', { createdAt: new Date(h.time - 10.5 * 60000).toISOString(), title: '精品果核蛋龟母龟出售\n立即查看' });
  h.add('own', { sellerPhoneRaw: 'buyer' }); h.add('blocked', { blocked: true }); h.add('expired', { expired: true }); h.add('gone', { status: 'sold' }); h.add('unmarked', { marketAlertPublishedAt: undefined }); h.add('new', { marketAlertPublishedAt: new Date(h.time - 1000).toISOString() });
  await Promise.all([h.service.dispatch(), h.service.dispatch()]); assert.equal(h.sent.length, 1);
  const data = h.sent[0].data; assert.equal(data.aps.alert.title, '你关注的果核蛋龟有新上架'); assert.equal(data.aps.alert.body, '新增3条商品，精品果核蛋龟母龟出售 立即查看'); assert.equal(data.route, 'marketAlerts');
  const deliveries = [], sender = createAndroidPush({ env: { ANDROID_PUSH_APP_KEY: '12345678', ANDROID_PUSH_ACCESS_KEY_ID: 'test-id', ANDROID_PUSH_ACCESS_KEY_SECRET: 'test-secret' }, request: async body => { deliveries.push(new URLSearchParams(body)); return { ok: true }; } });
  await sender.send('device_123456789012345', { ...data, recipientId: 'buyer' });
  assert.equal(deliveries[0].get('Title'), data.aps.alert.title); assert.equal(deliveries[0].get('Body'), data.aps.alert.body); assert.equal(JSON.parse(deliveries[0].get('AndroidExtParameters')).receiptId, data.receiptId);
  assert.equal(h.service.open(h.db, h.db.users.buyer, data).listings.length, 3); assert.throws(() => h.service.open(h.db, h.db.users.seller, data), /不属于/);
  h.db.marketListings.find(x => x.id === '3').status = 'sold'; assert.equal(h.service.open(h.db, h.db.users.buyer, data).listings.length, 2);
  h.advance(3600000); await createMarketAlerts(h.options).dispatch(); assert.equal(h.sent.length, 1, 'Restart and later additions cannot bypass daily cap');
  h = harness(); h.subscribe(); h.advance(12 * 60000); h.add('wait'); h.advance(13 * 3600000); await h.service.dispatch(); assert.equal(h.sent.length, 0, 'Quiet hours');
  h = harness(); h.subscribe(); h.advance(12 * 60000); h.add('1'); h.hook(async () => { throw Error('durability failed'); }); await assert.rejects(h.service.dispatch(), /durability/); assert.equal(h.sent.length, 0);
  for (const change of ['off', 'remove', 'device', 'hours']) {
    h = harness(); h.subscribe(); h.advance(12 * 60000); h.add('1');
    h.hook(async (db, writes) => { if (writes === 2) { if (change === 'off') db.users.buyer.marketAlertSettings.enabled = false; if (change === 'remove') db.marketListings = []; if (change === 'device') db.users.buyer.device.sessionHash = 'other'; if (change === 'hours') h.advance(12 * 3600000); } });
    await h.service.dispatch(); assert.equal(h.sent.length, 0, 'Revalidate after durable await: ' + change);
  }
  h = harness(); h.subscribe(); h.advance(12 * 60000); h.add('1'); h.add('2');
  h.hook(async (db, writes) => { if (writes === 2) db.marketListings.pop(); }); await h.service.dispatch(); assert.match(h.sent[0].data.aps.alert.body, /^新增1条商品/);
  h = harness(); h.subscribe(); h.advance(12 * 60000); h.add('1');
  const failed = createMarketAlerts({ ...h.options, send: async () => { h.sent.push('failed'); return { ok: false }; } }); await failed.dispatch(); await createMarketAlerts(h.options).dispatch(); assert.equal(h.sent.length, 1, 'Failed provider attempts are not resent');
  h = harness(); h.subscribe(); h.advance(12 * 60000); h.add('1'); h.db.communityDailyDeliveries = { '2026-11-07': { postId: 'already', attempted: { [deviceKey(h.db.users.buyer.device)]: 'yes' } } }; await h.service.dispatch(); assert.equal(h.sent.length, 0, 'Legacy daily recommendation consumes shared cap');
  h = harness(); h.subscribe(); h.advance(12 * 60000); h.add('1'); await h.service.dispatch();
  const post = { id: 'post', authorPhoneRaw: 'seller', title: '小龟成长记录', content: '成长', visibility: 'public', createdAt: new Date(h.time - 60000).toISOString() }; post.dailyPushReview = { hash: reviewHash(post) }; h.db.communityPosts = [post];
  const daily = createDailyCommunityDispatcher({ ...h.options, now: () => new Date(h.time), canReceive: () => true, canRecommend: (db, user, day, campaign) => quotaAvailable(db, user, day, campaign, h.options.devices(user)), reserveRecommendation: reserveQuota });
  await daily(); assert.equal(h.sent.length, 1, 'Market first prevents community recommendation that day');
  h = harness(); h.subscribe(); h.advance(12 * 60000); h.add('1'); reserveQuota(h.db.users.buyer, '2026-11-07', 'community:2026-11-07:post'); await h.service.dispatch(); assert.equal(h.sent.length, 0);
  h = harness(); h.subscribe(false); h.advance(3600000); h.add('old'); h.subscribe(true); h.advance(11 * 60000); await h.service.dispatch(); assert.equal(h.sent.length, 0, 'Re-enable never backfills previous publications');
  for (const records of [false, true]) {
    const r = await runtime({ records });
    const post = async (action, name, body = {}) => { const res = await fetch(r.base + '/api/market/alerts/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: r.accounts[name], token: name ? r.token(name) : '', ...body }) }); return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json() }; };
    try {
      assert.equal((await post('preference', '')).status, 401);
      const register = async extra => {
        const response = await fetch(r.base + '/api/notifications/device/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: r.accounts.alice, token: r.token('alice'), deviceToken: 'a'.repeat(64), ...extra }) });
        assert.equal(response.status, 200); await response.json();
      };
      await register({ marketAlerts: true }); assert.equal(r.disk().users[r.accounts.alice].pushDevices[0].marketAlerts, true, 'New client capability is persisted');
      await register({}); assert.notEqual(r.disk().users[r.accounts.alice].pushDevices[0].marketAlerts, true, 'Old-client registration removes unsupported capability');
      const before = await post('preference', 'alice'); assert.equal(before.body.settings.enabled, false); assert.equal(before.cache, 'no-store');
      assert.equal((await post('preference', 'alice', { enabled: true, revision: 0, speciesCodes: ['GHG'] })).status, 400);
      const enabled = await post('preference', 'alice', { enabled: true, revision: 0, speciesCodes: ['GHG'], confirmed: true, consentVersion: CONSENT_VERSION }); assert.equal(enabled.status, 200); assert.equal(enabled.body.settings.enabled, true);
      assert.equal((await post('preference', 'alice', { enabled: false, revision: 0, speciesCodes: [] })).status, 409);
      assert.equal((await post('preference', 'bob')).body.settings.enabled, false);
      assert.equal((await post('open', 'bob', { receiptId: 'someone-else' })).status, 404);
      await r.stop(); await r.start(); assert.equal((await post('preference', 'alice')).body.settings.enabled, true, 'Preference persists on restart in either storage mode');
      if (records) { fs.writeFileSync(r.failFile, '1'); assert.equal((await post('preference', 'alice', { enabled: false, speciesCodes: ['GHG'], revision: 1 })).status, 500); fs.unlinkSync(r.failFile); await r.stop(); await r.start(); assert.equal((await post('preference', 'alice')).body.settings.enabled, true); }
    } finally { await r.stop(); }
  }
  console.log('PASS market alerts: explicit consent, selected species, fresh committed publications, exact payloads, exclusions, quiet hours, shared daily cap, durable at-most-once claims, restart, late opt-out/device/listing changes, receipt ownership and JSON/record API persistence. No real pushes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
