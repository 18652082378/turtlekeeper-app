'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createWeatherProvider, lookup } = require('../server/weatherkit-provider');
const { configure } = require('./configure-weatherkit.cjs');
const W = require('../server/weather-reminders');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output/weather-reminders');
fs.mkdirSync(output, { recursive: true });
const dir = fs.mkdtempSync(path.join(output, 'weatherkit-')), results = [];
const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const keyFile = path.join(dir, 'synthetic.p8'); fs.writeFileSync(keyFile, pem);
const env = { WEATHERKIT_TEAM_ID: 'TEAM123456', WEATHERKIT_KEY_ID: 'KEY1234567', WEATHERKIT_SERVICE_ID: 'com.turtlekeeper.weather', WEATHERKIT_KEY_PATH: keyFile };
const days = Array.from({ length: 10 }, (_, i) => ({ forecastStart: W.futureDate('2026-10-07', i) + 'T00:00:00+08:00', temperatureMin: i === 7 ? 12 : 18 }));
const reply = () => ({ ok: true, text: async () => JSON.stringify({ forecastDaily: { metadata: { expireTime: '2026-10-08T12:00:00Z' }, days } }) });
async function check(name, run) { try { await run(); results.push({ name, pass: true }); console.log('PASS ' + name); } catch (e) { results.push({ name, pass: false, error: e.stack }); console.error('FAIL ' + name + ': ' + e.message); } }
(async () => {
  await check('local cities support Chinese, ID, pinyin and nearby choices without credentials or network', async () => {
    const sh = (await lookup('上海'))[0]; assert.equal(sh.name, '上海市'); assert.equal(sh.province, '上海市'); assert.equal((await lookup(sh.id))[0].id, sh.id);
    assert.equal((await lookup('Shanghai'))[0].id, sh.id); const nearby = await lookup('121.47,31.23'); assert.equal(nearby[0].province, '上海市'); assert.ok(nearby.some(c => c.id === sh.id));
    assert.ok((await lookup('深圳'))[0].name.includes('深圳')); assert.deepEqual(await lookup('never-a-real-city'), []); await assert.rejects(lookup('181,95'), /无效/);
    const p = createWeatherProvider({ env: {} }); assert.equal(p.configured(), false); assert.equal((await p.lookup('北京'))[0].name, '北京市'); await assert.rejects(p.forecast(sh), /尚未配置/);
  });
  await check('Apple ES256 JWT signature and required claims, future day 7, coarse coordinates and shared cache', async () => {
    let time = new Date('2026-10-07T10:00:00Z'); const calls = [];
    const p = createWeatherProvider({ env, now: () => time, fetcher: async (url, options) => { calls.push({ url, options }); return reply(); } });
    const city = { latitude: 31.234567, longitude: 121.473456 };
    const forecasts = await Promise.all([p.forecast(city), p.forecast(city)]); await p.forecast(city); assert.equal(calls.length, 1);
    assert.match(calls[0].url, /^https:\/\/weatherkit.apple.com\/api\/v1\/weather\/zh-Hans\/31.23\/121.47\?dataSets=forecastDaily/);
    assert.doesNotMatch(calls[0].url, /TEAM|KEY|token/); assert.equal(forecasts[0].days.find(d => d.date === '2026-10-14').minimum, 12);
    const parts = calls[0].options.headers.Authorization.slice(7).split('.'), header = JSON.parse(Buffer.from(parts[0], 'base64url')), payload = JSON.parse(Buffer.from(parts[1], 'base64url'));
    assert.deepEqual(header, { alg: 'ES256', kid: env.WEATHERKIT_KEY_ID, id: env.WEATHERKIT_TEAM_ID + '.' + env.WEATHERKIT_SERVICE_ID }); assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'iss', 'sub']); assert.equal(payload.sub, env.WEATHERKIT_SERVICE_ID);
    assert.equal(Buffer.from(parts[2], 'base64url').length, 64); assert.equal(crypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), { key: keys.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url')), true);
    time = new Date('2026-10-07T10:31:00Z'); await p.forecast(city); assert.equal(calls.length, 2); assert.notEqual(calls[0].options.headers.Authorization, calls[1].options.headers.Authorization);
  });
  await check('Apple failure, expiry and malformed response never become a normal forecast; backoff avoids rapid retry', async () => {
    for (const response of [{ ok: false, status: 401 }, { ok: true, text: async () => '{}' }, { ok: true, text: async () => JSON.stringify({ forecastDaily: { metadata: { expireTime: '2026-10-06T00:00:00Z' }, days } }) }]) {
      let count = 0; const p = createWeatherProvider({ env, now: () => new Date('2026-10-07T10:00:00Z'), fetcher: async () => { count++; return response; } });
      await assert.rejects(p.forecast({ latitude: 31, longitude: 121 })); await assert.rejects(p.forecast({ latitude: 31, longitude: 121 })); assert.equal(count, 1);
    }
    const old = { weatherReminder: { ...W.defaults, enabled: true } }; assert.equal(W.publicWeather(old).settings.enabled, false);
  });
  await check('server setup verifies Apple response before saving; failed setup preserves existing env and APNs', async () => {
    const serverRoot = path.join(dir, 'project'); fs.mkdirSync(path.join(serverRoot, 'server'), { recursive: true });
    const file = path.join(serverRoot, 'server/.env'), original = 'APNS_KEY_ID=KEEP\nPORT=8787\n'; fs.writeFileSync(file, original);
    const input = { ...env, WEATHERKIT_KEY_INPUT: Buffer.from(pem).toString('base64') };
    await assert.rejects(configure({ root: serverRoot, input, fetcher: async () => ({ ok: false, status: 401 }), log: () => {} }), /认证失败/); assert.equal(fs.readFileSync(file, 'utf8'), original); assert.deepEqual(fs.readdirSync(path.join(serverRoot, 'server/keys')), []);
    const result = await configure({ root: serverRoot, input, fetcher: async () => ({ ok: true, text: async () => JSON.stringify({ forecastDaily: { days } }) }), log: () => {} }); assert.equal(result.configured, true);
    const saved = fs.readFileSync(file, 'utf8'); assert.ok(saved.startsWith(original)); assert.match(saved, /WEATHERKIT_SERVICE_ID=com.turtlekeeper.weather/); assert.doesNotMatch(saved, /PRIVATE KEY|WEATHERKIT_KEY_INPUT/); assert.equal(fs.readFileSync(path.join(serverRoot, 'server/keys/weatherkit-KEY1234567.p8'), 'utf8'), pem);
  });
  fs.writeFileSync(path.join(output, 'weatherkit-tests.json'), JSON.stringify(results, null, 2)); if (results.some(r => !r.pass)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
