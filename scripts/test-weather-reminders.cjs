'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const W = require('../server/weather-reminders');
const city = { id: '101020100', name: '上海市', province: '上海市', city: '上海市', latitude: 31.23, longitude: 121.47, timezone: 'Asia/Shanghai' };
const results = [];
async function check(name, run) { try { await run(); results.push({ name, pass: true }); console.log('PASS ' + name); } catch (e) { results.push({ name, pass: false, error: e.stack }); console.error('FAIL ' + name + ': ' + e.message); } }
function rig({ settings = {}, stamp = '2026-10-07T10:00:00Z', minimum = 16, configured = true } = {}) {
  let time = new Date(stamp), db = { users: { a: { phone: 'a', weatherConsentProvider: 'apple-weather', weatherReminder: { ...W.defaults, enabled: true, location: city, ...settings }, pushDevices: [{ token: 'device' }], data: { turtles: [{ id: 'keep' }] } }, b: { phone: 'b', data: { notes: [] } } } };
  const calls = [], sends = [];
  let getForecast = async () => ({ days: Array.from({ length: 8 }, (_, i) => ({ date: W.futureDate(W.clock(time).date, i), minimum: i === 0 ? -20 : minimum })), fetchedAt: time.toISOString() });
  let sender = async (token, payload) => { sends.push({ token, payload }); return { ok: true }; };
  const params = { read: () => structuredClone(db), write: value => { db = structuredClone(value); }, configured: () => configured,
    devices: u => u.pushDevices || [], provider: { configured: () => true, forecast: async l => { calls.push(l); return getForecast(l); } },
    send: (t, p) => sender(t, p), now: () => time };
  return { dispatch: W.createWeatherDispatcher(params), restart: () => W.createWeatherDispatcher(params), get: () => db, edit: fn => fn(db), calls, sends, time: value => { time = new Date(value); }, forecast: fn => { getForecast = fn; }, sender: fn => { sender = fn; } };
}
(async () => {
  await check('defaults, threshold and date arithmetic across year boundary', () => {
    assert.equal(W.defaults.remindTime, '18:00'); assert.equal(W.defaults.advanceDays, 1);
    assert.equal(W.futureDate('2026-12-31', 1), '2027-01-01'); assert.equal(W.futureDate('2028-02-28', 1), '2028-02-29');
    assert.equal(W.matches(W.normalizeSettings({}), 17), true); assert.equal(W.matches(W.normalizeSettings({}), 17.1), false); assert.equal(W.matches(W.normalizeSettings({}), -10), true);
    assert.equal(W.normalizeSettings({ advanceDays: 0 }).advanceDays, 0);
    for (const patch of [{ advanceDays: -1 }, { advanceDays: 1.5 }, { advanceDays: '0' }, { advanceDays: 8 }, { difference: 0 }, { difference: 1.5 }, { remindTime: '24:00' }, { enabled: 'true' }, { targetTemperature: null }, { targetTemperature: 80 }]) assert.throws(() => W.normalizeSettings(patch));
  });
  await check('tomorrow low triggers exact user copy, never today low', async () => {
    const r = rig(); await r.dispatch(); assert.equal(r.sends.length, 1);
    assert.equal(r.sends[0].payload.aps.alert.body, '龟友手账提醒您：明天上海市预计最低气温为16℃，与预设温度相差4℃，请提前做好准备。');
    assert.equal(r.sends[0].payload.route, 'weather'); assert.equal(r.get().users.a.weatherNotices[0].forecastDate, '2026-10-08');
    const warm = rig({ minimum: 25 }); await warm.dispatch(); assert.equal(warm.sends.length, 0); assert.equal(warm.get().users.a.weatherLastCheck.status, 'normal');
  });
  await check('all 0 to 7 day offsets select today or their future date including day 7', async () => {
    for (let days = 0; days <= 7; days++) { const r = rig({ settings: { advanceDays: days } }); await r.dispatch(); assert.equal(r.sends[0].payload.forecastDate, W.futureDate('2026-10-07', days)); if (days === 0) assert.match(r.sends[0].payload.aps.alert.body, /今天/); if (days === 2) assert.match(r.sends[0].payload.aps.alert.body, /后天/); if (days >= 3) assert.match(r.sends[0].payload.aps.alert.body, new RegExp(`10月${7 + days}日`)); }
  });
  await check('same-day reminder uses Shanghai today, custom time and today wording; restart does not duplicate', async () => {
    const r = rig({ settings: { advanceDays: 0, remindTime: '00:05' }, stamp: '2026-10-06T16:05:00Z' });
    r.forecast(async () => ({ days: [{ date: '2026-10-07', minimum: 16 }, { date: '2026-10-08', minimum: -20 }], fetchedAt: '2026-10-06T16:05:00Z' }));
    await r.dispatch(); await r.restart()();
    assert.equal(r.sends.length, 1);
    assert.equal(r.sends[0].payload.forecastDate, '2026-10-07');
    assert.equal(r.sends[0].payload.aps.alert.body, '龟友手账提醒您：今天上海市预计最低气温为16℃，与预设温度相差4℃，请提前做好准备。');
    const warm = rig({ settings: { advanceDays: 0 } });
    warm.forecast(async () => ({ days: [{ date: '2026-10-07', minimum: 25 }, { date: '2026-10-08', minimum: -20 }], fetchedAt: '2026-10-07T10:00:00Z' }));
    await warm.dispatch(); assert.equal(warm.sends.length, 0); assert.equal(warm.get().users.a.weatherLastCheck.forecastDate, '2026-10-07');
  });
  await check('custom time, before schedule, recovery and expired window', async () => {
    const early = rig({ stamp: '2026-10-07T09:59:00Z' }); await early.dispatch(); assert.equal(early.calls.length, 0);
    const late = rig({ stamp: '2026-10-07T10:15:00Z' }); await late.dispatch(); assert.equal(late.sends.length, 1);
    const expired = rig({ stamp: '2026-10-07T10:16:00Z' }); await expired.dispatch(); assert.equal(expired.calls.length, 0);
    const custom = rig({ settings: { remindTime: '07:30' }, stamp: '2026-10-06T23:30:00Z' }); await custom.dispatch(); assert.equal(custom.sends.length, 1);
  });
  await check('dedup survives restart, time and threshold changes', async () => {
    const r = rig(); await Promise.all([r.dispatch(), r.dispatch()]); await r.restart()();
    r.edit(db => { db.users.a.weatherReminder.remindTime = '18:01'; db.users.a.weatherReminder.targetTemperature = 30; }); r.time('2026-10-07T10:01:00Z'); await r.restart()(); assert.equal(r.sends.length, 1);
  });
  await check('disabled settings, no devices and absent APNs never query or send', async () => {
    const disabled = rig({ settings: { enabled: false } }); await disabled.dispatch(); assert.equal(disabled.calls.length, 0);
    const noDevice = rig(); noDevice.edit(db => { db.users.a.pushDevices = []; }); await noDevice.dispatch(); assert.equal(noDevice.calls.length, 0);
    const noPush = rig({ configured: false }); await noPush.dispatch(); assert.equal(noPush.calls.length, 0);
    const previousProvider = rig(); previousProvider.edit(db => { delete db.users.a.weatherConsentProvider; }); await previousProvider.dispatch(); assert.equal(previousProvider.calls.length, 0);
  });
  await check('normal forecast is cached per settings revision, changed threshold is checked again', async () => {
    const r = rig({ minimum: 18 });
    await r.dispatch(); await r.restart()(); assert.equal(r.calls.length, 1); assert.equal(r.sends.length, 0);
    r.edit(db => { db.users.a.weatherReminder.targetTemperature = 22; });
    await r.dispatch(); assert.equal(r.calls.length, 2); assert.equal(r.sends.length, 1);
  });
  await check('missing future day, stale forecast and failure are unavailable, never normal', async () => {
    for (const fn of [async () => { throw Error('offline'); }, async () => ({ days: [], fetchedAt: '2026-10-07T10:00:00Z' }), async () => ({ days: [{ date: '2026-10-08', minimum: 5 }], fetchedAt: '2026-10-07T08:00:00Z' })]) {
      const r = rig(); r.forecast(fn); await r.dispatch(); assert.equal(r.sends.length, 0); assert.equal(r.get().users.a.weatherLastCheck.status, 'unavailable');
    }
  });
  await check('forecast await preserves other account writes and cancels disabled/deleted recipients', async () => {
    for (const remove of [false, true]) {
      const r = rig(); r.forecast(async () => { r.edit(db => { db.users.b.data.notes.push('during fetch'); if (remove) delete db.users.a; else db.users.a.weatherReminder.enabled = false; }); return { days: [{ date: '2026-10-08', minimum: 5 }], fetchedAt: '2026-10-07T10:00:00Z' }; });
      await r.dispatch(); assert.equal(r.sends.length, 0); assert.deepEqual(r.get().users.b.data.notes, ['during fetch']);
    }
    const r = rig(); r.sender(async () => { r.edit(db => db.users.b.data.notes.push('during push')); return { ok: true }; }); await r.dispatch(); assert.deepEqual(r.get().users.b.data.notes, ['during push']);
  });
  await check('ambiguous APNs error records one attempt without duplicate retry', async () => {
    const r = rig(); let count = 0; r.sender(async () => { count++; throw Error('timeout'); }); await r.dispatch(); await r.restart()(); assert.equal(count, 1); assert.equal(r.get().users.a.weatherLastCheck.status, 'failed'); assert.equal(r.get().users.a.data.turtles[0].id, 'keep');
  });
  await check('authenticated settings handler validates consent, forged city and concurrent saves', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
    const start = source.indexOf('async function handleWeatherReminder('), code = source.slice(start, source.indexOf('\nasync function handleCommunityAdminAction', start));
    let db = { users: { a: { phone: 'a', data: { turtles: ['retain'] } }, b: { phone: 'b', weatherReminder: { ...W.defaults, location: { ...city, name: '别人的地点' } } } } }, body, response, lookupHook;
    const ctx = vm.createContext({ Date, String, Object, Map, normalizeWeatherSettings: W.normalizeSettings, publicWeather: W.publicWeather,
      readJson: async () => body, readDatabase: () => structuredClone(db), writeDatabase: value => { db = structuredClone(value); },
      sendJson: (_, status, data) => { response = { status, data }; }, requireReviewUser: (db, body, res) => { if (body.token === 'valid' && db.users[body.phone]) return db.users[body.phone]; response = { status: 401 }; }, authenticate: (db, phone, token) => token === 'valid' && db.users[phone],
      weatherRequestLimits: new Map(), apnsConfigured: () => true, normalizedPushDevices: () => [], weatherProvider: { configured: () => true, lookup: async id => { lookupHook?.(); return id === city.id ? [city] : []; } } });
    vm.runInContext(code, ctx);
    const call = async (action, b) => { body = b; response = null; await ctx.handleWeatherReminder({}, {}, action); return response; };
    assert.equal((await call('settings', { phone: 'a', token: 'bad' })).status, 401);
    const own = await call('settings', { phone: 'a', token: 'valid' }); assert.equal(own.data.settings.location, null);
    const base = { phone: 'a', token: 'valid', settings: { ...W.defaults, enabled: true, locationId: city.id, location: { name: 'forged' } } };
    assert.equal((await call('save', base)).status, 400);
    const good = await call('save', { ...base, weatherConsent: true }); assert.equal(good.data.settings.location.name, '上海市'); assert.deepEqual(db.users.a.data.turtles, ['retain']);
    assert.equal((await call('locations', { phone: 'a', token: 'valid', query: '上海' })).status, 400);
    lookupHook = () => { db.users.a.weatherReminder.enabled = false; };
    const changed = await call('save', { ...base, weatherConsent: true, settings: { ...base.settings, locationId: 'another' } }); assert.equal(changed.status, 400);
    delete db.users.a.weatherReminder; lookupHook = () => { db.users.a.weatherReminder = { ...W.defaults }; };
    assert.equal((await call('save', { ...base, weatherConsent: true })).status, 409); assert.equal(db.users.a.weatherReminder.enabled, false);
  });
  fs.mkdirSync(path.join(__dirname, '../output/weather-reminders'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '../output/weather-reminders/server-tests.json'), JSON.stringify(results, null, 2));
  if (results.some(r => !r.pass)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
