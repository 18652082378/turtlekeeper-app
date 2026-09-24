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
  function normalizeRecords(records) {
    const ids = new Set();
    return (Array.isArray(records) ? records : []).flatMap(record => {
      const id = text(record?.id, 100), title = text(record?.title, 40), date = text(record?.date, 10);
      if (!id || !title || !validDate(date) || ids.has(id)) return [];
      ids.add(id);
      // Titles and pool names are historical snapshots, independent of picker options.
      return [{ id, title, date, itemId: text(record.itemId, 100), poolId: text(record.poolId, 100),
        poolName: text(record.poolName, 100), note: text(record.note, 1000),
        createdAt: text(record.createdAt, 40), updatedAt: text(record.updatedAt, 40) }];
    });
  }
  const api = { builtins, validDate, normalizeItems, normalizeRecords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurtleCare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
