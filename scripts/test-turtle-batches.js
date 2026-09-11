const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const TurtleBatches = require('../assets/turtle-batches');
const TurtleLossAccounting = require('../assets/loss-accounting');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
let message, saved;
const ctx = { TurtleBatches, TurtleLossAccounting, crypto,
  FormData: class { constructor(values) { this.values = values; } get(key) { return this.values[key] ?? null; } },
  requireLogin: () => true, requireArchiveCapacity: () => true,
  speciesPhoto: () => 'photo.jpg', defaultPhoto: 'photo.jpg', escapeHtml: value => String(value),
  formatDate: () => '2026-09-10', formatTime: value => value, money: value => Number(value).toFixed(2),
  turtleDraftValue: (turtle, key) => turtle[key] ?? '', turtleKeepingDays: () => '已饲养 0 天',
  turtleActionIcon: () => '', topbar: () => '', bottomNav: () => '',
  turtleTotalCost: turtle => Number(turtle.price || 0),
  makeActivity: text => ({ id: crypto.randomUUID(), text, createdAt: '2026-09-10' }),
  saveWithDeferredImages: patch => { saved = patch; Object.assign(ctx.state, patch); },
  toast: text => { message = text; }, activateCareReminder: () => {}, window: { setTimeout() {} },
  state: { turtles: [], ledgerRecords: [], turtlePools: [{ id: 'p1', name: '苗池', count: 7 }, { id: 'p2', name: '新池', count: 0 }], memos: [], keptSpecies: [], activityLogs: [], formPhoto: '', turtleSort: 'default', turtleFilter: 'all', turtlePoolFilter: 'all' }
};
ctx.turtlePoolName = id => ctx.state.turtlePools.find(pool => pool.id === id)?.name || '未关联';
vm.createContext(ctx);
for (const [start, end] of [
  ['function turtleBatchLabel(', 'function turtleListRow('],
  ['function sortedTurtles()', 'function archiveDashboardSection()'],
  ['function submitBatchTurtles(', 'function appReviewStorageKey()']
]) vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), ctx);
const event = fields => ({ preventDefault() {}, currentTarget: fields });
ctx.submitBatchTurtles(new ctx.FormData({ batchStage: 'hatchling', batchCount: '500', batchTotalPrice: '1000.01', poolId: 'p1', acquiredDate: '2026-09-10' }), { code: 'GHG', name: '果核蛋龟' });
assert.equal(ctx.state.turtles.length, 500, `Preserve individually linked inventory and accounting IDs: ${message}`);
assert.equal(ctx.sortedTurtles().length, 1, '500 turtles render as one batch');
assert.equal(ctx.state.memos.length, 1, 'Create one batch reminder');
assert.equal(ctx.state.ledgerRecords.length, 1, 'Create one purchase record');
assert.equal(ctx.state.turtles.reduce((sum, t) => sum + Math.round(t.price * 100), 0), 100001, 'Allocate cents exactly');
assert.equal(TurtleBatches.poolCount(ctx.state.turtlePools[0], ctx.state.turtles), 507);
assert.match(ctx.turtleBatchListRow(ctx.sortedTurtles()[0]), /在养 500 只/);
const leader = ctx.state.turtles[0];
const update = { batchName: '九月果核批次', stage: 'juvenile', poolId: 'p2', health: '__KEEP__', maleCount: '200', femaleCount: '250', unknownCount: '50', note: '转池观察' };
ctx.submitTurtleBatchDetail(event(update), leader);
assert.equal(TurtleBatches.poolCount(ctx.state.turtlePools[0], ctx.state.turtles), 7);
assert.equal(TurtleBatches.poolCount(ctx.state.turtlePools[1], ctx.state.turtles), 500);
assert.equal(TurtleBatches.summary(ctx.state.turtles).male, 200);
const genders = ctx.state.turtles.map(t => t.gender);
ctx.submitTurtleBatchDetail(event({ ...update }), ctx.state.turtles[0]);
assert.equal(TurtleBatches.poolCount(ctx.state.turtlePools[1], ctx.state.turtles), 500, 'Repeated saves never inflate counts');
assert.deepEqual(ctx.state.turtles.map(t => t.gender), genders, 'Unchanged totals preserve individual genders');
saved = undefined;
ctx.submitTurtleBatchDetail(event({ ...update, unknownCount: '51' }), ctx.state.turtles[0]);
assert.equal(saved, undefined, 'Reject inconsistent gender counts');
ctx.state.selectedTurtleId = leader.id;
const lossEvent = event({ type: 'loss', count: '12', poolId: 'p2', gender: '未知', amount: '999999', recordDate: '2026-09-10' });
ctx.submitTurtleBatchMovement(lossEvent);
assert.equal(TurtleBatches.poolCount(ctx.state.turtlePools[1], ctx.state.turtles), 488);
assert.equal(ctx.sortedTurtles().length, 1, 'Lost members stay in the same batch');
assert.equal(TurtleBatches.summary(ctx.state.turtles).lost, 12);
assert.equal(ctx.state.ledgerRecords.reduce((sum, r) => sum + Math.round(r.amount * 100), 0), 100001, 'Loss moves purchase cost without double counting');
saved = undefined; ctx.submitTurtleBatchMovement(lossEvent); assert.equal(saved, undefined, 'Do not submit movements twice');
const loss = ctx.state.ledgerRecords.find(r => r.type === 'loss');
Object.assign(ctx.state, TurtleLossAccounting.undoLoss(ctx.state, loss));
assert.equal(TurtleBatches.poolCount(ctx.state.turtlePools[1], ctx.state.turtles), 489, 'Undo loss restores pond count');
ctx.submitTurtleBatchMovement(event({ type: 'sold', count: '100', poolId: 'p2', gender: '公', amount: '300.01', recordDate: '2026-09-10' }));
assert.equal(TurtleBatches.poolCount(ctx.state.turtlePools[1], ctx.state.turtles), 389);
assert.equal(TurtleBatches.summary(ctx.state.turtles).male, 100);
assert.equal(ctx.state.ledgerRecords.filter(r => r.type === 'sold').reduce((sum, r) => sum + Math.round(r.amount * 100), 0), 30001);
assert.equal(ctx.sortedTurtles().length, 1, 'Sale of representative retains remaining batch');
saved = undefined;
ctx.submitTurtleBatchMovement(event({ type: 'sold', count: '101', poolId: 'p2', gender: '公', amount: '0', recordDate: '2026-09-10' }));
assert.equal(saved, undefined, 'Cannot remove more than the selected gender/pool count');
assert.match(message, /100 只/);
const single = { id: 'single', speciesCode: 'GHG', code: '单只', poolId: 'p2', price: 20, status: '正常饲养' };
ctx.state.turtles.push(single);
assert.equal(ctx.sortedTurtles().length, 2, 'Single archives remain separate');
assert.equal(TurtleBatches.poolCount(ctx.state.turtlePools[1], ctx.state.turtles), 390);
ctx.state.turtles[0].poolId = 'p1';
ctx.state.turtlePoolFilter = 'p1';
assert.equal(ctx.sortedTurtles().length, 1);
assert.equal(ctx.sortedTurtles()[0].batchMembers.length, 400, 'Pool filtering retains the complete batch');
ctx.state.turtlePoolFilter = 'all';
ctx.state.updatingTurtleId = ctx.state.selectedTurtleId;
const detail = ctx.pageTurtleBatchDetail(ctx.state.turtles.find(t => t.id === ctx.state.selectedTurtleId));
assert.match(detail, /保存批次更新/);
assert.doesNotMatch(detail, /id="turtleBatchMovementForm"/, 'Save batch edits before changing inventory');
ctx.state.updatingTurtleId = '';
assert.match(ctx.pageTurtleBatchDetail(ctx.state.turtles.find(t => t.id === ctx.state.selectedTurtleId)), /本次数量/);
assert.doesNotMatch(detail, /name="weight"|name="carapaceLength"/, 'Batch update does not require single-turtle measurements');
// Legacy batches only need their existing batchId; no destructive migration.
assert.equal(TurtleBatches.group([{ id: 'old-1', batchId: 'old' }, { id: 'old-2', batchId: 'old' }]).length, 1);
console.log('Batch purchase, display, updates, pool transfers, partial sales/losses, undo and legacy grouping passed.');
