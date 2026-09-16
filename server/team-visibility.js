// Date scope is enforced on the server before data leaves the owner account.
const clone = value => JSON.parse(JSON.stringify(value));
function day(value) {
  const s = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s ? s : '';
  if (!/^\d{4}-\d{2}-\d{2}T/.test(s) || !Number.isFinite(Date.parse(s))) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s));
}
function recordDay(row, keys) {
  for (const key of keys) if (row?.[key] != null && row[key] !== '') return day(row[key]);
  return '';
}
const dates = {
  turtles: ['acquiredDate', 'createdAt'], ledgerRecords: ['recordDate', 'createdAt'], breedingRecords: ['date', 'layDate', 'createdAt'],
  memos: ['dueDate', 'date', 'recordDate', 'createdAt', 'updatedAt'], turtlePools: ['createdAt'],
  tasks: ['due', 'createdAt'], logs: ['at', 'createdAt'], hatchEvents: ['date', 'createdAt']
};
function visible(row, kind, from) {
  if (!from) return true;
  const d = recordDay(row, dates[kind]); return Boolean(d && d >= from);
}
function scope(data, from = '') {
  if (!from) return data;
  const result = {};
  for (const kind of ['turtles', 'ledgerRecords', 'breedingRecords', 'memos', 'turtlePools']) result[kind] = (data[kind] || []).filter(r => visible(r, kind, from)).map(clone);
  const allowedNests = new Set(result.breedingRecords.map(r => r.id));
  result.turtles = result.turtles.filter(t => !t.sourceBreedingId || allowedNests.has(t.sourceBreedingId));
  const turtleIds = new Set(result.turtles.map(t => t.id)), nestIds = new Set(result.breedingRecords.map(r => r.id)), poolIds = new Set(result.turtlePools.map(p => p.id));
  for (const t of result.turtles) {
    t.measureHistory = (t.measureHistory || []).filter(h => recordDay(h, ['date', 'recordDate', 'updatedAt', 'createdAt']) >= from).map(h => ({
      id: h.id, updatedAt: h.updatedAt || h.date || h.recordDate, newPhoto: h.newPhoto || '',
      newSnapshot: Object.fromEntries(['weight', 'carapaceLength', 'health', 'status'].map(k => [k, h.newSnapshot?.[k] ?? h[k] ?? '']))
    }));
    // New hatchling archives may refer to an older, hidden nest.
    if (t.sourceBreedingId && !nestIds.has(t.sourceBreedingId)) { delete t.sourceBreedingId; t.note = ''; }
    if (t.poolId && !poolIds.has(t.poolId)) { t.poolId = ''; t.poolName = ''; }
  }
  for (const r of result.ledgerRecords) {
    if (r.turtleSnapshot) {
      // Snapshot history and prior purchase details are not part of this dated transaction.
      r.turtleSnapshot = Object.fromEntries(['id', 'code', 'speciesCode', 'speciesName'].map(k => [k, r.turtleSnapshot[k]]));
    }
    if (r.transferredPurchase && !visible(r.transferredPurchase, 'ledgerRecords', from)) { delete r.transferredPurchase; delete r.transferredPurchaseAmount; }
    if (r.turtleId && !turtleIds.has(r.turtleId)) delete r.turtleId;
  }
  for (const r of result.breedingRecords) {
    r.hatchEvents = (r.hatchEvents || []).filter(e => visible(e, 'hatchEvents', from));
    r.hatchArchiveIds = (r.hatchArchiveIds || []).filter(id => turtleIds.has(id));
    r.editHistory = [];
    if (r.motherId && r.motherId !== 'manual' && !turtleIds.has(r.motherId)) { r.motherId = '__keep__'; r.restrictedMother = true; }
    if (r.fatherId && !turtleIds.has(r.fatherId)) delete r.fatherId;
    if (r.poolId && !poolIds.has(r.poolId)) { r.poolId = '__keep__'; r.poolName = ''; r.restrictedPool = true; }
  }
  result.memos = result.memos.filter(m => !m.turtleId || turtleIds.has(m.turtleId));
  // Derive pool counts from visible animals; the owner's total count may span years.
  for (const p of result.turtlePools) p.count = result.turtles.filter(t => t.poolId === p.id && !['已死亡', '已转让'].includes(t.status)).length;
  result.customSpecies = (data.customSpecies || []).filter(s => visible(s, 'turtlePools', from) || result.turtles.some(t => t.speciesCode === s.code)).map(s => ({ code: s.code, name: s.name, isCustom: true, photo: s.photo || '' }));
  result.keptSpecies = [...new Set(result.turtles.map(t => t.speciesCode).filter(Boolean))];
  result.activityLogs = []; // Legacy free text has no record IDs to safely resolve its data scope.
  return result;
}
function mutationAllowed(body, data, team, from) {
  if (!from) return true;
  const has = (kind, id) => (data[kind] || []).some(r => r.id === id && visible(r, kind, from));
  const after = v => Boolean(day(v) && day(v) >= from);
  switch (body.action) {
    case 'turtle': return has('turtles', body.id);
    case 'breeding': return (!body.id || has('breedingRecords', body.id)) && after(body.date)
      && (!body.motherId || body.motherId === 'manual' || (body.motherId === '__keep__' && body.id) || has('turtles', body.motherId)) && (!body.poolId || (body.poolId === '__keep__' && body.id) || has('turtlePools', body.poolId));
    case 'hatch': return has('breedingRecords', body.id) && after(body.hatchDate);
    case 'ledger': return (!body.id || has('ledgerRecords', body.id)) && (body.kind === 'delete' || after(body.recordDate))
      && (!body.turtleId || has('turtles', body.turtleId));
    case 'task': return body.id ? (team.tasks || []).some(t => t.id === body.id && visible(t, 'tasks', from)) : after(body.due);
    case 'memo': return (!body.id || has('memos', body.id)) && after(body.date) && (!body.turtleId || has('turtles', body.turtleId));
    default: return true;
  }
}
module.exports = { day, recordDay, visible, scope, mutationAllowed };
