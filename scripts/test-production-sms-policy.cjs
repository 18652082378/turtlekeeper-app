'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequestBudget, requestAddress } = require('../server/request-budget');

async function main() {
  let now = 0;
  const budget = createRequestBudget({ capacity: 2, now: () => now });
  assert.equal(budget.take('login', 1, 100), true);
  assert.equal(budget.take('login', 1, 100), false);
  assert.equal(budget.take('sms', 1, 100), true);
  assert.equal(budget.take('another', 1, 100), false);
  now = 100;
  assert.equal(budget.take('login', 1, 100), true);
  const address = { socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: { 'x-real-ip': '192.0.2.1' } };
  assert.equal(requestAddress(address), '127.0.0.1');
  assert.equal(requestAddress(address, true), '192.0.2.1');
  assert.equal(requestAddress({ ...address, socket: { remoteAddress: '192.0.2.2' } }, true), '192.0.2.2');

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tk-production-sms-'));
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const root = path.resolve(__dirname, '..');
  const child = spawn(process.execPath, ['server/server.js'], { cwd: root, windowsHide: true,
    env: {
      ...process.env, HOST: '127.0.0.1', PORT: String(port), TURTLE_RUNTIME_DIR: tmp,
      MYSQL_URL: '', MYSQL_HOST: '', NODE_ENV: 'production', SMS_PROVIDER: 'mock', SMS_MOCK: 'true',
      APNS_KEY_PATH: '', APNS_KEY_BASE64: '', ALIYUN_PUSH_ACCESS_KEY_ID: '', ALIYUN_PUSH_ACCESS_KEY_SECRET: ''
    }, stdio: ['ignore', 'ignore', 'inherit'] });
  const origin = 'http://127.0.0.1:' + port;
  try {
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      try { ready = (await fetch(origin + '/api/app/version')).ok; } catch {}
      if (!ready) await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.ok(ready);
    const post = (route, body) => fetch(origin + route, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    for (const purpose of ['register', 'reset_password']) {
      const res = await post('/api/sms/send', { phone: '13900001198', purpose });
      assert.equal(res.status, 503);
      const data = await res.json();
      assert.equal(data.code, 'SMS_UNAVAILABLE');
      assert.equal(data.mode, undefined);
      assert.equal(data.expiresIn, undefined);
    }
    const invalid = await post('/api/account/login', []);
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, 'INVALID_REQUEST');
    assert.equal(invalid.headers.get('x-frame-options'), 'DENY');
    assert.equal(invalid.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    console.log('PASS production SMS is closed with missing configuration; test mode cannot fall back into production; request budgets and HTTP error/header policy.');
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    await fs.rm(tmp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
