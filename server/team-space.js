// Team records live on the owner, outside client-writable account data.
// Audit entries contain descriptions only; they are not recoverable snapshots.
const crypto = require('crypto');
const fs = require('node:fs');
const path = require('node:path');
const lossAccounting = require('../assets/loss-accounting');
const activeTurtle = require('../assets/turtle-batches').isActive;
const breeding = require('./team-breeding');
const visibility = require('./team-visibility');
const id = () => crypto.randomUUID();
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value, limit = 120) => String(value ?? '').trim().slice(0, limit);
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function check(condition, message, status) { if (!condition) fail(message, status); }
function amount(value) {
  const n = Number(value);
  check(value !== '' && Number.isFinite(n) && n >= 0 && n <= 1e9 && Math.abs(n * 100 - Math.round(n * 100)) < .0001, '金额需为非负数，最多两位小数');
  return Math.round(n * 100) / 100;
}
function date(value) {
  const v = text(value, 10);
  check(/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, '请填写有效日期');
  return v;
}
function permissions(value = {}) {
  return Object.fromEntries(['dashboard', 'ledger', 'tasks', 'breeding'].map(key => [key,
    ['none', 'read', 'edit'].includes(value[key]) ? value[key] : 'none']));
}
// A server-admin allowlist enables time-limited testing for specific accounts.
// It lives outside client-writable account data and never alters Apple purchases.
function testAccessFile() {
  return path.resolve(process.env.TURTLE_RUNTIME_DIR || __dirname, 'data/team-test-access.json');
}
function access(user, now = Date.now()) {
  const e = user.teamEntitlement;
  if (e && e.verified === true && ['apple', 'test'].includes(e.source)
    && (e.source !== 'test' || process.env.TURTLE_TEAM_TEST === '1') && Date.parse(e.expiresAt) > now && !e.revoked)
    return { active: true, testing: e.source === 'test', expiresAt: e.expiresAt };
  try {
    const grants = JSON.parse(fs.readFileSync(testAccessFile(), 'utf8'));
    const grant = grants.version === 1 && grants.accounts?.[user.phone];
    const start = Date.parse(grant?.issuedAt), end = Date.parse(grant?.expiresAt);
    if (grant && start <= now && end > now && end - start <= 7 * 86400000)
      return { active: true, testing: true, expiresAt: grant.expiresAt };
  } catch { /* Missing or invalid admin configuration cannot grant access. */ }
  return { active: false, testing: false, expiresAt: e?.expiresAt || '' };
}
function entitled(user, now = Date.now()) { return access(user, now).active; }
function newTeam(user) {
  return { id: id(), name: `${user.accountName || '我的'}的龟场`, members: [], tasks: [], approvals: [], logs: [],
    branding: { name: '', logo: '', contact: '' }, approvalRequired: false, createdAt: new Date().toISOString() };
}
function audit(team, user, action, summary, module = 'team', dataDate = '') {
  team.logs.unshift({ id: id(), actorId: user.phone, actorName: user.accountName || '团队成员', action,
    summary: text(summary, 220), module, dataDate, at: new Date().toISOString() });
  team.logs = team.logs.slice(0, 5000);
}
function recordAccountChange(user, before, after) {
  const team = user.teamSpace;
  if (!team) return;
  for (const key of ['turtles', 'ledgerRecords', 'memos', 'breedingRecords']) {
    const old = new Map((before[key] || []).map(row => [row.id, row]));
    const next = new Map((after[key] || []).map(row => [row.id, row]));
    const added = [...next.keys()].filter(k => !old.has(k)).length;
    const removed = [...old.keys()].filter(k => !next.has(k)).length;
    const changed = [...next.keys()].filter(k => old.has(k) && hash(next.get(k)) !== hash(old.get(k))).length;
    if (added || removed || changed) audit(team, user, 'account.sync', `${({ turtles: '档案', ledgerRecords: '账本', memos: '护理', breedingRecords: '繁殖' })[key]}：新增 ${added} · 修改 ${changed} · 删除 ${removed}`, key === 'ledgerRecords' ? 'ledger' : key === 'breedingRecords' ? 'breeding' : 'dashboard');
  }
}
function publicTurtle(t, finance = false) {
  const out = {};
  for (const key of ['id', 'code', 'name', 'speciesCode', 'speciesName', 'gender', 'status', 'health', 'photo', 'acquiredDate', 'weight', 'carapaceLength', 'poolId']) out[key] = t[key] ?? '';
  for (const key of ['source', 'batchId', 'batchName', 'stage', 'lossDate']) out[key] = t[key] ?? '';
  out.measureHistory = (t.measureHistory || []).map(h => ({ id: h.id, date: h.updatedAt || h.date || h.recordDate || '', weight: h.newSnapshot?.weight ?? h.weight, carapaceLength: h.newSnapshot?.carapaceLength ?? h.carapaceLength ?? h.newLength, health: h.newSnapshot?.health || '', photo: h.newPhoto || '' }));
  if (finance) { out.price = t.price; out.note = t.note || ''; }
  return out;
}
function ledgerRows(data) {
  const turtles = new Map((data.turtles || []).map(t => [t.id, t]));
  const source = (data.ledgerRecords || []).filter(r => ['purchase', 'sold', 'loss', 'other'].includes(r.type) && !r.duplicateLossOf);
  const sourceIds = new Set(source.map(r => r.id));
  const rows = [...source];
  for (const r of source) if (r.type === 'loss' && r.transferredPurchase) {
    rows.push({ ...r.transferredPurchase, id: `transferred:${r.id}`, type: 'purchase',
      amount: r.transferredPurchaseAmount || 0, restoredPurchase: true,
      turtleId: r.turtleId || r.turtleSnapshot?.id || '', turtleIds: [r.turtleId || r.turtleSnapshot?.id].filter(Boolean), relatedLossId: r.id,
      turtleSnapshot: r.turtleSnapshot || r.transferredPurchase.turtleSnapshot,
      title: r.transferredPurchase.originalPurchaseTitle || r.transferredPurchase.title });
  }
  return rows.map(r => {
    const t = r.turtleSnapshot || turtles.get(r.turtleId) || {};
    return { id: r.id, type: r.type, title: r.title || '', amount: Number(r.amount || 0),
      recordDate: r.recordDate || visibility.recordDay(r, ['createdAt']), recordTime: r.recordTime || '', createdAt: r.createdAt || '',
      category: r.type === 'other' ? String(r.category || '').trim() || '其他' : '', note: r.note || '',
      turtleId: r.turtleId || '', turtleCode: t.code || '', speciesName: r.speciesName || t.speciesName || '',
      associationIds: [...new Set([...(r.turtleIds || []), r.turtleId, r.turtleSnapshot?.id].filter(Boolean))],
      relatedLossId: sourceIds.has(r.relatedLossId) ? r.relatedLossId : '',
      quantity: r.restoredPurchase ? 1 : (r.turtleIds?.length || t.batchCount || (r.turtleId ? 1 : null)),
      poolName: r.poolName || '', photo: r.photo || t.photo || '', restoredPurchase: Boolean(r.restoredPurchase) };
  }).sort((a, b) => `${b.recordDate} ${b.recordTime}`.localeCompare(`${a.recordDate} ${a.recordTime}`));
}
function recordTime(value) {
  const v = text(value, 20);
  check(!v || /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v), '请填写有效时间');
  return v;
}
function reportPeriod(month, range = {}) {
  check(range && typeof range === 'object' && !Array.isArray(range), '请选择有效日期范围');
  const mode = range.mode || 'month';
  check(['month', 'year', 'custom', 'all'].includes(mode), '请选择有效日期范围');
  if (mode === 'all') return { mode, start: '', end: '', label: '全部历史' };
  if (mode === 'year') {
    const end = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const start = new Date(Date.parse(end + 'T00:00:00Z') - 364 * 86400000).toISOString().slice(0, 10);
    return { mode, start, end, label: `${start} 至 ${end}` };
  }
  if (mode === 'custom') {
    check(/^\d{4}-\d{2}-\d{2}$/.test(range.start || '') && /^\d{4}-\d{2}-\d{2}$/.test(range.end || ''), '请填写开始和结束日期');
    const start = date(range.start), end = date(range.end);
    check(start <= end, '开始日期不能晚于结束日期');
    return { mode, start, end, label: `${start} 至 ${end}` };
  }
  check(/^\d{4}-(0[1-9]|1[0-2])$/.test(month), '请选择月份');
  const end = new Date(`${month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  return { mode, start: month + '-01', end: end.toISOString().slice(0, 10), label: month };
}
const inPeriod = (r, period) => !period.start || (String(r.recordDate || '').slice(0, 10) >= period.start && String(r.recordDate || '').slice(0, 10) <= period.end);
function report(data, month, species = '', range) {
  check(/^\d{4}-(0[1-9]|1[0-2])$/.test(month), '请选择月份');
  const period = reportPeriod(month, range);
  const turtles = data.turtles || [];
  const byId = new Map(turtles.map(t => [t.id, t]));
  const all = ledgerRows(data);
  const speciesOf = r => r.speciesName || r.turtleSnapshot?.speciesName || byId.get(r.turtleId)?.speciesName || '未分类';
  // Daily expenses keep the owner's ledger category, even when linked to a turtle.
  const groupOf = r => r.type === 'other' ? String(r.category || '').trim() || '其他' : speciesOf(r);
  // Old loss handling moves purchase cost out of purchase records. Restore
  // the transferred cash movement to the ORIGINAL purchase date for reports.
  const cash = all.filter(r => ['sold', 'purchase', 'other'].includes(r.type)).map(r => ({ ...r }));
  const match = r => inPeriod(r, period) && (!species || groupOf(r) === species);
  const rows = cash.filter(match);
  const sum = type => Math.round(rows.filter(r => r.type === type).reduce((n, r) => n + Math.round(Number(r.amount || 0) * 100), 0)) / 100;
  const income = sum('sold'), purchase = sum('purchase'), expenses = sum('other');
  const losses = all.filter(r => r.type === 'loss' && !r.duplicateLossOf && match(r));
  const groups = new Map();
  for (const r of rows) {
    const name = groupOf(r), g = groups.get(name) || { name, income: 0, expense: 0 };
    g[r.type === 'sold' ? 'income' : 'expense'] += Math.round(Number(r.amount || 0) * 100);
    groups.set(name, g);
  }
  let buckets;
  if (period.mode === 'month') buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 5 + i); return d.toISOString().slice(0, 7);
  });
  else {
    const start = (period.start || all.map(r => r.recordDate).filter(Boolean).sort()[0] || month).slice(0, 7);
    const end = (period.end || all.map(r => r.recordDate).filter(Boolean).sort().at(-1) || month).slice(0, 7);
    const count = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5)) - Number(start.slice(5)) + 1;
    if (count > 24) buckets = [...new Set(all.filter(match).map(r => r.recordDate.slice(0, 4)))].sort();
    else buckets = Array.from({ length: Math.max(1, count) }, (_, i) => { const d = new Date(`${start}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + i); return d.toISOString().slice(0, 7); });
  }
  const trend = buckets.map(m => {
    let inc = 0, exp = 0;
    cash.filter(r => String(r.recordDate || '').startsWith(m) && (period.mode === 'month' || inPeriod(r, period)) && (!species || groupOf(r) === species)).forEach(r => {
      const n = Math.round(Number(r.amount || 0) * 100); if (r.type === 'sold') inc += n; else exp += n;
    });
    return { month: m, income: inc / 100, expense: exp / 100 };
  });
  return { month, period, income, purchase, expenses, balance: Math.round((income - purchase - expenses) * 100) / 100,
    entries: all.filter(match),
    loss: losses.reduce((n, r) => n + Math.round(Number(r.amount || 0) * 100), 0) / 100,
    lossCount: losses.length, activeCount: turtles.filter(activeTurtle).length,
    missingCostCount: turtles.filter(t => activeTurtle(t) && (t.price === undefined || t.price === null || t.price === '')).length,
    species: [...new Set([...all, ...cash].map(groupOf))].sort(), groups: [...groups.values()].map(g => ({ ...g, income: g.income / 100, expense: g.expense / 100 })), trend };
}
const csv = rows => '\uFEFF' + rows.map(row => row.map(value => {
  let s = String(value ?? '');
  if (/^[\s]*[=+@\-]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}).join(',')).join('\r\n');
function createTeamService({ read, write, authenticate, normalize }) {
  function resolve(db, user, teamId) {
    const owner = Object.values(db.users).find(u => u.teamSpace?.id === teamId);
    check(owner, '团队不存在或已解散', 404);
    const own = owner.phone === user.phone;
    const member = owner.teamSpace.members.find(m => m.phone === user.phone && m.status === 'active');
    check(own || member, '你已不在这个团队中', 403);
    const visibleFrom = own ? '' : (member.visibleFrom || '');
    // Invalid stored cutoff fails closed rather than accidentally sharing history.
    check(!visibleFrom || visibility.day(visibleFrom) === visibleFrom, '数据可见日期无效，请联系主账号重新设置', 403);
    return { owner, own, member, team: owner.teamSpace, visibleFrom, data: visibility.scope(owner.data, visibleFrom), perms: own ? { dashboard: 'edit', ledger: 'edit', tasks: 'edit', breeding: 'edit' } : permissions(member.permissions) };
  }
  function snapshot(db, user, ctx, month, range) {
    const { owner, own, team, perms, data, visibleFrom } = ctx;
    const membership = access(owner), active = membership.active;
    const can = module => active && ['read', 'edit'].includes(perms[module]);
    const breedingRecords = can('breeding') ? (data.breedingRecords || []).map(r => breeding.publicRecord(r, data)) : [];
    const publicApprovals = active && (own || can('ledger')) ? team.approvals.filter(p => {
      if (own) return true;
      if (p.actorId !== user.phone) return false;
      if (!visibleFrom) return true;
      if (visibility.recordDay(p, ['at']) < visibleFrom) return false;
      if (visibility.recordDay(p.command.record || p.command.patch, ['recordDate', 'createdAt']) < visibleFrom) return false;
      // Approved sales remove the live turtle. Use the dated transaction as proof
      // of visibility instead of requiring an archive which no longer exists.
      if (p.status === 'approved') return (data.ledgerRecords || []).some(r => r.id === (p.command.kind === 'edit' ? p.command.id : p.command.record?.id));
      return visibility.mutationAllowed({ action: 'ledger', ...(p.command.record || p.command.patch), id: p.command.kind === 'edit' ? p.command.id : '', kind: p.command.kind }, data, team, visibleFrom);
    }).map(p => {
      const command = { kind: p.command.kind, id: p.command.id };
      // Stored approval commands can contain full asset snapshots after applying
      // a sale/loss. Only return fields needed to review the transaction.
      for (const key of ['record', 'patch']) if (p.command[key]) command[key] = Object.fromEntries(
        ['id', 'type', 'title', 'amount', 'recordDate', 'recordTime', 'category', 'note'].filter(k => p.command[key][k] !== undefined).map(k => [k, p.command[key][k]])
      );
      return { id: p.id, actorId: p.actorId, actorName: db.users[p.actorId]?.accountName || '成员', at: p.at, status: p.status, decidedAt: p.decidedAt, reason: p.reason, command };
    }) : [];
    return { id: team.id, name: team.name, own, selfId: own ? 'owner' : ctx.member.id, ...membership,
      revision: hash([team, owner.data]), permissions: perms, visibleFrom, branding: team.branding, approvalRequired: team.approvalRequired,
      members: team.members.filter(m => own || m.status === 'active').map(m => ({ id: m.id, name: db.users[m.phone]?.accountName || m.name || '待加入成员',
        ...(own ? { phone: m.phone, permissions: permissions(m.permissions), visibleFrom: m.visibleFrom || '', status: m.status } : {}) })),
      owner: { id: 'owner', name: owner.accountName || '主账号' },
      turtles: can('dashboard') ? (data.turtles || []).map(t => publicTurtle(t, can('ledger'))) : [],
      pools: can('dashboard') ? (data.turtlePools || []).map(p => ({ id: p.id, name: p.name, type: p.type, length: p.length, width: p.width, height: p.height, note: p.note || '', count: (data.turtles || []).filter(t => t.poolId === p.id && activeTurtle(t)).length })) : [],
      ledgerTurtles: can('ledger') && perms.ledger === 'edit' ? (data.turtles || []).filter(activeTurtle).map(t => ({ id: t.id, code: t.code, speciesName: t.speciesName })) : [],
      ledger: can('ledger') ? ledgerRows(data) : [],
      report: can('ledger') ? report(data, month, '', range) : null,
      breedingRecords, breedingStats: can('breeding') ? breeding.stats(breedingRecords) : null,
      breedingParents: can('breeding') && perms.breeding === 'edit' ? (data.turtles || []).filter(activeTurtle).map(t => ({ id: t.id, code: t.code, speciesCode: t.speciesCode, speciesName: t.speciesName })) : [],
      breedingPools: can('breeding') && perms.breeding === 'edit' ? (data.turtlePools || []).map(p => ({ id: p.id, name: p.name })) : [],
      breedingSpecies: can('breeding') && perms.breeding === 'edit' ? breeding.speciesOptions(data) : [],
      memos: can('tasks') ? (data.memos || []).map(m => ({ id: m.id, title: m.title, content: m.content || '', date: visibility.recordDay(m, ['dueDate', 'date', 'recordDate', 'createdAt', 'updatedAt']), remindTime: m.remindTime || '', repeat: Boolean(m.repeat), weekdays: m.weekdays || [], turtleId: m.turtleId || '' })) : [],
      tasks: can('tasks') ? team.tasks.filter(t => visibility.visible(t, 'tasks', visibleFrom)) : [],
      approvals: publicApprovals,
      logs: active ? team.logs.filter(l => (own || (l.module !== 'team' && can(l.module))) && (!visibleFrom || (visibility.visible(l, 'logs', visibleFrom) && l.dataDate && l.dataDate >= visibleFrom))).slice(0, 500) : [],
      personalLogs: active && !visibleFrom ? (data.activityLogs || []).filter(l => own || can(({ '繁殖': 'breeding', '护理': 'tasks', '账本': 'ledger', '档案': 'dashboard' })[l.type])).map(l => ({ id: l.id, summary: l.text, at: l.createdAt, actorName: owner.accountName || '主账号', actorId: owner.phone })).slice(0, 500) : [] };
  }
  function applyLedger(data, command) {
    const rows = data.ledgerRecords;
    if (command.kind === 'edit') {
      const row = rows.find(r => r.id === command.id);
      check(row && hash(row) === command.baseHash, '原账目已被修改，请重新提交', 409);
      check(['sold', 'other'].includes(row.type), '收购与损耗关联成本，请在主账号原账本中修改');
      Object.assign(row, command.patch);
      return;
    }
    if (command.kind === 'delete') {
      const row = rows.find(r => r.id === command.id);
      check(row && row.type === 'other', '团队空间只支持删除日常支出；关联资产账目请在主账号处理');
      data.ledgerRecords = rows.filter(r => r.id !== row.id); return;
    }
    const row = command.record;
    const turtle = data.turtles.find(t => t.id === row.turtleId);
    if (['sold', 'loss'].includes(row.type)) {
      check(turtle && activeTurtle(turtle), '该档案已售出或损耗，请刷新', 409);
      row.turtleSnapshot = clone(turtle); row.title = turtle.code || turtle.name || turtle.speciesName;
      if (row.type === 'loss') row.amount = lossAccounting.purchaseCost(turtle, rows);
    }
    rows.unshift(row);
    if (row.type === 'sold') data.turtles = data.turtles.filter(t => t.id !== turtle.id);
    if (row.type === 'loss') Object.assign(data, lossAccounting.transferLoss(data, row, turtle));
  }
  async function action(body) {
    const db = read();
    const user = authenticate(db, text(body.phone), body.token);
    check(user, '登录已过期，请重新登录', 401);
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(body.month || '') ? body.month : new Date().toISOString().slice(0, 7);
    const range = reportPeriod(month, body.range);
    if (body.action === 'list') return { teams: Object.values(db.users).filter(u => u.teamSpace && (u.phone === user.phone || u.teamSpace.members.some(m => m.phone === user.phone && m.status === 'active'))).map(u => ({ id: u.teamSpace.id, name: u.teamSpace.name, own: u.phone === user.phone, active: entitled(u) })),
      invitations: Object.values(db.users).filter(u => u.teamSpace).flatMap(u => u.teamSpace.members.filter(m => m.phone === user.phone && m.status === 'pending').map(m => ({ id: m.id, teamId: u.teamSpace.id, name: u.teamSpace.name }))),
      canCreate: entitled(user), hasOwnTeam: Boolean(user.teamSpace), membership: access(user) };
    if (body.action === 'create') {
      check(entitled(user), '请先开通团队会员', 403);
      check(!user.teamSpace, '你已经创建了团队');
      user.teamSpace = newTeam(user); audit(user.teamSpace, user, 'create', '创建团队空间');
      await write(db); return { team: snapshot(db, user, resolve(db, user, user.teamSpace.id), month, range) };
    }
    if (['accept', 'decline'].includes(body.action)) {
      const owner = Object.values(db.users).find(u => u.teamSpace?.id === body.teamId);
      const member = owner?.teamSpace.members.find(m => m.id === body.id && m.phone === user.phone && m.status === 'pending');
      check(member, '邀请已失效', 404); check(entitled(owner), '该团队会员已到期', 403);
      if (body.action === 'accept') { member.status = 'active'; audit(owner.teamSpace, user, 'join', '接受邀请，加入团队'); }
      else owner.teamSpace.members = owner.teamSpace.members.filter(m => m !== member);
      await write(db); return { accepted: body.action === 'accept' };
    }
    const ctx = resolve(db, user, text(body.teamId));
    if (body.action === 'get') return { team: snapshot(db, user, ctx, month, range) };
    check(entitled(ctx.owner), '团队会员已到期，主账号原有数据仍可在个人空间使用', 403);
    const can = module => check(ctx.perms[module] === 'edit', '你没有此模块的编辑权限', 403);
    const ownerOnly = () => check(ctx.own, '仅主账号可以执行此操作', 403);
    if (body.action === 'report') { check(ctx.perms.ledger !== 'none', '没有账本权限', 403); return { report: report(ctx.data, month, text(body.species), range) }; }
    if (body.action === 'export') {
      ownerOnly(); const data = ctx.owner.data, brand = ctx.team.branding.name || ctx.team.name;
      let rows;
      if (body.kind === 'inventory') rows = [['龟场', '编号', '品种', '性别', '状态', '体重(g)', '购入成本'], ...data.turtles.filter(activeTurtle).map(t => [brand, t.code, t.speciesName, t.gender, t.status, t.weight, t.price])];
      else if (body.kind === 'ledger') rows = [['龟场', '业务日期', '业务时间(北京时间)', '录入时间(ISO)', '类型', '事项', '支出分类', '品种', '编号', '数量', '金额', '备注', '原购入成本还原'], ...ledgerRows(data).filter(r => inPeriod(r, range)).map(r => [brand, r.recordDate, r.recordTime || '未记录时间', r.createdAt, ({ purchase: '收购', sold: '售出', loss: '损耗', other: '其他支出' })[r.type], r.title, r.category, r.speciesName, r.turtleCode, r.quantity, r.amount, r.note, r.restoredPurchase ? '是' : '否'])];
      else { const r = report(data, month, '', range); rows = [['龟场', '日期范围', '销售收入', '收购支出', '日常支出', '收支结余', '损耗成本(非现金)', '缺少购入成本档案数'], [brand, range.label, r.income, r.purchase, r.expenses, r.balance, r.loss, r.missingCostCount]]; }
      audit(ctx.team, user, 'export', `导出 ${range.label} ${text(body.kind)}`, 'ledger'); await write(db);
      return { filename: `团队-${text(body.kind)}-${range.start || 'all'}-${range.end || 'all'}.csv`, content: csv(rows) };
    }
    if (body.action === 'share') {
      ownerOnly(); const turtle = ctx.owner.data.turtles.find(t => t.id === body.id); check(turtle, '档案不存在', 404);
      const safe = publicTurtle(turtle);
      if (body.growth) safe.growth = [...(turtle.measureHistory || [])].sort((a, b) => String(a.updatedAt || a.date || '').localeCompare(String(b.updatedAt || b.date || ''))).slice(-12).map(r => ({ date: String(r.updatedAt || r.date || r.recordDate || '').slice(0, 10), weight: r.newSnapshot?.weight ?? r.weight, carapaceLength: r.newSnapshot?.carapaceLength ?? r.carapaceLength }));
      if (body.breeding) safe.breeding = (ctx.owner.data.breedingRecords || []).filter(r => r.motherId === turtle.id || r.fatherId === turtle.id).map(r => ({ date: r.date || r.layDate, eggs: r.eggCount }));
      audit(ctx.team, user, 'share', `生成 ${turtle.code || '档案'} 品牌分享卡`, 'dashboard'); await write(db);
      return { card: { brand: ctx.team.branding, turtle: safe } };
    }
    check(body.revision === hash([ctx.team, ctx.owner.data]), '其他成员已更新，请刷新后重试；本次没有覆盖数据', 409);
    check(ctx.own || visibility.mutationAllowed(body, ctx.data, ctx.team, ctx.visibleFrom), '该记录或日期不在你可操作的数据范围内', 403);
    // Work on copies, so a rejected command never partly changes live MySQL state.
    const team = clone(ctx.team), data = normalize(clone(ctx.owner.data));
    let message = '已保存';
    switch (body.action) {
      case 'breeding': {
        can('breeding'); const previous = data.breedingRecords.find(r => r.id === body.id);
        const editBody = { ...body };
        if (body.motherId === '__keep__') editBody.motherId = previous?.motherId;
        if (body.poolId === '__keep__') editBody.poolId = previous?.poolId;
        const r = breeding.edit(data, editBody);
        audit(team, user, body.id ? 'breeding.edit' : 'breeding.create', `${body.id ? '更新' : '新增'}繁殖：${r.motherName} · 产蛋 ${r.eggCount} 枚 · 受精 ${r.fertileCount} 枚${r.incubationClosed ? ' · 孵化已结束' : ''}`, 'breeding', r.date); break;
      }
      case 'hatch': {
        can('breeding'); const result = breeding.hatch(data, body);
        message = result.repeated ? '本次出壳已记录，未重复创建档案' : `${result.historical ? '历史出壳' : '本次出壳'} ${result.added} 只，幼龟档案已关联主账号看板`;
        if (!result.repeated) audit(team, user, 'breeding.hatch', `${result.record.motherName} · ${body.hatchDate} · ${result.historical ? '补建历史幼龟档案' : '记录出壳'} ${result.added} 只 · 累计 ${result.record.hatchCount} 只`, 'breeding', result.record.date); break;
      }
      case 'settings': {
        ownerOnly(); team.name = text(body.name, 40) || team.name;
        const logo = text(body.logo, 600000);
        check(!logo || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo), 'Logo 请上传 PNG、JPEG 或 WebP 图片');
        team.branding = { name: text(body.brandName, 40), contact: text(body.contact, 100), logo };
        team.approvalRequired = body.approvalRequired === true; audit(team, user, 'settings', '更新品牌与审批设置'); break;
      }
      case 'invite': {
        ownerOnly(); check(team.members.length < 6, '最多 6 个子账号，待接受邀请也占用名额');
        const phone = text(body.memberPhone);
        check(/^1[3-9]\d{9}$/.test(phone) && phone !== user.phone, '请填写成员手机号');
        check(!team.members.some(m => m.phone === phone), '该成员已经在团队或邀请列表中');
        const visibleFrom = body.visibleFrom ? date(body.visibleFrom) : '';
        team.members.push({ id: id(), phone, status: 'pending', permissions: permissions(body.permissions), visibleFrom });
        audit(team, user, 'invite', `邀请成员 ${phone.slice(0, 3)}****${phone.slice(-4)}`); break;
      }
      case 'member': {
        ownerOnly(); const m = team.members.find(m => m.id === body.id); check(m, '成员不存在', 404);
        if (body.remove) team.members = team.members.filter(x => x !== m);
        else { m.permissions = permissions(body.permissions); if (body.visibleFrom !== undefined) m.visibleFrom = body.visibleFrom ? date(body.visibleFrom) : ''; }
        audit(team, user, body.remove ? 'remove' : 'permission', `${body.remove ? '移除成员并撤销权限' : '调整成员模块权限'}：${db.users[m.phone]?.accountName || m.phone.slice(0, 3) + '****' + m.phone.slice(-4)}`); break;
      }
      case 'turtle': {
        can('dashboard'); const t = data.turtles.find(t => t.id === body.id); check(t, '档案不存在', 404);
        check(['健康', '观察', '治疗中'].includes(body.health), '请选择健康状态');
        const measurement = turtle => Object.fromEntries(['code', 'weight', 'carapaceLength', 'status', 'health', 'poolId'].map(k => [k, turtle[k] ?? '']));
        const before = measurement(t);
        t.health = body.health;
        for (const key of ['weight', 'carapaceLength']) {
          if (body[key] !== undefined && body[key] !== '') t[key] = amount(body[key]);
        }
        if (before.weight !== t.weight || before.carapaceLength !== t.carapaceLength) {
          t.measureHistory = [{ id: id(), oldLength: Number(before.carapaceLength || 0), newLength: Number(t.carapaceLength || 0),
            oldSnapshot: before, newSnapshot: measurement(t), oldPhoto: t.photo || '', newPhoto: t.photo || '', updatedAt: new Date().toISOString() }, ...(t.measureHistory || [])];
        }
        audit(team, user, 'turtle.edit', `更新 ${t.code || t.speciesName} 健康状态：${t.health}`, 'dashboard', visibility.recordDay(t, ['acquiredDate', 'createdAt'])); break;
      }
      case 'ledger': {
        can('ledger'); let command;
        if (body.kind === 'delete') { ownerOnly(); command = { kind: 'delete', id: text(body.id) }; }
        else if (body.kind === 'edit') {
          const row = data.ledgerRecords.find(r => r.id === body.id); check(row, '账目不存在', 404);
          command = { kind: 'edit', id: row.id, baseHash: hash(row), patch: { amount: amount(body.amount), note: text(body.note, 500), recordDate: date(body.recordDate) } };
          if (body.recordTime !== undefined) command.patch.recordTime = recordTime(body.recordTime);
          if (row.type === 'other' && body.category !== undefined) command.patch.category = text(body.category) || '其他';
        } else {
          check(['sold', 'loss', 'other'].includes(body.type), '请选择售出、损耗或日常支出');
          command = { kind: 'add', record: { id: id(), type: body.type, title: text(body.title) || '团队记账', amount: body.type === 'loss' ? 0 : amount(body.amount),
            turtleId: text(body.turtleId), recordDate: date(body.recordDate), recordTime: recordTime(body.recordTime), note: text(body.note, 500), category: body.type === 'other' ? text(body.category) || '其他' : '', createdAt: new Date().toISOString() } };
        }
        if (!ctx.own && team.approvalRequired && (command.kind === 'edit' || ['sold', 'loss'].includes(command.record?.type))) {
          const preview = clone(data); applyLedger(preview, clone(command));
          if (command.record) {
            const proposed = preview.ledgerRecords.find(r => r.id === command.record.id);
            command.record.title = proposed.title; command.record.amount = proposed.amount;
          }
          check(team.approvals.filter(p => p.status === 'pending').length < 200, '待审批项目过多，请先处理');
          team.approvals.unshift({ id: id(), actorId: user.phone, at: new Date().toISOString(), status: 'pending', command });
          audit(team, user, 'approval.submit', '提交重要账目操作，等待主账号确认', 'ledger', command.record?.recordDate || command.patch?.recordDate || ''); message = '已提交审批，账目尚未变更';
        } else { applyLedger(data, command); audit(team, user, `ledger.${command.kind}`, `${({ sold: '售出', loss: '损耗', other: '日常支出', edit: '更正账目', delete: '删除账目' })[command.record?.type || command.kind]} · ${command.record?.title || '账目'}`, 'ledger', command.record?.recordDate || command.patch?.recordDate || ''); }
        break;
      }
      case 'approval': {
        ownerOnly(); const p = team.approvals.find(p => p.id === body.id && p.status === 'pending'); check(p, '审批已处理或不存在', 409);
        if (body.approve === true) {
          const m = team.members.find(m => m.phone === p.actorId && m.status === 'active');
          check(m?.permissions.ledger === 'edit', '提交人已离队或失去编辑权限，请拒绝此申请');
          const actorData = visibility.scope(ctx.owner.data, m.visibleFrom || '');
          check(visibility.mutationAllowed({ action: 'ledger', ...(p.command.record || p.command.patch), id: p.command.kind === 'edit' ? p.command.id : '', kind: p.command.kind }, actorData, team, m.visibleFrom || ''), '提交人的可见日期范围已变更，请拒绝此申请', 403);
          applyLedger(data, clone(p.command)); p.status = 'approved';
        } else { check(text(body.reason, 500), '请填写退回原因'); p.status = 'rejected'; p.reason = text(body.reason, 500); }
        p.decidedAt = new Date().toISOString(); audit(team, user, 'approval.decide', `${p.status === 'approved' ? '通过' : '拒绝'}账目申请`, 'ledger'); break;
      }
      case 'task': {
        can('tasks');
        if (body.id) {
          const task = team.tasks.find(t => t.id === body.id); check(task, '任务不存在', 404);
          const self = ctx.own ? 'owner' : ctx.member.id;
          check(ctx.own || task.assignee === self, '只能完成分配给自己的任务', 403);
          task.done = !task.done; task.completedBy = user.accountName; task.completedAt = task.done ? new Date().toISOString() : '';
          audit(team, user, 'task.complete', `${task.done ? '完成' : '重新打开'}：${task.title}`, 'tasks', task.due);
        } else {
          check(team.tasks.length < 2000, '任务数量已达上限');
          const title = text(body.title); check(title, '请填写任务内容');
          const assignee = text(body.assignee);
          check(assignee === 'owner' || team.members.some(m => m.id === assignee && m.status === 'active'), '请选择在队成员');
          team.tasks.unshift({ id: id(), title, kind: text(body.kind), due: date(body.due), assignee, done: false, createdAt: new Date().toISOString() });
          audit(team, user, 'task.create', `分配任务：${title}`, 'tasks', body.due);
        } break;
      }
      case 'task.delete': ownerOnly(); team.tasks = team.tasks.filter(t => t.id !== body.id); audit(team, user, 'task.delete', '删除任务', 'tasks'); break;
      case 'memo': {
        can('tasks'); data.memos ||= [];
        const old = body.id ? data.memos.find(m => m.id === body.id) : null; check(!body.id || old, '护理记录不存在', 404);
        const title = text(body.title); check(title, '请填写护理事项');
        const remindTime = text(body.remindTime, 5); check(!remindTime || /^([01]\d|2[0-3]):[0-5]\d$/.test(remindTime), '请填写有效提醒时间');
        const r = { ...(old || { id: id(), createdAt: new Date().toISOString() }), title, content: text(body.content, 2000), date: date(body.date), remindTime, repeat: body.repeat === true, updatedAt: new Date().toISOString() };
        // dueDate takes precedence for dated care plans; moving it must honor scope too.
        if (old?.dueDate) r.dueDate = r.date;
        if (old) data.memos[data.memos.indexOf(old)] = r; else data.memos.unshift(r);
        audit(team, user, 'memo.save', `${old ? '更新' : '新增'}护理：${r.title}`, 'tasks', r.date); break;
      }
      default: fail('不支持的团队操作');
    }
    ctx.owner.teamSpace = team; ctx.owner.data = data;
    ctx.owner.updatedAt = new Date(Math.max(Date.now(), (Date.parse(ctx.owner.updatedAt) || 0) + 1)).toISOString();
    await write(db);
    return { message, team: snapshot(db, user, resolve(db, user, team.id), month, range) };
  }
  return { action };
}
module.exports = { createTeamService, entitled, access, testAccessFile, recordAccountChange, report, reportPeriod, ledgerRows, csv, hash, newTeam };
