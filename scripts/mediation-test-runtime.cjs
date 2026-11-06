'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const accounts = { alice: '13900001111', bob: '13900002222', admin: '13900009999' };
const token = name => `synthetic-mediation-${name}-token`;
async function runtime({ records = false } = {}) {
  fs.mkdirSync(path.join(root, 'output'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'output/mediation-test-'));
  fs.mkdirSync(path.join(directory, 'data'));
  const users = Object.fromEntries(Object.entries(accounts).map(([name, phone]) => [phone, { phone, accountName: `测试${name}`, tokens: [{ hash: crypto.createHash('sha256').update(token(name)).digest('hex') }], data: {} }]));
  const listing = { id: 'synthetic-mediation-abc123', title: '测试果核蛋龟', speciesCode: 'GHG', speciesName: '果核蛋龟', status: 'active', price: 1400, sellerPhoneRaw: accounts.bob, sellerName: '测试卖家', createdAt: new Date().toISOString(), mediaItems: [], wantedPhones: [] };
  const databaseFile = path.join(directory, records ? 'durable-test.json' : 'data/app-data.json'), failFile = path.join(directory, 'fail-commit');
  fs.writeFileSync(databaseFile, JSON.stringify({ users, marketListings: [listing] }));
  const port = await new Promise((resolve, reject) => { const s = net.createServer(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(e => e ? reject(e) : resolve(p)); }); });
  let child, output = '';
  const base = `http://127.0.0.1:${port}`;
  async function start() {
    const args = [...(records ? ['--require', path.join(root, 'scripts/mysql-record-test-preload.js')] : []), path.join(root, 'server/server.js')];
    child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TURTLE_RUNTIME_DIR: directory, HOST: '127.0.0.1', PORT: String(port), ADMIN_PHONE: accounts.admin, MYSQL_HOST: records ? 'synthetic-driver' : '', MYSQL_URL: '', MYSQL_STORAGE_MODE: 'records', TURTLE_TEST_RECORD_DRIVER: '1', TURTLE_TEST_DURABLE_FILE: databaseFile, TURTLE_TEST_FAIL_FILE: failFile, TURTLE_TEST_COMMIT_DELAY: records ? '120' : '', SMS_MOCK: 'true', APNS_KEY_PATH: '', APNS_KEY_BASE64: '' } });
    child.stdout.on('data', x => output += x); child.stderr.on('data', x => output += x);
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/api/app/version', { signal: AbortSignal.timeout(300) })).ok) return; } catch { /* Wait for isolated server. */ }
      await new Promise(r => setTimeout(r, 50));
    }
    throw Error('Synthetic server did not start: ' + output);
  }
  async function stop() { if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); }); }
  async function post(action, name, body = {}) {
    const response = await fetch(base + '/api/mediation/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: accounts[name], token: name ? token(name) : '', ...body }), signal: AbortSignal.timeout(5000) });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  }
  const disk = () => JSON.parse(fs.readFileSync(databaseFile, 'utf8'));
  await start();
  return { base, directory, listing, accounts, token, post, disk, stop, start, failFile };
}
module.exports = { runtime, accounts, token };
