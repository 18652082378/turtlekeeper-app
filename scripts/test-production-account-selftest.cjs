'use strict';

// Runs the production acceptance engine only against a copied current server,
// a temporary JSON database and synthetic accounts. No .env or external service.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { runAcceptance, createLoopbackTransport, FIELDS } = require('./test-production-account.cjs');
const root = path.resolve(__dirname, '..');
const password = 'SyntheticAcceptancePass!123';
const secretNote = 'ORIGINAL_SYNTHETIC_NOTE_MUST_NOT_APPEAR_IN_REPORT';
const output = path.join(root, 'output/release-acceptance/selftest');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
function account(phone) {
  const salt = crypto.randomBytes(16).toString('hex');
  const date = '2026-09-28', createdAt = date + 'T00:00:00Z';
  return { phone, accountName: `Synthetic ${phone.slice(-2)}`, accountAvatar: '', tokens: [], createdAt, updatedAt: createdAt,
    passwordSalt: salt, passwordHash: crypto.scryptSync(password, salt, 64).toString('hex'),
    data: { turtles: [{ id: 'original-turtle', code: 'ORIGINAL_PRIVATE_ARCHIVE', speciesCode: 'GHG', speciesName: '果核蛋龟', note: secretNote, measureHistory: [] }],
      careRecords: [{ id: 'original-care', title: '喂食', date, note: secretNote, turtleRefs: [{ id: 'original-turtle' }] }],
      memos: [{ id: 'original-memo', title: 'ORIGINAL_PRIVATE_REMINDER', reminderEnabled: false, note: secretNote }],
      breedingRecords: [{ id: 'original-breeding', motherId: 'original-turtle', date, eggCount: 1, note: secretNote }],
      turtlePools: [{ id: 'original-pool', name: 'ORIGINAL_POOL', type: 'breeder', count: 1, note: secretNote }],
      ledgerRecords: [{ id: 'original-ledger', type: 'other', amount: 1, note: secretNote }],
      careCustomItems: [{ id: 'original-item', title: '原有项目', createdAt }],
      carePlans: [{ id: 'original-plan', name: '原有计划', note: secretNote }],
      keptSpecies: ['GHG'], activityLogs: [{ id: 'original-log', note: secretNote }], themeColor: 'plum' } };
}
async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tk-production-acceptance-selftest-'));
  const app = path.join(temporary, 'app'), runtime = path.join(temporary, 'runtime');
  const database = path.join(runtime, 'data/app-data.json'), results = [];
  let child, logs = '';
  await fs.mkdir(output, { recursive: true });
  try {
    for (const folder of ['server', 'assets']) {
      await fs.mkdir(path.join(app, folder), { recursive: true });
      for (const name of await fs.readdir(path.join(root, folder))) {
        if (name.endsWith('.js')) await fs.copyFile(path.join(root, folder, name), path.join(app, folder, name));
      }
    }
    await fs.copyFile(path.join(root, 'species-data.js'), path.join(app, 'species-data.js'));
    await fs.mkdir(path.dirname(database), { recursive: true });
    const phones = Array.from({ length: 12 }, (_, i) => String(13900008000 + i));
    await fs.writeFile(database, JSON.stringify({ users: Object.fromEntries(phones.map(phone => [phone, account(phone)])) }));
    const port = await freePort(), base = `http://127.0.0.1:${port}`;
    const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
    Object.assign(env, { HOST: '127.0.0.1', PORT: String(port), TURTLE_RUNTIME_DIR: runtime,
      MYSQL_URL: '', MYSQL_HOST: '', MYSQL_STORAGE_MODE: 'legacy', SMS_PROVIDER: 'mock', SMS_MOCK: 'true', ADMIN_PHONE: phones[1] });
    child = spawn(process.execPath, [path.join(app, 'server/server.js')], { cwd: app, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/api/app/version')).ok) break; } catch {}
      if (i === 99) throw Error('Isolated server startup failed');
      await pause(50);
    }
    const transport = createLoopbackTransport(base);
    async function scenario(name, index, decorate, expected, verify = async () => {}, override = {}) {
      let saves = 0, calls = 0;
      const request = async (route, body) => {
        calls++; if (route === '/api/account/save') saves++;
        return decorate ? decorate(route, body, transport, { saves, calls }) : transport(route, body);
      };
      const result = await runAcceptance({ credentials: { phone: phones[index], password, testAccountOnly: true,
        acceptedTermsVersion: '2026-09-01', ...override }, request, environment: 'isolated-local', reportDirectory: output });
      try {
        assert.equal(result.report.status, expected === 'passed' ? 'passed' : 'stopped');
        if (expected !== 'passed') assert.equal(result.report.failure.code, expected);
        const serialized = JSON.stringify(result.report);
        for (const forbidden of [phones[index], password, secretNote, 'ORIGINAL_PRIVATE_ARCHIVE', 'ORIGINAL_PRIVATE_REMINDER']) {
          assert.ok(!serialized.includes(forbidden), 'Report must not contain credentials or original records');
        }
        const stored = JSON.parse(await fs.readFile(database, 'utf8')).users[phones[index]].data;
        for (const field of FIELDS) assert.ok(stored[field].some(row => row.id.startsWith('original-')), 'Original records must remain');
        assert.equal(stored.turtles.find(row => row.id === 'original-turtle').note, secretNote);
        await verify({ ...result, saves, calls, stored });
        results.push({ name, passed: true }); console.log('PASS ' + name);
      } catch (error) { results.push({ name, passed: false, message: error.message }); console.error('FAIL ' + name + ': ' + error.message); }
    }
    for (const [index, kind] of [[0, 'ordinary'], [1, 'admin']]) {
      await scenario(`${kind}: 8 collections create/edit/delete, fresh connections and A/B sessions preserve originals`, index, null, 'passed', async ({ report, saves, stored }) => {
        assert.equal(saves, 4); assert.equal(report.successfulDataWrites, 3); assert.equal(report.conflictProbes, 1);
        assert.equal(report.sessionPolicy, kind === 'admin' ? 'admin-up-to-three-devices' : 'ordinary-one-device');
        for (const field of FIELDS) assert.equal(stored[field].filter(row => row.id.startsWith(report.runId)).length, 1);
        assert.ok(stored.memos.filter(row => row.id.startsWith(report.runId)).every(row => row.reminderEnabled === false));
      });
    }
    await scenario('Missing revision stops before account writes', 2, async (route, body, send) => {
      const response = await send(route, body); if (route.endsWith('/login')) delete response.body.user.dataRevision; return response;
    }, 'REVISION_REQUIRED_BEFORE_WRITING', async ({ saves }) => assert.equal(saves, 0));
    await scenario('Missing care collection stops before account writes', 3, async (route, body, send) => {
      const response = await send(route, body); if (route.endsWith('/login')) delete response.body.user.data.careRecords; return response;
    }, 'COLLECTION_MISSING_OR_INVALID', async ({ saves }) => assert.equal(saves, 0));
    await scenario('Unconfirmed agreement version sends no requests', 4, null, 'ALREADY_ACCEPTED_TERMS_VERSION_REQUIRED',
      async ({ calls }) => assert.equal(calls, 0), { acceptedTermsVersion: '' });
    await scenario('Conflict stops with no automatic overwrite or retry', 5, async (route, body, send) => route.endsWith('/save')
      ? { status: 409, body: { ok: false } } : send(route, body), 'API_REQUEST_REJECTED', async ({ saves, stored }) => {
      assert.equal(saves, 1); assert.ok(stored.turtles.every(row => row.id.startsWith('original-')));
    });
    await scenario('Incomplete save receipt stops and leaves synthetic evidence', 6, async (route, body, send) => {
      const response = await send(route, body); if (route.endsWith('/save')) response.body.user.data.careRecords = [];
      return response;
    }, 'BASELINE_CHANGED_STOPPED', async ({ saves, report, stored }) => {
      assert.equal(saves, 1); assert.equal(stored.turtles.filter(row => row.id.startsWith(report.runId)).length, 2);
    });
    let loadCalls = 0;
    await scenario('Original record divergence before save stops without writing', 7, async (route, body, send) => {
      const response = await send(route, body);
      if (route.endsWith('/load') && ++loadCalls === 2) response.body.user.data.turtles[0].note = 'simulated external edit';
      return response;
    }, 'BASELINE_CHANGED_STOPPED', async ({ saves }) => assert.equal(saves, 0));
    await scenario('Server accepting stale revision stops before edit/delete', 8, async (route, body, send, count) => {
      if (route.endsWith('/save') && count.saves === 2) {
        const loaded = await send('/api/account/load', { phone: body.phone, token: body.token });
        return send(route, { ...body, baseDataRevision: loaded.body.user.dataRevision });
      }
      return send(route, body);
    }, 'SERVER_DID_NOT_ENFORCE_CAS', async ({ saves }) => assert.equal(saves, 2));
    await scenario('Lost save response stops without retry or baseline rollback', 9, async (route, body, send) => {
      const response = await send(route, body); if (route.endsWith('/save')) throw Error('Sensitive transport details must not be reported'); return response;
    }, 'UNEXPECTED_FAILURE_REDACTED', async ({ saves, report, stored }) => {
      assert.equal(saves, 1); assert.equal(report.possibleUnverifiedWrite, true);
      assert.equal(stored.turtles.filter(row => row.id.startsWith(report.runId)).length, 2);
    });
    await scenario('Dedicated-account confirmation missing sends no requests', 10, null, 'TEST_ACCOUNT_CONFIRMATION_REQUIRED',
      async ({ calls }) => assert.equal(calls, 0), { testAccountOnly: false });
    try {
      assert.throws(() => createLoopbackTransport('https://not-authorized.invalid'), /ENDPOINT_NOT_ALLOWED/);
      assert.throws(() => createLoopbackTransport('https://api.turtleworld.cn'), /ENDPOINT_NOT_ALLOWED/);
      assert.throws(() => createLoopbackTransport('http://localhost:9999'), /ENDPOINT_NOT_ALLOWED/);
      results.push({ name: 'Test transport rejects arbitrary destinations', passed: true }); console.log('PASS Test transport rejects arbitrary destinations');
    } catch (error) { results.push({ name: 'Test transport rejects arbitrary destinations', passed: false, message: error.message }); }
    await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify({ environment: 'Isolated copied server, temporary synthetic JSON database, no real credentials/providers',
      completedAt: new Date().toISOString(), passed: results.filter(row => row.passed).length, total: results.length, results }, null, 2));
    if (results.some(row => !row.passed)) process.exitCode = 1;
  } finally {
    if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
    // This helper owns the mkdtemp tree, never the working repository or .env.
    // Keep failed-run synthetic evidence in the temp directory for diagnosis.
  }
}
main().catch(() => { console.error('ISOLATED_SELFTEST_FAILED (no credentials logged)'); process.exitCode = 1; });
