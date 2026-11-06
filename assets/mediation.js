/* Private application records live on the server, never in the shared feed cache. */
(() => {
  'use strict';
  const TERMS = 'mediation-20261106';
  const labels = { pending: '待受理', accepted: '已受理', processing: '服务跟进中', completed: '服务已完成', closed: '已关闭', withdrawn: '已撤回' };
  const next = { pending: ['accepted', 'closed'], accepted: ['processing', 'closed'], processing: ['completed', 'closed'], completed: [], closed: [], withdrawn: [] };
  const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = cents => (Number(cents || 0) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const uuid = () => globalThis.crypto?.randomUUID?.() || `mediation_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  function validApplication(item) {
    return item && typeof item.id === 'string' && typeof item.code === 'string' && item.product && typeof item.product.title === 'string'
      && typeof item.contact === 'string' && Number.isSafeInteger(item.amountCents) && item.amountCents > 0
      && Number.isSafeInteger(item.feeCents) && item.feeCents >= 680 && Number.isSafeInteger(item.revision) && item.revision > 0
      && Object.hasOwn(labels, item.status) && Array.isArray(item.history) && item.history.length > 0
      && item.history.every(event => event && typeof event.label === 'string' && typeof event.note === 'string' && Number.isFinite(Date.parse(event.at)));
  }
  function validate(result, kind) {
    const valid = result?.ok === true && (kind === 'list' ? Array.isArray(result.applications) && result.applications.every(validApplication)
      && Number.isSafeInteger(result.total) && result.total >= 0 && typeof result.hasMore === 'boolean' : validApplication(result.application));
    if (!valid) throw Error('申请服务返回的信息不完整，请重试或联系客服');
    return result;
  }
  let ctx, session = '', list = null, detail = null, loading = '', error = '', busy = false, generation = 0, draft = null;
  let filter = '', keyword = '', offset = 0, selected = '', adminDraft = null, lastPage = '', mutationId = 0;
  function key() { const s = ctx.state(); return `${s.loggedInPhone || ''}|${ctx.auth().token || ''}|${Boolean(s.isCommunityAdmin)}`; }
  function sync(context) {
    ctx = context;
    if (session !== key()) {
      session = key(); generation++; mutationId++; list = detail = draft = adminDraft = null; loading = error = ''; busy = false; filter = keyword = ''; offset = 0; selected = ''; lastPage = '';
    }
  }
  const isCurrent = (owner, gen) => owner === key() && gen === generation;
  const active = () => ['mediation', 'mediationApply', 'mediationDetail'].includes(ctx.state().page);
  const redraw = () => { if (active()) ctx.render(); };
  function go(patch) { error = ''; ctx.navigate(patch); }
  function canUse() { return Boolean(ctx.state().loggedInPhone && ctx.auth().token); }
  function newApplication(listing) {
    if (busy) return ctx.toast('正在保存申请，请稍候');
    if (!ctx.requireLogin()) return;
    draft = { listingId: listing?.id || '', title: listing?.title || listing?.speciesName || '', speciesName: listing?.speciesName || '', amount: listing?.price > 0 ? String(listing.price) : '', role: 'buyer', contact: '', note: '', agreed: false, requestId: uuid() };
    go({ page: 'mediationApply' });
  }
  function open(id) {
    detail = null; adminDraft = null; selected = id; loading = ''; generation++;
    go({ page: 'mediationDetail', selectedMediationApplicationId: id });
  }
  function scope() { return ctx.state().mediationScope === 'all' && ctx.state().isCommunityAdmin ? 'all' : 'mine'; }
  const description = `<p>提供代收买款、买方验收后按约向卖方放款的人工中介服务。提交申请后由管理员联系核实，双方确认交易与验收约定后再办理。</p><p>中介费按交易总价的 <b>0.68%</b> 计算，每笔最低 <b>6.80元</b>。费用由谁承担、取消或未成交时的费用处理，须在付款前共同确认。</p>`;
  function entry() {
    return `<section class="mediation-entry"><div><strong>中介服务</strong><small>代收买款 · 验收后按约放款</small></div><div><button type="button" data-mediation-start>申请中介</button><button type="button" data-mediation-records>我的申请</button></div></section>`;
  }
  function notice() {
    if (error) return `<div class="mediation-notice" role="alert"><p>${E(error)}</p><button type="button" data-mediation-retry>重试加载</button></div>`;
    if (loading) return `<p class="mediation-muted" role="status">正在读取申请记录…</p>`;
    return '';
  }
  function badge(item) { return `<span class="mediation-status is-${E(item.status)}">${E(labels[item.status] || item.status)}</span>`; }
  function listPage() {
    const all = scope() === 'all';
    return `${ctx.topbar(all ? '全部中介申请' : '我的中介申请', true)}<main class="content mediation-page">
      <section class="fresh-card mediation-intro"><h2>${all ? '申请管理' : '申请与进度'}</h2><p>${all ? '查看全部用户的申请，处理状态和说明会同步给申请人。' : '查看自己提交的申请、联系信息和处理进度。'}</p><button class="primary" type="button" data-mediation-start>双方已谈好，申请中介</button></section>
      ${ctx.state().isCommunityAdmin ? `<nav class="mediation-tabs" aria-label="申请范围"><button type="button" data-mediation-scope="mine" aria-pressed="${!all}">我的申请</button><button type="button" data-mediation-scope="all" aria-pressed="${all}">全部申请</button></nav>` : ''}
      <form class="mediation-filters" data-mediation-filter><label>状态<select name="status"><option value="">全部状态</option>${Object.entries(labels).map(([value, name]) => `<option value="${value}" ${filter === value ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label>搜索<input name="keyword" maxlength="80" value="${E(keyword)}" placeholder="申请号、商品${all ? '或申请人' : ''}"></label><button type="submit">查询</button></form>
      ${notice()}<div class="mediation-list">${list ? list.applications.map(item => `<button type="button" class="fresh-card mediation-record" data-mediation-open="${E(item.id)}"><header><strong>${E(item.product.title)}</strong>${badge(item)}</header><span class="mediation-code">${E(item.code)}</span><p>${E(item.product.speciesName)} · ${item.role === 'seller' ? '卖方申请' : '买方申请'}${all ? ` · ${E(item.applicantName)}` : ''}</p><div><span>申请金额 ¥${money(item.amountCents)}</span><span>预计服务费 ¥${money(item.feeCents)}</span></div><small>${E(date(item.createdAt))} 提交　查看进度 ›</small></button>`).join('') || (!loading && !error ? `<section class="fresh-card mediation-empty"><strong>暂无${filter || keyword ? '匹配的' : ''}申请记录</strong><p>${all ? '用户主动提交的申请将显示在这里。' : '申请中介服务后，可在这里查看进度。'}</p><button type="button" ${filter || keyword ? 'data-mediation-reset' : 'data-mediation-start'}>${filter || keyword ? '清除筛选' : '申请中介服务'}</button></section>` : '') : ''}</div>
      ${list ? `<nav class="mediation-pagination" aria-label="申请分页"><button type="button" data-mediation-prev ${offset === 0 || loading ? 'disabled' : ''}>上一页</button><span>共 ${list.total} 条 · 第 ${Math.floor(offset / 20) + 1} 页</span><button type="button" data-mediation-next ${!list.hasMore || loading ? 'disabled' : ''}>下一页</button></nav>` : ''}
    </main>`;
  }
  function applyPage() {
    if (!draft) draft = { listingId: '', title: '', speciesName: '', amount: '', role: 'buyer', contact: '', note: '', agreed: false, requestId: uuid() };
    const d = draft;
    return `${ctx.topbar('申请中介服务', true)}<main class="content mediation-page"><section class="fresh-card mediation-intro"><h2>先确认约定，再办理交易</h2>${description}<button type="button" data-mediation-terms>阅读完整交易条款</button></section>
      <form class="fresh-card mediation-form" data-mediation-apply>
      <label>交易商品<input name="title" required maxlength="120" value="${E(d.title)}" placeholder="例如：果核蛋龟一只" ${d.listingId ? 'readonly' : ''}></label>
      <label>品种<input name="speciesName" required maxlength="60" value="${E(d.speciesName)}" placeholder="填写交易品种" ${d.listingId ? 'readonly' : ''}></label>
      <label>我的身份<select name="role"><option value="buyer" ${d.role === 'buyer' ? 'selected' : ''}>买方</option><option value="seller" ${d.role === 'seller' ? 'selected' : ''}>卖方</option></select></label>
      <label>双方拟定交易总价（元）<input name="amount" inputmode="decimal" required pattern="(?:0|[1-9][0-9]{0,6})(?:[.][0-9]{1,2})?" value="${E(d.amount)}" placeholder="可按协商金额填写" aria-describedby="mediationFee"></label>
      <div class="mediation-fee" id="mediationFee" aria-live="polite">${feeText(d.amount)}</div>
      <label>联系微信或电话<input name="contact" required maxlength="80" value="${E(d.contact)}" autocomplete="off" placeholder="供管理员与我确认本次申请"></label>
      <label>补充说明（选填）<textarea name="note" maxlength="1000" rows="4" placeholder="可填写数量、尺寸、对方联系方式及待确认事项">${E(d.note)}</textarea></label>
      <label class="mediation-consent"><input type="checkbox" name="agreed" required ${d.agreed ? 'checked' : ''}><span>我已阅读申请说明与完整交易条款，同意将本次申请及联系信息提供给管理员处理。提交申请后，由双方与中介另行确认费用承担、验收及放款条件。</span></label>
      <p class="mediation-muted">申请提交不代表双方已确认交易或已经付款。请在管理员联系核实后，按双方确认的约定办理。</p>
      <p class="mediation-form-error" role="alert" data-mediation-form-error>${E(error)}</p><button class="primary" type="submit" ${busy ? 'disabled' : ''}>${busy ? '正在提交…' : '提交申请'}</button>
      </form></main>`;
  }
  function feeText(value) {
    if (!/^(0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(String(value)) || Number(value) <= 0) return '中介费 0.68%，每笔最低6.80元';
    const cents = Math.round(Number(value) * 100), fee = Math.max(680, Math.floor((cents * 68 + 5000) / 10000));
    return `预计中介费 <strong>¥${money(fee)}</strong> <small>0.68%，每笔最低6.80元；实际按最终确认的交易总价计算</small>`;
  }
  function detailPage() {
    const item = detail?.application;
    if (!item || item.id !== ctx.state().selectedMediationApplicationId) return `${ctx.topbar('申请详情', true)}<main class="content mediation-page">${notice()}</main>`;
    const admin = Boolean(detail.isAdmin && ctx.state().isCommunityAdmin);
    const statuses = [item.status, ...(next[item.status] || [])];
    if (!adminDraft || adminDraft.id !== item.id) adminDraft = { id: item.id, status: item.status, reply: item.reply || '' };
    return `${ctx.topbar('申请详情', true)}<main class="content mediation-page">
      <section class="fresh-card mediation-summary"><header><h2>${E(item.product.title)}</h2>${badge(item)}</header><p class="mediation-code">${E(item.code)}</p><dl><div><dt>品种</dt><dd>${E(item.product.speciesName)}</dd></div><div><dt>申请身份</dt><dd>${item.role === 'seller' ? '卖方' : '买方'}</dd></div><div><dt>申请金额</dt><dd>¥${money(item.amountCents)}</dd></div><div><dt>预计服务费</dt><dd>¥${money(item.feeCents)}</dd></div><div><dt>联系信息</dt><dd>${E(item.contact)}</dd></div>${admin ? `<div><dt>申请人</dt><dd>${E(item.applicantName)} · ${E(item.applicantPhone || '')}</dd></div>` : ''}${item.product.inquiryCode ? `<div><dt>商品咨询码</dt><dd>${E(item.product.inquiryCode)}</dd></div>` : ''}<div><dt>提交时间</dt><dd>${E(date(item.createdAt))}</dd></div></dl>${item.note ? `<h3>补充说明</h3><p class="mediation-prewrap">${E(item.note)}</p>` : ''}<p class="mediation-muted">服务费0.68%，最低6.80元。此处金额为申请时填写，最终金额与费用承担方需共同确认。</p></section>
      <section class="fresh-card mediation-progress"><h3>处理进度</h3><ol>${item.history.map(event => `<li><strong>${E(event.label)}</strong><time>${E(date(event.at))}</time><p>${E(event.note)}</p></li>`).join('')}</ol></section>
      <section class="fresh-card mediation-contact"><h3>联系中介</h3><p>微信 ${E(ctx.wechat)}。申请号和商品信息会保留在此页，复制微信号后也可回来查看。</p><div class="mediation-buttons"><button type="button" data-mediation-copy>复制申请信息</button><button type="button" data-mediation-wechat>复制微信号</button></div><button type="button" data-mediation-terms>查看完整交易条款</button></section>
      ${admin ? `<form class="fresh-card mediation-form" data-mediation-admin><h3>管理员处理</h3><label>进度<select name="status">${statuses.map(status => `<option value="${status}" ${adminDraft.status === status ? 'selected' : ''}>${labels[status]}</option>`).join('')}</select></label><label>给申请人的说明<textarea name="reply" required maxlength="1000" rows="4" placeholder="用户可见，请填写联系结果或处理说明">${E(adminDraft.reply)}</textarea></label><p class="mediation-muted">保存仅更新服务进度，资金收取、退款和放款需另行核实办理。</p><p role="alert" class="mediation-form-error" data-mediation-form-error>${E(error)}</p><button class="primary" type="submit" ${busy ? 'disabled' : ''}>${busy ? '正在保存…' : '保存处理进度'}</button></form>` : `<p role="alert" class="mediation-form-error">${E(error)}</p>`}
      ${!admin && item.status === 'pending' ? `<section class="mediation-withdraw"><button type="button" data-mediation-withdraw ${busy ? 'disabled' : ''}>撤回申请</button><small>仅撤回尚未受理的申请；已受理后请联系客服协商。</small></section>` : ''}
      <button class="mediation-refresh" type="button" data-mediation-refresh ${loading ? 'disabled' : ''}>${loading ? '正在刷新…' : '刷新进度'}</button>
    </main>`;
  }
  function render(context) {
    sync(context);
    if (list && list.scopeKey !== scope()) list = null;
    if (!canUse()) return `${ctx.topbar('中介申请', true)}<main class="content mediation-page"><section class="fresh-card mediation-empty"><strong>请先登录账号</strong><p>登录后查看自己的申请记录。</p><button type="button" data-page="account">去登录</button></section></main>`;
    return ctx.state().page === 'mediationApply' ? applyPage() : ctx.state().page === 'mediationDetail' ? detailPage() : listPage();
  }
  async function load() {
    if (loading || !canUse()) return;
    const page = ctx.state().page, id = ctx.state().selectedMediationApplicationId;
    if (!['mediation', 'mediationDetail'].includes(page)) return;
    const owner = key(), gen = generation, all = scope();
    loading = page; error = ''; redraw();
    try {
      const kind = page === 'mediationDetail' ? 'detail' : 'list';
      const result = validate(await ctx.api(`/api/mediation/${kind}`, ctx.auth(page === 'mediationDetail' ? { id } : { scope: all, status: filter, keyword, offset, limit: 20 })), kind);
      if (!isCurrent(owner, gen)) return;
      if (page === 'mediationDetail') { detail = result; adminDraft = null; }
      else list = { ...result, scopeKey: all };
    } catch (e) { if (isCurrent(owner, gen)) error = e.message === '方法不支持' ? '中介申请服务暂未开放，请稍后重试或联系客服。' : e.message || '申请记录读取失败，请重试'; }
    finally { if (isCurrent(owner, gen)) { loading = ''; if (ctx.state().page === page && (page !== 'mediationDetail' || id === ctx.state().selectedMediationApplicationId)) redraw(); } }
  }
  function capture(form) {
    const data = new FormData(form);
    for (const name of ['title', 'speciesName', 'amount', 'role', 'contact', 'note']) draft[name] = String(data.get(name) || '');
    draft.agreed = data.get('agreed') === 'on';
  }
  async function mutate(action, payload) {
    if (busy) return;
    const owner = key(), gen = generation, page = ctx.state().page, mutation = ++mutationId;
    busy = true; error = '';
    const form = document.querySelector(`[data-mediation-${action === 'create' ? 'apply' : 'admin'}]`);
    form?.querySelectorAll('input,select,textarea,button').forEach(el => el.disabled = true);
    document.querySelector('[data-mediation-withdraw]')?.setAttribute('disabled', '');
    try {
      const result = validate(await ctx.api(`/api/mediation/${action}`, ctx.auth(payload)), 'detail');
      if (!isCurrent(owner, gen)) return;
      list = null;
      const stillVisible = ctx.state().page === page && (action === 'create' || ctx.state().selectedMediationApplicationId === payload.id);
      if (stillVisible) { detail = { ...result, isAdmin: Boolean(ctx.state().isCommunityAdmin) }; adminDraft = null; }
      if (action === 'create') {
        if (draft?.requestId === payload.requestId) draft = null;
        if (stillVisible) { selected = result.application.id; busy = false; go({ page: 'mediationDetail', selectedMediationApplicationId: result.application.id }); }
        ctx.toast('申请已保存，可在“我的中介申请”查看进度');
      } else ctx.toast(action === 'withdraw' ? '申请已撤回' : '处理结果已保存，申请人可查看');
    } catch (e) {
      if (isCurrent(owner, gen) && ctx.state().page === page && (action === 'create' || ctx.state().selectedMediationApplicationId === payload.id)) { error = e.message || '操作未确认成功，请保留内容重试'; if (action === 'create' && draft) draft.requestId = payload.requestId; }
    } finally { if (owner === key() && mutation === mutationId) { busy = false; if (active()) redraw(); } }
  }
  function bind(context) {
    sync(context);
    const root = document.getElementById('app');
    if (!root) return;
    if (lastPage !== ctx.state().page) {
      if (ctx.state().page === 'mediation') { list = null; error = ''; }
      lastPage = ctx.state().page;
    }
    const on = (selector, fn) => root.querySelectorAll(selector).forEach(button => button.addEventListener('click', fn));
    on('[data-mediation-start]', () => newApplication());
    on('[data-mediation-records]', () => { list = null; offset = 0; go({ page: 'mediation', mediationScope: 'mine' }); });
    on('[data-mediation-open]', event => open(event.currentTarget.dataset.mediationOpen));
    on('[data-mediation-terms]', () => window.openTradeGuide?.('terms'));
    on('[data-mediation-scope]', event => { list = null; offset = 0; error = ''; loading = ''; generation++; go({ mediationScope: event.currentTarget.dataset.mediationScope }); });
    on('[data-mediation-prev]', () => { offset = Math.max(0, offset - 20); list = null; void load(); });
    on('[data-mediation-next]', () => { offset += 20; list = null; void load(); });
    on('[data-mediation-reset]', () => { filter = keyword = ''; offset = 0; list = null; void load(); });
    on('[data-mediation-retry], [data-mediation-refresh]', () => {
      if (adminDraft?.dirty && !window.confirm('刷新会替换未保存的处理说明，是否继续？')) return;
      error = ''; void load();
    });
    on('[data-mediation-copy]', () => { const item = detail.application; void ctx.copy(`您好，我申请中介服务。\n申请号：${item.code}\n商品：${item.product.title}\n品种：${item.product.speciesName}\n交易金额：¥${money(item.amountCents)}\n预计服务费：¥${money(item.feeCents)}`, '申请信息已复制'); });
    on('[data-mediation-wechat]', () => { void ctx.copy(ctx.wechat, '微信号已复制，申请信息仍保留在详情中'); });
    on('[data-mediation-withdraw]', () => { if (window.confirm('撤回这份尚未受理的申请？')) void mutate('withdraw', { id: detail.application.id, revision: detail.application.revision }); });
    const form = root.querySelector('[data-mediation-apply]');
    if (form) {
      // Keep the same intent ID after an uncertain acknowledgment, even if the
      // applicant edits fields. A server-side conflict then prevents a second
      // application being created for an already committed intent.
      form.addEventListener('input', () => { capture(form); const fee = root.querySelector('#mediationFee'); if (fee) fee.innerHTML = feeText(draft.amount); });
      form.addEventListener('change', () => capture(form));
      form.addEventListener('submit', event => { event.preventDefault(); if (busy) return; capture(form); if (!form.reportValidity()) return; void mutate('create', { ...draft, agreed: draft.agreed, termsVersion: TERMS }); });
      if (busy) form.querySelectorAll('input,select,textarea,button').forEach(el => el.disabled = true);
    }
    const adminForm = root.querySelector('[data-mediation-admin]');
    if (adminForm) {
      const remember = () => { const data = new FormData(adminForm); adminDraft = { id: detail.application.id, status: String(data.get('status')), reply: String(data.get('reply') || ''), dirty: true }; };
      adminForm.addEventListener('input', remember); adminForm.addEventListener('change', remember);
      adminForm.addEventListener('submit', event => { event.preventDefault(); if (busy || loading || !adminForm.reportValidity()) return; remember(); void mutate('update', { id: detail.application.id, revision: detail.application.revision, status: adminDraft.status, reply: adminDraft.reply }); });
      if (busy || loading) adminForm.querySelectorAll('input,select,textarea,button').forEach(el => el.disabled = true);
    }
    root.querySelector('[data-mediation-filter]')?.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.currentTarget); filter = String(data.get('status') || ''); keyword = String(data.get('keyword') || '').trim(); offset = 0; list = null; loading = ''; generation++; void load(); });
    if (ctx.state().page === 'mediationDetail' && selected !== ctx.state().selectedMediationApplicationId) { selected = ctx.state().selectedMediationApplicationId; detail = null; adminDraft = null; error = loading = ''; generation++; }
    if (!loading && !error && ((ctx.state().page === 'mediation' && !list) || (ctx.state().page === 'mediationDetail' && !detail))) void load();
  }
  window.TurtleMediation = { render, bind, entry, start: (context, listing) => { sync(context); newApplication(listing); } };
})();
