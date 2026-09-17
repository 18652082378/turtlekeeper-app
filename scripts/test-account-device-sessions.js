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
  // Media uploads must check the credentials captured when the upload began.
  let activeToken = 'old-upload-token', release;
  const uploadContext = { window: { TURTLE_API_BASE_URL: '' }, state: { loggedInPhone: 'same-account' },
    currentCloudToken: () => activeToken, clearExpiredCloudSession: () => cleared++,
    localMediaFileKind: () => 'image', localMediaUploadMimeType: () => 'image/png',
    isRetryableMediaUploadError: () => false,
    fetch: () => new Promise(resolve => { release = () => resolve({ status: 401, ok: false, json: async () => ({ ok: false, code: 'ACCOUNT_SESSION_REPLACED' }) }); }) };
  vm.createContext(uploadContext);
  vm.runInContext(extract('async function apiUploadMediaFile(', 'function uploadMediaFileRequest('), uploadContext);
  const upload = uploadContext.apiUploadMediaFile({});
  activeToken = 'new-login-token'; release();
  await assert.rejects(upload);
  assert.equal(cleared, 1, 'an upload started before re-login cannot clear the new credential');
  const xhrs = [];
  uploadContext.XMLHttpRequest = function () {
    this.upload = {}; this.open = () => {}; this.setRequestHeader = () => {}; this.send = () => {}; xhrs.push(this);
  };
  vm.runInContext(extract('function uploadMediaFileRequest(', 'function currentCloudToken('), uploadContext);
  const xhrUpload = uploadContext.uploadMediaFileRequest('/api/upload/media', {}, { contentType: 'image/png' });
  activeToken = 'even-newer-token';
  xhrs[0].status = 401; xhrs[0].responseText = '{"ok":false,"code":"ACCOUNT_SESSION_REPLACED"}'; xhrs[0].onload();
  await assert.rejects(xhrUpload);
  assert.equal(cleared, 1, 'delayed XHR upload cannot clear the new login');
  console.log('Device identity and login/upload-race regression passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
