(function (root) {
  const isActive = turtle => !['已死亡', '已转让'].includes(turtle.status) && !turtle.lossRecordId;
  const normalizeHatchBatches = turtles => turtles.map(turtle => {
    if (!turtle.sourceBreedingId) return turtle;
    const nestBatch = `hatch:${turtle.sourceBreedingId}`;
    // Old clients did not store confirmation IDs. Preserve known dates and
    // species; never combine different days or infer unknown same-day events.
    const legacyBatch = `${nestBatch}:legacy:${turtle.acquiredDate || 'undated'}:${turtle.speciesCode || 'unknown'}`;
    const batchId = !turtle.batchId || turtle.batchId === nestBatch
      ? (turtle.hatchEventId ? `${nestBatch}:${turtle.hatchEventId}` : legacyBatch) : turtle.batchId;
    return { ...turtle, batchId, stage: turtle.stage || 'hatchling' };
  });
  function normalizeLegacyPurchaseCosts(data) {
    const turtles = data.turtles || [];
    const records = data.ledgerRecords || [];
    const byId = new Map(records.map(record => record.turtleSnapshot).filter(Boolean).map(turtle => [turtle.id, turtle]));
    turtles.forEach(turtle => byId.set(turtle.id, turtle));
    const corrected = new Map();
    const migrated = new Set();
    for (const purchase of records) {
      if (purchase.type !== 'purchase' || !purchase.batchPurchase || !purchase.batchId || purchase.batchCostVersion) continue;
      const ids = purchase.turtleIds || [];
      if (ids.length < 2 || new Set(ids).size !== ids.length) continue;
      const cents = Math.round(Number(purchase.amount) * 100);
      if (!Number.isSafeInteger(cents) || cents < 0) continue;
      const oldUnit = Number((Number(purchase.amount) / ids.length).toFixed(2));
      if (Math.round(oldUnit * 100) * ids.length === cents) continue;
      // Only the verified old uniform rounding pattern is eligible. Missing
      // members or user-edited prices must not be silently redistributed.
      if (!ids.every(id => {
        const turtle = byId.get(id);
        return turtle && turtle.batchId === purchase.batchId && Number(turtle.price) === oldUnit
          && Number(turtle.batchTotalPrice) === Number(purchase.amount) && !turtle.batchCostVersion;
      })) continue;
      const amounts = splitCents(purchase.amount, ids.length);
      ids.forEach((id, index) => corrected.set(id, amounts[index]));
      migrated.add(purchase.id);
    }
    if (!corrected.size) return data;
    const correct = turtle => turtle && corrected.has(turtle.id)
      ? { ...turtle, legacyBatchUnitPrice: turtle.price, price: corrected.get(turtle.id), batchCostVersion: 1 } : turtle;
    return { ...data, turtles: turtles.map(correct), ledgerRecords: records.map(record => ({ ...record,
      ...(migrated.has(record.id) ? { batchCostVersion: 1 } : {}),
      ...(record.turtleSnapshot ? { turtleSnapshot: correct(record.turtleSnapshot) } : {})
    })) };
  }
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
  const poolCountNeedsReview = pool => Number(pool.count || 0) > 0 && pool.countMode !== 'additional';
  function poolCount(pool, turtles) {
    // Older unmarked counts may already include these archives. Report known
    // linked inventory separately until the user verifies the actual total.
    const additional = poolCountNeedsReview(pool) ? 0 : Math.max(0, Number(pool.count) || 0);
    return additional + turtles.filter(turtle => turtle.poolId === pool.id && isActive(turtle)).length;
  }
  function splitCents(amount, count) {
    const cents = Math.round(Number(amount) * 100);
    return Array.from({ length: count }, (_, index) => (Math.floor(cents / count) + (index < cents % count ? 1 : 0)) / 100);
  }
  function groupLedgerRecords(records) {
    const groups = new Map();
    const rows = [];
    for (const record of records) {
      if (!record.batchMovementId || !['sold', 'loss'].includes(record.type)) {
        rows.push(record);
        continue;
      }
      // Only combine members of the same recorded operation, never separate
      // operations that happen to share a batch or date.
      const key = JSON.stringify([record.batchId || record.turtleSnapshot?.batchId || '', record.type, record.batchMovementId]);
      let row = groups.get(key);
      if (!row) {
        row = { ...record, movementRecords: [], amount: 0 };
        groups.set(key, row);
        rows.push(row);
      }
      row.movementRecords.push(record);
      row.amount = (Math.round(row.amount * 100) + Math.round(Number(record.amount || 0) * 100)) / 100;
    }
    return rows;
  }
  function codeAllocator(prefix, turtles, records = []) {
    const used = new Set([...turtles.map(turtle => turtle.code), ...records.map(record => record.turtleSnapshot?.code)].filter(Boolean));
    let serial = 1;
    return () => {
      let code;
      do { code = `${prefix}-${serial++}`; } while (used.has(code));
      used.add(code);
      return code;
    };
  }
  const api = { isActive, normalizeHatchBatches, normalizeLegacyPurchaseCosts, members, group, summary, poolCount, poolCountNeedsReview, splitCents, groupLedgerRecords, codeAllocator };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurtleBatches = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
