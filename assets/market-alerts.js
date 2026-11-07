(() => {
  'use strict';
  const CONSENT = 'market-alerts-20261107';
  const E = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let ctx, owner = '', generation = 0, mutation = 0, loading = false, saving = false, error = '', value = null, results = null, resultLimit = 30, query = '', dirty = false, lastRoute = '';
  function session() { const auth = ctx.auth(); return `${auth.phone || ''}:${auth.token || ''}`; }
  const current = (key, gen) => key === session() && gen === generation;
  const visible = () => ['marketAlerts', 'marketAlertResults'].includes(ctx.state().page);
  function sync(context) {
    ctx = context;
    if (owner !== session()) { owner = session(); generation++; mutation++; loading = saving = dirty = false; error = query = ''; value = results = null; lastRoute = ''; }
    const state = ctx.state(), route = state.page === 'marketAlertResults' ? `${state.page}:${state.marketAlertReceiptId || ''}` : state.page;
    if (lastRoute !== route) {
      lastRoute = route; generation++; loading = false; error = '';
      if (state.page === 'marketAlertResults') { results = null; resultLimit = 30; }
      if (state.page === 'marketAlerts' && !dirty && !saving) value = null;
    }
  }
  function redraw() { if (visible()) ctx.render(); }
  function openReceipt(context, receiptId) {
    sync(context); generation++; loading = false; error = ''; results = null; resultLimit = 30;
    ctx.navigate({ page: 'marketAlertResults', marketAlertReceiptId: receiptId });
  }
  function allowedSpecies() { return ctx.catalog.filter(item => ctx.allowed(item)); }
  function settingsMarkup() {
    if (!value) return `<section class="fresh-card market-alert-status" role="${error ? 'alert' : 'status'}"><p>${E(error || '正在读取上新提醒设置…')}</p>${error ? '<button type="button" data-market-alert-retry>重新读取</button>' : ''}</section>`;
    const chosen = new Set(value.settings.speciesCodes);
    const catalog = allowedSpecies(), suggested = new Set(value.suggestedSpeciesCodes);
    const list = catalog.filter(item => chosen.has(item.code) || !query || `${item.name} ${item.code}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => Number(chosen.has(b.code)) - Number(chosen.has(a.code)) || Number(suggested.has(b.code)) - Number(suggested.has(a.code)) || a.name.localeCompare(b.name, 'zh-CN'));
    return `<form class="fresh-card market-alert-form" data-market-alert-form>
      <label class="market-alert-enable"><input type="checkbox" name="enabled" ${value.settings.enabled ? 'checked' : ''}><span><strong>开启品种上新推荐通知</strong><small>我同意按所选品种接收龟集市商品推广通知，可随时在此关闭。</small></span></label>
      <p>根据在养档案推荐品种，你可以自行选择。保存开启后只提醒新发布的相关在售商品，不补发历史商品。</p>
      <div class="market-alert-tools"><span>已选择 <b data-market-alert-count>${chosen.size}</b>/30 个品种</span><button type="button" data-market-alert-kept>选择在养品种</button></div>
      <label class="market-alert-search">查找品种<input name="search" type="search" value="${E(query)}" maxlength="60" placeholder="输入品种名称或代码" autocomplete="off"></label>
      <div class="market-alert-species" data-market-alert-species>${speciesMarkup(list, chosen, suggested)}</div>
      <div class="market-alert-example"><strong>推送示例</strong><b>你关注的果核蛋龟有新上架</b><span>新增3条商品，精品果核蛋龟母龟出售</span><small>实际显示关注品种、本次符合条件的新增数量和其中最新一条商品标题。</small></div>
      <p class="market-alert-muted">推荐通知每日合计最多1条，含每日新帖推荐；北京时间9:00—21:00发送。同品种上新约10分钟后合并检查，编辑或刷新曝光不重复触发。私信、回复和养护提醒单独处理。</p>
      ${value.settings.enabled && !value.hasPushDevice ? '<p class="market-alert-muted">当前账号尚无可接收通知的设备。保存后可按系统提示授权；也可到手机系统设置中开启本软件通知。</p>' : ''}
      <p class="market-alert-error" data-market-alert-error role="alert">${E(error)}</p>
      <div class="market-alert-actions"><button class="primary" type="submit" ${saving ? 'disabled' : ''}>${saving ? '正在保存…' : '保存设置'}</button><button type="button" data-market-alert-retry ${saving || loading ? 'disabled' : ''}>重新读取</button></div>
    </form>`;
  }
  function speciesMarkup(list, chosen, suggested) {
    return list.map(item => `<label><input type="checkbox" name="species" value="${E(item.code)}" ${chosen.has(item.code) ? 'checked' : ''}><span>${E(item.name)}${suggested.has(item.code) ? '<small>在养</small>' : ''}</span></label>`).join('') || '<p>没有匹配品种</p>';
  }
  function render(context) {
    sync(context);
    const state = ctx.state(), auth = ctx.auth();
    if (!state.loggedInPhone || !auth.token) return `${ctx.topbar('品种上新提醒', true)}<main class="content market-alert-page"><section class="fresh-card"><p>登录后可选择关注品种、开启上新推荐通知。</p><button type="button" data-page="account">去登录</button></section></main>`;
    if (state.page === 'marketAlerts') return `${ctx.topbar('品种上新提醒', true)}<main class="content market-alert-page"><section class="market-alert-heading"><h2>关注品种，有新上架再提醒</h2><p>选择你感兴趣的品种，收到提醒后可直接查看本次上新商品。</p></section>${settingsMarkup()}</main>`;
    return `${ctx.topbar('本次上新商品', true)}<main class="content market-page market-alert-page"><section class="fresh-card"><h2>${results ? E(results.speciesName) + '上新' : '本次提醒商品'}</h2><p>${results ? results.listings.length ? `当前可查看 ${results.listings.length} 条商品；下架或不可见的商品不再展示。` : '本次提醒的商品已下架或暂时不可见。' : E(error || '正在读取本次提醒的商品…')}</p>${error ? '<button type="button" data-market-alert-retry>重试加载</button>' : ''}</section><section class="market-grid">${results?.listings.slice(0, resultLimit).map(ctx.card).join('') || ''}</section>${results && results.listings.length > resultLimit ? `<button type="button" class="secondary market-alert-return" data-market-alert-more>继续查看（还有${results.listings.length - resultLimit}条）</button>` : ''}<button type="button" class="secondary market-alert-return" data-page="market">去龟集市看看</button></main>`;
  }
  function validate(result, mode) {
    const valid = result?.ok === true && (mode === 'preference' ? result.settings && typeof result.settings.enabled === 'boolean' && Array.isArray(result.settings.speciesCodes)
      && Number.isSafeInteger(result.settings.revision) && Array.isArray(result.suggestedSpeciesCodes) && result.consentVersion === CONSENT : Array.isArray(result.listings) && result.listings.every(item => item && typeof item.id === 'string') && typeof result.speciesName === 'string');
    if (!valid) throw Error('提醒服务返回的信息不完整，请重新读取');
    return result;
  }
  async function load() {
    if (loading || !ctx.auth().token) return;
    const key = session(), gen = generation, page = ctx.state().page, receiptId = ctx.state().marketAlertReceiptId;
    loading = true; error = ''; redraw();
    const mode = page === 'marketAlertResults' ? 'open' : 'preference';
    try {
      const result = validate(await ctx.api('/api/market/alerts/' + mode, ctx.auth(mode === 'open' ? { receiptId } : {})), mode);
      if (!current(key, gen) || ctx.state().page !== page || (mode === 'open' && ctx.state().marketAlertReceiptId !== receiptId)) return;
      if (mode === 'open') { results = result; ctx.merge(result.listings); } else { value = result; dirty = false; }
    } catch (e) { if (current(key, gen)) error = e.message === '方法不支持' ? '上新提醒服务暂未开放，请稍后重试' : e.message; }
    finally { if (current(key, gen)) { loading = false; redraw(); } }
  }
  async function save() {
    if (saving || loading || !value) return;
    const key = session(), id = ++mutation, snapshot = JSON.parse(JSON.stringify(value.settings));
    saving = true; error = ''; redraw();
    try {
      const result = validate(await ctx.api('/api/market/alerts/preference', ctx.auth({ ...snapshot, confirmed: snapshot.enabled, consentVersion: CONSENT })), 'preference');
      if (key !== session() || id !== mutation) return;
      value = result; dirty = false;
      ctx.toast(result.settings.enabled ? '品种上新提醒已保存' : '品种上新提醒已关闭');
      if (result.settings.enabled && ctx.state().page === 'marketAlerts') void ctx.requestNotifications();
    } catch (e) { if (key === session() && id === mutation) {
      if (ctx.state().page === 'marketAlerts') error = e.message || '保存未确认成功，请保留选择重试';
      else ctx.toast('上新提醒设置未确认成功，请返回设置检查');
    } }
    finally { if (key === session() && id === mutation) { saving = false; redraw(); } }
  }
  function bind(context) {
    sync(context);
    const root = document.getElementById('app'); if (!root) return;
    if (!visible()) return;
    root.querySelector('[data-market-alert-more]')?.addEventListener('click', () => { resultLimit += 30; redraw(); });
    root.querySelectorAll('[data-market-alert-retry]').forEach(button => { button.onclick = () => {
      if (dirty && !window.confirm('重新读取会替换未保存的选择，是否继续？')) return;
      generation++; loading = false; void load();
    }; });
    const form = root.querySelector('[data-market-alert-form]');
    if (form) {
      form.querySelector('[name="enabled"]').onchange = event => { value.settings.enabled = event.target.checked; dirty = true; };
      form.querySelector('[name="search"]').oninput = event => {
        query = event.target.value;
        const chosen = new Set(value.settings.speciesCodes), suggested = new Set(value.suggestedSpeciesCodes);
        const list = allowedSpecies().filter(item => chosen.has(item.code) || !query || `${item.name} ${item.code}`.toLowerCase().includes(query.toLowerCase()));
        form.querySelector('[data-market-alert-species]').innerHTML = speciesMarkup(list, chosen, suggested);
      };
      form.querySelector('[data-market-alert-species]').onchange = event => {
        if (event.target.name !== 'species') return;
        const chosen = new Set(value.settings.speciesCodes);
        if (event.target.checked && chosen.size >= 30 && !chosen.has(event.target.value)) { event.target.checked = false; return ctx.toast('最多关注30个品种'); }
        if (event.target.checked) chosen.add(event.target.value); else chosen.delete(event.target.value);
        value.settings.speciesCodes = [...chosen]; dirty = true;
        form.querySelector('[data-market-alert-count]').textContent = chosen.size;
      };
      form.querySelector('[data-market-alert-kept]').onclick = () => {
        value.settings.speciesCodes = [...new Set([...value.settings.speciesCodes, ...value.suggestedSpeciesCodes])].slice(0, 30); dirty = true; redraw();
      };
      form.onsubmit = event => { event.preventDefault(); if (value.settings.enabled && !value.settings.speciesCodes.length) return ctx.toast('请先选择至少一个关注品种'); void save(); };
      if (saving || loading) form.querySelectorAll('input,button').forEach(control => { control.disabled = true; });
    }
    if (!loading && !error && ctx.auth().token && (ctx.state().page === 'marketAlerts' && !value || ctx.state().page === 'marketAlertResults' && !results)) void load();
  }
  window.TurtleMarketAlerts = { render, bind, openReceipt };
})();
