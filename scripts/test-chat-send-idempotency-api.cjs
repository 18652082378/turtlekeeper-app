'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), net = require('node:net'), assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), outcomes = [], clone = value => JSON.parse(JSON.stringify(value));
const phones = ['13900000201', '13900000202', '13900000203'];
const id = phone => crypto.createHash('sha256').update('community:' + phone).digest('hex').slice(0, 20);
const auth = index => ({ phone: phones[index], token: 'chat-test-token-' + index });
(async () => {
  const parent = path.join(root, 'output/chat-send-qa'); fs.mkdirSync(parent, { recursive: true });
  const runtime = fs.mkdtempSync(path.join(parent, 'api-fixture-')); fs.mkdirSync(path.join(runtime, 'data'));
  const recordMode = process.env.CHAT_SEND_RECORDS === '1';
  const dataFile = path.join(runtime, recordMode ? 'durable-records.json' : 'data/app-data.json');
  const now = new Date().toISOString();
  const users = Object.fromEntries(phones.map((phone, index) => [phone, { phone, accountName: 'Test ' + index, termsVersion: '2026-09-01', tokens: [{ hash: crypto.createHash('sha256').update(auth(index).token).digest('hex') }], data: { hiddenConversationPhones: [], pinnedConversationPhones: [phones[1]] } }]));
  const db = { users, friendships: [{ key: phones.slice(0, 2).sort().join(':'), phones: phones.slice(0, 2), createdAt: now }],
    messages: [
      { id: 'text', fromPhone: phones[0], toPhone: phones[1], content: '旧文字', createdAt: now },
      { id: 'image', fromPhone: phones[1], toPhone: phones[0], content: '', mediaUrl: '/uploads/old-image.png', mediaType: 'image', createdAt: now },
      { id: 'video', fromPhone: phones[1], toPhone: phones[0], content: '', mediaUrl: '/uploads/old-video.mp4', posterUrl: '/uploads/poster.png', mediaType: 'video', createdAt: now },
      { id: 'card', fromPhone: phones[0], toPhone: phones[1], content: '', marketListing: { id: 'old-product', title: '旧商品' }, createdAt: now },
      { id: 'other', fromPhone: phones[2], toPhone: phones[0], content: '别的会话', createdAt: now }
    ], marketListings: [] };
  fs.writeFileSync(dataFile, JSON.stringify(db));
  const port = await new Promise((resolve, reject) => { const listener = net.createServer(); listener.once('error', reject); listener.listen(0, '127.0.0.1', () => { const port = listener.address().port; listener.close(error => error ? reject(error) : resolve(port)); }); });
  let child, output = '';
  async function start() {
    const serverFile = path.join(root, 'server/server.js');
    const args = process.env.CHAT_SEND_BEFORE ? ['-e', "const M=require('module'),fs=require('fs');const f=process.argv[1],m=new M(f);m.filename=f;m.paths=M._nodeModulePaths(require('path').dirname(f));m._compile(fs.readFileSync(process.argv[2],'utf8'),f)", serverFile, path.join(runtime, 'before.js')] : [...(recordMode ? ['--require', path.join(root, 'scripts/mysql-record-test-preload.js')] : []), serverFile];
    if (process.env.CHAT_SEND_BEFORE) fs.writeFileSync(path.join(runtime, 'before.js'), execFileSync('git', ['show', 'HEAD:server/server.js'], { cwd: root, maxBuffer: 8 * 1024 * 1024 }));
    child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), TURTLE_RUNTIME_DIR: runtime, MYSQL_URL: '', MYSQL_HOST: recordMode ? 'isolated-driver' : '', MYSQL_STORAGE_MODE: 'records', SMS_MODE: 'mock', APNS_KEY_PATH: '', APNS_KEY_BASE64: '', TURTLE_TEST_RECORD_DRIVER: '1', TURTLE_TEST_DURABLE_FILE: dataFile, TURTLE_TEST_FAIL_FILE: path.join(runtime, 'fail-commit'), TURTLE_TEST_COMMIT_DELAY: '20' } });
    child.stdout.on('data', bytes => output += bytes); child.stderr.on('data', bytes => output += bytes);
    for (let i = 0; i < 60; i++) { try { if ((await fetch('http://127.0.0.1:' + port + '/api/app/version')).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 80)); }
    throw Error(output);
  }
  async function stop() { if (!child || child.exitCode !== null) return; await new Promise(resolve => { child.once('exit', resolve); child.kill(); }); }
  async function post(route, body, status = 200) {
    const response = await fetch('http://127.0.0.1:' + port + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    const result = await response.json(); assert.equal(response.status, status, route + ' ' + JSON.stringify(result)); return result;
  }
  function check(name, run) { try { run(); outcomes.push({ name, pass: true }); } catch (error) { outcomes.push({ name, pass: false, error: error.message }); } }
  const chat = index => post('/api/community/chat/list', { ...auth(index), userId: id(phones[1 - index]) });
  try {
    await start();
    const payload = { ...auth(0), userId: id(phones[1]), content: '你要买我再加', clientMessageId: 'intent-00000000000001' };
    const responses = await Promise.all(Array.from({length: 20}, () => post('/api/community/chat/send', payload)));
    check('20 concurrent retries create exactly one durable message', () => {
      const stored = JSON.parse(fs.readFileSync(dataFile));
      assert.equal(stored.messages.filter(item => item.content === payload.content).length, 1);
      assert.equal(responses.filter(item => item.deduplicated).length, 19);
      assert.ok(responses.every(item => item.messages.filter(message => message.content === payload.content).length === 1));
    });
    await stop(); await start();
    const retried = await post('/api/community/chat/send', payload);
    check('lost acknowledgement retry after restart stays idempotent', () => assert.equal(retried.deduplicated, true));
    await post('/api/community/chat/send', {...payload, content: 'changed'}, 409);
    check('same identifier cannot silently change its content', () => assert.equal(JSON.parse(fs.readFileSync(dataFile)).messages.filter(item => item.content === 'changed').length, 0));
    await post('/api/community/chat/send', {...payload, token: 'wrong'}, 401);
    await post('/api/community/chat/send', {...payload, clientMessageId: 'bad'}, 400);
    await post('/api/community/chat/send', {...payload, clientMessageId: 'intent-00000000000002'});
    check('two deliberate identical messages with distinct identifiers are retained', () => assert.equal(JSON.parse(fs.readFileSync(dataFile)).messages.filter(item => item.content === payload.content).length, 2));
    await post('/api/community/chat/send', {...payload, ...auth(2)});
    check('another sender may use its own same identifier', () => assert.equal(JSON.parse(fs.readFileSync(dataFile)).messages.filter(item => item.fromPhone === phones[2] && item.content === payload.content).length, 1));
    const media = {...payload, content: '', mediaUrl: '/uploads/2026/10/photo.jpg', mediaType: 'image', clientMessageId: 'intent-00000000000003'};
    await post('/api/community/chat/send', media); await post('/api/community/chat/send', media);
    check('media sends use the same durable retry protection', () => assert.equal(JSON.parse(fs.readFileSync(dataFile)).messages.filter(item => item.mediaUrl === media.mediaUrl).length, 1));
    await post('/api/community/chat/delete', {...auth(0), userId: id(phones[1])});
    await post('/api/community/chat/delete', {...auth(1), userId: id(phones[0])});
    const deletedRetry = await post('/api/community/chat/send', payload);
    check('retry after both participants clear history does not restore messages or the row', () => { assert.equal(deletedRetry.deduplicated, true); assert.deepEqual(deletedRetry.messages, []); assert.ok(deletedRetry.conversationState.hiddenIds.includes(id(phones[1]))); });
    if (recordMode) {
      const durable = fs.readFileSync(dataFile); fs.writeFileSync(path.join(runtime, 'fail-commit'), 'injected failure');
      const failed = await post('/api/community/chat/send', {...payload, clientMessageId: 'intent-00000000000004'}, 500);
      check('failed transaction never acknowledges or persists a new send', () => { assert.equal(failed.ok, false); assert.deepEqual(fs.readFileSync(dataFile), durable); });
    }
    fs.writeFileSync(path.join(parent, recordMode ? 'records-double.json' : 'json.json'), JSON.stringify({outcomes}, null, 2));
    console.log(JSON.stringify({outcomes}, null, 2)); if (outcomes.some(item => !item.pass)) process.exitCode=1;
  } finally { await stop(); assert.equal(path.dirname(runtime), parent); assert.ok(path.basename(runtime).startsWith('api-fixture-')); fs.rmSync(runtime, { recursive:true, force:true }); }
})().catch(error => { console.error(error); process.exitCode=1 });
