const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const script = source.slice(source.indexOf('async function downloadTextFile('), source.indexOf('function exportAccountData('));
function setup(native = true) {
  const messages = [];
  let clicks = 0;
  const ctx = {
    window: { Capacitor: { isNativePlatform: () => native, getPlatform: () => 'ios', Plugins: { TurtleMediaPicker: {} } } },
    toast: text => messages.push(text), Blob,
    URL: { createObjectURL: () => 'blob:export', revokeObjectURL() {} },
    setTimeout() {},
    document: { body: { appendChild() {} }, createElement: () => ({ click() { clicks++; }, remove() {} }) },
  };
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  return { ctx, messages, clicks: () => clicks };
}
(async () => {
  const native = setup();
  let complete;
  native.ctx.window.Capacitor.Plugins.TurtleMediaPicker.exportText = args => {
    assert.equal(args.filename, '经营报表.csv');
    assert.equal(args.content, '\ufeff类型,金额\n损耗,450');
    return new Promise(resolve => { complete = resolve; });
  };
  const pending = native.ctx.downloadTextFile('经营报表.csv', '类型,金额\n损耗,450', 'text/csv');
  assert.equal(native.messages.length, 0, 'No success message before a real save result');
  complete({ saved: true, filename: '经营报表.csv' });
  assert.equal(await pending, true);
  assert.match(native.messages[0], /你选择的位置/);
  assert.equal(native.clicks(), 0, 'Native export never attempts an unsupported blob download');
  native.ctx.window.Capacitor.Plugins.TurtleMediaPicker.exportText = async () => ({ cancelled: true });
  assert.equal(await native.ctx.downloadTextFile('backup.json', '{}'), false);
  assert.match(native.messages.at(-1), /取消/);
  native.ctx.window.Capacitor.Plugins.TurtleMediaPicker.exportText = async () => { throw new Error('not implemented'); };
  assert.equal(await native.ctx.downloadTextFile('backup.json', '{}'), false);
  assert.match(native.messages.at(-1), /更新 App/);
  native.ctx.window.Capacitor.Plugins.TurtleMediaPicker.exportText = async () => { throw new Error('磁盘空间不足'); };
  assert.equal(await native.ctx.downloadTextFile('backup.json', '{}'), false);
  assert.match(native.messages.at(-1), /磁盘空间不足/);
  const web = setup(false);
  assert.equal(await web.ctx.downloadTextFile('经营报表.csv', '损耗,450', 'text/csv'), true);
  assert.equal(web.clicks(), 1);
  assert.match(web.messages[0], /浏览器下载列表/);
  console.log('Export checks passed: native save confirmation, cancel, unsupported build, failure, and browser download.');
})().catch(error => { console.error(error); process.exitCode = 1; });
