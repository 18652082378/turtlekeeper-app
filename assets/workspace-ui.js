// Shared views for daily work. Business records remain in the account snapshot.
let careHistoryFilter = {};
let careHistoryLimit = 40;
const recordFormBaselines = new WeakMap();
let carriedRecordBaselines = new Map();
const recordFormSelector = '#careForm, #memoForm, #turtleForm, #turtleDetailForm, #ledgerForm, #turtleBatchMovementForm, #breedingForm, #breedingDetailForm, #turtlePoolForm';

function recordFormSignature(form) {
  return JSON.stringify({ fields: [...new FormData(form)].filter(([name, value]) => name !== 'hatchEventId' && typeof value === 'string'),
    photos: [...form.querySelectorAll('.photo-uploader img')].map(image => image.getAttribute('src')) });
}

function rememberRecordFormBaselines() {
  carriedRecordBaselines = new Map([...$app.querySelectorAll(recordFormSelector)]
    .filter(form => !form.__breedingDetailSaved && !form.__breedingSaved && !form.__ledgerSaved && !form.__poolSaved && !form.__turtleDetailSaved)
    .map(form => [form.__recordBaselineKey, recordFormBaselines.get(form)]));
}

function recordPageHasChanges() {
  return [...$app.querySelectorAll(recordFormSelector)].some(form =>
    !form.__breedingDetailSaved && !form.__breedingSaved && !form.__ledgerSaved && !form.__poolSaved && !form.__turtleDetailSaved &&
    recordFormBaselines.has(form) && recordFormBaselines.get(form) !== recordFormSignature(form));
}

function canLeaveRecordPage() {
  return !recordPageHasChanges() || confirm('本页有尚未保存的内容，确定返回上一页吗？');
}

function careHistoryTurtleRefs() {
  const refs = (state.careRecords || []).flatMap(record => record.turtleRefs || []);
  return TurtleCare.normalizeTurtleRefs(refs.filter(ref => !careHistoryFilter.species || ref.speciesName === careHistoryFilter.species));
}

function careFilterMarkup() {
  const records = state.careRecords || [];
  const refs = careHistoryTurtleRefs();
  const options = (values, selected) => values.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
  const pools = [...new Map(records.filter(record => record.poolId).map(record => [record.poolId, record.poolName || '原龟池'])).entries()];
  const species = [...new Set(records.flatMap(record => (record.turtleRefs || []).map(ref => ref.speciesName)).filter(Boolean))].sort().map(name => [name, name]);
  const active = Object.values(careHistoryFilter).some(Boolean);
  return `<details class="work-filters" ${active ? 'open' : ''}><summary>筛选养护记录${active ? ' · 已筛选' : ''}</summary>
    <form id="careFilterForm" class="work-fields">
      <label class="work-wide"><span>搜索</span><input class="field" name="query" type="search" placeholder="事项、乌龟编号或备注" value="${escapeHtml(careHistoryFilter.query || '')}"></label>
      <label><span>事项</span><select class="select" name="item">${options([['', '全部事项'], ['feeding', '喂食'], ['water', '换水'], ['other', '其他']], careHistoryFilter.item)}</select></label>
      <label><span>龟池</span><select class="select" name="pool">${options([['', '全部龟池'], ...pools], careHistoryFilter.pool)}</select></label>
      <label><span>开始日期</span><input class="field" type="date" name="from" value="${escapeHtml(careHistoryFilter.from || '')}"></label>
      <label><span>结束日期</span><input class="field" type="date" name="to" value="${escapeHtml(careHistoryFilter.to || '')}"></label>
      <label><span>关联品种</span><select class="select" name="species">${options([['', '全部品种'], ...species], careHistoryFilter.species)}</select></label>
      <label><span>关联乌龟</span><select class="select" name="turtle" data-archive-directory>${options([['', '全部乌龟'], ...refs.filter(ref => !careHistoryFilter.species || ref.speciesName === careHistoryFilter.species).map(ref => [ref.id, ref.code || '原乌龟'])], careHistoryFilter.turtle)}</select></label>
      <div class="work-actions work-wide"><button class="secondary" type="button" data-reset-care-filter>重置</button><button class="primary" type="submit">筛选</button></div>
    </form></details>`;
}

function carePlansMarkup() {
  const plans = state.carePlans || [];
  return `<details class="work-plans"><summary>常用喂食方案 <small>${plans.length} 个</small></summary>
    <p class="work-hint">填写喂食内容后可存为方案，使用时先确认再保存记录。</p>
    ${plans.map(plan => `<article class="work-plan"><div><strong>${escapeHtml(plan.name)}</strong><small>${plan.turtleRefs.length} 只龟 · ${escapeHtml(plan.poolName || '未关联龟池')}</small></div><button type="button" data-use-care-plan="${escapeHtml(plan.id)}">使用</button><button type="button" data-delete-care-plan="${escapeHtml(plan.id)}" aria-label="删除方案 ${escapeHtml(plan.name)}">删除</button></article>`).join('') || '<p class="work-hint">还没有方案，可在“记喂食”中创建。</p>'}</details>`;
}

function saveCarePlan() {
  if (!requireLogin()) return;
  const draft = readCareDraft();
  if (!draft || draft.itemId !== 'feeding') return;
  const name = String(draft.planName || '').trim();
  if (!name) return toast('先填写方案名称');
  if ((state.carePlans || []).some(plan => plan.name === name)) return toast('已有同名方案，请换一个名称');
  const active = new Map(state.turtles.filter(TurtleBatches.isActive).map(t => [t.id, t]));
  const refs = TurtleCare.normalizeTurtleRefs(draft.turtleRefs);
  if (refs.some(ref => !active.has(ref.id))) return toast('部分乌龟已不在养，请先重新选择');
  const pool = state.turtlePools.find(pool => pool.id === draft.poolId);
  if (draft.poolId && !pool) return toast('龟池已不存在，请重新选择');
  const now = new Date().toISOString();
  const plans = TurtleCare.normalizePlans([{ id: crypto.randomUUID(), name, poolId: pool?.id || '', poolName: pool?.name || '', turtleRefs: refs, note: draft.note, createdAt: now, updatedAt: now }, ...(state.carePlans || [])]);
  setState({ carePlans: plans, careDraft: { ...draft, planName: '' } });
  toast('方案已保存，本次喂食尚未记录');
}

function completeCareTask(id) {
  if (!requireLogin()) return;
  const today = formatDate(new Date());
  const memo = TurtleCare.dueMemos(state.memos || [], today).find(memo => memo.id === id);
  // Recheck live state so a second click on the previous DOM cannot duplicate it.
  if (!memo || memo.growthReminder) return;
  const now = new Date().toISOString();
  const title = String(memo.title || '养护提醒').trim().slice(0, 40) || '养护提醒';
  let items = TurtleCare.normalizeItems(state.careCustomItems);
  let item = [...TurtleCare.builtins, ...items].find(item => item.title === title);
  if (!item) {
    item = { id: crypto.randomUUID(), title, createdAt: now };
    items = [item, ...items];
  }
  const record = { id: crypto.randomUUID(), title, itemId: item.id, date: today,
    note: String(memo.content || '').trim().slice(0, 1000), sourceMemoId: memo.id,
    poolId: '', poolName: '', turtleRefs: [], createdAt: now, updatedAt: now };
  const careRecords = [record, ...(state.careRecords || [])];
  setState({ careRecords, careCustomItems: items,
    memos: TurtleCare.reconcileCompletion(state.memos, careRecords, memo.id),
    activityLogs: logActivity(`完成养护待办：${title} · ${today}`, '养护') });
  toast(localBackupFailed ? '本机保存失败，请前往同步页面重试保存' : '已完成，可在日常养护的养护历史中查看记录');
}

function homeTasksMarkup() {
  if (!state.loggedInPhone) return '';
  const tasks = TurtleCare.dueMemos(state.memos || [], formatDate(new Date()));
  if (!tasks.length) return '';
  const row = memo => `<article class="work-task"><div><strong>${escapeHtml(memo.title || '养护提醒')}</strong><small>${memo.dueDate && memo.dueDate < formatDate(new Date()) ? '已到期 · ' : ''}${escapeHtml(memo.remindTime || '今天待办')}${memo.growthReminder ? ' · 成长记录' : ''}</small></div><button type="button" data-start-task="${escapeHtml(memo.id)}">${memo.growthReminder ? '记录成长' : '已完成'}</button></article>`;
  return `<section class="fresh-card work-tasks"><div class="work-heading"><h3>今日待办</h3><span>${tasks.length} 项</span></div>${tasks.slice(0, 3).map(row).join('')}${tasks.length > 3 ? `<details><summary>查看其余 ${tasks.length - 3} 项</summary><div class="work-scroll">${tasks.slice(3).map(row).join('')}</div></details>` : ''}</section>`;
}

function archiveTimeline(turtle) {
  if (turtle.sharedView) return '';
  const members = turtle.batchId ? state.turtles.filter(t => t.batchId === turtle.batchId) : [turtle];
  const ids = new Set(members.map(t => t.id));
  const ledger = (state.ledgerRecords || []).filter(record => ids.has(record.turtleId) || (turtle.batchId && record.turtleSnapshot?.batchId === turtle.batchId));
  ledger.forEach(record => { if (record.turtleId) ids.add(record.turtleId); });
  const events = [];
  for (const record of state.careRecords || []) {
    const count = (record.turtleRefs || []).filter(ref => ids.has(ref.id)).length;
    if (count) events.push({ date: record.date, time: record.createdAt, title: record.title, copy: `${turtle.batchId ? `涉及本批次 ${count} 只 · ` : ''}${record.note || '已记录养护'}` });
  }
  for (const record of state.breedingRecords || []) {
    if (!ids.has(record.motherId) && !(turtle.batchId && record.batchId === turtle.batchId)) continue;
    events.push({ date: record.date, time: record.createdAt, title: '产蛋', copy: `${record.eggCount} 枚 · 受精 ${record.fertileCount || 0} 枚` });
    for (const hatch of record.hatchEvents || []) events.push({ date: hatch.date, time: hatch.createdAt, title: '孵化', copy: `本次 ${hatch.count} 只` });
  }
  for (const record of TurtleBatches.groupLedgerRecords(ledger)) events.push({ date: record.recordDate, time: record.createdAt, title: ledgerTypeText(record.type), copy: `${record.title || ''}${record.movementRecords?.length ? ` · ${record.movementRecords.length} 只` : ''} · ¥${money(record.amount)}` });
  for (const member of members) for (const history of member.measureHistory || []) events.push({ date: formatDate(history.updatedAt), time: history.updatedAt, title: '成长记录', copy: `${member.code || '乌龟'} · 体重 ${history.newSnapshot?.weight ?? history.newWeight ?? '未填写'} g · 背甲 ${history.newSnapshot?.carapaceLength ?? history.newLength ?? '未填写'} cm` });
  events.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.time || '').localeCompare(String(a.time || '')));
  const row = event => `<li><time>${escapeHtml(event.date || '未填写日期')}</time><div><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.copy)}</p></div></li>`;
  return `<section class="fresh-card work-timeline"><div class="work-heading"><h3>关联记录</h3><span>${events.length} 条</span></div><p class="work-hint">按时间汇总与${turtle.batchId ? '本批次' : '这只龟'}直接关联的养护、成长、繁殖和账本记录。</p>${events.length ? `<ol>${events.slice(0, 5).map(row).join('')}</ol>${events.length > 5 ? `<details><summary>查看其余 ${events.length - 5} 条</summary><ol class="work-scroll">${events.slice(5).map(row).join('')}</ol></details>` : ''}` : '<p class="work-hint">暂无直接关联记录。</p>'}</section>`;
}

function accountSaveStatus() {
  if (localBackupFailed) return '本机保存失败，请重试';
  if (recordPageHasChanges()) return '编辑中，尚未保存';
  if (cloudSyncIsPaused()) return '本机已保存，同步待处理';
  const pending = readPendingCloudData();
  if (cloudSyncInFlight) return '本机已保存，正在同步';
  if (pending?.phone === state.loggedInPhone) return '已保存到本机，待同步';
  if (!CONFIGURED_SMS_BACKEND || !currentCloudToken()) return '已保存到本机';
  if (!cloudHydrationComplete || !state.cloudAccountUpdatedAt) return '正在核对云端数据';
  return '已同步';
}

function updateAccountSaveStatus() {
  const status = accountSaveStatus();
  document.querySelectorAll('[data-account-save-status]').forEach(node => {
    node.textContent = status;
    node.hidden = status === '已同步';
  });
}

function bindWorkspaceUI() {
  const historyPicker = document.querySelector('#careFilterForm [name="turtle"]');
  if (historyPicker) {
    const live = new Map(state.turtles.map(t => [t.id, t]));
    historyPicker.__directorySource = { turtles: careHistoryTurtleRefs().map(ref => ({ ...live.get(ref.id), ...ref })), pools: state.turtlePools };
  }
  document.querySelectorAll(recordFormSelector).forEach(form => {
    const key = JSON.stringify([state.loggedInPhone, state.page, form.id, state.selectedTurtleId, state.selectedBreedingId, state.careDraft?.id, state.memoEditingId]);
    form.__recordBaselineKey = key;
    if (!recordFormBaselines.has(form)) recordFormBaselines.set(form, carriedRecordBaselines.get(key) ?? recordFormSignature(form));
    form.addEventListener('input', updateAccountSaveStatus);
    form.addEventListener('change', updateAccountSaveStatus);
  });
  carriedRecordBaselines.clear();
  if (state.loggedInPhone && ['home', 'list', 'add', 'turtleDetail', 'memos', 'ledger', 'ledgerDetail', 'breeding', 'breedingAdd', 'breedingDetail', 'pools', 'poolAdd', 'growth', 'mine'].includes(state.page)) {
    const main = $app.querySelector('main');
    if (main && !main.querySelector('[data-account-save-status]')) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'work-save-status'; button.dataset.accountSaveStatus = '';
      button.setAttribute('aria-label', '查看保存和同步状态');
      button.onclick = () => setState({ page: 'sync' });
      main.prepend(button);
    }
    updateAccountSaveStatus();
  }
  document.querySelector('#careFilterForm')?.addEventListener('submit', event => {
    event.preventDefault(); const filter = Object.fromEntries(new FormData(event.currentTarget));
    if (filter.from && filter.to && filter.from > filter.to) return toast('开始日期不能晚于结束日期');
    careHistoryFilter = filter; careHistoryLimit = 40;
    setState({ careDraft: readCareDraft() }, { skipCloud: true });
  });
  document.querySelector('#careFilterForm [name="species"]')?.addEventListener('change', event => {
    const form = event.target.form, filter = Object.fromEntries(new FormData(form));
    careHistoryFilter = { ...filter, turtle: '' };
    careHistoryLimit = 40; setState({ careDraft: readCareDraft() }, { skipCloud: true });
  });
  document.querySelector('[data-reset-care-filter]')?.addEventListener('click', () => { careHistoryFilter = {}; careHistoryLimit = 40; setState({ careDraft: readCareDraft() }, { skipCloud: true }); });
  document.querySelector('[data-more-care]')?.addEventListener('click', () => { careHistoryLimit += 40; setState({ careDraft: readCareDraft() }, { skipCloud: true }); });
  document.querySelector('[data-save-care-plan]')?.addEventListener('click', saveCarePlan);
  document.querySelectorAll('[data-use-care-plan]').forEach(button => button.addEventListener('click', () => {
    const plan = state.carePlans.find(plan => plan.id === button.dataset.useCarePlan);
    if (!plan) return;
    const active = new Map(state.turtles.filter(TurtleBatches.isActive).map(t => [t.id, t]));
    const refs = plan.turtleRefs.filter(ref => active.has(ref.id)).map(ref => { const t = active.get(ref.id); return { id: t.id, code: t.code, speciesName: archiveSpeciesName(t) }; });
    const poolExists = state.turtlePools.some(pool => pool.id === plan.poolId);
    setState({ careDraft: { date: formatDate(new Date()), itemId: 'feeding', turtleRefs: refs, poolId: poolExists ? plan.poolId : '', note: plan.note, planName: '', planNotice: `${plan.name} · 请确认本次内容${refs.length !== plan.turtleRefs.length ? `，已移除 ${plan.turtleRefs.length - refs.length} 只不在养的龟` : ''}${plan.poolId && !poolExists ? '，原龟池已不存在' : ''}` }, carePickerOpen: false });
  }));
  document.querySelectorAll('[data-delete-care-plan]').forEach(button => button.addEventListener('click', () => {
    if (!confirm('删除这个喂食方案？已有养护记录会保留。')) return;
    setState({ carePlans: state.carePlans.filter(plan => plan.id !== button.dataset.deleteCarePlan), careDraft: readCareDraft() });
  }));
  document.querySelectorAll('[data-start-task]').forEach(button => button.addEventListener('click', () => {
    const memo = state.memos.find(memo => memo.id === button.dataset.startTask);
    if (!memo) return;
    if (memo.growthReminder) {
      const turtle = state.turtles.find(t => t.id === memo.turtleId);
      if (!turtle) return toast('关联档案已不存在，请调整提醒');
      setState({ page: 'turtleDetail', selectedTurtleId: turtle.id, updatingTurtleId: turtle.id, turtleDetailDraftId: turtle.id, turtleDetailDraft: null, growthTaskMemoId: memo.id });
    } else {
      completeCareTask(memo.id);
    }
  }));
}
