const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
let saved;
let message;
const ctx = {
  FormData: class { constructor(values) { this.values = values; } get(key) { return this.values[key] ?? null; } },
  requireLogin: () => true,
  speciesByCode: () => ({ code: 'GHG', name: '果核蛋龟' }),
  speciesPhoto: () => 'photo', defaultPhoto: 'photo',
  saveWithDeferredImages: patch => { saved = patch; },
  toast: text => { message = text; },
  turtleLabel: turtle => turtle.code,
  logActivity: text => [text], money: value => Number(value).toFixed(2),
  state: {}
};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function buildTurtlePriceUpdate('), source.indexOf('function submitTurtle(event)')), ctx);
const turtle = { id: 'a', code: '小龟', speciesCode: 'GHG', price: '100', weight: 0, carapaceLength: 0, health: '健康', source: '购买', measureHistory: [] };
const record = { id: 'purchase', type: 'purchase', turtleId: 'a', amount: 100, turtleSnapshot: { ...turtle } };
const sold = { type: 'sold', turtleId: 'a', amount: 500 };
let result = ctx.buildTurtlePriceUpdate(turtle, { ...turtle, price: '120.50' }, [turtle], [record, sold]);
assert.equal(result.ledgerRecords[0].amount, 120.5);
assert.equal(result.ledgerRecords[0].turtleSnapshot.price, '120.50');
assert.equal(result.ledgerRecords[1], sold, 'sale amount must not change');
assert.equal(record.amount, 100, 'do not mutate original state');
const batch = { ...record, batchPurchase: true, turtleIds: ['a', 'b', 'sold-c'], amount: 300.01 };
result = ctx.buildTurtlePriceUpdate(turtle, { ...turtle, price: '125.25' }, [turtle, { id: 'b', price: 100 }], [batch]);
assert.equal(result.ledgerRecords[0].amount, 325.26, 'apply only the changed turtle delta, retaining rounding and sold members');
assert.equal(result.turtles[1].price, 100);
assert.equal(result.turtles[1].batchTotalPrice, 325.26);
assert.equal(ctx.buildTurtlePriceUpdate(turtle, { ...turtle, price: '0' }, [turtle], []).ledgerRecords.length, 0, 'do not recreate deleted ledger records');
assert.throws(() => ctx.buildTurtlePriceUpdate(turtle, { ...turtle, price: '0' }, [turtle], [{ ...batch, amount: 1 }]), /关联收购金额异常/);
function submit(price, extras = {}) {
  saved = undefined;
  ctx.state = { selectedTurtleId: 'a', turtles: [turtle], ledgerRecords: [record], keptSpecies: ['GHG'], turtlePools: [], memos: [] };
  ctx.submitTurtleDetail({ preventDefault() {}, currentTarget: { speciesCode: 'GHG', weight: '0', carapaceLength: '0', health: '健康', price, ...extras } });
}
submit('180.25');
assert.equal(saved.turtles[0].price, '180.25', 'price-only edits work for unmeasured batch turtles');
assert.equal(saved.ledgerRecords[0].amount, 180.25);
assert.equal(saved.turtles[0].measureHistory.length, 0, 'price-only changes do not add growth records');
assert.equal(saved.memos, undefined, 'price-only changes do not reset reminders');
submit('0');
assert.equal(saved.ledgerRecords[0].amount, 0);
for (const price of ['-1', 'NaN', 'Infinity', '2.001', '999999999999999999']) {
  submit(price);
  assert.equal(saved, undefined);
  assert.match(message, /非负金额/);
}
submit('100', {acquiredDate:'2025-10-12',birthDate:'2024-06-01'});
assert.equal(saved.turtles[0].acquiredDate,'2025-10-12');
assert.equal(saved.turtles[0].birthDate,'2024-06-01');
assert.equal(saved.turtles[0].measureHistory.length,0,'Date-only edits do not add growth records');
assert.equal(saved.memos,undefined,'Date-only edits do not reset growth reminders');
assert.equal(saved.ledgerRecords[0].amount,100,'Date-only edits do not change purchase amounts');
turtle.acquiredDate='2025-10-12'; turtle.birthDate='2024-06-01';
submit('100', {acquiredDate:'2025-11-01'});
assert.equal(saved.turtles[0].birthDate,'2024-06-01','Missing date field preserves existing value');
submit('100', {birthDate:''});
assert.equal(saved.turtles[0].birthDate,'','An optional birth date can be cleared');
assert.equal(saved.turtles[0].acquiredDate,'2025-10-12');
console.log('Turtle price/date update checks passed, including date-only edits and optional birthday preservation/clearing.');
