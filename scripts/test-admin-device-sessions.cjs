const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
const extract = name => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
};
const hashValue = value => crypto.createHash('sha256').update(value).digest('hex');
const context = { REVIEW_ADMIN_PHONE: '18652082378', hashValue };
vm.createContext(context);
vm.runInContext(['isAdminUser', 'normalizeApnsDeviceToken', 'normalizedPushDevices', 'addAccountSession'].map(extract).join('\n'), context);
const admin = { phone: '18652082378', tokens: [] };
let counter = 0;
const login = (user, device, platform = 'ios') => {
  const token = 'test-token-' + (++counter);
  context.addAccountSession(user, token, device ? { deviceId: 'test-installation-' + device, devicePlatform: platform } : {}, new Date(1700000000000 + counter * 1000).toISOString());
  return hashValue(token);
};
const hashes = user => Array.from(user.tokens, item => item.hash);
const a = login(admin, 'a'), b = login(admin, 'b', 'android'), c = login(admin, 'c', 'web');
assert.deepEqual(hashes(admin), [a, b, c]);
admin.pushDevices = [a, b, c].map((sessionHash, i) => ({ token: String(i + 1).repeat(64), platform: 'ios', sessionHash }));
const b2 = login(admin, 'b', 'android');
assert.deepEqual(hashes(admin), [a, c, b2], 'same installation renews only its own credential');
assert.ok(admin.replacedSessions.some(item => item.hash === b));
assert.deepEqual(Array.from(admin.pushDevices, item => item.sessionHash), [a, c]);
const d = login(admin, 'd');
assert.deepEqual(hashes(admin), [c, b2, d], 'fourth installation evicts the oldest login');
assert.ok(admin.replacedSessions.some(item => item.hash === a));
assert.deepEqual(Array.from(admin.pushDevices, item => item.sessionHash), [c]);
const legacy1 = login(admin), legacy2 = login(admin), legacy3 = login(admin);
assert.deepEqual(hashes(admin), [legacy1, legacy2, legacy3], 'legacy clients also obey the limit');
for (let i = 0; i < 40; i++) login(admin, 'overflow-' + i);
assert.equal(admin.tokens.length, 3);
assert.equal(admin.replacedSessions.length, 32);
const oldAdmin = { phone: admin.phone, tokens: [{ hash: 'legacy-login' }], pushDevices: [{ token: 'ab'.repeat(32), platform: 'ios' }] };
login(oldAdmin, 'new');
assert.equal(oldAdmin.pushDevices[0].sessionHash, 'legacy-login', 'retain notifications from the existing single-device release');
const regular = { phone: '13900000006', tokens: [] };
for (const device of ['a', 'b', null, 'b']) {
  const latest = login(regular, device);
  assert.deepEqual(hashes(regular), [latest], 'ordinary accounts remain single-device');
}
console.log('PASS: admin three-device limit, same-device renewal, oldest eviction, legacy clients, bounded revocations, push ownership, ordinary single-device policy.');
