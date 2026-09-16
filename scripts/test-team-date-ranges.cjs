const assert = require('node:assert/strict');
const { report, reportPeriod, createTeamService } = require('../server/team-space');
const { fixture } = require('./team-test-fixture');
process.env.TURTLE_TEAM_TEST = '1';
async function main() {
  const data = { turtles: [], ledgerRecords: [
    { id: 'before', type: 'other', category: '器材', recordDate: '2024-12-30', amount: 1000 },
    { id: 'start', type: 'purchase', recordDate: '2024-12-31', recordTime: '00:00:00', amount: 10.10 },
    { id: 'middle', type: 'other', category: '龟粮', recordDate: '2025-01-01', amount: 20.20 },
    { id: 'end', type: 'sold', recordDate: '2025-01-02', recordTime: '23:59:59', amount: 60.30 },
    { id: 'after', type: 'sold', recordDate: '2025-01-03', amount: 1000 }
  ] };
  const range = { mode: 'custom', start: '2024-12-31', end: '2025-01-02' };
  const r = report(data, '2025-01', '', range);
  assert.deepEqual(r.entries.map(x => x.id).sort(), ['end', 'middle', 'start']);
  assert.equal(r.balance, 30); assert.equal(r.purchase, 10.10); assert.equal(r.expenses, 20.20);
  assert.deepEqual(r.trend.map(x => x.month), ['2024-12', '2025-01']);
  assert.equal(r.trend.reduce((n, x) => n + Math.round(x.expense * 100), 0), 3030);
  assert.equal(report(data, '2025-01', '', { mode: 'custom', start: '2025-01-01', end: '2025-01-01' }).entries.length, 1);
  assert.equal(reportPeriod('2024-02').end, '2024-02-29');
  assert.throws(() => report(data, '2025-01', '', { mode: 'custom', start: '2025-02-29', end: '2025-03-01' }), /有效日期/);
  assert.throws(() => report(data, '2025-01', '', { mode: 'custom', start: '2025-02-02', end: '2025-01-01' }), /不能晚于/);
  assert.throws(() => report(data, '2025-01', '', { mode: 'custom', start: '', end: '' }), /开始和结束/);
  const year = reportPeriod('2025-01', { mode: 'year' });
  assert.equal((Date.parse(year.end) - Date.parse(year.start)) / 86400000, 364);
  const previous = new Date(Date.parse(year.start) - 86400000).toISOString().slice(0, 10);
  const future = new Date(Date.parse(year.end) + 86400000).toISOString().slice(0, 10);
  const yr = report({ ledgerRecords: [previous, year.start, year.end, future].map((recordDate, i) => ({ id: String(i), recordDate, type: 'other', amount: 1 })) }, '2025-01', '', { mode: 'year' });
  assert.equal(yr.expenses, 2); assert.equal(yr.trend.reduce((s, t) => s + t.expense, 0), 2);
  assert.equal(report(data, '2025-01', '', { mode: 'all' }).entries.length, 5);
  const db = fixture(), owner = db.users['13900000001']; owner.data = data;
  owner.teamSpace.members[0].visibleFrom = '2025-01-01';
  const service = createTeamService({ read: () => db, write: async () => {}, authenticate: (db, phone) => db.users[phone], normalize: d => d });
  const req = (action, extra = {}, phone = owner.phone) => service.action({ action, phone, teamId: 'fixture-team', month: '2025-01', range, ...extra });
  const child = await req('get', {}, '13900000002');
  assert.deepEqual(child.team.report.entries.map(x => x.id).sort(), ['end', 'middle']);
  assert.equal(child.team.report.purchase, 0);
  const csv = (await req('export', { kind: 'ledger' })).content;
  assert(csv.includes('2024-12-31') && csv.includes('2025-01-02'));
  assert(!csv.includes('2024-12-30') && !csv.includes('2025-01-03'));
  const reportCsv = (await req('export', { kind: 'report' })).content;
  assert(reportCsv.includes('2024-12-31 至 2025-01-02'));
  await assert.rejects(req('export', { kind: 'ledger' }, '13900000002'), e => e.status === 403);
  console.log('PASS: inclusive date boundaries, cross-year totals/trends/exports, leap dates, rolling 365 days, validation and member date scope.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
