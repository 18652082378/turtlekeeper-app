'use strict';
// Isolated handler contract checks, with injected persistence failures/delays.
// Real HTTP and JSON disk behavior are covered by test-postrelease-server-audit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
function extract(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0); return source.slice(start, source.indexOf('\n}', start) + 2);
}
function setup(body, write) {
  const user = { phone: '13900007900', data: { turtles: [{ id: 't1', weight: 30, measureHistory: [{ id: 'h1' }] }] } };
  let response, snapshots = 0;
  const context = vm.createContext({ Object, String, Date, Number, console, readJson: async () => body,
    readDatabase: () => ({ users: { [user.phone]: user } }), authenticate: () => user,
    accountDataRevision: () => 'current-revision', normalizeAccountData: value => structuredClone(value),
    createAccountRecoverySnapshot: () => { snapshots++; },
    deleteGrowthRecordAndRebuild: turtle => ({ turtle: { ...turtle, weight: 20, measureHistory: [] } }),
    writeDatabase: write, publicUser: () => structuredClone(user),
    sendJson: (_res, status, value) => { response = { status, value }; return response; }
  });
  vm.runInContext(extract('handleDeleteGrowthRecord'), context);
  return { run: () => context.handleDeleteGrowthRecord({}, {}), user, response: () => response, snapshots: () => snapshots };
}
async function main() {
  const results = [], base = { phone: '13900007900', token: 'synthetic', turtleId: 't1', historyId: 'h1' };
  async function test(name, run) {
    try { await run(); results.push({ name, passed: true }); console.log('PASS ' + name); }
    catch (error) { results.push({ name, passed: false, message: error.message }); console.error('FAIL ' + name + ': ' + error.message); }
  }
  await test('stale growth deletion refuses changed cloud revision before mutation', async () => {
    let writes = 0;
    const test = setup({ ...base, baseDataRevision: 'stale-revision' }, async () => { writes++; });
    await test.run(); assert.equal(test.response().status, 409); assert.equal(test.response().value.code, 'ACCOUNT_DATA_CONFLICT');
    assert.equal(writes, 0); assert.equal(test.snapshots(), 0); assert.equal(test.user.data.turtles[0].measureHistory.length, 1);
  });
  await test('legacy client without revision remains supported', async () => {
    const test = setup(base, async () => {}); await test.run(); assert.equal(test.response().status, 200);
  });
  await test('current revision waits for durable commit before returning account', async () => {
    let commit; const pending = new Promise(resolve => { commit = resolve; });
    const test = setup({ ...base, baseDataRevision: 'current-revision' }, () => pending);
    const run = test.run(); await new Promise(resolve => setImmediate(resolve));
    const early = test.response(); commit(); await run;
    assert.equal(early, undefined, 'deletion must not acknowledge an uncommitted change');
    assert.equal(test.response().status, 200);
  });
  await test('failed deletion commit returns 503 rather than success', async () => {
    const failure = Promise.reject(Error('isolated injected failure')); failure.catch(() => {});
    const test = setup({ ...base, baseDataRevision: 'current-revision' }, () => failure);
    await test.run(); assert.equal(test.response().status, 503); assert.equal(test.response().value.ok, false);
  });
  await test('invalid explicitly supplied revision cannot bypass conflict check', async () => {
    const test = setup({ ...base, baseDataRevision: null }, async () => {});
    await test.run(); assert.equal(test.response().status, 400);
  });
  const directory = path.join(root, 'output/postrelease-server-audit'); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, process.argv.includes('--red') ? 'growth-red.json' : 'growth-report.json'), JSON.stringify({ environment: 'isolated handler with synthetic database and persistence injection', results }, null, 2));
  console.log(`${results.filter(r => r.passed).length}/${results.length} checks passed`);
  if (results.some(r => !r.passed)) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
