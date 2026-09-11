const assert = require('node:assert/strict');
const { groupLedgerRecords } = require('../assets/turtle-batches');
const records = [
  ...Array.from({ length: 500 }, (_, i) => ({ id: `loss-${i}`, type: 'loss', batchId: 'purchase', batchMovementId: 'operation-1', amount: i === 0 ? 0.11 : 0.1 })),
  { id: 'later', type: 'loss', batchId: 'purchase', batchMovementId: 'operation-2', amount: 2 },
  { id: 'sale', type: 'sold', batchId: 'purchase', batchMovementId: 'operation-1', amount: 3 },
  { id: 'hatch', type: 'loss', batchId: 'hatch', batchMovementId: 'operation-1', amount: 0 },
  { id: 'legacy-a', type: 'loss', batchId: 'purchase', amount: 1 },
  { id: 'legacy-b', type: 'loss', batchId: 'purchase', amount: 1 },
  { id: 'purchase', type: 'purchase', amount: 100 }
];
const before = JSON.stringify(records);
const rows = groupLedgerRecords(records);
assert.equal(rows.length, 7);
assert.equal(rows[0].movementRecords.length, 500);
assert.equal(rows[0].amount, 50.01);
assert.equal(rows[0].id, 'loss-0');
assert.deepEqual(rows.map(r => r.id), ['loss-0', 'later', 'sale', 'hatch', 'legacy-a', 'legacy-b', 'purchase']);
assert.equal(JSON.stringify(records), before, 'Display grouping must not change stored records or snapshots');
assert.equal(rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0), records.reduce((sum, r) => sum + Math.round(r.amount * 100), 0));
console.log('Movement grouping passed: 500 entries become one, exact totals, separate operations/types/batches, legacy records preserved.');
