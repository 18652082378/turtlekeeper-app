(function (root) {
  const builtins = Object.freeze([{ id: 'feeding', title: '喂食' }, { id: 'water', title: '换水' }]);
  const text = (value, limit) => String(value ?? '').trim().slice(0, limit);
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function normalizeItems(items) {
    const ids = new Set(), titles = new Set(builtins.map(item => item.title));
    return (Array.isArray(items) ? items : []).flatMap(item => {
      const id = text(item?.id, 100), title = text(item?.title, 40);
      if (!id || !title || ids.has(id) || titles.has(title) || builtins.some(row => row.id === id)) return [];
      ids.add(id); titles.add(title);
      return [{ id, title, createdAt: text(item.createdAt, 40) }];
    });
  }
  function normalizeTurtleRefs(refs) {
    const ids = new Set();
    return (Array.isArray(refs) ? refs : []).flatMap(ref => {
      const id = text(ref?.id, 100);
      if (!id || ids.has(id)) return [];
      ids.add(id);
      return [{ id, code: text(ref.code, 100), speciesName: text(ref.speciesName, 100) }];
    });
  }
  function normalizeRecords(records) {
    const ids = new Set();
    return (Array.isArray(records) ? records : []).flatMap(record => {
      const id = text(record?.id, 100), title = text(record?.title, 40), date = text(record?.date, 10);
      if (!id || !title || !validDate(date) || ids.has(id)) return [];
      ids.add(id);
      // Titles and pool names are historical snapshots, independent of picker options.
      return [{ id, title, date, itemId: text(record.itemId, 100), poolId: text(record.poolId, 100),
        poolName: text(record.poolName, 100), note: text(record.note, 1000), turtleRefs: normalizeTurtleRefs(record.turtleRefs),
        sourceMemoId: text(record.sourceMemoId, 100),
        createdAt: text(record.createdAt, 40), updatedAt: text(record.updatedAt, 40) }];
    });
  }
  function normalizePlans(plans) {
    const ids = new Set();
    return (Array.isArray(plans) ? plans : []).flatMap(plan => {
      const id = text(plan?.id, 100), name = text(plan?.name, 40);
      if (!id || !name || ids.has(id)) return [];
      ids.add(id);
      return [{ id, name, poolId: text(plan.poolId, 100), poolName: text(plan.poolName, 100),
        turtleRefs: normalizeTurtleRefs(plan.turtleRefs), note: text(plan.note, 1000),
        createdAt: text(plan.createdAt, 40), updatedAt: text(plan.updatedAt, 40) }];
    });
  }
  function filterRecords(records, filter = {}) {
    const query = text(filter.query, 100).toLocaleLowerCase();
    return records.filter(record => {
      const refs = record.turtleRefs || [];
      return (!filter.item || (filter.item === 'other' ? !['feeding', 'water'].includes(record.itemId) : record.itemId === filter.item))
        && (!filter.from || record.date >= filter.from) && (!filter.to || record.date <= filter.to)
        && (!filter.pool || record.poolId === filter.pool)
        && (!filter.species || refs.some(ref => ref.speciesName === filter.species))
        && (!filter.turtle || refs.some(ref => ref.id === filter.turtle))
        && (!query || [record.title, record.note, record.poolName, ...refs.flatMap(ref => [ref.code, ref.speciesName])].join(' ').toLocaleLowerCase().includes(query));
    }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }
  function dueMemos(memos, today) {
    const weekday = String(new Date(`${today}T12:00:00`).getDay());
    return memos.filter(memo => {
      if (memo.reminderEnabled === false || memo.lastCompletedDate === today || (!memo.repeat && memo.completedAt)) return false;
      if (memo.dueDate && memo.dueDate > today) return false;
      if (memo.repeat && (memo.weekdays || []).length && !memo.weekdays.map(String).includes(weekday)) return false;
      return true;
    }).sort((a, b) => (a.dueDate || today).localeCompare(b.dueDate || today) || (a.remindTime || '23:59').localeCompare(b.remindTime || '23:59'));
  }
  function reconcileCompletion(memos, records, memoId) {
    if (!memoId) return memos;
    const latest = records.filter(record => record.sourceMemoId === memoId)
      .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
    return memos.map(memo => memo.id !== memoId ? memo : { ...memo,
      lastCompletedDate: latest?.date || '', completedAt: !memo.repeat && latest ? latest.createdAt || latest.updatedAt || latest.date : '' });
  }
  const api = { builtins, validDate, normalizeItems, normalizeRecords, normalizeTurtleRefs, normalizePlans, filterRecords, dueMemos, reconcileCompletion };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurtleCare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
