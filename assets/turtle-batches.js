(function (root) {
  const isActive = turtle => !['已死亡', '已转让'].includes(turtle.status) && !turtle.lossRecordId;
  const members = (turtle, turtles) => turtle.batchId ? turtles.filter(item => item.batchId === turtle.batchId) : [turtle];
  function group(turtles) {
    const batches = new Map();
    const rows = [];
    for (const turtle of turtles) {
      if (!turtle.batchId) { rows.push(turtle); continue; }
      let row = batches.get(turtle.batchId);
      if (!row) {
        row = { ...turtle, batchMembers: [] };
        batches.set(turtle.batchId, row);
        rows.push(row);
      }
      row.batchMembers.push(turtle);
    }
    for (const row of batches.values()) {
      const active = row.batchMembers.find(isActive);
      if (active) Object.assign(row, active, { id: row.id, status: '正常饲养' });
      row.pinned = row.batchMembers.some(turtle => turtle.pinned);
    }
    return rows;
  }
  function summary(turtles) {
    const active = turtles.filter(isActive);
    const representative = active[0] || turtles[0];
    const pools = [...new Set(active.map(turtle => turtle.poolId || ''))];
    return { active, representative, count: active.length,
      male: active.filter(turtle => turtle.gender === '公').length,
      female: active.filter(turtle => turtle.gender === '母').length,
      unknown: active.filter(turtle => !['公', '母'].includes(turtle.gender)).length,
      lost: turtles.filter(turtle => turtle.status === '已死亡' || turtle.lossRecordId).length,
      pools,
      cost: active.reduce((sum, turtle) => sum + Math.round(Number(turtle.price || 0) * 100), 0) / 100
    };
  }
  function poolCount(pool, turtles) {
    return Math.max(0, Number(pool.count) || 0) + turtles.filter(turtle => turtle.poolId === pool.id && isActive(turtle)).length;
  }
  function splitCents(amount, count) {
    const cents = Math.round(Number(amount) * 100);
    return Array.from({ length: count }, (_, index) => (Math.floor(cents / count) + (index < cents % count ? 1 : 0)) / 100);
  }
  const api = { isActive, members, group, summary, poolCount, splitCents };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurtleBatches = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
