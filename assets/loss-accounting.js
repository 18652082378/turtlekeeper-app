(function (root) {
  const cents = value => Math.max(0, Math.round((Number(value) || 0) * 100));
  const ids = record => [...new Set((record.turtleIds?.length ? record.turtleIds : [record.turtleId]).filter(Boolean))];
  const purchaseFor = (turtle, records) => records.find(record => record.type === 'purchase' && ids(record).includes(turtle.id));
  function purchaseCost(turtle, records) {
    const purchase = purchaseFor(turtle, records);
    if (!purchase) return cents(turtle.price) / 100;
    const members = ids(purchase);
    if (members.length <= 1) return cents(purchase.amount) / 100;
    const unit = turtle.price === '' || turtle.price == null ? Math.floor(cents(purchase.amount) / members.length) : cents(turtle.price);
    return Math.min(unit, cents(purchase.amount)) / 100;
  }
  function remainingPurchase(record, members, amount, turtles) {
    const representative = turtles.find(turtle => turtle.id === members[0]);
    return { ...record, amount, turtleId: members[0], turtleIds: members,
      title: `${representative?.speciesName || record.turtleSnapshot?.speciesName || '乌龟'}批量购入 ${members.length} 只`,
      originalPurchaseTitle: record.originalPurchaseTitle || record.title,
      turtleSnapshot: representative ? { ...representative, batchCount: members.length } : { ...record.turtleSnapshot, id: members[0], batchCount: members.length }
    };
  }
  function transferLoss(data, loss, turtle) {
    if (loss.lossCostTransferred) return data;
    const purchase = purchaseFor(turtle, data.ledgerRecords);
    const amount = purchaseCost(turtle, data.ledgerRecords);
    const records = data.ledgerRecords.flatMap(record => {
      if (record !== purchase) return [record];
      const members = ids(record).filter(id => id !== turtle.id);
      return members.length ? [remainingPurchase(record, members, (cents(record.amount) - cents(amount)) / 100, data.turtles)] : [];
    });
    const updatedLoss = { ...loss, amount, photo: turtle.photo || loss.turtleSnapshot?.photo || loss.photo || "", turtleId: turtle.id, turtleSnapshot: loss.turtleSnapshot || { ...turtle },
      lossCostTransferred: true, originalLossAmount: loss.amount,
      transferredPurchase: purchase ? { ...purchase } : null, transferredPurchaseAmount: purchase ? amount : 0 };
    const lostTurtle = { ...turtle, status: '已死亡', lossRecordId: loss.id, lossDate: loss.recordDate || '', pinned: false };
    return { ...data,
      turtles: data.turtles.some(item => item.id === turtle.id) ? data.turtles.map(item => item.id === turtle.id ? lostTurtle : item) : [...data.turtles, lostTurtle],
      ledgerRecords: records.map(record => record === loss ? updatedLoss : record),
      memos: (data.memos || []).map(memo => memo.turtleId === turtle.id ? { ...memo, reminderEnabled: false, lossRecordId: loss.id, lossPreviousReminderEnabled: memo.reminderEnabled } : memo)
    };
  }
  function reconcile(data) {
    let next = { ...data, turtles: Array.isArray(data.turtles) ? data.turtles : [], ledgerRecords: Array.isArray(data.ledgerRecords) ? data.ledgerRecords : [], memos: Array.isArray(data.memos) ? data.memos : [] };
    // The marker makes this safe to run on load/sync repeatedly. Historical
    // snapshots retain the original amount and purchase record for review/undo.
    for (const original of [...next.ledgerRecords].reverse()) {
      if (original.type !== 'loss' || original.lossCostTransferred) continue;
      const loss = next.ledgerRecords.find(record => record === original);
      if (!loss) continue;
      const id = loss.turtleId || loss.turtleSnapshot?.id;
      if (!id) continue;
      const turtle = next.turtles.find(item => item.id === id) || (loss.turtleSnapshot?.id === id ? loss.turtleSnapshot : null)
        || next.ledgerRecords.find(record => record.type === 'purchase' && record.turtleSnapshot?.id === id)?.turtleSnapshot;
      if (!turtle) continue;
      const prior = next.ledgerRecords.find(record => record !== loss && record.type === 'loss' && record.lossCostTransferred && !record.duplicateLossOf && record.turtleId === id);
      if (prior) {
        next = { ...next, ledgerRecords: next.ledgerRecords.map(record => record === loss ? { ...record, amount: 0, originalLossAmount: record.amount, lossCostTransferred: true, duplicateLossOf: prior.id } : record) };
      } else next = transferLoss(next, loss, turtle);
    }
    return next;
  }
  function undoLoss(data, loss) {
    let records = data.ledgerRecords.filter(record => record.id !== loss.id && record.duplicateLossOf !== loss.id);
    if (loss.duplicateLossOf) return { ...data, ledgerRecords: records };
    const purchase = loss.transferredPurchase;
    if (purchase) {
      const current = records.find(record => record.id === purchase.id && record.type === 'purchase');
      const amount = (cents(current?.amount) + cents(loss.transferredPurchaseAmount)) / 100;
      const members = [...new Set([...(current ? ids(current) : []), loss.turtleId])];
      const restored = purchase.batchPurchase || ids(purchase).length > 1
        ? remainingPurchase(current || purchase, members, amount, data.turtles)
        : { ...purchase, amount };
      records = current ? records.map(record => record === current ? restored : record) : [restored, ...records];
    }
    return { ...data, ledgerRecords: records,
      turtles: data.turtles.map(turtle => {
        if (turtle.id !== loss.turtleId || turtle.lossRecordId !== loss.id) return turtle;
        const { lossRecordId, lossDate, ...rest } = turtle;
        return { ...rest, status: loss.turtleSnapshot?.status || '正常饲养', pinned: Boolean(loss.turtleSnapshot?.pinned) };
      }),
      memos: (data.memos || []).map(memo => {
        if (memo.lossRecordId !== loss.id) return memo;
        const { lossRecordId, lossPreviousReminderEnabled, ...rest } = memo;
        return { ...rest, reminderEnabled: lossPreviousReminderEnabled };
      })
    };
  }
  const api = { purchaseCost, transferLoss, reconcile, undoLoss };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurtleLossAccounting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
