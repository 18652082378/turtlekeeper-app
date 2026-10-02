'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { HELPER, TARGET, OPERATION, patchServer, adjust, undoAdjustment, openStorage, deploy } = require('./deploy-market-stat-adjustment.cjs');
const root = path.resolve(__dirname, '..');
const clone = object => JSON.parse(JSON.stringify(object));
const base = { ...TARGET, impressionCount: 5, viewCount: 26, wantedPhones: [], status: 'active', sellerPhoneRaw: 'seller', city: '上海市' };
const fixtureDb = () => ({ users: { seller: { data: { turtles: [{ id: 'never-touch' }] } } }, marketListings: [clone(base), { id: 'other', wantedPhones: ['real'], impressionCount: 7 }], appAnalytics: { days: { today: { market: { wants: 3 } } } } });
const context = vm.createContext({ REVIEW_ADMIN_PHONE: 'admin' }); vm.runInContext(HELPER, context);
let db = fixtureDb(), unchanged = clone(db);
assert.equal(adjust(db), true);
assert.equal(db.marketListings[0].impressionCount, 134); assert.equal(context.marketWantCount(db.marketListings[0]), 1);
assert.deepEqual(db.marketListings[0].wantedPhones, []); assert.equal(db.marketListings[0].viewCount, 26);
assert.deepEqual(db.users, unchanged.users); assert.deepEqual(db.appAnalytics, unchanged.appAnalytics); assert.deepEqual(db.marketListings[1], unchanged.marketListings[1]);
db.marketListings[0].wantedPhones.push('real-buyer'); db.marketListings[0].impressionCount += 3; db.marketListings[0].viewCount += 2;
assert.equal(context.marketWantCount(db.marketListings[0]), 2); assert.equal(adjust(db), false); assert.equal(db.marketListings[0].impressionCount, 137);
undoAdjustment(db, unchanged.marketListings[0]);
assert.equal(db.marketListings[0].impressionCount, 8); assert.equal(db.marketListings[0].viewCount, 28);
assert.deepEqual(db.marketListings[0].wantedPhones, ['real-buyer']); assert.equal(context.marketWantCount(db.marketListings[0]), 1);
assert.equal(context.marketWantCount({ wantedPhones: ['admin', 'a'], manualMetricAdjustment: { wantDelta: 1 } }, true), 2);
assert.equal(context.marketWantCount({ wantedPhones: ['a'], manualMetricAdjustment: { wantDelta: 'invalid' } }), 1);
for (const change of [item => item.id = 'wrong', item => item.title = 'wrong', item => item.price = 1,
  item => item.impressionCount = 200, item => item.wantedPhones = ['a', 'b'], item => item.manualMetricAdjustment = { operation: 'another' }]) {
  const invalid = fixtureDb(); change(invalid.marketListings[0]); const snapshot = clone(invalid);
  assert.throws(() => adjust(invalid)); assert.deepEqual(invalid, snapshot);
}
const oldServer = fs.readFileSync(path.join(__dirname, 'fixtures/reviewed-server-20260929.js'), 'utf8');
const patched = patchServer(oldServer); assert.equal(patchServer(patched), patched);
assert.equal(patchServer(oldServer.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')), patched.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'));
assert.throws(() => patchServer(oldServer.replace('wantCount: listing.wantedPhones.length', 'wantCount: 999')));
const generated = require('./copy-market-stat-server-command.cjs').serverCommand();
const encoded = generated.split("<<'TURTLE_STAT_PATCH'\n")[1].split('\nTURTLE_STAT_PATCH')[0];
const bytes = Buffer.from(encoded, 'base64'); assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), generated.match(/printf '%s  %s\\n' '([a-f0-9]{64})'/)[1]);
assert.deepEqual(zlib.gunzipSync(bytes), fs.readFileSync(path.join(__dirname, 'deploy-market-stat-adjustment.cjs')));
(async () => {
  const parent = path.join(root, 'output'); fs.mkdirSync(parent, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(parent, 'market-stat-test-'));
  try {
    // Exercise both SQL adapters with the project's transactional SQL double.
    const records = require('../server/mysql-record-store');
    const { Driver } = require('./mysql-record-test-driver');
    for (const mode of ['legacy', 'records']) {
      const driver = new Driver(fixtureDb());
      const end = driver.end.bind(driver); driver.end = async () => { driver.locked = false; await end(); };
      const execute = driver.execute.bind(driver);
      driver.execute = async (sql, values) => {
        if (sql.startsWith('UPDATE turtlekeeper_app_state SET payload')) { driver.legacy = JSON.parse(values[0]); return [{ affectedRows: 1 }]; }
        return execute(sql, values);
      };
      if (mode === 'records') await records.migrate(driver, fixtureDb());
      const dependencies = { requireServer: name => name === 'mysql2/promise' ? { createConnection: async () => driver } : records };
      const env = { MYSQL_HOST: 'isolated-test-double', MYSQL_STORAGE_MODE: mode };
      let store = await openStorage(root, env, true, dependencies);
      assert.equal(driver.locked, false); await assert.rejects(store.save(), /Read-only/); await store.close();
      const beforeRows = new Map([...driver.rows].map(([key, value]) => [key, JSON.stringify(value)]));
      store = await openStorage(root, env, false, dependencies); assert.equal(driver.locked, true);
      adjust(store.db); await store.save(); await store.close(); assert.equal(driver.locked, false);
      const data = mode === 'records' ? (await records.load(driver)).database : driver.legacy;
      assert.equal(data.marketListings[0].impressionCount, 134); assert.equal(context.marketWantCount(data.marketListings[0]), 1);
      assert.deepEqual(data.users, fixtureDb().users); assert.deepEqual(data.appAnalytics, fixtureDb().appAnalytics); assert.deepEqual(data.marketListings[1], fixtureDb().marketListings[1]);
      if (mode === 'records') {
        assert.equal([...driver.rows].filter(([key, value]) => beforeRows.get(key) !== JSON.stringify(value)).length, 1, 'records mode updates only the target listing SQL row');
        assert.deepEqual(driver.legacy, fixtureDb(), 'old legacy snapshot remains untouched');
      }
      driver.locked = true; await assert.rejects(openStorage(root, env, false, dependencies), /已有写入进程/);
    }
    for (const fault of ['', 'health', 'save']) {
      const workspace = path.join(temporary, fault || 'ok'); fs.mkdirSync(path.join(workspace, 'server/data'), { recursive: true });
      const file = path.join(workspace, 'server/server.js'), dataFile = path.join(workspace, 'server/data/app-data.json');
      fs.writeFileSync(file, oldServer); fs.writeFileSync(dataFile, JSON.stringify(fixtureDb()));
      let pid = 42, status = 'online', restarts = 0;
      const run = args => {
        if (args[0] === 'jlist') return JSON.stringify([{ name: 'turtlekeeper-api', pid, pm2_env: { status, exec_mode: 'fork_mode', pm_cwd: workspace, pm_exec_path: file, watch: false } }]);
        if (args[0] === 'stop') { status = 'stopped'; pid = 0; return ''; }
        if (args[0] === 'restart') {
          status = 'online'; pid = 43 + restarts++; const current = JSON.parse(fs.readFileSync(dataFile));
          if (fault === 'health' && restarts === 1) { current.marketListings[0].impressionCount += 3; current.marketListings[0].viewCount += 2; current.marketListings[0].wantedPhones.push('new-buyer'); fs.writeFileSync(dataFile, JSON.stringify(current)); }
          return '';
        }
        throw Error('Unexpected PM2 command');
      };
      const request = async (port, route) => {
        if (route === '/api/app/version') return { status: 200, json: { ok: true, latestBuild: fault === 'health' && restarts === 1 ? 999 : 122 } };
        const current = JSON.parse(fs.readFileSync(dataFile)).marketListings[0];
        return { status: 200, json: { listing: { ...current, wantCount: fs.readFileSync(file, 'utf8').includes(HELPER.trim()) ? context.marketWantCount(current) : current.wantedPhones.length } } };
      };
      const storage = async (...args) => {
        const store = await openStorage(...args); const save = store.save;
        if (fault === 'save') store.save = async () => { if (!args[2]) throw Error('Simulated storage failure'); return save(); };
        return store;
      };
      const options = { root: workspace, platform: 'linux', run, request, storage, wait: async () => {}, log: () => {} };
      const originalData = fs.readFileSync(dataFile); await deploy({ ...options, mode: '--check' });
      assert.deepEqual(fs.readFileSync(dataFile), originalData); assert.equal(restarts, 0);
      if (fault) {
        await assert.rejects(deploy({ ...options, mode: '--apply' }), fault === 'health' ? /Post-restart/ : /storage failure/);
        assert.equal(fs.readFileSync(file, 'utf8'), oldServer); assert.equal(status, 'online');
        const current = JSON.parse(fs.readFileSync(dataFile));
        assert.equal(current.marketListings[0].impressionCount, fault === 'health' ? 8 : 5);
        assert.equal(current.marketListings[0].viewCount, fault === 'health' ? 28 : 26);
        assert.deepEqual(current.users, fixtureDb().users); assert.deepEqual(current.marketListings[1], fixtureDb().marketListings[1]);
      } else {
        await deploy({ ...options, mode: '--apply' }); assert.equal(restarts, 1);
        assert.equal(JSON.parse(fs.readFileSync(dataFile)).marketListings[0].impressionCount, 134);
        assert.equal((await deploy({ ...options, mode: '--apply' })).status, 'already'); assert.equal(restarts, 1);
        const store = await openStorage(workspace, {}, true); await assert.rejects(store.save(), /Read-only/); await store.close();
      }
    }
    // Real local HTTP handlers, isolated JSON data and synthetic credentials only.
    const apiDir = path.join(temporary, 'api'); fs.mkdirSync(path.join(apiDir, 'data'), { recursive: true });
    const apiDb = fixtureDb(); adjust(apiDb);
    Object.assign(apiDb.marketListings[0], { createdAt: new Date().toISOString(), refreshedAt: new Date().toISOString(), speciesCode: 'GHG', speciesName: '果核蛋龟' });
    const phone = '13900000111', token = 'isolated-stats-test-token';
    apiDb.users[phone] = { phone, accountName: 'Local regression buyer', tokens: [{ hash: crypto.createHash('sha256').update(token).digest('hex') }], data: {} };
    fs.writeFileSync(path.join(apiDir, 'data/app-data.json'), JSON.stringify(apiDb));
    const port = await new Promise((resolve, reject) => {
      const listener = net.createServer(); listener.once('error', reject); listener.listen(0, '127.0.0.1', () => { const port = listener.address().port; listener.close(error => error ? reject(error) : resolve(port)); });
    });
    const child = spawn(process.execPath, [path.join(root, 'server/server.js')], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), TURTLE_RUNTIME_DIR: apiDir, MYSQL_URL: '', MYSQL_HOST: '', SMS_MODE: 'mock', APNS_KEY_PATH: '', APNS_KEY_BASE64: '' } });
    let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
    const post = async (route, body) => {
      const response = await fetch('http://127.0.0.1:' + port + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(1000) });
      assert.equal(response.status, 200, route + ' ' + output); return response.json();
    };
    try {
      let ready = false;
      for (let i = 0; i < 60 && !ready; i++) {
        try { ready = (await fetch('http://127.0.0.1:' + port + '/api/app/version')).ok; } catch {}
        if (!ready) await new Promise(resolve => setTimeout(resolve, 80));
      }
      assert.ok(ready, output);
      let result = await post('/api/market/detail', { listingId: TARGET.id }); assert.equal(result.listing.impressionCount, 134); assert.equal(result.listing.wantCount, 1); assert.equal(result.listing.viewCount, 26);
      result = await post('/api/market/list', { keyword: TARGET.title }); assert.equal(result.listings.find(item => item.id === TARGET.id).wantCount, 1);
      result = await post('/api/market/impression', { listingId: TARGET.id }); assert.equal(result.impressionCount, 135); assert.equal(result.wantCount, 1);
      result = await post('/api/market/view', { listingId: TARGET.id }); assert.equal(result.viewCount, 27); assert.equal(result.wantCount, 1);
      for (let i = 0; i < 2; i++) { result = await post('/api/market/want', { phone, token, listingId: TARGET.id }); assert.equal(result.wantCount, 2); }
      const stored = JSON.parse(fs.readFileSync(path.join(apiDir, 'data/app-data.json')));
      assert.deepEqual(targetListingForTest(stored).wantedPhones, [phone]); assert.equal(targetListingForTest(stored).manualMetricAdjustment.operation, OPERATION);
    } finally {
      await new Promise(resolve => { child.once('exit', resolve); if (child.exitCode !== null) return resolve(); child.kill(); setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), 2000).unref(); });
    }
    console.log('PASS: exact single listing, authentic want records preserved, real local detail/list/impression/view/want HTTP handlers, live count accumulation, idempotence, unknown code refusal, payload hash, read-only preflight, JSON backup/apply, legacy/records SQL adapters with an isolated transactional double, writer lock refusal, failed-save recovery and rollback preserving new activity. Local fixtures only.');
  } finally { assert.equal(path.dirname(temporary), parent); assert.ok(path.basename(temporary).startsWith('market-stat-test-')); fs.rmSync(temporary, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
function targetListingForTest(db) { return db.marketListings.find(item => item.id === TARGET.id); }
