'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), { webcrypto, createHash } = require('node:crypto');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const functions = source.slice(source.indexOf('function nativePushNotifications()'), source.indexOf('async function testNativePushNotification()'));
const recipient = phone => createHash('sha256').update('community:' + phone).digest('hex').slice(0, 20);
const tick = () => new Promise(r => setImmediate(r));
async function waitFor(check) { for (let i = 0; i < 1000; i++) { if (check()) return; await tick(); } assert.ok(check(), 'asynchronous push callback completes'); }
(async () => {
  const listeners = {}, calls = [], phone = '13900003111'; let localOff = false, iosRegistered = 0;
  const android = { addListener: (name, fn) => { listeners[name] = fn; }, checkPermissions: async () => ({ receive: 'granted' }),
    requestPermissions: async () => ({ receive: 'granted' }), register: async ({ phone }) => listeners.registration({ value: 'device_123456789012345', recipientId: recipient(phone) }),
    unregister: () => { localOff = true; throw Error('simulated native failure'); } };
  const ios = { addListener() {}, checkPermissions: async () => ({ receive: 'granted' }), register: async () => { iosRegistered++; } };
  const sandbox = { crypto: webcrypto, TextEncoder, console, state: { loggedInPhone: phone, page: 'home' },
    window: { TURTLE_APP_PLATFORM: 'android', Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { TurtleAndroidPush: android, PushNotifications: ios } } },
    nativePushDeviceToken: '', nativePushListenersAttached: false, nativePushSetupInFlight: false, pendingNativePushAction: null, cloudHydrationComplete: true,
    currentCloudToken: () => sandbox.state.loggedInPhone ? 'session-' + sandbox.state.loggedInPhone : '',
    communityAuthPayload: body => ({ ...body, phone: sandbox.state.loggedInPhone, token: 'session-' + sandbox.state.loggedInPhone }),
    apiPost: async (route, body) => { calls.push({ route, body }); if (route.endsWith('unregister')) assert.ok(localOff, 'local disable precedes HTTP'); return { ok: true }; },
    setState: update => Object.assign(sandbox.state, update), refreshMessageUnread() {}, openCommunityChat() {} };
  vm.createContext(sandbox); vm.runInContext(functions, sandbox);
  await sandbox.setupNativePushNotifications(); await waitFor(() => calls.length > 0);
  assert.equal(calls[0].route, '/api/notifications/android/device/register'); assert.equal(calls[0].body.platform, 'android'); assert.equal(iosRegistered, 0);
  sandbox.state.loggedInPhone = '13900003112';
  await sandbox.saveNativePushDeviceToken('old-device-123456789', recipient(phone)); assert.equal(calls.length, 1, 'late SDK event does not bind to a new account');
  sandbox.queueNativePushAction({ data: { route: 'weather', recipientId: recipient(phone) } });
  await waitFor(() => sandbox.pendingNativePushAction === null); assert.equal(sandbox.state.page, 'home');
  sandbox.state.loggedInPhone = phone;
  sandbox.queueNativePushAction({ data: { route: 'weather', recipientId: recipient(phone) } });
  await waitFor(() => sandbox.state.page === 'memos'); assert.equal(sandbox.state.careTab, 'weather');
  sandbox.state.loggedInPhone = '';
  sandbox.queueNativePushAction({ data: { route: 'weather', recipientId: recipient(phone) } });
  sandbox.state.loggedInPhone = phone; sandbox.consumePendingNativePushAction(); await waitFor(() => sandbox.pendingNativePushAction === null);
  await sandbox.unregisterNativePushNotifications(phone, 'session-' + phone);
  assert.equal(calls.at(-1).route, '/api/notifications/android/device/unregister'); assert.equal(calls.at(-1).body.platform, 'android');
  sandbox.window.TURTLE_APP_PLATFORM = 'ios'; sandbox.window.Capacitor.getPlatform = () => 'ios';
  sandbox.nativePushListenersAttached = false;
  await sandbox.setupNativePushNotifications(); assert.equal(iosRegistered, 1);
  await sandbox.saveNativePushDeviceToken('a'.repeat(64)); assert.equal(calls.at(-1).route, '/api/notifications/device/register'); assert.equal(calls.at(-1).body.platform, 'ios');
  console.log('PASS: Android native selection, safe old-server route, late registration/account change, cold tap ownership, immediate logout disable and iOS compatibility.');
})().catch(e => { console.error(e); process.exitCode = 1; });
