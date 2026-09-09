const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const turtle = { id: 'a', code: '小龟', speciesCode: 'GHG', speciesName: '果核蛋龟', price: '300', weight: 10, carapaceLength: 3, health: '健康', source: '购买', measureHistory: [] };
let saves = 0;
let message;
const ctx = {
  crypto,
  FormData: class { constructor(data) { this.data = data; } get(key) { return this.data[key] ?? null; } },
  requireLogin: () => true, speciesByCode: () => ({ code: 'GHG', name: '果核蛋龟' }),
  speciesPhoto: () => 'photo', defaultPhoto: 'photo', turtlePoolName: () => '', activateCareReminder() {},
  formatDate: date => date.toISOString().slice(0, 10),
  turtleLabel: turtle => turtle.code, logActivity: text => [text], money: value => Number(value).toFixed(2),
  toast: value => { message = value; },
  saveWithDeferredImages: patch => { saves++; Object.assign(ctx.state, patch); },
  state: { selectedTurtleId: 'a', turtles: [turtle], keptSpecies: ['GHG'], turtlePools: [], memos: [],
    ledgerRecords: [{ id: 'purchase', type: 'purchase', turtleId: 'a', amount: 300, turtleSnapshot: { ...turtle } }] }
};
vm.createContext(ctx);
for (const [start, end] of [
  ['function buildTurtlePriceUpdate(', 'function submitTurtle(event)'],
  ['function turtleMedicalCost(', 'function turtleListRow('],
  ['function ledgerMoneyStats(', 'function breedingStats(']
]) vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), ctx);
function event(medicalExpense, extras = {}) {
  return { preventDefault() {}, currentTarget: { ...ctx.state.turtles[0], medicalExpense, ...extras } };
}
const first = event('300');
ctx.submitTurtleDetail(first);
assert.equal(saves, 1);
assert.equal(ctx.state.turtles[0].price, '300');
assert.equal(ctx.turtleTotalCost(ctx.state.turtles[0]), 600);
assert.equal(ctx.state.ledgerRecords.find(item => item.id === 'purchase').amount, 300);
assert.equal(ctx.state.ledgerRecords[0].category, '看病');
assert.equal(ctx.state.ledgerRecords[0].turtleId, 'a');
assert.equal(ctx.state.ledgerRecords[0].amount, 300);
assert.equal(ctx.state.turtles[0].measureHistory.length, 0);
assert.equal(ctx.ledgerMoneyStats().purchase, 300);
assert.equal(ctx.ledgerMoneyStats().other, 300);
ctx.submitTurtleDetail(first);
assert.equal(saves, 1, 'repeat submit of the same form cannot charge twice');
ctx.submitTurtleDetail(event(''));
assert.equal(ctx.state.ledgerRecords.length, 2, 'blank next update does not reuse previous expense');
ctx.submitTurtleDetail(event('50.25', { weight: 12 }));
assert.equal(ctx.state.ledgerRecords.length, 3);
assert.equal(ctx.turtleTotalCost(ctx.state.turtles[0]), 650.25);
assert.equal(ctx.state.turtles[0].measureHistory.length, 1, 'growth and expense can be saved together');
ctx.submitTurtleDetail(event('25', { price: '400' }));
assert.equal(ctx.turtleTotalCost(ctx.state.turtles[0]), 775.25);
assert.equal(ctx.state.ledgerRecords.find(item => item.id === 'purchase').amount, 400);
assert.equal(ctx.turtleMedicalCost(ctx.state.turtles[0]), 375.25);
for (const input of ['-1', 'Infinity', 'bad', '0.001']) {
  const before = saves;
  ctx.submitTurtleDetail(event(input));
  assert.equal(saves, before);
  assert.match(message, /看病花费需/);
}
ctx.submitTurtleDetail(event('0'));
assert.equal(ctx.state.ledgerRecords.length, 4, 'zero creates no expense');
ctx.state.ledgerRecords = ctx.state.ledgerRecords.filter(item => item.category !== '看病');
assert.equal(ctx.turtleTotalCost(ctx.state.turtles[0]), 400, 'deleting expenses also removes them from dashboard cost');
assert.equal(ctx.turtleMedicalCost({ id: 'other' }), 0);
console.log('Medical expense checks passed: 300 + 300 = 600, separate ledger entries, repeat saves, growth, price changes, validation, removal and per-turtle isolation.');
