const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const accounting = require('../assets/loss-accounting');
const codec = require('../assets/local-data-codec');
const photo = 'data:image/jpeg;base64,' + 'A'.repeat(24000);
const turtles = Array.from({ length: 499 }, (_, i) => ({ id: crypto.randomUUID(), code: `GHG-${i}`, batchId: 'batch',
  price: 360, photo, status: '正常饲养', health: '健康', speciesName: '果核蛋龟', poolId: 'p1', measureHistory: [] }));
const purchase = { id: 'purchase', type: 'purchase', batchPurchase: true, turtleId: turtles[0].id, turtleIds: turtles.map(t => t.id),
  amount: 179640, title: '购入 499 只', photo, turtleSnapshot: { ...turtles[0] } };
let data = { turtles, ledgerRecords: [purchase], memos: [] };
for (const turtle of turtles.slice(0, 399)) {
  const loss = { id: `loss-${turtle.id}`, type: 'loss', turtleId: turtle.id, turtleSnapshot: { ...turtle }, photo };
  data = accounting.transferLoss({ ...data, ledgerRecords: [loss, ...data.ledgerRecords] }, loss, turtle);
}
assert.equal(data.turtles.filter(t => t.status !== '已死亡').length, 100);
assert.equal(data.ledgerRecords.find(r => r.type === 'purchase').amount, 36000);
assert.ok(data.ledgerRecords.filter(r => r.type === 'loss').every(r => r.transferredPurchase.turtleIds.length === 1));
const raw = JSON.stringify(data);
const encoded = codec.stringify(data);
assert.ok(raw.length > 5 * 1024 * 1024, 'Reproduce storage exhaustion with repeated batch photos');
assert.ok(encoded.length < 2 * 1024 * 1024, 'Recovery copy and cloud journal can both fit');
assert.deepEqual(codec.parse(encoded), JSON.parse(raw), 'Every photo, history, amount and snapshot round trips exactly');
assert.deepEqual(codec.parse(raw), JSON.parse(raw), 'Old plain JSON backups still load');
const legacy = { ...data, ledgerRecords: data.ledgerRecords.map(record => record.type === 'loss'
  ? { ...record, transferredPurchase: { ...record.transferredPurchase, turtleIds: turtles.map(t => t.id) } } : record) };
const originalIds = legacy.ledgerRecords[0].transferredPurchase.turtleIds.length;
const migrated = accounting.reconcile(legacy);
assert.equal(legacy.ledgerRecords[0].transferredPurchase.turtleIds.length, originalIds, 'Migration does not mutate legacy data');
assert.deepEqual(accounting.reconcile(migrated), migrated, 'Repeated loads do not change records');
let restored = codec.parse(codec.stringify(migrated));
for (const record of [...restored.ledgerRecords].filter(r => r.type === 'loss').reverse()) restored = accounting.undoLoss(restored, record);
assert.equal(restored.turtles.filter(t => t.status === '正常饲养').length, 499);
assert.equal(restored.ledgerRecords.length, 1);
assert.equal(restored.ledgerRecords[0].amount, 179640);
assert.equal(new Set(restored.ledgerRecords[0].turtleIds).size, 499);
assert.ok(restored.turtles.every(t => t.photo === photo));
// References live outside the application data, so arbitrary keys cannot collide.
const unusual = JSON.parse('{"__proto__":{"photo":null},"format":"user-value","textRefs":[],"nil":null}');
unusual.__proto__.photo = photo; unusual.other = photo;
assert.deepEqual(codec.parse(codec.stringify(unusual)), unusual);
assert.equal(Object.prototype.photo, undefined);
assert.equal(codec.parse(null), null);
assert.deepEqual(codec.parse(codec.stringify({ optional: undefined, list: [null, 'short'] })), { list: [null, 'short'] });
console.log(`399 losses / 499 turtles: raw ${(raw.length / 1048576).toFixed(2)} MiB -> local ${(encoded.length / 1048576).toFixed(2)} MiB; exact reload, legacy migration and all 399 undos passed.`);
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
let uploads = 0;
const ctx = { state: data, cloudImageMigrationInFlight: false, cloudImageMigrationQueued: false,
  hasCloudSession: () => true, isEmbeddedImage: value => String(value || '').startsWith('data:image/'), defaultPhoto: 'default',
  uploadDataUrlToCloud: async () => { uploads++; return 'https://example.test/shared-batch.jpg'; },
  saveState() {}, render() {}, refreshCareReminderTimers() {}, pushCloudDataNow: async () => {},
  scheduleCloudImageMigration() {}, toast() {}, console };
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function isMigratableImage('), source.indexOf('function turtleDraftValue(')), ctx);
(async () => {
  await ctx.migrateEmbeddedImagesToCloud();
  assert.equal(uploads, 1, '499 batch members and all purchase/loss snapshots share exactly one upload');
  assert.ok(ctx.state.turtles.every(t => t.photo === 'https://example.test/shared-batch.jpg'));
  assert.ok(ctx.state.ledgerRecords.filter(r => r.type === 'loss').every(r => r.transferredPurchase.photo === 'https://example.test/shared-batch.jpg'));
  await ctx.migrateEmbeddedImagesToCloud();
  assert.equal(uploads, 1, 'Repeat saves do not reupload the same image');
  console.log('Shared batch image: one upload, reused by every member and loss snapshot.');
  // A loss entered while a slow photo upload is pending must survive when
  // the upload completes; only image URLs may be changed by that completion.
  ctx.state = { loggedInPhone: 'same-account', ...data };
  let finishUpload;
  ctx.uploadDataUrlToCloud = () => new Promise(resolve => { finishUpload = resolve; });
  const uploading = ctx.migrateEmbeddedImagesToCloud();
  const currentTurtle = ctx.state.turtles.find(t => t.status !== '已死亡');
  const concurrentLoss = { id: 'loss-during-upload', type: 'loss', turtleId: currentTurtle.id, photo };
  ctx.state = accounting.transferLoss({ ...ctx.state, ledgerRecords: [concurrentLoss, ...ctx.state.ledgerRecords] }, concurrentLoss, currentTurtle);
  ctx.state.turtles = ctx.state.turtles.map(t => t.id === currentTurtle.id ? { ...t, note: 'edited during upload' } : t);
  finishUpload('https://example.test/concurrent.jpg');
  await uploading;
  assert.equal(ctx.state.turtles.filter(t => t.status !== '已死亡').length, 99);
  assert.ok(ctx.state.ledgerRecords.some(r => r.id === concurrentLoss.id));
  assert.equal(ctx.state.turtles.find(t => t.id === currentTurtle.id).note, 'edited during upload');
  assert.equal(ctx.state.ledgerRecords.find(r => r.id === concurrentLoss.id).photo, 'https://example.test/concurrent.jpg');
  console.log('Concurrent loss and edits survive delayed photo uploads.');
})().catch(error => { console.error(error); process.exitCode = 1; });
