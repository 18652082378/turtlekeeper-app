'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), net = require('node:net'), assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), outcomes = [], clone = value => JSON.parse(JSON.stringify(value));
const phones = ['13900000201', '13900000202', '13900000203'];
const id = phone => crypto.createHash('sha256').update('community:' + phone).digest('hex').slice(0, 20);
const auth = index => ({ phone: phones[index], token: 'chat-test-token-' + index });
(async () => {
  const parent = path.join(root, 'output/chat-delete-qa'); fs.mkdirSync(parent, { recursive: true });
  const runtime = fs.mkdtempSync(path.join(parent, 'api-fixture-')); fs.mkdirSync(path.join(runtime, 'data'));
  const recordMode = process.env.CHAT_DELETE_RECORDS === '1';
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
    const args = process.env.CHAT_DELETE_BEFORE ? ['-e', "const M=require('module'),fs=require('fs');const f=process.argv[1],m=new M(f);m.filename=f;m.paths=M._nodeModulePaths(require('path').dirname(f));m._compile(fs.readFileSync(process.argv[2],'utf8'),f)", serverFile, path.join(runtime, 'before.js')] : [...(recordMode ? ['--require', path.join(root, 'scripts/mysql-record-test-preload.js')] : []), serverFile];
    if (process.env.CHAT_DELETE_BEFORE) fs.writeFileSync(path.join(runtime, 'before.js'), execFileSync('git', ['show', 'HEAD:server/server.js'], { cwd: root, maxBuffer: 8 * 1024 * 1024 }));
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
    await post('/api/community/chat/delete', { ...auth(0), token: 'wrong', userId: id(phones[1]) }, 401);
    check('unauthenticated delete changes nothing', () => assert.deepEqual(JSON.parse(fs.readFileSync(dataFile)).messages, db.messages));
    await post('/api/community/chat/delete', { ...auth(2), userId: id(phones[1]) });
    check('a third account cannot delete another pair', () => assert.equal(JSON.parse(fs.readFileSync(dataFile)).messages.filter(item => item.fromPhone !== phones[2]).length, 4));
    const thirdAccount = clone(JSON.parse(fs.readFileSync(dataFile)).users[phones[2]]);
    const deleted = await post('/api/community/chat/delete', { ...auth(0), userId: id(phones[1]) });
    check('delete removes the caller row and clears its unread count', () => { assert.ok(!deleted.friends.some(friend => friend.id === id(phones[1]))); assert.equal(deleted.totalUnreadCount, 1); });
    let result = await chat(0);
    check('deleted text/image/video/product data are absent from the caller API', () => { assert.deepEqual(result.messages, []); assert.equal(result.marketListing, null); });
    result = await chat(1);
    check('the other participant keeps all four original messages', () => assert.equal(result.messages.length, 4));
    const oldUpload = clone(db.users[phones[0]].data);
    await post('/api/account/save', { ...auth(0), data: oldUpload });
    result = await post('/api/community/unread', auth(0));
    check('an old full-account upload cannot restore the deleted row', () => assert.ok(!result.friends.some(friend => friend.id === id(phones[1]))));
    await stop(); await start(); result = await chat(0);
    check('cleared history survives an API restart', () => assert.deepEqual(result.messages, []));
    await post('/api/community/chat/send', { ...auth(1), userId: id(phones[0]), content: '删除后的新消息' });
    result = await chat(0);
    check('new chat restores only new messages for the deleting participant', () => { assert.equal(result.messages.length, 1); assert.equal(result.messages[0].content, '删除后的新消息'); assert.equal(result.marketListing, null); });
    result = await chat(1);
    check('the other participant still has its old history plus the new message', () => assert.equal(result.messages.length, 5));
    const stored = JSON.parse(fs.readFileSync(dataFile));
    check('unrelated conversation and data remain intact', () => { assert.deepEqual(stored.messages.find(item => item.id === 'other'), db.messages.find(item => item.id === 'other')); assert.deepEqual(stored.users[phones[2]], thirdAccount); });
    await post('/api/community/chat/delete', { ...auth(1), userId: id(phones[0]) });
    const bothDeleted = JSON.parse(fs.readFileSync(dataFile));
    check('both participants clearing their copies removes their shared old records', () => assert.ok(!bothDeleted.messages.some(item => ['text', 'image', 'video', 'card'].includes(item.id))));
    result = await chat(1); check('the second participant also sees an empty chat after deleting', () => assert.deepEqual(result.messages, []));
    // Upgrade an old hidden-only deletion without bringing its history back.
    await stop();
    const legacy = JSON.parse(fs.readFileSync(dataFile));
    legacy.users[phones[2]].data.hiddenConversationPhones = [phones[1]];
    delete legacy.users[phones[2]].communityConversationClearVersions;
    delete legacy.users[phones[2]].communityConversationHiddenPhones;
    legacy.messages.push({ id: 'legacy-hidden', fromPhone: phones[1], toPhone: phones[2], content: '旧版隐藏过的历史', createdAt: now });
    fs.writeFileSync(dataFile, JSON.stringify(legacy)); await start();
    await post('/api/community/chat/send', { ...auth(1), userId: id(phones[2]), content: '升级后的新消息' });
    result = await post('/api/community/chat/list', { ...auth(2), userId: id(phones[1]) });
    check('legacy hidden-only deletion upgrades before receiving a new message', () => { assert.equal(result.messages.length, 1); assert.equal(result.messages[0].content, '升级后的新消息'); });
    if (recordMode) {
      const durable = fs.readFileSync(dataFile); fs.writeFileSync(path.join(runtime, 'fail-commit'), 'inject test failure');
      result = await post('/api/community/chat/delete', { ...auth(2), userId: id(phones[1]) }, 500);
      check('failed database commit never reports deletion success or changes durable history', () => { assert.equal(result.ok, false); assert.deepEqual(fs.readFileSync(dataFile), durable); });
    }
    fs.writeFileSync(path.join(parent, 'api-' + (process.env.CHAT_DELETE_BEFORE ? 'before' : recordMode ? 'records-double' : 'after') + '.json'), JSON.stringify({ outcomes }, null, 2));
    console.log(JSON.stringify({ outcomes }, null, 2)); if (outcomes.some(item => !item.pass)) process.exitCode = 1;
  } finally { await stop(); assert.equal(path.dirname(runtime), parent); assert.ok(path.basename(runtime).startsWith('api-fixture-')); fs.rmSync(runtime, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
