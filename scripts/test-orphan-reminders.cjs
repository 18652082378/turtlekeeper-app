'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const Care = require('../assets/care-records');
const { extract } = require('./deploy-care-persistence.cjs');
const source = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8').replace(/\r\n/g, '\n');
const due = vm.runInNewContext('(' + extract(source, 'careReminderDue') + ')');
const today = '2026-10-10', clock = { date: today, time: '09:00', weekday: '6' };
const cases = [
  ['ordinary unlinked task', { id: 'care' }, [], true],
  ['live growth archive', { id: 'growth', growthReminder: true, turtleId: 'a' }, [{ id: 'a' }], true],
  ['deleted growth archive', { id: 'deleted', growthReminder: true, turtleId: 'a' }, [], false],
  ['broken growth link', { id: 'missing-id', growthReminder: true }, [{ id: 'a' }], false],
  ['deleted linked ordinary task', { id: 'linked', turtleId: 'a' }, [], false],
  ['live linked ordinary task', { id: 'linked', turtleId: 'a' }, [{ id: 'a' }], true],
  ['another archive is not a match', { id: 'wrong', growthReminder: true, turtleId: 'a' }, [{ id: 'b' }], false],
  ['batch member cannot replace a missing link', { id: 'batch', growthReminder: true, turtleId: 'a', batchId: 'batch' }, [{ id: 'b', batchId: 'batch' }], false],
  ['malformed archive collection', { id: 'invalid', growthReminder: true, turtleId: 'a' }, null, false],
  ['malformed archive entry', { id: 'invalid-entry', growthReminder: true, turtleId: 'a' }, [null, { code: 'a' }], false]
];
for (const [name, partial, turtles, expected] of cases) {
  const memo = { dueDate: today, remindTime: '09:00', repeat: false, ...partial };
  assert.equal(Care.hasReminderArchive(memo, turtles), expected, name);
  assert.equal(Care.dueMemos([memo], today, turtles).length === 1, expected, 'client: ' + name);
  assert.equal(due(memo, clock, turtles), expected, 'server: ' + name);
}
assert.equal(Care.dueMemos([{ growthReminder: true, turtleId: 'a' }], today).length, 0, 'no archive snapshot cannot activate growth reminder');
assert.equal(due({ growthReminder: true, turtleId: 'a', remindTime: '09:00' }, clock), false);
assert.equal(Care.hasReminderArchive(null, []), false);
(async () => {
  const ghost = { id: 'ghost', title: 'deleted archive', growthReminder: true, turtleId: 'shared', dueDate: today, remindTime: '09:00' };
  const db = { users: {
    first: { phone: 'first', data: { turtles: [], memos: [ghost, { id: 'care', title: 'feed', remindTime: '09:00' }], ledgerRecords: [{ id: 'ledger' }] } },
    second: { phone: 'second', data: { turtles: [{ id: 'shared' }], memos: [{ ...ghost, id: 'valid' }, { ...ghost, id: 'missing', turtleId: 'removed' }] } }
  }, careReminderDeliveries: {} };
  const before = JSON.stringify(db.users), sent = [], warnings = [];
  let writes = 0;
  const context = vm.createContext({ careReminderDispatching: false, apnsConfigured: () => true, readDatabase: () => db,
    careReminderClock: () => clock, careReminderDue: due, notifyCareReminder: async (user, memo) => { sent.push(user.phone + ':' + memo.id); return true; },
    writeDatabase: () => { writes++; }, console: { warn: (...v) => warnings.push(v) }, Date });
  vm.runInContext(extract(source, 'dispatchDueCareReminders'), context);
  await context.dispatchDueCareReminders();
  assert.deepEqual(sent, ['first:care', 'second:valid'], 'dispatch must use each account own current archives');
  assert.equal(JSON.stringify(db.users), before, 'skip does not edit archive, reminder or business records');
  assert.equal(writes, 1);
  assert.equal(Object.keys(db.careReminderDeliveries).length, 2, 'no delivered marker for missing archives');
  await context.dispatchDueCareReminders();
  assert.equal(sent.length, 2, 'normal delivery deduplication preserved');
  assert.deepEqual(warnings, []);
  console.log('PASS orphan reminders: client/server eligibility, missing links, malformed collections, batch links, account isolation, dispatch deduplication and data preservation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
