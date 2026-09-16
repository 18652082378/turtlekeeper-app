// Shared owner data; keep the personal app's breeding, hatch-event and batch schema.
const crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const text = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function date(v) {
  const s = text(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s || s > today()) fail('请填写有效日期，不能晚于今天');
  return s;
}
function count(v, label, max = 1000000) {
  const n = Number(v);
  if (v === '' || v == null || !Number.isSafeInteger(n) || n < 0 || n > max) fail(`${label}需为 0 至 ${max} 的整数`);
  return n;
}
function progress(record, data) {
  const linked = new Set((record.hatchArchiveIds || []).filter(Boolean));
  for (const t of [...(data.turtles || []), ...(data.ledgerRecords || []).map(r => r.turtleSnapshot).filter(Boolean)]) if (t.sourceBreedingId === record.id && t.id) linked.add(t.id);
  const events = Array.isArray(record.hatchEvents) ? record.hatchEvents : [];
  for (const event of events) for (const id of event.turtleIds || []) if (id) linked.add(id);
  // Historical links create archives for previously counted hatchlings, not new births.
  const total = Math.max(Number(record.hatchCount) || 0, linked.size, events.filter(e => !e.historicalLink).reduce((sum, e) => sum + (Number(e.count) || 0), 0));
  return { linked, events, total, unlinked: Math.max(0, total - linked.size) };
}
function rate(n, d) { return d > 0 && n >= 0 && n <= d ? Math.round(n / d * 1000) / 10 : null; }
function rates(eggs, fertile, hatch) {
  const valid = [eggs, fertile, hatch].every(n => Number.isSafeInteger(n) && n >= 0) && fertile <= eggs && hatch <= fertile;
  return { hatchRate: valid ? rate(hatch, fertile) : null, fertileRate: fertile <= eggs ? rate(fertile, eggs) : null,
    totalRate: hatch <= eggs ? rate(hatch, eggs) : null, needsReview: !valid || fertile === 0 };
}
function publicRecord(r, data) {
  const p = progress(r, data), eggs = Number(r.eggCount || 0), fertile = Number(r.fertileCount || 0);
  const mother = (data.turtles || []).find(t => t.id === r.motherId);
  return { id: r.id, date: r.date || '', motherId: r.motherId || 'manual', motherName: r.motherName || '未记录种母', fatherId: r.fatherId || '',
    speciesCode: r.speciesCode || mother?.speciesCode || '', speciesName: r.speciesName || mother?.speciesName || '未记录品种',
    poolId: r.poolId || '', poolName: r.poolName || '', eggCount: eggs, fertileCount: fertile, hatchCount: p.total,
    photo: r.photo || '', note: r.note || '', incubationClosed: r.incubationClosed === true, unlinked: p.unlinked,
    ...rates(eggs, fertile, p.total), hatchEvents: p.events.map(e => ({ id: e.id, batchId: e.batchId || '', date: e.date, count: e.count, speciesCode: e.speciesCode || '', historicalLink: Boolean(e.historicalLink) })) };
}
function stats(rows) {
  const totals = rows.reduce((s, r) => ({ eggs: s.eggs + r.eggCount, fertile: s.fertile + r.fertileCount, hatch: s.hatch + r.hatchCount }), { eggs: 0, fertile: 0, hatch: 0 });
  const invalid = rows.some(r => r.hatchCount > r.fertileCount || r.fertileCount > r.eggCount || ![r.eggCount, r.fertileCount, r.hatchCount].every(n => Number.isSafeInteger(n) && n >= 0));
  return { ...totals, ...rates(totals.eggs, totals.fertile, totals.hatch), hatchRate: invalid ? null : rates(totals.eggs, totals.fertile, totals.hatch).hatchRate,
    needsReview: invalid || totals.fertile === 0, nests: rows.length, ongoing: rows.filter(r => !r.incubationClosed).length };
}
let catalog;
function speciesOptions(data) {
  if (!catalog) {
    // Trusted bundled source only, never evaluate client input.
    const source = fs.readFileSync(path.join(__dirname, '../species-data.js'), 'utf8');
    catalog = Function('window', '"use strict";\n' + source + '\nreturn window.TURTLE_SPECIES;')({});
  }
  const options = new Map();
  for (const t of data.turtles || []) if (t.speciesCode && t.speciesName) options.set(t.speciesCode, { code: t.speciesCode, name: t.speciesName });
  for (const s of [...(data.customSpecies || []), ...catalog]) if (s.code && s.name) options.set(s.code, { code: s.code, name: s.name });
  return [...options.values()];
}
function edit(data, body) {
  const records = data.breedingRecords || (data.breedingRecords = []);
  const r = body.id ? records.find(r => r.id === body.id) : null;
  if (body.id && !r) fail('繁殖记录不存在');
  if (!r && records.length >= 10000) fail('繁殖记录已达上限');
  const layDate = date(body.date), eggs = count(body.eggCount, '产蛋数'), fertile = count(body.fertileCount, '受精数');
  if (fertile > eggs) fail('受精数不能大于产蛋数');
  const p = r ? progress(r, data) : { total: 0, events: [], linked: new Set() };
  if (eggs < p.total || fertile < p.total) fail('产蛋数和受精数不能少于已累计出壳数');
  const dates = !r ? [] : [...p.events.map(e => e.date), ...(data.turtles || []).filter(t => t.sourceBreedingId === r?.id).map(t => t.acquiredDate), ...(data.ledgerRecords || []).map(row => row.turtleSnapshot).filter(t => t && t.sourceBreedingId === r?.id).map(t => t.acquiredDate)].filter(Boolean);
  if (dates.some(d => layDate > d)) fail('产蛋日期不能晚于已记录的出壳日期');
  const motherId = text(body.motherId) || 'manual', mother = (data.turtles || []).find(t => t.id === motherId);
  if (motherId !== 'manual' && !mother && motherId !== r?.motherId) fail('请选择有效种母或手动填写');
  const motherName = mother ? text(mother.code || mother.name || mother.speciesName) : motherId === r?.motherId && motherId !== 'manual' ? r.motherName : text(body.motherName);
  if (!motherName) fail('请填写种母名称');
  const poolId = text(body.poolId), pool = (data.turtlePools || []).find(p => p.id === poolId);
  if (poolId && !pool && poolId !== r?.poolId) fail('养殖池已不存在，请重新选择');
  if (body.photo !== undefined && (typeof body.photo !== 'string' || body.photo.length > 600000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.photo))) fail('请上传 400KB 以内的 PNG、JPEG 或 WebP 繁殖照片');
  const updated = { ...(r || { id: crypto.randomUUID(), hatchCount: 0, hatchArchiveIds: [], hatchEvents: [], createdAt: new Date().toISOString(), editHistory: [] }),
    date: layDate, motherId, motherName, poolId, poolName: pool?.name || (poolId ? r?.poolName || '' : ''), eggCount: eggs, fertileCount: fertile,
    note: text(body.note, 500), incubationClosed: body.incubationClosed === true, updatedAt: new Date().toISOString() };
  if (mother?.speciesCode) { updated.speciesCode = mother.speciesCode; updated.speciesName = mother.speciesName || ''; }
  else if (body.speciesCode !== undefined) {
    const species = speciesOptions(data).find(s => s.code === body.speciesCode);
    if (body.speciesCode && !species) fail('请选择有效品种');
    updated.speciesCode = species?.code || ''; updated.speciesName = species?.name || '';
  }
  if (body.photo !== undefined) updated.photo = body.photo;
  else if (body.removePhoto === true) updated.photo = '';
  // Existing photo/history is preserved; team audit records this edit without adding recovery snapshots.
  if (r) records[records.indexOf(r)] = updated; else records.unshift(updated);
  return updated;
}
function hatch(data, body) {
  const r = (data.breedingRecords || []).find(r => r.id === body.id);
  if (!r) fail('繁殖记录不存在');
  const p = progress(r, data), eventId = text(body.eventId, 80), historical = body.linkHistorical === true;
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(eventId)) fail('本次出壳标识无效，请重新打开表单');
  if (p.events.some(e => e.id === eventId)) return { record: r, added: 0, repeated: true };
  if (r.incubationClosed && !historical) fail('本窝孵化已结束，请先在繁殖记录中重新开启');
  const n = count(body.count, '本次出壳数', 1000); if (!n) fail('本次出壳数至少为 1');
  const hatchDate = date(body.hatchDate); if (r.date && hatchDate < r.date) fail('出壳日期不能早于产蛋日期');
  if (historical && n > p.unlinked) fail('超出尚未关联档案的历史出壳数量');
  const total = historical ? p.total : p.total + n;
  if (total > Number(r.eggCount || 0)) fail('累计出壳数不能超过产蛋数');
  if (!historical && total > Number(r.fertileCount || 0)) fail('累计出壳数超过受精数，请先核对并更新受精数');
  const species = speciesOptions(data).find(s => s.code === body.speciesCode); if (!species) fail('请选择有效幼龟品种');
  const now = new Date().toISOString(), batchId = `hatch:${r.id}:${eventId}`;
  const codes = new Set([...(data.turtles || []).map(t => t.code), ...(data.ledgerRecords || []).map(row => row.turtleSnapshot?.code)].filter(Boolean));
  const added = []; let serial = 1;
  for (let i = 0; i < n; i++) {
    let code; do { code = `${species.code}-孵化${serial++}`; } while (codes.has(code)); codes.add(code);
    const t = { id: crypto.randomUUID(), code, speciesCode: species.code, speciesName: species.name, source: '孵化', sourceBreedingId: r.id, hatchEventId: eventId,
      acquiredDate: hatchDate, batchId, batchName: `${species.name} · ${hatchDate}孵化批次`, stage: 'hatchling', gender: '未知', status: '正常饲养', health: '健康',
      poolId: r.poolId || '', weight: 0, carapaceLength: 0, price: 0, photo: '', note: `来自 ${r.motherName} 的繁殖记录（${r.date}）`, createdAt: now, measureHistory: [] };
    p.linked.add(t.id); added.push(t);
  }
  r.hatchCount = total; r.hatchArchiveIds = [...p.linked]; r.updatedAt = now;
  r.hatchEvents = [...p.events, { id: eventId, batchId, date: hatchDate, count: n, ...(historical ? { historicalLink: true } : {}), speciesCode: species.code, turtleIds: added.map(t => t.id), createdAt: now }];
  data.turtles = [...added, ...(data.turtles || [])]; data.keptSpecies = [...new Set([...(data.keptSpecies || []), species.code])];
  return { record: r, added: n, historical };
}
module.exports = { progress, publicRecord, stats, speciesOptions, edit, hatch };
