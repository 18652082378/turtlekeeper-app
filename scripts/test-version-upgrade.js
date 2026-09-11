const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createLegacyData, legacyNormalize } = require('./legacy-upgrade-fixture');
const batches = require('../assets/turtle-batches');
const loss = require('../assets/loss-accounting');
const codec = require('../assets/local-data-codec');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const ctx = { crypto, TurtleBatches: batches, TurtleLossAccounting: loss, cleanText: x => x, speciesPhoto: () => '/assets/species/GHG.jpg', formatDate: () => '2026-09-11' };
vm.createContext(ctx);
for (const [start, end] of [['function emptyAccountData(', 'function syncRegisteredUsers('], ['function breedingHatchProgress(', 'function confirmBreedingHatch(']]) {
  vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), ctx);
}
const normalize = data => JSON.parse(JSON.stringify(ctx.normalizeAccountData(data)));
const old = createLegacyData();
const pristine = JSON.stringify(old);
const migrated = normalize(old);
assert.equal(JSON.stringify(old), pristine, 'migration never mutates its source backup');
assert.deepEqual(migrated.turtles.map(t => t.id), old.turtles.map(t => t.id));
assert.equal(batches.group(migrated.turtles).length, 3, '500 purchases and old hatch dates 3+2 become three rows');
assert.equal(migrated.ledgerRecords.length, old.ledgerRecords.length, 'migration never creates another purchase');
assert.equal(migrated.ledgerRecords[0].amount, 180000);
assert.equal(new Set(migrated.turtles.filter(t => t.source === '购买').map(t => t.photo)).size, 1);
assert.equal(batches.poolCount(migrated.turtlePools[0], migrated.turtles), 505, 'unconfirmed historical count is not blindly added');
assert.equal(migrated.turtlePools[0].count, 7, 'preserve the original hand-entered number');
assert.equal(batches.poolCountNeedsReview(migrated.turtlePools[0]), true);
assert.equal(batches.poolCount({ id: 'pool', count: 500 }, migrated.turtles.slice(0, 500)), 500, 'old total 500 plus 500 linked never becomes 1000');
assert.equal(batches.poolCount({ id: 'pool', count: 7, countMode: 'additional' }, migrated.turtles), 512, 'confirmed extra stock still counts');
assert.deepEqual(normalize(codec.parse(codec.stringify(migrated))), migrated, 'repeated restart and local codec round-trip are idempotent');
assert.deepEqual(normalize(JSON.parse(JSON.stringify(migrated))), migrated, 'cloud JSON round-trip is idempotent');

for (const [count, amount] of [[3, 1], [6, 5000], [500, 1000.01]]) {
  const before = createLegacyData(count, amount);
  const after = normalize(before);
  const purchased = after.turtles.filter(t => t.source === '购买');
  assert.equal(purchased.reduce((sum, t) => sum + Math.round(t.price * 100), 0), Math.round(amount * 100));
  assert.equal(after.ledgerRecords[0].amount, amount, 'keep original purchase total');
  assert.ok(purchased.some(t => t.legacyBatchUnitPrice !== undefined), 'retain old unit price for audit');
  assert.deepEqual(normalize(after), after, 'rounding allocation runs once');
  let allLost = after;
  for (const turtle of purchased) {
    const record = { id: `loss-${turtle.id}`, turtleId: turtle.id, type: 'loss', recordDate: '2026-09-11' };
    allLost = loss.transferLoss({ ...allLost, ledgerRecords: [record, ...allLost.ledgerRecords] }, record, turtle);
  }
  assert.equal(allLost.ledgerRecords.filter(r => r.type === 'loss').reduce((sum, r) => sum + Math.round(r.amount * 100), 0), Math.round(amount * 100), 'all losses exhaust cost exactly');
}
const edited = createLegacyData(3, 1);
edited.turtles[0].price = 99;
assert.equal(normalize(edited).turtles[0].price, 99, 'do not redistribute a user-edited price');

const species = { code: 'GHG', name: '果核蛋龟' };
const nest = migrated.breedingRecords[0];
const continuation = ctx.buildBreedingHatchPlan(nest, 2, species, migrated.turtles, migrated.ledgerRecords, '2026-09-11', 'new-event');
assert.equal(continuation.hatchCount, 7);
assert.equal(continuation.added.length, 2, 'old cumulative 5 plus this-time 2, not another 7 archives');
assert.equal(batches.group([...migrated.turtles, ...continuation.added]).length, 4);

const countOnly = migrated.breedingRecords[1];
const linked = ctx.buildBreedingHatchPlan(countOnly, 3, species, migrated.turtles, migrated.ledgerRecords, '2026-09-10', 'historical-event', '2026-09-11', true);
assert.equal(linked.hatchCount, 3, 'link existing count without incrementing it');
const linkedRecord = { ...countOnly, ...linked, added: undefined };
assert.equal(ctx.buildBreedingHatchPlan(linkedRecord, 3, species, linked.added, [], '2026-09-10', 'historical-event', '2026-09-11', true).added.length, 0);
assert.throws(() => ctx.buildBreedingHatchPlan(linkedRecord, 3, species, linked.added, [], '2026-09-10', 'another-event', '2026-09-11', true), /不能重复关联/);
const next = ctx.buildBreedingHatchPlan(linkedRecord, 2, species, linked.added, [], '2026-09-11', 'later-event');
assert.equal(next.hatchCount, 5);
const newBeforeLink = ctx.buildBreedingHatchPlan(countOnly, 2, species, [], [], '2026-09-11', 'before-link');
const pendingHistory = { ...countOnly, hatchCount: newBeforeLink.hatchCount, hatchEvents: newBeforeLink.hatchEvents, hatchArchiveIds: newBeforeLink.hatchArchiveIds };
const linkAfterNew = ctx.buildBreedingHatchPlan(pendingHistory, 3, species, newBeforeLink.added, [], '2026-09-10', 'after-new', '2026-09-11', true);
assert.equal(linkAfterNew.hatchCount, 5, 'linking history after a new event also preserves the cumulative count');
const newData = normalize({ ...migrated, turtles: [...migrated.turtles, ...linked.added, ...next.added],
  breedingRecords: [nest, { ...countOnly, hatchCount: next.hatchCount, hatchArchiveIds: next.hatchArchiveIds, hatchEvents: next.hatchEvents }] });
assert.deepEqual(normalize(legacyNormalize(newData)), newData, 'old client ordinary load/save preserves new batch IDs, cost allocation and hatch events');
// Sold or lost old hatchlings stay counted and are never recreated on upgrade.
const hatchlings = migrated.turtles.filter(t => t.sourceBreedingId === nest.id);
const snapshots = hatchlings.slice(0, 2).map((t, i) => ({ id: `old-move-${i}`, type: i ? 'loss' : 'sold', turtleId: t.id, turtleSnapshot: t, amount: 0, recordDate: '2026-09-10' }));
const archived = normalize({ ...migrated, turtles: migrated.turtles.filter(t => !hatchlings.slice(0, 2).some(old => old.id === t.id)), ledgerRecords: [...snapshots, ...migrated.ledgerRecords] });
assert.equal(ctx.breedingHatchProgress(nest, archived.turtles, archived.ledgerRecords).unlinked, 0);
assert.equal(archived.turtles.some(t => t.id === hatchlings[0].id), false, 'sold hatchling stays sold');
assert.equal(archived.turtles.find(t => t.id === hatchlings[1].id).status, '已死亡');
assert.deepEqual(normalize(archived), archived);
console.log('1.0.7 upgrade passed: actual legacy generators, 500-member grouping, exact costs, date groups, count-only linking, continued hatching, sold/lost preservation and repeat normalization.');
