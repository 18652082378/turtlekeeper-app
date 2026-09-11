const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
(async () => {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'tk-record-api-'));
  const durable = path.join(runtime, 'durable-test.json'), fail = path.join(runtime, 'fail-commit');
  const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child, output = '';
  const start = async () => {
    child = spawn(process.execPath, ['--require', path.join(root, 'scripts/mysql-record-test-preload.js'), 'server/server.js'], { cwd: root, windowsHide: true,
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), MYSQL_URL: '', MYSQL_HOST: 'test-driver', MYSQL_STORAGE_MODE: 'records',
        TURTLE_RUNTIME_DIR: runtime, TURTLE_TEST_RECORD_DRIVER: '1', TURTLE_TEST_DURABLE_FILE: durable, TURTLE_TEST_FAIL_FILE: fail,
        TURTLE_TEST_COMMIT_DELAY: '120', SMS_PROVIDER: 'mock', SMS_MOCK: 'true', APNS_KEY_ID: '', APNS_KEY_PATH: '', APNS_TEAM_ID: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/api/app/version')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Test API startup failed: ' + output);
  };
  const stop = async () => { if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); } };
  const post = async (route, payload, okay = true) => {
    const response = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await response.json(); assert.equal(response.ok && body.ok === true, okay, route + ': ' + JSON.stringify(body)); return body;
  };
  try {
    await fs.writeFile(durable, JSON.stringify({ users: {}, legacyExtra: { keep: '旧版字段' } }));
    await start();
    const initialized = JSON.parse(await fs.readFile(durable, 'utf8'));
    assert.ok(Array.isArray(initialized.marketListings), 'older snapshots gain absent module defaults before serving requests');
    assert.equal(initialized.legacyExtra.keep, '旧版字段', 'startup preserves unknown legacy fields');
    const phone = '13900000019';
    const sms = await post('/api/sms/send', { phone, purpose: 'register' });
    const registered = await post('/api/account/register', { phone, code: sms.code, password: 'TestOnlyPass123', accountName: 'durability test', termsAccepted: true });
    assert.ok(JSON.parse(await fs.readFile(durable, 'utf8')).users[phone], 'registration cannot return before its delayed commit');
    const auth = { phone, token: registered.user.token };
    const data = { ...registered.user.data, turtles: [{ id: 'one', code: 'ONE', status: '正常饲养', measureHistory: [] }],
      ledgerRecords: [{ id: 'purchase', type: 'purchase', amount: 450, turtleId: 'one' }] };
    await post('/api/account/save', { ...auth, accountName: 'durability test', data, baseDataRevision: registered.user.dataRevision });
    assert.equal(JSON.parse(await fs.readFile(durable, 'utf8')).users[phone].data.ledgerRecords[0].amount, 450, 'save response waits for ledger durability');
    await stop(); await start();
    const loaded = await post('/api/account/load', auth);
    assert.equal(loaded.user.data.ledgerRecords[0].amount, 450);
    await fs.writeFile(fail, 'test');
    await post('/api/account/save', { ...auth, accountName: 'durability test', baseDataRevision: loaded.user.dataRevision,
      data: { ...loaded.user.data, ledgerRecords: [...loaded.user.data.ledgerRecords, { id: 'failed', type: 'other', amount: 999 }] } }, false);
    assert.equal(JSON.parse(await fs.readFile(durable, 'utf8')).users[phone].data.ledgerRecords.length, 1, 'failed commit cannot leak half-written ledger records');
    await post('/api/account/load', auth, false);
    await stop(); await fs.unlink(fail); await start();
    assert.equal((await post('/api/account/load', auth)).user.data.ledgerRecords.length, 1, 'restart reads committed data only');
    console.log('Record API durability passed: delayed commit acknowledgment, compatible old client payload, restart, failed commit returns an error and cannot persist partial changes.');
  } finally {
    await stop();
    assert.equal(path.dirname(path.resolve(runtime)), path.resolve(os.tmpdir())); assert.ok(path.basename(runtime).startsWith('tk-record-api-'));
    await fs.rm(runtime, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
