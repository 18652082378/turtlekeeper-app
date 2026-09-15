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
