const assert = require('node:assert/strict');
const { fixture } = require('./team-test-fixture');
const { createTeamService } = require('../server/team-space');
const visibility = require('../server/team-visibility');
process.env.TURTLE_TEAM_TEST = '1';
async function main() {
  const db = fixture(), owner = db.users['13900000001'];
  owner.data.turtles = Array.from({ length: 20 }, (_, i) => ({ id: 'dated-t' + i, code: (i < 10 ? 'OLD' : 'NEW') + i,
    speciesCode: i < 10 ? 'OLD-SPECIES' : 'ZYG', speciesName: i < 10 ? '早期品种' : '窄桥蛋龟', acquiredDate: i < 10 ? '2025-06-05' : '2025-06-10',
    createdAt: '2026-09-16T12:00:00Z', status: '正常饲养', price: 100, measureHistory: [], note: i < 10 ? 'SECRET-OLDER-TURTLE' : '新档案备注' }));
  owner.data.turtles.push({ id: 'undated', code: 'UNKNOWN-DATE', status: '正常饲养' });
  owner.data.turtles[10].measureHistory = [
    { id: 'old-growth', updatedAt: '2025-06-05T12:00:00Z', newSnapshot: { weight: 88888 }, oldPhoto: 'SECRET-OLDER-PHOTO' },
    { id: 'new-growth', updatedAt: '2025-06-10T12:00:00Z', oldSnapshot: { weight: 77777 }, newSnapshot: { weight: 123 } }
  ];
  owner.data.ledgerRecords = [
    { id: 'old-purchase', type: 'purchase', title: 'SECRET-OLDER-LEDGER', amount: 1000, turtleId: 'dated-t0', recordDate: '2025-06-05' },
    { id: 'new-purchase', type: 'purchase', title: '六月十日收购', amount: 1000, turtleId: 'dated-t10', recordDate: '2025-06-10' },
    { id: 'cutoff-day', type: 'other', title: '起始当天的费用', amount: 20, recordDate: '2025-06-09' },
    { id: 'no-date', type: 'other', title: 'SECRET-UNKNOWN', amount: 88888 },
    { id: 'dated-loss', type: 'loss', title: '本期损耗', amount: 100, recordDate: '2025-06-10', transferredPurchaseAmount: 100,
      transferredPurchase: { type: 'purchase', title: 'SECRET-OLDER-TRANSFER', amount: 100, recordDate: '2025-06-05' } }
  ];
  owner.data.breedingRecords = [
    { id: 'old-nest', date: '2025-06-05', motherName: 'SECRET-OLDER-NEST', eggCount: 100, fertileCount: 100, hatchCount: 90,
      hatchEvents: [{ id: 'old-nest-new-birth', date: '2025-06-10', count: 90, turtleIds: [] }] },
    { id: 'new-nest', date: '2025-06-10', motherId: 'dated-t0', motherName: '当前记录中的种母', poolId: 'old-pool', eggCount: 10, fertileCount: 8, hatchCount: 4,
      note: '当前繁殖备注', hatchEvents: [{ id: 'new-nest-birth', date: '2025-06-11', count: 4, turtleIds: [] }] }
  ];
  owner.data.turtlePools = [{ id: 'old-pool', name: 'SECRET-OLDER-POOL', createdAt: '2025-06-05T00:00:00Z', count: 888 }, { id: 'new-pool', name: '新养殖池', createdAt: '2025-06-10T00:00:00Z', count: 999 }];
  owner.data.memos = [{ id: 'old-care', title: 'SECRET-OLDER-CARE', date: '2025-06-05' }, { id: 'new-care', title: '新护理', date: '2025-06-10', content: '喂食' }];
  owner.data.activityLogs = [{ id: 'unknown-summary', type: '档案', text: 'SECRET-OLDER-ACTIVITY', createdAt: '2025-06-10T00:00:00Z' }];
  owner.teamSpace.tasks = [{ id: 'old-task', title: 'SECRET-OLDER-TASK', due: '2025-06-05', assignee: 'member-2' }, { id: 'new-task', title: '新任务', due: '2025-06-10', assignee: 'member-2' }];
  owner.teamSpace.logs = [{ id: 'old-log', summary: 'SECRET-OLDER-LOG', module: 'dashboard', dataDate: '2025-06-05', at: '2025-06-10T00:00:00Z' }];
  const all = { dashboard: 'edit', ledger: 'edit', tasks: 'edit', breeding: 'edit' };
  const service = createTeamService({ read: () => db, write: async () => {}, authenticate: (db, p, t) => t === 'token' ? db.users[p] : null, normalize: x => x });
  const req = (who, action, body = {}) => service.action({ phone: `1390000000${who}`, token: 'token', action, teamId: 'fixture-team', month: '2025-06', ...body });
  const view = async who => (await req(who, 'get')).team;
  const edit = async (who, action, body) => req(who, action, { revision: (await view(who)).revision, ...body });
  await edit(1, 'member', { id: 'member-2', permissions: all, visibleFrom: '2025-06-09' });
  await edit(1, 'member', { id: 'member-3', permissions: all, visibleFrom: '' });
  const initialData = JSON.stringify(owner.data);
  const v = await view(2);
  assert.equal(v.turtles.length, 10, 'user example: June 5 ten turtles hidden, June 10 ten visible');
  assert.equal(v.visibleFrom, '2025-06-09');
  assert(!JSON.stringify(v).includes('SECRET-')); assert(!JSON.stringify(v).includes('UNKNOWN-DATE'));
  assert(v.ledger.some(r => r.id === 'cutoff-day'), 'start day is inclusive');
  assert.equal(v.breedingRecords.length, 1); assert.equal(v.breedingStats.hatch, 4); assert.equal(v.breedingStats.hatchRate, 50);
  assert.equal(v.breedingRecords[0].motherId, '__keep__');
  assert.equal(v.pools[0].count, 0, 'never return owner total pool count');
  assert.equal(v.tasks.length, 1); assert.equal(v.memos.length, 1);
  assert.equal(v.turtles[0].measureHistory.length, 1); assert(!JSON.stringify(v).includes('77777'));
  assert.equal((await view(1)).turtles.length, 21); assert.equal((await view(3)).turtles.length, 21);
  assert((await view(1)).personalLogs.length, 'owner personal history is shared without a date restriction');
  const r = (await req(2, 'report')).report;
  assert.equal(r.purchase, 1000); assert.equal(r.expenses, 20); assert(!r.species.includes('早期品种'));
  assert.equal(r.trend.find(t => t.month === '2025-06').expense, 1020, 'hidden transferred purchase excluded from totals');
  assert.equal((await req(2, 'get', { visibleFrom: '' })).team.turtles.length, 10, 'client cannot override cutoff');
  assert.equal(JSON.stringify(owner.data), initialData, 'projections do not modify owner data');
  for (const [action, body] of [
    ['turtle', { id: 'dated-t0', health: '健康' }],
    ['ledger', { kind: 'edit', id: 'old-purchase', recordDate: '2025-06-10', amount: 100 }],
    ['ledger', { type: 'sold', turtleId: 'dated-t0', recordDate: '2025-06-10', amount: 100 }],
    ['ledger', { type: 'other', title: '回填旧日期', recordDate: '2025-06-08', amount: 100 }],
    ['hatch', { id: 'old-nest', hatchDate: '2025-06-10', count: 1, speciesCode: 'ZYG', eventId: 'old-nest-rejected-event' }],
    ['breeding', { id: 'old-nest', date: '2025-06-10', motherId: 'manual', motherName: '修改旧窝', eggCount: 100, fertileCount: 100 }],
    ['task', { id: 'old-task' }], ['memo', { id: 'old-care', date: '2025-06-10', title: '修改旧护理' }]
  ]) await assert.rejects(edit(2, action, body), e => e.status === 403);
  await edit(2, 'breeding', { id: 'new-nest', date: '2025-06-10', motherId: '__keep__', poolId: '__keep__', motherName: '当前记录中的种母', eggCount: 10, fertileCount: 8 });
  assert.equal(owner.data.breedingRecords[1].motherId, 'dated-t0', 'preserve hidden parent association without exposing ID');
  assert.equal(owner.data.breedingRecords[1].poolId, 'old-pool');
  await edit(2, 'memo', { id: 'new-care', date: '2025-06-10', title: '护理已更新', repeat: false });
  assert.equal(owner.data.memos[1].title, '护理已更新');
  const oldRevision = (await view(2)).revision;
  await edit(1, 'member', { id: 'member-2', permissions: all, visibleFrom: '2025-06-11' });
  assert.equal((await view(2)).turtles.length, 0);
  await assert.rejects(req(2, 'turtle', { id: 'dated-t10', health: '健康', revision: oldRevision }), e => e.status === 409);
  await assert.rejects(edit(2, 'turtle', { id: 'dated-t10', health: '健康' }), e => e.status === 403);
  await edit(1, 'member', { id: 'member-2', permissions: all, visibleFrom: '' });
  assert.equal((await view(2)).turtles.length, 21);
  await assert.rejects(edit(1, 'member', { id: 'member-2', permissions: all, visibleFrom: '2025-02-30' }));
  assert.equal(visibility.day('2025-06-08T16:00:00Z'), '2025-06-09');
  assert.equal(visibility.day('2025-06-08T15:59:59Z'), '2025-06-08');
  // A juvenile from a hidden older nest remains hidden under the chosen whole-nest policy.
  owner.data.turtles.push({ id: 'hidden-nest-child', code: 'SECRET-OLDER-NEST-CHILD', sourceBreedingId: 'old-nest', acquiredDate: '2025-06-10' });
  await edit(1, 'member', { id: 'member-2', permissions: all, visibleFrom: '2025-06-09' });
  assert.equal((await view(2)).turtles.length, 10);
  await assert.rejects(edit(2, 'turtle', { id: 'hidden-nest-child', health: '健康' }), e => e.status === 403);
  console.log('PASS: all existing history shared, exact 10/20 example, inclusive dates, per-member scope, owner exemption, reports/trends, whole-nest hiding, nested history redaction, mutation bounds, date updates, care records, no data duplication.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
