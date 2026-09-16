const assert = require('node:assert/strict');
const { createTeamService, ledgerRows } = require('../server/team-space');
const breeding = require('../server/team-breeding');
const { fixture, month } = require('./team-test-fixture');
process.env.TURTLE_TEAM_TEST = '1';
async function main() {
  const db = fixture(), owner = db.users['13900000001'];
  const service = createTeamService({ read: () => db, write: async () => {}, authenticate: (db, phone) => db.users[phone], normalize: d => d });
  const req = (action, extra = {}, who = 1) => service.action({ action, phone: `1390000000${who}`, teamId: 'fixture-team', month, ...extra });
  const edit = async (action, extra, who = 1) => req(action, { revision: (await req('get', {}, who)).team.revision, ...extra }, who);
  await edit('settings', { approvalRequired: true });
  await edit('ledger', { type: 'sold', turtleId: 't1', amount: 2800, recordDate: `${month}-10` }, 2);
  const p = (await req('get')).team.approvals.find(p => p.status === 'pending');
  await assert.rejects(edit('approval', { id: p.id, approve: false, reason: '' }), /退回原因/);
  assert.equal(owner.teamSpace.approvals[0].status, 'pending');
  await assert.rejects(edit('approval', { id: p.id, approve: false, reason: '越权' }, 2), e => e.status === 403);
  await edit('approval', { id: p.id, approve: false, reason: '请核对售出金额及凭证' });
  const child = (await req('get', {}, 2)).team;
  assert.equal(child.approvals[0].reason, '请核对售出金额及凭证');
  assert.equal(child.approvals[0].status, 'rejected');
  assert(owner.data.turtles.some(t => t.id === 't1'), 'rejected sale must not move inventory');
  assert.equal((await req('get', {}, 3)).team.approvals.length, 0);
  await assert.rejects(edit('approval', { id: p.id, approve: true }), e => e.status === 409);
  const rows = ledgerRows({ turtles: [], ledgerRecords: [
    { id: 'a', type: 'purchase', turtleId: 't1', turtleSnapshot: { id: 't1', code: 'SAME' }, amount: 10 },
    { id: 'b', type: 'other', turtleId: 't1', amount: 3 },
    { id: 'c', type: 'sold', turtleId: 't2', turtleSnapshot: { id: 't2', code: 'SAME' }, amount: 20 },
    { id: 'e', type: 'other', relatedLossId: 'hidden-loss', amount: 2 },
    { id: 'l', type: 'loss', turtleId: 't1', amount: 10, transferredPurchaseAmount: 10, transferredPurchase: { id: 'old-batch', turtleIds: ['t1', 't2'], amount: 100 } }
  ] });
  assert.deepEqual(rows.find(r => r.id === 'a').associationIds, ['t1']);
  assert.deepEqual(rows.find(r => r.id === 'c').associationIds, ['t2']);
  assert.deepEqual(rows.find(r => r.restoredPurchase).associationIds, ['t1']);
  assert.equal(rows.find(r => r.id === 'e').relatedLossId, '');
  owner.teamSpace.members[0].permissions.breeding = 'edit';
  await edit('breeding', { motherId: 'manual', motherName: '测试种母', speciesCode: 'ZYG', date: `${month}-01`, eggCount: 10, fertileCount: 8, incubationClosed: true }, 2);
  const record = (await req('get', {}, 2)).team.breedingRecords.find(r => r.motherName === '测试种母');
  assert(record.speciesName && record.speciesName !== '未记录品种');
  assert.equal(record.incubationClosed, true);
  const ended = breeding.stats([record]); assert.equal(ended.hatchRate, 0); assert.equal(ended.ongoing, 0);
  owner.teamSpace.members[0].visibleFrom = `${month}-09`;
  const scoped = (await req('get', {}, 2)).team;
  assert(!scoped.breedingRecords.some(r => r.id === record.id));
  assert(!scoped.ledger.some(r => r.id === 'p1'));
  // Selling removes the live archive, but the member must still see the decision.
  owner.teamSpace.members[0].visibleFrom = `${month}-01`;
  owner.data.turtles.find(t => t.id === 't1').measureHistory.push({ id: 'hidden-history', date: '2020-01-01', note: 'HIDDEN_APPROVAL_HISTORY' });
  await edit('ledger', { type: 'sold', turtleId: 't1', amount: 2800, recordDate: `${month}-10` }, 2);
  const sale = (await req('get')).team.approvals.find(p => p.status === 'pending');
  await edit('approval', { id: sale.id, approve: true });
  assert(!owner.data.turtles.some(t => t.id === 't1'));
  assert((await req('get', {}, 2)).team.approvals.some(p => p.id === sale.id && p.status === 'approved'), 'approved sale remains visible after archive is removed');
  // Older versions stored the entire turtle on the applied command.
  owner.teamSpace.approvals.find(p => p.id === sale.id).command.record.turtleSnapshot = { measureHistory: [{ date: '2020-01-01', note: 'HIDDEN_APPROVAL_HISTORY' }] };
  assert(!JSON.stringify((await req('get', {}, 2)).team.approvals).includes('HIDDEN_APPROVAL_HISTORY'), 'approval response must not expose the full unscoped archive snapshot');
  owner.teamSpace.members[0].visibleFrom = `${month}-11`;
  assert(!(await req('get', {}, 2)).team.approvals.some(p => p.id === sale.id), 'decision still respects the transaction date cutoff');
  owner.data.ledgerRecords.find(r => r.id === sale.command.record.id).recordDate = `${month}-12`;
  assert(!(await req('get', {}, 2)).team.approvals.some(p => p.id === sale.id), 'moving a transaction later cannot reveal the earlier approval payload');
  console.log('PASS: approval reasons/ownership, no mutation on rejection, stable-ID associations, safe batch restoration, breeding species/final status and member scope.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
