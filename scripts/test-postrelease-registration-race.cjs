'use strict';
// Delay only a synthetic SMS verifier. No real provider, database or account.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), source = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
const start = source.indexOf('async function handleRegister('), handler = source.slice(start, source.indexOf('\n}', start) + 2);
async function checkRace(samePhone) {
  let saved = { users: { existing: { data: { careRecords: [] } } } }, resume;
  const verification = new Promise(resolve => { resume = resolve; });
  let response, verificationStarted = false;
  const phone = '13900007088';
  const context = vm.createContext({ Date, String, Object, crypto: require('node:crypto'),
    readJson: async () => ({ phone, password: 'synthetic-password', code: '000000', termsAccepted: true }), validPhone: () => true,
    readDatabase: () => structuredClone(saved), verifyRegistrationCode: () => { verificationStarted = true; return verification; },
    hashPassword: () => ({ salt: 'synthetic', hash: 'synthetic' }), makeAuthToken: () => 'synthetic-token',
    accountNameForPhone: () => 'Synthetic', maskPhone: () => 'Synthetic', randomDefaultAccountAvatar: () => '',
    normalizeAccountData: value => value, clientPolicyVersion: () => 'test', LEGACY_POLICY_VERSION: 'test',
    addAccountSession: () => {}, writeDatabase: value => { saved = structuredClone(value); }, verifiedPhones: new Map(), forgetCode: () => {},
    publicUserForPolicyClient: user => user, sendJson: (_res, status, body) => { response = { status, body }; }
  });
  vm.runInContext(handler, context);
  const pending = context.handleRegister({}, {}); await new Promise(resolve => setImmediate(resolve));
  assert.equal(verificationStarted, true);
  if (samePhone) saved.users[phone] = { phone, accountName: 'Already registered', data: { turtles: [{ id: 'keep' }] } };
  else saved.users.existing.data.careRecords.push({ id: 'saved-while-sms-pending' });
  resume(); await pending;
  if (samePhone) {
    assert.equal(response.status, 409); assert.equal(saved.users[phone].data.turtles[0].id, 'keep');
  } else {
    assert.equal(response.status, 200); assert.equal(saved.users.existing.data.careRecords.length, 1, 'SMS wait must not overwrite another account save');
  }
}
(async () => {
  const results = [];
  for (const samePhone of [false, true]) {
    const name = samePhone ? 'concurrent same-phone registration preserves the first account' : 'registration preserves account edits made during SMS network wait';
    try { await checkRace(samePhone); results.push({ name, passed: true }); console.log('PASS ' + name); }
    catch (error) { results.push({ name, passed: false, message: error.message }); console.error('FAIL ' + name + ': ' + error.message); }
  }
  const directory = path.join(root, 'output/postrelease-server-audit'); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, process.argv.includes('--red') ? 'registration-red.json' : 'registration-report.json'), JSON.stringify({ environment: 'isolated handler, synthetic delayed verifier and cloned database snapshots', results }, null, 2));
  if (results.some(r => !r.passed)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
