'use strict';
const fs = require('node:fs'), path = require('node:path'), net = require('node:net'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
(async () => {
  const runtime = fs.mkdtempSync(path.join(root, 'output/weather-reminders/api-'));
  fs.mkdirSync(path.join(runtime, 'data'));
  const token = 'synthetic-weather-api-token', phone = '13900001234';
  fs.writeFileSync(path.join(runtime, 'data/app-data.json'), JSON.stringify({ users: { [phone]: { phone, tokens: [{ hash: crypto.createHash('sha256').update(token).digest('hex') }], data: {} } } }));
  const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  let output = '';
  const child = spawn(process.execPath, ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TURTLE_RUNTIME_DIR: runtime, MYSQL_URL: '', MYSQL_HOST: '', OSS_REGION: '', APNS_TEAM_ID: '', APNS_KEY_ID: '', APNS_KEY_PATH: '', APNS_KEY_BASE64: '', QWEATHER_API_HOST: '', QWEATHER_API_KEY: '', QWEATHER_KEY_ID: '', QWEATHER_PROJECT_ID: '', QWEATHER_DEVELOPER_ID: '', QWEATHER_PRIVATE_KEY_PATH: '', WEATHERKIT_TEAM_ID: '', WEATHERKIT_KEY_ID: '', WEATHERKIT_SERVICE_ID: '', WEATHERKIT_KEY_PATH: '', SMS_PROVIDER: 'mock' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
  async function post(route, body = {}) { const r = await fetch(`http://127.0.0.1:${port}/api/weather/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) }); return { status: r.status, body: await r.json() }; }
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) { try { await post('settings'); ready = true; break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    assert.equal(ready, true, output);
    for (const route of ['settings', 'locations', 'save']) assert.equal((await post(route)).status, 401);
    const auth = { phone, token }; const own = await post('settings', auth);
    assert.equal(own.status, 200); assert.equal(own.body.settings.remindTime, '18:00'); assert.equal(own.body.providerConfigured, false); assert.equal(own.body.pushConfigured, false);
    assert.equal((await post('save', { ...auth, settings: { enabled: true }, weatherConsent: true })).status, 503);
    assert.equal((await post('save', { ...auth, settings: { advanceDays: 8 } })).status, 400);
    assert.equal((await post('save', { ...auth, settings: { advanceDays: -1 } })).status, 400);
    const off = await post('save', { ...auth, settings: { enabled: false, targetTemperature: 25, difference: 5, remindTime: '09:15', advanceDays: 7 } }); assert.equal(off.status, 200);
    const saved = await post('settings', auth); assert.equal(saved.body.settings.remindTime, '09:15'); assert.equal(saved.body.settings.advanceDays, 7);
    const disk = JSON.parse(fs.readFileSync(path.join(runtime, 'data/app-data.json'), 'utf8')); assert.equal(disk.users[phone].weatherReminder.difference, 5);
    const today = await post('save', { ...auth, settings: { enabled: false, targetTemperature: 25, difference: 5, remindTime: '07:30', advanceDays: 0 } });
    assert.equal(today.status, 200); assert.equal(today.body.settings.advanceDays, 0);
    const reload = await post('settings', auth); assert.equal(reload.body.settings.advanceDays, 0); assert.equal(reload.body.settings.remindTime, '07:30');
    assert.equal(JSON.parse(fs.readFileSync(path.join(runtime, 'data/app-data.json'), 'utf8')).users[phone].weatherReminder.advanceDays, 0);
    assert.equal((await post('settings', { phone: '13900009999', token })).status, 401);
    assert.doesNotMatch(JSON.stringify(saved.body), /synthetic-weather-api-token|WEATHERKIT_KEY|QWEATHER/);
    assert.equal(saved.body.attribution.source, 'Apple Weather');
    const localCities = await post('locations', { ...auth, weatherConsent: true, query: '上海' }); assert.equal(localCities.status, 200); assert.equal(localCities.body.locations[0].name, '上海市');
    console.log('PASS isolated HTTP authentication, persistence, defaults, validation and unconfigured provider');
    fs.writeFileSync(path.join(root, 'output/weather-reminders/api-tests.json'), JSON.stringify({ pass: true, environment: 'isolated localhost server and synthetic account; no external weather or APNs requests' }, null, 2));
  } finally { child.kill(); await new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); setTimeout(resolve, 5000).unref(); }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
