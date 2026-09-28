'use strict';

// Real HTTP against a copied server and synthetic JSON database. The copy never
// includes .env, real accounts, uploads, payment credentials or push credentials.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const userId = phone => hash(`community:${phone}`).slice(0, 20);
const accounts = ['13900007101', '13900007102', '13900007103', '13900007104'].map((phone, i) => ({
  phone, token: `isolated-token-${i}`, accountName: `Audit ${i}`, accountAvatar: '',
  tokens: [{ hash: hash(`isolated-token-${i}`), createdAt: new Date().toISOString() }],
  data: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
}));
const auth = account => ({ phone: account.phone, token: account.token });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'turtle-postrelease-audit-'));
  const app = path.join(temporary, 'app'), runtime = path.join(temporary, 'runtime');
  let child, logs = '';
  const results = [];
  async function check(name, run) {
    try { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, passed: false, message: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
  }
  try {
    for (const folder of ['server', 'assets']) {
      await fs.mkdir(path.join(app, folder), { recursive: true });
      for (const name of await fs.readdir(path.join(root, folder))) {
        if (name.endsWith('.js')) await fs.copyFile(path.join(root, folder, name), path.join(app, folder, name));
      }
    }
    await fs.copyFile(path.join(root, 'species-data.js'), path.join(app, 'species-data.js'));
    for (const name of ['index.html', 'app.js', 'config.js', 'styles.css', 'privacy.html', 'terms.html', 'apple-app-site-association']) {
      await fs.copyFile(path.join(root, name), path.join(app, name));
    }
    await fs.mkdir(path.join(runtime, 'data'), { recursive: true });
    await fs.mkdir(path.join(runtime, 'uploads'), { recursive: true });
    const filename = path.join(runtime, 'data', 'app-data.json');
    const initialMessages = Array.from({ length: 5000 }, (_, i) => ({ id: `history-${i}`,
      fromPhone: accounts[i === 0 ? 2 : 0].phone, toPhone: accounts[i === 0 ? 3 : 1].phone,
      content: `Historical ${i}`, createdAt: '2026-09-01T00:00:00Z', readAt: '' }));
    await fs.writeFile(filename, JSON.stringify({ users: Object.fromEntries(accounts.map(a => [a.phone, a])), messages: initialMessages }));
    await fs.writeFile(path.join(runtime, 'uploads', 'range.mp4'), '0123456789');
    const listenPort = await port(), base = `http://127.0.0.1:${listenPort}`;
    // Only process essentials are inherited. The copied server has no .env.
    const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
    Object.assign(env, { HOST: '127.0.0.1', PORT: String(listenPort), TURTLE_RUNTIME_DIR: runtime,
      MYSQL_URL: '', MYSQL_HOST: '', MYSQL_STORAGE_MODE: 'legacy', SMS_MOCK: 'true', SMS_PROVIDER: 'mock',
      ADMIN_PHONE: '13900007999', MAX_UPLOAD_BYTES: '1024', MAX_MEDIA_IMAGE_UPLOAD_BYTES: '1024', MAX_MEDIA_UPLOAD_BYTES: '2048',
      FFMPEG_PATH: path.join(temporary, 'disabled-ffmpeg') });
    child = spawn(process.execPath, [path.join(app, 'server', 'server.js')], { cwd: app, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/api/app/version')).ok) break; } catch {}
      if (i === 99) throw Error('Isolated server failed to start: ' + logs);
      await pause(50);
    }
    async function post(route, body, options = {}) {
      const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...options.headers },
        body: Object.hasOwn(options, 'raw') ? options.raw : JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    }
    const read = async () => JSON.parse(await fs.readFile(filename, 'utf8'));
    const postBody = { ...auth(accounts[0]), title: '临时审查图片测试', content: '合成测试记录' };
    for (const url of ['javascript:alert(1)', '/uploads/x.png" onerror="alert(1)', 'https://example.invalid/a.png\n" onerror="alert(1)', '//example.invalid/a.png']) {
      await check(`community rejects unsafe media ${JSON.stringify(url)}`, async () => {
        const before = (await read()).communityPosts?.length || 0;
        const result = await post('/api/community/create', { ...postBody, mediaItems: [{ type: 'image', url }] });
        assert.equal(result.status, 400);
        assert.equal((await read()).communityPosts?.length || 0, before, 'invalid post must not be saved');
      });
    }
    await check('chat rejects unsafe media without changing history', async () => {
      const before = (await read()).messages;
      const result = await post('/api/community/chat/send', { ...auth(accounts[0]), userId: userId(accounts[1].phone), mediaUrl: 'javascript:alert(1)' });
      assert.equal(result.status, 400); assert.deepEqual((await read()).messages, before);
    });
    await check('avatar rejects attribute injection without saving account', async () => {
      const before = (await read()).users[accounts[0].phone];
      const result = await post('/api/account/save', { ...auth(accounts[0]), accountName: 'Valid name', accountAvatar: '/uploads/a.png" onerror="alert(1)', data: before.data });
      assert.equal(result.status, 400); assert.deepEqual((await read()).users[accounts[0].phone], before);
    });
    await check('safe local and signed HTTPS media remain compatible', async () => {
      for (const url of ['/uploads/2026/09/test.png', 'https://example.invalid/a.png?Expires=1&Signature=a%2Bb']) {
        const result = await post('/api/community/create', { ...postBody, mediaItems: [{ type: 'image', url }] });
        assert.equal(result.status, 200);
        assert.ok((await read()).communityPosts.some(p => p.mediaItems[0].url === url));
      }
    });
    await check('market create rejects unsafe photo without saving a listing', async () => {
      const result = await post('/api/market/create', { ...auth(accounts[0]), title: '临时测试商品', speciesCode: 'GHG',
        price: 100, city: '南京市', latitude: 32.0603, longitude: 118.7969, locationSource: 'device', photoUrl: 'javascript:alert(1)' });
      assert.equal(result.status, 400); assert.equal((await read()).marketListings?.length || 0, 0);
    });
    await check('community poster URL has the same validation as media URL', async () => {
      const before = (await read()).communityPosts.length;
      assert.equal((await post('/api/community/create', { ...postBody, mediaItems: [{ type: 'image', url: '/uploads/safe.png', posterUrl: 'javascript:alert(1)' }] })).status, 400);
      assert.equal((await read()).communityPosts.length, before);
    });
    await check('sending a message does not delete another conversation at 5000 messages', async () => {
      const db = await read(); db.messages = initialMessages; await fs.writeFile(filename, JSON.stringify(db));
      const result = await post('/api/community/chat/send', { ...auth(accounts[0]), userId: userId(accounts[1].phone), content: 'New audit message' });
      assert.equal(result.status, 200);
      const saved = await read(); assert.equal(saved.messages.length, 5001);
      assert.ok(saved.messages.some(m => m.id === 'history-0'), 'unrelated oldest conversation must remain');
      const otherConversation = await post('/api/community/chat/list', { ...auth(accounts[2]), userId: userId(accounts[3].phone) });
      assert.equal(otherConversation.body.messages[0]?.id, 'history-0');
    });
    for (const [range, status, body, contentRange] of [
      ['bytes=-4', 206, '6789', 'bytes 6-9/10'], ['bytes=-20', 206, '0123456789', 'bytes 0-9/10'],
      ['bytes=3-', 206, '3456789', 'bytes 3-9/10'], ['bytes=2-5', 206, '2345', 'bytes 2-5/10'],
      ['bytes=-0', 416, '', 'bytes */10'], ['bytes=10-', 416, '', 'bytes */10']
    ]) await check(`media range ${range}`, async () => {
      const response = await fetch(base + '/uploads/range.mp4', { headers: { Range: range } });
      assert.equal(response.status, status); assert.equal(await response.text(), body);
      assert.equal(response.headers.get('content-range'), contentRange);
    });
    await check('HEAD suffix range returns correct length without body', async () => {
      const response = await fetch(base + '/uploads/range.mp4', { method: 'HEAD', headers: { Range: 'bytes=-4' } });
      assert.equal(response.status, 206); assert.equal(response.headers.get('content-length'), '4'); assert.equal(await response.text(), '');
    });
    for (const raw of ['null', '[]', '"text"', '{broken']) await check(`invalid JSON object ${raw} is a client error`, async () => {
      const response = await post('/api/account/load', null, { raw }); assert.equal(response.status, 400); assert.equal(response.body.ok, false);
    });
    await check('stream upload limit protects disk and returns 413', async () => {
      const response = await post('/api/upload/media', null, { headers: { 'Content-Type': 'image/png', 'X-Auth-Phone': accounts[0].phone, 'X-Auth-Token': accounts[0].token }, raw: Buffer.alloc(4096, 1) });
      assert.equal(response.status, 413);
      await pause(100);
      const files = await fs.readdir(path.join(runtime, 'uploads'), { recursive: true });
      assert.ok(!files.some(name => /-media\./.test(name)), 'oversized partial media must be cleaned up');
    });
    await check('chunked video upload enforces limit and removes partial file', async () => {
      const result = await new Promise((resolve, reject) => {
        const request = require('node:http').request(base + '/api/upload/media', { method: 'POST', headers: {
          'Content-Type': 'video/mp4', 'X-Auth-Phone': accounts[0].phone, 'X-Auth-Token': accounts[0].token,
          'X-Media-Duration': '2', 'Transfer-Encoding': 'chunked'
        } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
        request.on('error', reject); request.write(Buffer.alloc(512)); request.end(Buffer.alloc(4096));
      });
      assert.equal(result, 413); await pause(100);
      const files = await fs.readdir(path.join(runtime, 'uploads'), { recursive: true });
      assert.ok(!files.some(name => /-media\./.test(name)));
    });
    await check('base64 uploads obey the same size limit as streamed uploads', async () => {
      const result = await post('/api/upload/media', { ...auth(accounts[0]), media: 'data:image/png;base64,' + Buffer.alloc(2048).toString('base64') });
      assert.equal(result.status, 413);
    });
    await check('small streamed image remains compatible', async () => {
      const result = await post('/api/upload/media', null, { headers: { 'Content-Type': 'image/png', 'X-Auth-Phone': accounts[0].phone, 'X-Auth-Token': accounts[0].token }, raw: Buffer.from([137, 80, 78, 71]) });
      assert.equal(result.status, 200); assert.ok(result.body.url.startsWith('/uploads/'));
    });
    await check('HTTP growth deletion rejects a stale device and preserves newer records', async () => {
      const db = await read();
      db.users[accounts[0].phone].data = { turtles: [{ id: 'growth-turtle', weight: 30, measureHistory: [
        { id: 'growth-2', oldSnapshot: { weight: 20 }, newSnapshot: { weight: 30 } },
        { id: 'growth-1', oldSnapshot: { weight: 10 }, newSnapshot: { weight: 20 } }
      ] }] };
      await fs.writeFile(filename, JSON.stringify(db));
      const older = (await post('/api/account/load', auth(accounts[0]))).body.user;
      const saved = await post('/api/account/save', { ...auth(accounts[0]), accountName: older.accountName,
        baseDataRevision: older.dataRevision, data: { ...older.data, memos: [{ id: 'newer-memo', title: 'Keep this' }] } });
      assert.equal(saved.status, 200);
      const before = (await read()).users[accounts[0].phone];
      const result = await post('/api/account/growth-record/delete', { ...auth(accounts[0]), turtleId: 'growth-turtle', historyId: 'growth-1', baseDataRevision: older.dataRevision });
      assert.equal(result.status, 409); assert.equal(result.body.code, 'ACCOUNT_DATA_CONFLICT');
      assert.deepEqual((await read()).users[accounts[0].phone], before);
      const current = await post('/api/account/growth-record/delete', { ...auth(accounts[0]), turtleId: 'growth-turtle', historyId: 'growth-1', baseDataRevision: saved.body.user.dataRevision });
      assert.equal(current.status, 200); assert.equal(current.body.user.data.turtles[0].weight, 30);
      assert.equal((await read()).users[accounts[0].phone].data.turtles[0].measureHistory.length, 1);
      const legacy = await post('/api/account/growth-record/delete', { ...auth(accounts[0]), turtleId: 'growth-turtle', historyId: 'growth-2' });
      assert.equal(legacy.status, 200, 'released legacy client may omit revision');
      const reload = await post('/api/account/load', auth(accounts[0]));
      assert.equal(reload.body.user.data.turtles[0].measureHistory.length, 0);
      assert.equal(reload.body.user.data.memos[0].id, 'newer-memo');
    });
    await check('anonymous uploads and forged owner token cannot modify records', async () => {
      assert.equal((await post('/api/upload/image', { image: 'data:image/png;base64,AAAA' })).status, 401);
      const before = (await read()).users[accounts[1].phone];
      assert.equal((await post('/api/account/save', { phone: accounts[1].phone, token: accounts[0].token, data: { turtles: [{ id: 'forged' }] } })).status, 401);
      assert.deepEqual((await read()).users[accounts[1].phone], before);
    });
    if (process.argv.includes('--workflows')) await check('existing full API workflows using the .env-free server copy', async () => {
      const output = await new Promise((resolve, reject) => {
        const runner = spawn(process.execPath, [path.join(root, 'scripts/test-api-workflows.js')], {
          cwd: root, windowsHide: true, env: { ...env, MAX_UPLOAD_BYTES: '', MAX_MEDIA_IMAGE_UPLOAD_BYTES: '', MAX_MEDIA_UPLOAD_BYTES: '', API_TEST_ROOT: app,
            GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: root.replace(/\\/g, '/') }, stdio: ['ignore', 'pipe', 'pipe']
        });
        let text = ''; runner.stdout.on('data', chunk => { text += chunk; }); runner.stderr.on('data', chunk => { text += chunk; });
        runner.on('error', reject); runner.on('exit', code => code === 0 ? resolve(text) : reject(Error(text)));
      });
      console.log(output.trim());
    });
  } finally {
    if (child && child.exitCode === null) { child.kill(); await Promise.race([new Promise(resolve => child.once('exit', resolve)), pause(3000)]); }
    if (child && child.exitCode === null) child.kill('SIGKILL');
    const report = { createdAt: new Date().toISOString(), environment: 'localhost, copied sources without .env, synthetic temporary JSON database', results };
    const out = path.join(root, 'output', 'postrelease-server-audit'); await fs.mkdir(out, { recursive: true });
    const reportName = process.argv.includes('--red') ? 'red.json' : 'report.json';
    await fs.writeFile(path.join(out, reportName), JSON.stringify(report, null, 2));
    // All deletions remain under the verified mkdtemp directory.
    assert.ok(temporary.startsWith(path.join(os.tmpdir(), 'turtle-postrelease-audit-')));
    await fs.rm(temporary, { recursive: true, force: true });
  }
  const failed = results.filter(r => !r.passed);
  console.log(`${results.length - failed.length}/${results.length} checks passed; ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
