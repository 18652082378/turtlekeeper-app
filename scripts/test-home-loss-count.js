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
console.log('Home loss count passed.');
