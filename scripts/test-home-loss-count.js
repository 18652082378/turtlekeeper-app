const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const ctx = { state: { turtles: [], ledgerRecords: [] } };
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function activeTurtles()'), source.indexOf('function chinaDateParts(')), ctx);
assert.equal(ctx.stats().loss, 0);
ctx.state.turtles = [
  { id: 'alive', status: '正常饲养', health: '健康', speciesCode: 'A' },
  { id: 'dead', status: '已死亡', speciesCode: 'A' }
];
ctx.state.ledgerRecords = [
  { type: 'loss', turtleId: 'removed' },
  { type: 'loss', turtleId: 'removed' },
  { type: 'loss', turtleId: 'dead' },
  { type: 'loss', turtleSnapshot: { id: 'legacy' } },
  { type: 'loss', amount: 100 }, // Money-only entries have no known turtle count.
  { type: 'sold', turtleId: 'sold' },
  { type: 'other', turtleId: 'alive' }
];
assert.equal(ctx.stats().loss, 3, 'Count deceased and removed turtles once, excluding expenses and sales');
assert.equal(ctx.stats().total, 2);
assert.equal(ctx.stats().active, 1);
ctx.state.ledgerRecords = [];
assert.equal(ctx.stats().loss, 1, 'Deleting ledger records updates the count');
delete ctx.state.ledgerRecords;
assert.equal(ctx.stats().loss, 1, 'Older state without ledger records is supported');
// Reproduce the upgrade screenshot: 537 archives, 532 active, four losses,
// and one healthy transferred turtle that must not inflate current health.
ctx.state.turtles = [
  ...Array.from({ length: 532 }, (_, i) => ({ id: `active-${i}`, status: '正常饲养', health: '健康', speciesCode: 'A' })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `dead-${i}`, status: '已死亡', health: '健康', speciesCode: 'A' })),
  { id: 'sold', status: '已转让', health: '健康', speciesCode: 'A' }
];
const before = JSON.stringify(ctx.state);
assert.equal(ctx.stats().total, 537);
assert.equal(ctx.stats().active, 532);
assert.equal(ctx.stats().healthy, 532);
assert.equal(ctx.stats().sick, 0);
assert.equal(ctx.stats().loss, 4);
assert.equal(JSON.stringify(ctx.state), before, 'Statistics preserve historical archive data');

ctx.state.turtles[0].health = '生病';
ctx.state.turtles[532].health = '生病';
ctx.state.turtles[536].health = '生病';
assert.equal(ctx.stats().healthy, 531);
assert.equal(ctx.stats().sick, 1, 'Exclude deceased and transferred sick turtles');
assert.equal(ctx.stats().healthy + ctx.stats().sick, ctx.stats().active);
ctx.state.turtles = [];
assert.equal(ctx.stats().healthy, 0);
assert.equal(ctx.stats().sick, 0);
console.log('Home loss and active health counts passed.');
ctx.state.turtlePools = [{ id: 'one' }, { id: 'two' }];
ctx.state.turtles = [
  { id: 'a', speciesCode: 'A', poolId: 'one', status: '正常饲养', health: '健康' },
  { id: 'b', speciesCode: 'A', poolId: 'two', status: '正常饲养', health: '生病' },
  { id: 'c', speciesCode: 'B', poolId: 'one', status: '已死亡' },
  { id: 'd', speciesCode: 'B', poolId: 'deleted', status: '正常饲养', health: '健康' }
];
ctx.state.ledgerRecords = [
  { type: 'loss', turtleId: 'removed', turtleSnapshot: { id: 'removed', speciesCode: 'A', poolId: 'one' } },
  { type: 'loss', turtleId: 'removed', turtleSnapshot: { id: 'removed', speciesCode: 'A', poolId: 'one' } },
  { type: 'loss', turtleId: 'c', turtleSnapshot: { id: 'c', speciesCode: 'A', poolId: 'two' } },
  { type: 'loss', turtleId: 'legacy' }
];
ctx.state.turtleFilter = 'A'; ctx.state.turtlePoolFilter = 'one';
assert.deepEqual(JSON.parse(JSON.stringify(ctx.stats())), { total: 1, active: 1, healthy: 1, sick: 0, loss: 1, species: 1 });
ctx.state.turtleFilter = 'B'; ctx.state.turtlePoolFilter = 'one';
assert.equal(ctx.stats().loss, 1, 'Current archive metadata wins over an outdated loss snapshot');
ctx.state.turtlePoolFilter = 'two'; assert.equal(ctx.stats().total, 0); assert.equal(ctx.stats().loss, 0);
ctx.state.turtleFilter = 'all'; ctx.state.turtlePoolFilter = 'unassigned';
assert.equal(ctx.stats().total, 1, 'Deleted pools count as unassigned'); assert.equal(ctx.stats().loss, 0);
ctx.state.turtlePoolFilter = 'all'; assert.equal(ctx.stats().loss, 3, 'Unattributed legacy losses remain in overall totals');
assert.equal(ctx.stats().total, 4); assert.equal(ctx.stats().species, 2);
console.log('Home species/pool intersection, historical losses, missing pools and reset counts passed.');
