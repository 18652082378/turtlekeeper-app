(function (root) {
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const stable = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(stable)
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  const canonical = value => JSON.stringify(stable(value));
  const equal = (a, b) => canonical(a) === canonical(b);
  const recordFields = ['turtles', 'ledgerRecords', 'memos', 'breedingRecords', 'turtlePools', 'activityLogs', 'customSpecies', 'satisfactionReviews', 'feedbackItems'];
  const setFields = ['keptSpecies', 'marketFavoriteIds', 'marketHistoryIds'];
  const fieldNames = { turtles: '档案', ledgerRecords: '账本', memos: '护理', breedingRecords: '繁殖', turtlePools: '龟池', activityLogs: '操作记录', customSpecies: '品种', accountName: '昵称', accountAvatar: '头像', themeColor: '主题', professionalOutput: '报表设置', satisfactionRating: '评价' };
  const refs = record => [record?.turtleId, ...(record?.turtleIds || []), record?.motherId].filter(id => id && id !== 'manual').map(id => `turtles:${id}`);
  const countMoney = (records, type) => records.filter(r => r.type === type).reduce((sum, r) => sum + Math.round((Number(r.amount) || 0) * 100), 0) / 100;
  function merge(base, local, remote, choices = {}) {
    const parent = new Map(), nodes = new Map();
    const rootOf = key => { if (!parent.has(key)) parent.set(key, key); if (parent.get(key) !== key) parent.set(key, rootOf(parent.get(key))); return parent.get(key); };
    const connect = (a, b) => { const x = rootOf(a), y = rootOf(b); if (x !== y) parent.set(y, x); };
    const snapshots = [base, local, remote];
    snapshots.forEach((snapshot, side) => {
      if (!snapshot) return;
      const add = (key, field, id, value, kind) => {
        rootOf(key);
        if (!nodes.has(key)) nodes.set(key, { key, field, id, kind, values: [] });
        nodes.get(key).values[side] = value;
      };
      for (const [field, value] of Object.entries(snapshot.data || {})) {
        if (recordFields.includes(field) && Array.isArray(value)) {
          const seen = new Set();
          value.forEach((record, index) => {
            const id = record?.id || (field === 'customSpecies' ? record?.code : '') || `legacy-${index}`;
            if (seen.has(id)) throw new Error('记录编号重复，无法安全合并');
            seen.add(id);
            const key = `${field}:${id}`;
            add(key, field, id, record, 'record');
            // Logs describe past actions, so keeping them must not reconnect
            // unrelated live transactions or resurrect deleted archives.
            if (field === 'activityLogs') return;
            for (const ref of refs(record)) connect(key, ref);
            if (record.batchId) connect(key, `batch:${record.batchId}`);
            if (record.sourceBreedingId) connect(key, `breedingRecords:${record.sourceBreedingId}`);
            if (record.poolId) connect(key, `turtlePools:${record.poolId}`);
            if (field === 'turtles' && record.code) connect(key, `code:${record.code}`);
            if (field === 'breedingRecords') for (const id of record.hatchArchiveIds || []) connect(key, `turtles:${id}`);
            const turtle = record.turtleSnapshot;
            if (turtle?.id) connect(key, `turtles:${turtle.id}`);
            if (turtle?.batchId) connect(key, `batch:${turtle.batchId}`);
            if (record.transferredPurchase?.id) connect(key, `ledgerRecords:${record.transferredPurchase.id}`);
          });
        } else if (setFields.includes(field) && Array.isArray(value)) {
          value.forEach(item => add(`${field}:${JSON.stringify(item)}`, field, item, item, 'set'));
        } else add(`setting:${field}`, field, '', value, 'setting');
      }
      for (const field of ['accountName', 'accountAvatar']) add(`profile:${field}`, field, '', snapshot[field] || '', 'profile');
    });
    const groups = new Map();
    for (const node of nodes.values()) {
      const group = rootOf(node.key);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(node);
    }
    const result = { accountName: '', accountAvatar: '', data: {} }, conflicts = [];
    // Preserve source ordering within collections. Identity, never position
    // or amount, decides which record was added, edited or deleted.
    for (const snapshot of snapshots.filter(Boolean)) for (const [field, value] of Object.entries(snapshot.data || {})) if (Array.isArray(value)) result.data[field] = [];
    const choose = values => {
      const [before, here, there] = values;
      if (equal(here, there)) return { value: here };
      if (base && equal(here, before)) return { value: there };
      if (base && equal(there, before)) return { value: here };
      return { conflict: true, value: here };
    };
    const summary = (group, side) => {
      const of = field => group.filter(n => n.field === field && n.values[side] !== undefined).map(n => n.values[side]);
      const turtles = of('turtles'), ledger = of('ledgerRecords');
      return { archives: turtles.length, active: turtles.filter(t => !['已死亡', '已售出'].includes(t.status)).length,
        ledger: ledger.length, purchase: countMoney(ledger, 'purchase'), sold: countMoney(ledger, 'sold'), loss: countMoney(ledger, 'loss'),
        omitted: Math.max(0, group.filter(n => !equal(n.values[1], n.values[2])).length - 12),
        records: group.filter(n => !equal(n.values[1], n.values[2])).slice(0, 12).map(n => {
          const record = n.values[side];
          if (record === undefined) return `${fieldNames[n.field] || n.field}：此端没有这条记录`;
          if (n.kind === 'profile' || n.kind === 'setting') return `${fieldNames[n.field] || '设置'}：${n.field === 'accountAvatar' ? '头像已设置' : String(record).slice(0, 80)}`;
          const price = n.field === 'turtles' && record.price !== '' && record.price != null && Number.isFinite(Number(record.price))
            ? ` · 购入价 ${Number(record.price).toFixed(2)} 元` : '';
          return `${fieldNames[n.field] || '记录'}：${record.batchName || record.code || record.title || record.motherName || record.name || record.text || '已记录'}${price}${record.type ? ` · ${{ loss: '损耗', sold: '售出', purchase: '收购', other: '支出' }[record.type] || record.type} ${Number(record.amount || 0).toFixed(2)} 元` : ''}${record.status ? ` · ${record.status}` : ''}`;
        }) };
    };
    for (const group of groups.values()) {
      const decisions = group.map(node => !base && node.field === 'activityLogs' && (!node.values[1] || !node.values[2])
        ? { value: node.values[1] || node.values[2] } : choose(node.values));
      let conflict = decisions.some(d => d.conflict);
      const candidate = new Map(group.map((node, index) => [node.key, decisions[index].value]));
      // Cross-record changes must be checked together: deleting a pool while
      // the other device assigns a turtle to it is a real conflict.
      for (const node of group) {
        const record = candidate.get(node.key);
        if (!record || node.kind !== 'record') continue;
        for (const dependency of [record.poolId ? `turtlePools:${record.poolId}` : '', record.sourceBreedingId ? `breedingRecords:${record.sourceBreedingId}` : ''].filter(Boolean)) {
          if (nodes.has(dependency) && candidate.get(dependency) === undefined
            && !snapshots.slice(1).some((s, side) => equal(node.values[side + 1], record) && nodes.get(dependency).values[side + 1] === undefined)) conflict = true;
        }
      }
      const byCode = new Map();
      for (const node of group.filter(n => n.field === 'turtles' && candidate.get(n.key))) {
        const code = candidate.get(node.key).code;
        if (!code) continue;
        const earlier = byCode.get(code);
        if (earlier && ![1, 2].some(side => earlier.values[side]?.code === code && node.values[side]?.code === code)) conflict = true;
        byCode.set(code, node);
      }
      const key = group.map(n => n.key).sort()[0];
      const selectedSide = choices[key] === 'local' ? 1 : choices[key] === 'remote' ? 2 : 0;
      if (conflict) {
        const turtle = group.find(n => n.field === 'turtles')?.values.find(Boolean);
        const pool = group.find(n => n.field === 'turtlePools')?.values.find(Boolean);
        conflicts.push({ key, resolved: Boolean(selectedSide), label: (turtle?.batchName || turtle?.code || pool?.name || fieldNames[group[0].field] || '账号设置') + (turtle || pool ? '及关联记录' : ''),
          local: summary(group, 1), remote: summary(group, 2) });
      }
      group.forEach((node, index) => {
        const value = conflict && selectedSide ? node.values[selectedSide] : decisions[index].value;
        if (value === undefined) return;
        if (node.kind === 'profile') result[node.field] = copy(value);
        else if (node.kind === 'record' || node.kind === 'set') {
          const saved = copy(value);
          if (conflict && selectedSide && node.field === 'turtles') {
            // Choosing the current measurements must not erase the other
            // device's growth history or trip the server's history guard.
            const history = [], seen = new Map();
            for (const record of [value, ...node.values.filter(Boolean)]) {
              const occurrence = new Map();
              for (const item of record.measureHistory || []) {
                const key = item.id || canonical(item);
                const count = (occurrence.get(key) || 0) + 1; occurrence.set(key, count);
                if (count > (seen.get(key) || 0)) { history.push(copy(item)); seen.set(key, count); }
              }
            }
            if (history.length) saved.measureHistory = history;
          }
          result.data[node.field].push(saved);
        }
        else result.data[node.field] = copy(value);
      });
    }
    for (const field of recordFields) {
      if (!Array.isArray(result.data[field])) continue;
      const id = record => record.id || record.code;
      const old = new Set((base?.data[field] || []).map(id));
      const order = [...(local.data[field] || []).filter(r => !old.has(id(r))), ...(remote.data[field] || []).filter(r => !old.has(id(r))),
        ...(remote.data[field] || []), ...(local.data[field] || []), ...(base?.data[field] || [])];
      const ranks = new Map(); order.forEach(r => { if (!ranks.has(id(r))) ranks.set(id(r), ranks.size); });
      result.data[field].sort((a, b) => (ranks.get(id(a)) || 0) - (ranks.get(id(b)) || 0));
    }
    return { snapshot: result, conflicts, ready: conflicts.every(c => c.resolved), hasBase: Boolean(base) };
  }
  const api = { merge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurtleAccountMerge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
