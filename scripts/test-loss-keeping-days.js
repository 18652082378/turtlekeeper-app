const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const accounting = require('../assets/loss-accounting');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
let now = '2026-09-11T12:00:00';
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
const ctx = { Date: Clock, state: { ledgerRecords: [] } };
vm.createContext(ctx);
for (const name of ['turtleKeepingDays', 'turtleArchiveKeepingDays']) {
  const start = source.indexOf(`function ${name}(`);
  vm.runInContext(source.slice(start, source.indexOf('\nfunction ', start + 1)), ctx);
}
const turtle = { id: 'turtle', acquiredDate: '2026-08-08', status: '正常饲养', price: 450 };
const loss = { id: 'loss', type: 'loss', turtleId: turtle.id, recordDate: '2026-09-10', amount: 450 };
const lost = accounting.transferLoss({ turtles: [turtle], ledgerRecords: [loss], memos: [] }, loss, turtle);
assert.equal(ctx.turtleArchiveKeepingDays(lost.turtles[0], lost.ledgerRecords), '已饲养 33 天');
now = '2026-10-01T12:00:00';
assert.equal(ctx.turtleArchiveKeepingDays(lost.turtles[0], lost.ledgerRecords), '已饲养 33 天', 'A later day cannot increase a lost turtle age');
const reloaded = JSON.parse(JSON.stringify(lost));
assert.equal(ctx.turtleArchiveKeepingDays(reloaded.turtles[0], reloaded.ledgerRecords), '已饲养 33 天', 'Reload preserves cutoff');
assert.equal(ctx.turtleArchiveKeepingDays({ ...turtle, status: '已死亡' }, [loss]), '已饲养 33 天', 'Historical ledger supplies cutoff');
assert.equal(ctx.turtleArchiveKeepingDays({ ...turtle, status: '已死亡' }, [{ ...loss, recordDate: '', createdAt: '2026-09-10T04:00:00Z' }]), '已饲养 33 天');
assert.equal(ctx.turtleArchiveKeepingDays({ ...turtle, status: '已死亡' }, []), '饲养天数待补', 'Missing historical date must not silently use today');
assert.equal(ctx.turtleKeepingDays('2026-09-10', '2026-09-10'), '已饲养 0 天');
assert.equal(ctx.turtleKeepingDays('2024-02-28', '2024-03-01'), '已饲养 2 天');
const undone = accounting.undoLoss(reloaded, reloaded.ledgerRecords[0]);
assert.equal(ctx.turtleArchiveKeepingDays(undone.turtles[0], undone.ledgerRecords), '已饲养 54 天', 'Undo resumes normal elapsed days');
console.log('Loss keeping days passed: frozen cutoff, reload, legacy dates, zero days, leap day and undo.');
