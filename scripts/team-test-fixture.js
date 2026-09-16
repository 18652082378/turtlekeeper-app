const crypto = require('crypto');
const { newTeam } = require('../server/team-space');
const now = new Date(), month = now.toISOString().slice(0, 7);
function fixture() {
  const users = {};
  for (let i = 1; i <= 9; i++) {
    const phone = `1390000000${i}`;
    users[phone] = { phone, termsVersion: '2026-09-01', accountName: ['青禾龟场', '林小满', '周池', '访客'][i - 1] || `成员${i}`, tokens: [{ hash: crypto.createHash('sha256').update('team-test-token').digest('hex') }],
      data: { turtles: [], ledgerRecords: [], memos: [], breedingRecords: [] } };
  }
  const owner = users['13900000001'];
  owner.teamEntitlement = { source: 'test', verified: true, expiresAt: new Date(Date.now() + 86400000 * 60).toISOString() };
  owner.teamSpace = newTeam(owner); owner.teamSpace.id = 'fixture-team'; owner.teamSpace.name = '青禾龟场';
  owner.teamSpace.branding = { name: '青禾龟场', contact: '用心养龟 · 记录成长', logo: '' };
  owner.teamSpace.members = [
    { id: 'member-2', phone: '13900000002', status: 'active', permissions: { dashboard: 'edit', ledger: 'edit', tasks: 'edit' } },
    { id: 'member-3', phone: '13900000003', status: 'active', permissions: { dashboard: 'read', ledger: 'none', tasks: 'read' } }
  ];
  owner.data.turtles = [
    { id: 't1', code: 'JQ-001', speciesCode: 'gold', speciesName: '金钱龟', gender: '雌', status: '正常饲养', health: '健康', price: 2400, weight: 630, carapaceLength: 15.2, acquiredDate: `${month}-01`, note: 'PRIVATE COST NOTE', measureHistory: [{ id: 'h1', date: `${month}-01`, weight: 610, carapaceLength: 15 }] },
    { id: 't2', code: 'HC-002', speciesCode: 'yellow', speciesName: '黄缘闭壳龟', gender: '雄', status: '正常饲养', health: '健康', price: 850, weight: 320, carapaceLength: 12, acquiredDate: `${month}-02` },
    { id: 't3', code: 'HC-003', speciesCode: 'yellow', speciesName: '黄缘闭壳龟', gender: '未知', status: '正常饲养', health: '观察', price: '', weight: 190 }
  ];
  owner.data.ledgerRecords = [
    { id: 'p1', type: 'purchase', title: '金钱龟购入', amount: 2400, turtleId: 't1', recordDate: `${month}-01`, turtleSnapshot: owner.data.turtles[0] },
    { id: 'p2', type: 'purchase', title: '黄缘购入', amount: 850, turtleId: 't2', recordDate: `${month}-02`, turtleSnapshot: owner.data.turtles[1] },
    { id: 's1', type: 'sold', title: '黄缘成体售出', amount: 4800, recordDate: `${month}-05`, turtleSnapshot: { speciesName: '黄缘闭壳龟' } },
    { id: 'e1', type: 'other', title: '龟粮与水质试剂', amount: 160, recordDate: `${month}-06`, note: 'PRIVATE FINANCE' },
    { id: 's2', type: 'sold', title: '金钱龟成体售出', amount: 5600, recordDate: `${month}-08`, turtleSnapshot: { speciesName: '金钱龟' } }
  ];
  owner.teamSpace.tasks = [
    { id: 'task1', title: '一号池换水，检查水温', kind: '换水', due: now.toISOString().slice(0, 10), assignee: 'member-2', done: false },
    { id: 'task2', title: '黄缘组称重与背甲测量', kind: '称重', due: now.toISOString().slice(0, 10), assignee: 'owner', done: false },
    { id: 'task3', title: '幼龟投喂并清理食台', kind: '喂食', due: `${month}-01`, assignee: 'member-2', done: true }
  ];
  owner.data.breedingRecords = [
    { id: 'b1', motherId: 't1', motherName: '金钱龟 · 一号种母', date: `${month}-02`, eggCount: 6, fertileCount: 5, hatchCount: 3, note: 'PRIVATE BREEDING', hatchEvents: [{ id: 'fixture-hatch-001', date: `${month}-03`, count: 3, speciesCode: 'gold', turtleIds: [] }] },
    { id: 'b2', motherId: 'manual', motherName: '黄缘 · 二号种母', date: `${month}-01`, eggCount: 8, fertileCount: 6, hatchCount: 0, note: '定期观察，保持环境稳定。' }
  ];
  return { users };
}
module.exports = { fixture, month };
