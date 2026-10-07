(function () {
  'use strict';
  const defaults = () => ({ enabled: false, targetTemperature: 20, difference: 3, remindTime: '18:00', advanceDays: 1, location: null });
  let owner = '', model, context;
  const signature = s => JSON.stringify([s.enabled, s.targetTemperature, s.difference, s.remindTime, s.advanceDays, s.location?.id || '']);
  const ruleText = d => `每天${d.remindTime}检查${d.advanceDays === 0 ? '当天' : d.advanceDays + '天后'}的预报；预计最低气温≤${Math.round((d.targetTemperature - d.difference) * 10) / 10}℃时提醒。`;
  function ensure(ctx) {
    context = ctx;
    const id = `${ctx.phone}:${ctx.token}`;
    if (owner !== id) { owner = id; model = { settings: defaults(), draft: defaults(), notices: [], loaded: false, loading: false, busy: false, error: '', query: '', locations: [], consent: false, consentAttention: false }; }
    return model;
  }
  const isCurrent = (id, ctx) => owner === id && ctx.currentAuth().phone === ctx.phone && ctx.currentAuth().token === ctx.token;
  const repaint = ctx => { if (ctx.isVisible()) ctx.render(); };
  async function request(ctx, route, extra = {}) { return ctx.api(`/api/weather/${route}`, { phone: ctx.phone, token: ctx.token, ...extra }); }
  function accept(result) {
    model.settings = { ...defaults(), ...result.settings };
    model.draft = { ...model.settings };
    model.notices = result.notices || [];
    model.lastCheck = result.lastCheck;
    model.providerConfigured = result.providerConfigured;
    model.pushConfigured = result.pushConfigured;
    model.hasPushDevice = result.hasPushDevice;
    model.consent = model.settings.enabled;
    model.consentAttention = false;
    model.loaded = true;
  }
  async function load(ctx) {
    if (model.loading || !ctx.phone || !ctx.token) return;
    const id = owner; model.loading = true; model.error = ''; repaint(ctx);
    try { const result = await request(ctx, 'settings'); if (isCurrent(id, ctx)) accept(result); }
    catch (error) { if (isCurrent(id, ctx)) { model.error = error.message || '设置加载失败'; model.loaded = true; model.loadFailed = true; } }
    finally { if (isCurrent(id, ctx)) { model.loading = false; repaint(ctx); } }
  }
  function read(form) {
    const data = new FormData(form);
    model.draft = { ...model.draft, enabled: data.has('enabled'), targetTemperature: Number(data.get('targetTemperature')), difference: Number(data.get('difference')), remindTime: String(data.get('remindTime')), advanceDays: Number(data.get('advanceDays')) };
    model.consent = data.has('weatherConsent');
  }
  function updateConsentGuidance(form) {
    if (model.consent) model.consentAttention = false;
    const panel = form.querySelector('[data-weather-consent-panel]');
    panel.classList.toggle('needs-attention', model.consentAttention);
    form.elements.weatherConsent.setAttribute('aria-invalid', String(model.consentAttention));
    form.querySelector('#weatherConsentHint').hidden = model.consent;
  }
  function requireConsent() {
    if (model.consent) return true;
    model.consentAttention = true;
    const form = document.querySelector('#weatherForm');
    if (form) {
      updateConsentGuidance(form);
      form.querySelector('[data-weather-consent-panel]').scrollIntoView({ block: 'center', behavior: 'smooth' });
      form.elements.weatherConsent.focus({ preventScroll: true });
    }
    return false;
  }
  async function search(ctx, query) {
    if (model.busy || !query) return;
    if (!requireConsent()) return;
    const id = owner; model.busy = true; model.error = ''; repaint(ctx);
    try { const result = await request(ctx, 'locations', { query, weatherConsent: true }); if (isCurrent(id, ctx)) { model.locations = result.locations || []; if (!model.locations.length) model.error = '没有找到城市，请输入城市或区县名称'; } }
    catch (error) { if (isCurrent(id, ctx)) model.error = error.message || '城市查询失败'; }
    finally { if (isCurrent(id, ctx)) { model.busy = false; repaint(ctx); } }
  }
  async function save(ctx, form) {
    if (model.busy || !model.loaded || model.loadFailed) return;
    read(form);
    if (model.draft.enabled && !requireConsent()) return;
    if (model.draft.enabled && !model.draft.location) {
      const hint = form.querySelector('[data-weather-location-hint]');
      hint.textContent = '请搜索城市或使用当前位置，然后点击下方地点完成选择。';
      hint.setAttribute('role', 'alert');
      form.elements.cityQuery.scrollIntoView({ block: 'center', behavior: 'smooth' });
      form.elements.cityQuery.focus({ preventScroll: true });
      return;
    }
    const id = owner;
    model.busy = true; model.error = ''; repaint(ctx);
    try {
      const result = await request(ctx, 'save', { settings: { ...model.draft, location: undefined, locationId: model.draft.location?.id || '' }, weatherConsent: model.consent });
      if (!isCurrent(id, ctx)) return;
      accept(result);
      ctx.toast(result.settings.enabled ? '温度提醒已保存' : '温度提醒已关闭');
      if (result.settings.enabled) {
        await ctx.registerPush();
        if (isCurrent(id, ctx)) {
          const permission = await ctx.pushPermission();
          if (isCurrent(id, ctx) && permission === 'denied') ctx.toast('提醒已保存，请在系统设置中开启通知');
        }
      }
    } catch (error) { if (isCurrent(id, ctx)) model.error = error.message || '保存失败，请重试'; }
    finally { if (isCurrent(id, ctx)) { model.busy = false; repaint(ctx); } }
  }
  function page(ctx) {
    const m = ensure(ctx), d = m.draft, e = ctx.escape;
    const check = m.lastCheck;
    const checkText = { unavailable: '天气数据暂不可用，本次未作温度判断', normal: '本次检查未达到低温提醒条件', attempted: '已提交本次提醒', sent: '本次提醒已发送', failed: '本次系统推送未确认送达，可查看下方提醒记录' }[check?.status] || '';
    return `${ctx.topbar('日常养护', true)}<main class="content page-fresh weather-content">${ctx.tabs()}
      ${!ctx.phone ? '<div class="empty"><div>登录后即可设置温度提醒</div></div>' : `
      ${m.error ? `<p class="weather-feedback" role="alert">${e(m.error)}</p>` : ''}
      ${m.loading ? '<p class="muted" role="status">正在读取提醒设置…</p>' : ''}
      ${m.loadFailed ? '<button type="button" class="secondary weather-load-retry" data-weather-retry>重新读取设置</button>' : ''}
      ${m.loadFailed || !m.loaded ? '' : `
      <form id="weatherForm" class="fresh-card weather-form"><fieldset ${m.busy ? 'disabled' : ''}>
        <label class="weather-toggle"><span><strong>开启低温提醒</strong><small>达到条件才发送系统通知</small></span><input type="checkbox" name="enabled" ${d.enabled ? 'checked' : ''} ${!m.loaded ? 'disabled' : ''}></label>
        <section class="weather-location"><h3>养龟地点</h3><strong class="weather-selected-location">${e(d.location ? `${d.location.province} · ${d.location.name}` : '尚未选择')}</strong><small data-weather-location-hint>地点固定保存，不会随手机出行而改变。</small>
          <div class="weather-consent-panel ${m.consentAttention ? 'needs-attention' : ''}" data-weather-consent-panel>
            <label class="weather-consent"><input type="checkbox" name="weatherConsent" aria-describedby="weatherConsentHint" aria-invalid="${m.consentAttention}" ${m.consent ? 'checked' : ''}><span><strong>同意地点使用说明</strong><small>保存所选养龟地点，并向 Apple Weather 提供城市坐标查询预报；不发送手机号，不持续追踪位置。</small></span></label>
            <p id="weatherConsentHint" class="weather-consent-hint" aria-live="polite" ${m.consent ? 'hidden' : ''}>请先勾选上方说明，再搜索城市或使用当前位置。</p>
          </div>
          <div class="weather-search"><input class="field" type="search" name="cityQuery" aria-label="搜索养龟城市" placeholder="搜索城市或区县" value="${e(m.query)}" maxlength="40"><button type="button" class="secondary" data-weather-search ${m.busy ? 'disabled' : ''}>搜索</button></div>
          <button class="secondary weather-locate" type="button" data-weather-locate ${m.busy ? 'disabled' : ''}>使用当前位置</button>
          ${m.locations.length ? `<div class="weather-locations">${m.locations.map((l, i) => `<button type="button" data-weather-location="${i}"><strong>${e(l.name)}</strong><span>${e(l.province)} · ${e(l.city)}</span></button>`).join('')}</div>` : ''}
        </section>
        <section class="weather-settings"><h3>提醒条件</h3><div class="weather-fields"><label><span>预设温度（℃）</span><input class="field" name="targetTemperature" type="number" inputmode="decimal" min="-30" max="50" step="0.1" value="${e(d.targetTemperature)}" required></label>
          <label><span>提醒温差（℃）</span><input class="field" name="difference" type="number" inputmode="numeric" min="1" max="20" step="1" value="${e(d.difference)}" required></label>
          <label><span>每日提醒时间</span><input class="field" name="remindTime" type="time" value="${e(d.remindTime)}" required></label>
          <label><span>提前提醒天数</span><select class="select" name="advanceDays">${Array.from({ length: 8 }, (_, i) => `<option value="${i}" ${d.advanceDays === i ? 'selected' : ''}>${i === 0 ? '当天' : '提前' + i + '天'}</option>`).join('')}</select></label></div>
        <small>北京时间，默认18:00；最低气温低于预设温度达到所设温差时提醒。</small>
        <p class="weather-rule" data-weather-rule>${e(ruleText(d))}</p>
        </section>
        ${m.loaded && !m.providerConfigured ? '<p class="weather-feedback">天气服务尚未配置，暂不能开启提醒。</p>' : ''}
        ${m.loaded && (!m.pushConfigured || !m.hasPushDevice) ? '<p class="muted">系统提醒需要在手机中开启通知，并完成设备注册。</p>' : ''}
        <div class="weather-actions"><button type="submit" class="primary" ${m.busy || !m.loaded ? 'disabled' : ''}>${m.busy ? '处理中…' : '保存设置'}</button><button type="button" class="text-green" data-weather-retry>重新读取设置</button></div>
      </fieldset></form>`}
      <section class="fresh-card weather-history"><h3>最近提醒</h3>${checkText ? `<p>${e(checkText)}${check.checkedAt ? `<small>检查时间：${e(new Date(check.checkedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }))}</small>` : ''}</p>` : ''}
        ${m.notices.map(n => `<article><small>${e(new Date(n.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }))}</small><p>${e(n.body)}</p></article>`).join('') || '<p class="muted">达到低温条件后，提醒会显示在这里。</p>'}</section>
      <p class="weather-note">预报为室外气温，不代表龟池水温或室温。提前天数越多，预报可能变化，请留意实际环境温度。</p><p class="weather-note weather-attribution"><a href="https://weatherkit.apple.com/legal-attribution.html" target="_blank" rel="noopener noreferrer"><img src="assets/apple-weather-mark.png" width="120" alt="Apple Weather"><span>天气数据来源</span></a><small>地点数据：<a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a>。定位后请选择确认附近地点；未收录地点可选择附近城市。</small></p>`}
    </main>${ctx.nav()}`;
  }
  function bind(ctx) {
    ensure(ctx);
    if (!ctx.isVisible()) return;
    if (!model.loaded && !model.loading && ctx.phone) { void load(ctx); return; }
    const form = document.querySelector('#weatherForm');
    form?.addEventListener('input', () => {
      read(form); model.query = form.elements.cityQuery.value;
      updateConsentGuidance(form);
      const rule = form.querySelector('[data-weather-rule]');
      rule.textContent = ruleText(model.draft);
    });
    form?.addEventListener('submit', event => { event.preventDefault(); void save(ctx, form); });
    form?.elements.cityQuery.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void search(ctx, model.query); } });
    document.querySelector('[data-weather-search]')?.addEventListener('click', () => { read(form); void search(ctx, model.query); });
    document.querySelectorAll('[data-weather-location]').forEach(button => button.addEventListener('click', () => { read(form); model.draft.location = model.locations[Number(button.dataset.weatherLocation)]; model.locations = []; repaint(ctx); }));
    document.querySelector('[data-weather-retry]')?.addEventListener('click', () => {
      if (signature(model.settings) !== signature(model.draft) && !window.confirm('重新读取会放弃尚未保存的温度提醒设置，是否继续？')) return;
      model.loaded = false; model.loadFailed = false; void load(ctx);
    });
    document.querySelector('[data-weather-locate]')?.addEventListener('click', async () => {
      if (model.busy) return;
      read(form);
      if (!requireConsent()) return;
      const id = owner; model.busy = true; repaint(ctx);
      try { const position = await ctx.locate(); if (!isCurrent(id, ctx)) return; model.busy = false; await search(ctx, `${Number(position.coords.longitude).toFixed(2)},${Number(position.coords.latitude).toFixed(2)}`); }
      catch { if (isCurrent(id, ctx)) { model.busy = false; model.error = '定位未成功，可直接搜索并选择城市'; repaint(ctx); } }
    });
  }
  window.TurtleWeather = { page, bind, hasChanges: () => Boolean(model?.loaded && !model.loadFailed && context?.isVisible() && owner === `${context.currentAuth().phone}:${context.currentAuth().token}` && signature(model.settings) !== signature(model.draft)), discardDraft: () => { if (model) model.draft = { ...model.settings }; } };
}());
