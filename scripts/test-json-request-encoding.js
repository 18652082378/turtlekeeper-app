const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
const ctx = { Buffer };
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function readJson('), source.indexOf('function emptyAccountData(')), ctx);
(async () => {
  const payload = { speciesName: '果核蛋龟', status: '正常饲养', note: '孵化成功🐢，体重与背甲', rows: Array.from({ length: 500 }, (_, id) => ({ id, title: '损耗与售出记录' })) };
  const bytes = Buffer.from(JSON.stringify(payload));
  for (const size of [1, 2, 7, 1024]) {
    const req = new EventEmitter();
    const result = ctx.readJson(req);
    for (let offset = 0; offset < bytes.length; offset += size) req.emit('data', bytes.subarray(offset, offset + size));
    req.emit('end');
    assert.deepEqual(JSON.parse(JSON.stringify(await result)), payload, `UTF-8 survives ${size}-byte chunk boundaries`);
  }
  const oversized = new EventEmitter();
  const refused = assert.rejects(ctx.readJson(oversized), /请求内容过大/);
  oversized.emit('data', Buffer.alloc(25 * 1024 * 1024 + 1));
  oversized.emit('data', Buffer.from('ignored'));
  oversized.emit('end');
  await refused;
  const interrupted = new EventEmitter();
  const aborted = assert.rejects(ctx.readJson(interrupted), /请求已中断/);
  interrupted.emit('aborted');
  await aborted;
  console.log('JSON request encoding passed: Chinese/emoji split across byte chunks, large batches, size cap and interrupted requests.');
})().catch(error => { console.error(error); process.exitCode = 1; });
