const assert = require('node:assert/strict');
const { report, ledgerRows, createTeamService } = require('../server/team-space');
const { scope } = require('../server/team-visibility');
const { fixture, month } = require('./team-test-fixture');
process.env.TURTLE_TEAM_TEST = '1';
async function main() {
  const data = { turtles: [], ledgerRecords: [
    { id: 'p2', type: 'purchase', amount: 75.25, turtleIds: ['t2'], turtleSnapshot: { code: 'B-2', speciesName: '黄缘' }, recordDate: '2025-06-10', recordTime: '12:13:14' },
    { id: 'loss', type: 'loss', amount: 25.75, turtleId: 't1', turtleSnapshot: { code: 'B-1', speciesName: '黄缘' }, recordDate: '2025-07-15',
      transferredPurchaseAmount: 25.75, transferredPurchase: { id: 'p1', type: 'purchase', amount: 101, title: '批量购入', recordDate: '2025-06-10', recordTime: '12:13:14', createdAt: '2025-06-11T04:05:06Z' } },
    { id: 'extra', type: 'other', category: '器材', amount: 7.12, recordDate: '2025-07-15', note: '损耗处理额外费用' },
    { id: 'sold', type: 'sold', amount: 150, recordDate: '2025-07-12', turtleSnapshot: { code: 'S-1', speciesName: '草龟' } },
    { id: 'duplicate', type: 'loss', amount: 25.75, duplicateLossOf: 'loss', recordDate: '2025-07-15' }
  ] };
  const before = JSON.stringify(data), rows = ledgerRows(data);
  assert.equal(rows.length, 5);
  const transferred = rows.find(r => r.restoredPurchase);
  assert.equal(transferred.amount, 25.75);
  assert.equal(transferred.quantity, 1);
  assert.equal(transferred.turtleCode, 'B-1');
  assert.equal(transferred.recordDate, '2025-06-10');
  assert.equal(transferred.recordTime, '12:13:14');
  assert.equal(report(data, '2025-06').purchase, 101);
  for (const m of ['2025-06', '2025-07']) {
    const r = report(data, m);
    for (const [type, field] of [['purchase', 'purchase'], ['sold', 'income'], ['loss', 'loss'], ['other', 'expenses']]) {
      const detailCents = r.entries.filter(e => e.type === type).reduce((n, e) => n + Math.round(e.amount * 100), 0);
      assert.equal(detailCents, Math.round(r[field] * 100), 'every drilldown must reconcile with its total');
    }
  }
  const restricted = ledgerRows(scope(data, '2025-07-01'));
  assert(!restricted.some(r => r.restoredPurchase || r.type === 'purchase'));
  assert.equal(report(scope(data, '2025-07-01'), '2025-07').trend.at(-2).expense, 0);
  assert.equal(JSON.stringify(data), before);
  const db = fixture(), owner = db.users['13900000001'];
  const service = createTeamService({ read: () => db, write: async () => {}, authenticate: (db, phone) => db.users[phone], normalize: d => d });
  const req = (action, extra = {}, who = '13900000001') => service.action({ action, phone: who, teamId: 'fixture-team', month, ...extra });
  const edit = async (extra, who) => req('ledger', { revision: (await req('get', {}, who)).team.revision, ...extra }, who);
  await edit({ type: 'other', title: '时间与分类验证', amount: 10.01, recordDate: `${month}-10`, recordTime: '15:16:17', category: '器材' });
  const saved = owner.data.ledgerRecords.find(r => r.title === '时间与分类验证');
  assert.equal(saved.recordTime, '15:16:17'); assert.equal(saved.category, '器材');
  assert.equal((await req('report')).report.entries.find(r => r.id === saved.id).recordTime, '15:16:17');
  const snapshot = JSON.stringify(owner.data);
  await assert.rejects(edit({ type: 'other', amount: 1, recordDate: `${month}-10`, recordTime: '25:00:00' }), /有效时间/);
  assert.equal(JSON.stringify(owner.data), snapshot);
  owner.teamSpace.members[0].permissions.ledger = 'read';
  assert((await req('report', {}, '13900000002')).report.entries.length > 0);
  await assert.rejects(edit({ type: 'other', amount: 1, recordDate: `${month}-10`, recordTime: '10:00:00' }, '13900000002'), e => e.status === 403);
  await assert.rejects(req('report', {}, '13900000003'), e => e.status === 403);
  const exported = await req('export', { kind: 'ledger' });
  assert(exported.content.includes('15:16:17') && exported.content.includes('器材'));
  console.log('PASS: four totals reconcile to details, restored batch purchase costs, no duplicate losses, scoped history, timestamps, expense categories, CSV and read-only authorization.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
