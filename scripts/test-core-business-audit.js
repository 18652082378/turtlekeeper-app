const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const TurtleBatches = require('../assets/turtle-batches');
const TurtleLossAccounting = require('../assets/loss-accounting');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
let message = '', saves = 0;
const species = { code: 'GHG', name: '果核蛋龟' };
const ctx = { crypto, TurtleBatches, TurtleLossAccounting,
  FormData: class { constructor(fields) { this.fields = fields; } get(key) { return this.fields[key] ?? null; } },
  requireLogin: () => true, requireArchiveCapacity: () => true, speciesByCode: () => species,
  speciesPhoto: () => 'photo.jpg', defaultPhoto: 'photo.jpg', turtleLabel: turtle => turtle.code,
  turtlePoolName: id => ctx.state.turtlePools.find(pool => pool.id === id)?.name || '未关联',
  turtlePoolTypeLabel: type => type, ledgerTypeText: type => type,
  formatDate: () => '2026-09-11', money: value => Number(value).toFixed(2),
  makeActivity: text => ({ text }), logActivity: text => [{ text }],
  activateCareReminder() {}, window: { setTimeout() {} }, confirm: () => true,
  toast: text => { message = text; },
  saveWithDeferredImages: patch => { saves++; Object.assign(ctx.state, patch); return true; },
  setState: patch => { saves++; Object.assign(ctx.state, patch); return true; }
};
vm.createContext(ctx);
for (const [start, end] of [
  ['function submitTurtle(event)', 'function appReviewStorageKey('],
  ['function submitTurtlePool(', 'function openLedgerForm('],
  ['function breedingHatchProgress(', 'function deleteLedgerRecord(']
]) vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), ctx);
const event = fields => ({ preventDefault() {}, currentTarget: { ...fields } });
function reset() {
  message = ''; saves = 0;
  ctx.state = { turtles: [], turtlePools: [], ledgerRecords: [], breedingRecords: [], memos: [], keptSpecies: [], activityLogs: [], formGender: '未知', archivePurchaseMode: 'single', turtlePoolFilter: 'all' };
}
reset();
const breeding = { mother: 'manual', manualMother: '测试种母', eggCount: '5', fertileCount: '5', date: '2026-09-08' };
for (const patch of [{ fertileCount: '6' }, { eggCount: '-1' }, { fertileCount: '1.5' }, { eggCount: 'Infinity' }, { mother: 'missing' }]) {
  ctx.submitBreedingRecord(event({ ...breeding, ...patch }));
  assert.equal(saves, 0, `Reject invalid breeding data: ${JSON.stringify(patch)}`);
}
const breedingEvent = event(breeding);
ctx.submitBreedingRecord(breedingEvent);
ctx.submitBreedingRecord(breedingEvent);
assert.equal(ctx.state.breedingRecords.length, 1, 'Double submit creates one nest');
const record = ctx.state.breedingRecords[0];
ctx.state.selectedBreedingId = record.id;
Object.assign(record, { hatchCount: 2, hatchArchiveIds: ['h1', 'h2'], hatchEvents: [{ id: 'hatch', date: '2026-09-09', count: 2, turtleIds: ['h1', 'h2'] }] });
const before = saves;
ctx.submitBreedingDetail(event({ ...breeding, date: '2026-09-10' }));
assert.equal(saves, before, 'Cannot move egg date later than existing hatches');
assert.match(message, /产蛋日期/);
ctx.submitBreedingDetail(event({ ...breeding, fertileCount: '6' }));
assert.equal(saves, before);
const detailEvent = event(breeding);
ctx.submitBreedingDetail(detailEvent);
ctx.submitBreedingDetail(detailEvent);
assert.equal(saves, before + 1, 'Repeated detail save creates one history entry');

reset();
const poolEvent = event({ name: '苗池', type: 'hatchling', count: '3' });
ctx.submitTurtlePool(poolEvent);
ctx.submitTurtlePool(poolEvent);
assert.equal(ctx.state.turtlePools.length, 1);
const pool = ctx.state.turtlePools[0];
ctx.state.turtles = [{ id: 'a', poolId: pool.id, status: '正常饲养' }, { id: 'b', poolId: 'other', status: '正常饲养' }];
ctx.state.breedingRecords = [{ id: 'nest', poolId: pool.id, poolName: '苗池', eggCount: 5 }];
ctx.state.ledgerRecords = [{ id: 'history', poolId: pool.id, amount: 100 }];
ctx.state.turtlePoolFilter = pool.id;
assert.equal(TurtleBatches.poolCount(pool, ctx.state.turtles), 4);
ctx.deleteTurtlePool(pool.id);
assert.equal(ctx.state.turtles[0].poolId, '');
assert.equal(ctx.state.turtles[1].poolId, 'other');
assert.equal(ctx.state.breedingRecords[0].poolId, '');
assert.equal(ctx.state.ledgerRecords[0].poolId, pool.id, 'Historical ledger retains the original pool');
assert.equal(ctx.state.turtlePoolFilter, 'all');

reset();
ctx.state.turtles = [{ id: 'a', code: 'GHG-1', speciesCode: 'GHG' }, { id: 'c', code: 'GHG-3', speciesCode: 'GHG' }];
ctx.state.ledgerRecords = [{ id: 'sold', type: 'sold', amount: 1, turtleSnapshot: { id: 'b', code: 'GHG-2' } }];
const archive = event({ speciesCode: 'GHG', weight: '1', carapaceLength: '1', price: '1', source: '购买', acquiredDate: '2026-09-08' });
ctx.submitTurtle(archive);
ctx.submitTurtle(archive);
assert.equal(ctx.state.turtles.length, 3);
assert.equal(ctx.state.turtles[0].code, 'GHG-4', 'Auto code must skip existing and sold archives');
ctx.state.ledgerDraftType = 'purchase';
const purchase = event({ purchaseSpeciesCode: 'GHG', amount: '0.01', recordDate: '2026-09-09' });
ctx.submitLedgerRecord(purchase);
ctx.submitLedgerRecord(purchase);
assert.equal(ctx.state.turtles.length, 4);
assert.equal(ctx.state.turtles[0].code, 'GHG-5');
ctx.state.archivePurchaseMode = 'batch';
const batch = event({ speciesCode: 'GHG', batchStage: 'hatchling', batchCount: '2', batchTotalPrice: '0.03', acquiredDate: '2026-09-09' });
ctx.submitTurtle(batch);
ctx.submitTurtle(batch);
assert.equal(ctx.state.turtles.length, 6);
assert.deepEqual(Array.from(ctx.state.turtles.slice(0, 2), t => t.code), ['GHG-6', 'GHG-7']);
assert.deepEqual(Array.from(ctx.state.turtles.slice(0, 2), t => t.price), [0.02, 0.01]);
ctx.state.archivePurchaseMode = 'batch';
const saveCount = saves;
ctx.submitTurtle(event({ speciesCode: 'GHG', batchStage: 'hatchling', batchCount: '1000000000', batchTotalPrice: '1' }));
assert.equal(saves, saveCount, 'Reject an oversized batch before allocation');
assert.match(message, /10000/);
const plan = ctx.buildBreedingHatchPlan({ id: 'nest', eggCount: 2, date: '2026-09-08' }, 1, species, [], [{ turtleSnapshot: { code: 'GHG-孵化1' } }], '2026-09-09');
assert.equal(plan.added[0].code, 'GHG-孵化2', 'Hatch codes also retain sold archive history');
console.log('Core business audit passed: breeding constraints/history, duplicate submissions, safe pool deletion, unique codes after sales, exact cents and oversized batch rejection.');
