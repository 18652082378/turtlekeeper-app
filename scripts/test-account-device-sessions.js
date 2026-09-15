const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const extract = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
async function main() {
  const storage = new Map();
  const makeClient = platform => {
    const ctx = { crypto, window: { Capacitor: { isNativePlatform: () => platform !== 'web', getPlatform: () => platform } },
      localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
    vm.createContext(ctx);
    vm.runInContext(extract('let accountInstallationId', 'async function submitAccount('), ctx);
    return ctx;
  };
  const android = makeClient('android');
  const first = android.accountDeviceIdentity();
  assert.equal(first.devicePlatform, 'android');
  assert.match(first.deviceId, /^[A-Za-z0-9_-]{16,128}$/);
  assert.equal(android.accountDeviceIdentity().deviceId, first.deviceId);
  assert.equal(makeClient('android').accountDeviceIdentity().deviceId, first.deviceId, 'Cold restart reuses the installation ID');
  assert.equal(makeClient('ios').accountDeviceIdentity().devicePlatform, 'ios');
  assert.equal(makeClient('web').accountDeviceIdentity().devicePlatform, 'web');

  let cleared = 0;
  const ctx = { window: { TURTLE_API_BASE_URL: '' }, state: { loggedInPhone: 'same-account' },
    currentCloudToken: () => 'new-token', clearExpiredCloudSession: () => cleared++,
    AbortController, setTimeout, clearTimeout,
    fetch: async () => ({ status: 401, ok: false, json: async () => ({ ok: false, message: 'expired' }) }) };
  vm.createContext(ctx);
  vm.runInContext(extract('async function apiPost(', 'let appAnalyticsSessionId'), ctx);
  for (const payload of [{ phone: 'same-account', token: 'old-token' }, { phone: 'other-account', token: 'new-token' }]) {
    await assert.rejects(ctx.apiPost('/api/market/list', payload));
  }
  await assert.rejects(ctx.apiPost('/api/account/login', { phone: 'same-account', password: 'incorrect' }));
  assert.equal(cleared, 0, 'Late old requests, another account, or a wrong password cannot clear the current session');
  await assert.rejects(ctx.apiPost('/api/community/list', { phone: 'same-account', token: 'new-token' }));
  assert.equal(cleared, 1, 'A genuinely expired active credential is still cleared');
  console.log('Device identity and login-race regression passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
