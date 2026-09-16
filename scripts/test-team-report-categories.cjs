const assert = require('node:assert/strict');
const { report } = require('../server/team-space');
const visibility = require('../server/team-visibility');
const data = {
  turtles: [{ id: 't1', speciesName: '黄缘闭壳龟', acquiredDate: '2025-06-10' }],
  ledgerRecords: [
    { type: 'purchase', turtleId: 't1', amount: 100, recordDate: '2025-06-10' },
    { type: 'sold', speciesName: '黄缘闭壳龟', amount: 150, recordDate: '2025-06-11' },
    { type: 'other', category: '龟粮', amount: 10.10, recordDate: '2025-06-05' },
    { type: 'other', category: '龟粮', amount: 20.20, recordDate: '2025-06-10' },
    { type: 'other', category: '看病', turtleId: 't1', speciesName: '黄缘闭壳龟', amount: 30, recordDate: '2025-06-12' },
    { type: 'other', category: '水电', amount: 40, recordDate: '2025-06-13' },
    { type: 'other', category: '定制支出', amount: 5, recordDate: '2025-06-13' },
    { type: 'other', amount: 2, recordDate: '2025-06-14' },
    { type: 'other', category: '  ', amount: 3, recordDate: '2025-06-14' },
    { type: 'other', category: '龟粮', amount: 50, recordDate: '2025-05-10' }
  ]
};
const before = JSON.stringify(data);
const all = report(data, '2025-06');
const groups = Object.fromEntries(all.groups.map(g => [g.name, g]));
assert.equal(groups['龟粮'].expense, 30.30);
assert.equal(groups['看病'].expense, 30, 'linked expenses retain their ledger category');
assert.equal(groups['黄缘闭壳龟'].expense, 100);
assert.equal(groups['黄缘闭壳龟'].income, 150);
assert.equal(groups['其他'].expense, 5);
assert.equal(groups['定制支出'].expense, 5);
assert(!all.species.includes('未分类'));
assert.equal(all.expenses, 110.30);
assert.equal(all.balance, -60.30);
const food = report(data, '2025-06', '龟粮');
assert.equal(food.expenses, 30.30);
assert.equal(food.purchase, 0);
assert.equal(food.income, 0);
assert.equal(food.groups.length, 1);
assert.equal(food.trend.at(-2).expense, 50);
assert.equal(food.trend.at(-1).expense, 30.30);
const scoped = report(visibility.scope(data, '2025-06-09'), '2025-06', '龟粮');
assert.equal(scoped.expenses, 20.20);
assert.equal(scoped.trend.at(-2).expense, 0, 'category filters cannot reveal old expenses');
assert.equal(JSON.stringify(data), before, 'reporting does not rewrite owner records');
console.log('PASS: owner expense categories, linked medical costs, custom/fallback labels, totals, filters, trends and date scope.');
