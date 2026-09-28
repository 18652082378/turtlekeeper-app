const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { patch } = require('./deploy-care-inline.cjs');
const { extract } = require('./deploy-care-persistence.cjs');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const app = read('app.js');
const receipt = vm.runInNewContext('(' + extract(app, 'verifyCloudSaveReceipt') + ')');
const validateRecovery = vm.runInNewContext('(' + extract(app, 'validateReviewedRecovery') + ')', { reviewedRecoverySignature: JSON.stringify });
const emptyData = Object.fromEntries(['turtles', 'careRecords', 'careCustomItems', 'carePlans', 'memos', 'breedingRecords', 'turtlePools', 'ledgerRecords', 'activityLogs'].map(f => [f, []]));
const recovery = { backupFormat: 'turtlekeeper-account-v1', accountName: 'test', data: { ...emptyData, careRecords: [{ id: 'care' }] },
  recovery: { format: 'turtlekeeper-reviewed-recovery-v1', sources: [{ accountName: 'test', data: emptyData }, { accountName: 'test', data: emptyData }] } };
assert.doesNotThrow(() => validateRecovery(recovery), 'care-only accounts must be able to validate a reviewed recovery');
const incomplete = JSON.parse(JSON.stringify(recovery)); incomplete.data.turtles = [{ id: 'anchor' }]; delete incomplete.data.careRecords;
assert.throws(() => validateRecovery(incomplete), /缺失/, 'a missing care collection must not be interpreted as an intentional deletion');
for (const field of ['turtles', 'careRecords', 'careCustomItems', 'carePlans', 'memos', 'breedingRecords', 'turtlePools', 'ledgerRecords']) {
  const submitted = { [field]: [{ id: 'test', note: 'must survive', amount: 25 }] };
  const user = { phone: 'test', dataRevision: 'revision', data: submitted };
  assert.equal(receipt(user, submitted, 'test'), true, field + ': exact acknowledgment');
  for (const response of [{}, { [field]: [] }, { [field]: [{ id: 'test', note: 'truncated', amount: 25 }] }]) {
    assert.equal(receipt({ ...user, data: response }, submitted, 'test'), false, field + ': incomplete HTTP 200 must not acknowledge');
  }
  assert.equal(receipt({ ...user, data: submitted }, { [field]: [] }, 'test'), false, field + ': ignored deletion must not acknowledge');
}
const old = patch(read('scripts/fixtures/reviewed-account-functions-20260927.js'));
const oldDue = vm.runInNewContext('(' + extract(old, 'careReminderDue') + ')');
const currentDue = vm.runInNewContext('(' + extract(read('server/server.js'), 'careReminderDue') + ')');
const clock = { date: '2026-09-28', time: '10:00', weekday: '1' };
for (const state of [{ completedAt: '2026-09-28T01:00:00Z' }, { reminderEnabled: false }, { repeat: true, lastCompletedDate: clock.date }]) {
  const memo = { remindTime: '10:00', ...state };
  assert.equal(oldDue(memo, clock), true, 'REPRODUCED: reviewed production baseline still sends a completed/disabled reminder');
  assert.equal(currentDue(memo, clock), false);
}
assert.equal(currentDue({ remindTime: '10:00', repeat: true, weekdays: ['1'], lastCompletedDate: '2026-09-27' }, clock), true);
const poolContext = vm.createContext({ crypto: require('node:crypto'), TurtleCare: require('../assets/care-records'), normalizeCustomSpecies: x => x || [] });
for (const name of ['emptyAccountData', 'normalizeAccountData']) vm.runInContext(extract(read('server/server.js'), name), poolContext);
const pools = Array.from({ length: 201 }, (_, i) => ({ id: `pool-${i}`, name: `龟池${i}`, type: 'breeder', count: i }));
assert.equal(poolContext.normalizeAccountData({ turtlePools: pools }).turtlePools.length, 201, 'all valid pools must survive normalization; no silent truncation at 200');
for (const name of ['accountRecordCounts', 'accountDataWasReduced']) vm.runInContext(extract(read('server/server.js'), name), poolContext);
assert.equal(poolContext.accountDataWasReduced({ carePlans: [{ id: 'plan', name: '计划' }] }, {}), true, 'removing a saved care plan requires a recovery snapshot');
assert.equal(poolContext.accountDataWasReduced({ careCustomItems: [{ id: 'custom', title: '清洁' }] }, {}), true, 'removing a custom item requires a recovery snapshot');
const hotfix = require('./deploy-reliability-hotfix.cjs');
const patchedOld = hotfix.patch(old);
hotfix.verify(patchedOld);
assert.equal(hotfix.patch(patchedOld), patchedOld, 'deployment is idempotent');
hotfix.verify(hotfix.patch(read('server/server.js')));
assert.throws(() => hotfix.patch(old.replace('next.turtlePools.slice(0, 200)', 'next.turtlePools.slice(0, 199)')), /Unknown normalization/);
assert.throws(() => hotfix.patch(old.replace('if (!memo.repeat) return true;', 'if (!memo.repeat) return false;')), /Unknown reminder/);
console.log('PASS: exact receipts for all six modules and care settings; reproduced old reminder issue and verified current correction. LOCAL ONLY.');
