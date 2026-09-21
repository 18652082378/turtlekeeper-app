(function () {
  'use strict';
  const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = n => Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const typeName = t => ({ sold: '售出', loss: '损耗', purchase: '收购', other: '其他支出' })[t] || t;
  const icons = { egg: '<path d="M20 14c0 5-3.6 8-8 8s-8-3-8-8S8 2 12 2s8 7 8 12Z"/><path d="m7 10 3 3 3-4 4 3"/>', sprout: '<path d="M12 21v-9M12 16C5 16 3 12 3 7c6 0 9 3 9 9ZM12 12c0-6 3-9 9-9 0 6-3 9-9 9Z"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>', users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>', chart: '<path d="M4 3v18h17M9 16v-4M14 16V8M19 16V4"/>', book: '<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M3 7h4M3 12h4M3 17h4M11 8h5M11 12h5"/>', check: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m7 12 3 3 7-7"/>', shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>', card: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M6 16h6M15 9h3M15 13h3"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', plus: '<path d="M12 5v14M5 12h14"/>' };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
  const button = (action, label, extra = '', cls = '') => `<button type="button" class="ts-btn ${cls}" data-ts="${action}" ${extra}>${label}</button>`;
  const empty = (title, sub) => `<div class="ts-empty">${icon('grid')}<h3>${title}</h3><p>${sub}</p></div>`;
  let host, session = '', teams = [], invitations = [], team = null, selected = '', tab = 'overview', error = '', loaded = false, loading = false, busy = false;
  let sessionGeneration = 0, refreshVersion = 0;
  let month = today().slice(0, 7), species = '', filter = '', actor = '', taskFilter = 'all', dialog = '', editId = '', brandingLogo = '', canCreate = false, hasOwn = false;
  let products = [], purchaseInfo = null, purchaseError = '', productLoaded = false, nativeListener = null;
  let formDraft = null, cardImage = '', cardFilename = '';
  let membership = null, syncAt = '', syncNotice = '', saveState = '';
  let linkTarget = {}, breedYear = '', breedSpecies = '', breedMother = '', breedCompare = 'mother';
  let hatchEventId = '', historicalHatch = false, breedingStatus = 'all';
  let ledgerRange = { mode: 'all' }, reportRange = { mode: 'month' };
  let ledgerMonth = '', turtleLimit = 120, ledgerKind = '', reportKind = '';
  let membershipPage = false, previewKind = '', previewClosed = false;
  let teamInfoOpen = true;
  let tabsScrollLeft = 0;
  const moduleTabs = [['overview', 'grid', '概览'], ['ledger', 'book', '账本'], ['reports', 'chart', '报表'], ['hatching', 'egg', '孵化'], ['care', 'check', '护理'], ['tasks', 'check', '任务'], ['members', 'users', '成员'], ['logs', 'clock', '记录'], ['approvals', 'shield', '审批'], ['settings', 'card', '设置']];
  const isPreview = () => !membershipPage && !team?.active && !canCreate;
  function native() {
    const c = window.Capacitor;
    return c?.isNativePlatform?.() && c.getPlatform?.() === 'ios' ? (c.Plugins?.TurtlePurchases || c.registerPlugin?.('TurtlePurchases')) : null;
  }
  function androidPay() {
    const c = window.Capacitor;
    return c?.isNativePlatform?.() && c.getPlatform?.() === 'android' ? (c.Plugins?.TurtleAlipay || c.registerPlugin?.('TurtleAlipay')) : null;
  }
  const sameBuyer = a => `${a.phone}:${a.token}` === session && `${a.phone}:${a.token}` === `${auth().phone}:${auth().token}`;
  async function syncAlipay(explicit = true) {
    if (!androidPay() || !auth().phone || !purchaseInfo?.configured) return;
    const a = auth();
    try {
      const r = await host.api('/api/alipay/team/purchases', { ...a, action: 'sync' });
      if (!sameBuyer(a)) return;
      if (explicit) host.toast(r.active ? '会员状态已同步' : '尚未查询到已完成付款，请稍后再试');
      await refresh();
    } catch (e) { if (sameBuyer(a) && explicit) host.toast(e.message); }
  }
  async function purchaseAlipay(plan) {
    if (busy) return;
    if (!auth().phone) return host.login();
    if (!purchaseInfo?.configured) return host.toast('支付宝会员付款暂未开放');
    const p = products.find(p => p.id === plan); if (!p) return;
    if (!window.confirm(`购买${plan === 'yearly' ? '年度' : '月度'}团队会员 ${p.displayPrice}（${p.days}天），到期不自动扣款。将调用支付宝支付SDK处理订单、设备及网络信息，详见本页隐私政策。是否继续付款？`)) return;
    const a = auth(); busy = true; repaint();
    try {
      const order = await host.api('/api/alipay/team/purchases', { ...a, action: 'create', plan });
      if (!sameBuyer(a)) return;
      if (!order.orderId || !order.orderString) throw Error('暂时无法创建支付订单');
      const result = await androidPay().pay({ orderString: order.orderString });
      if (!sameBuyer(a)) return;
      let verified;
      for (let i = 0; i < 4; i++) {
        verified = await host.api('/api/alipay/team/purchases', { ...a, action: 'query', orderId: order.orderId });
        if (!sameBuyer(a)) return;
        if (verified.status !== 'pending' || result.resultStatus === '6001') break;
        if (i < 3) await new Promise(resolve => setTimeout(resolve, 1500));
      }
      if (verified.paid) { membershipPage = false; host.toast('团队会员已开通'); }
      else host.toast(result.resultStatus === '6001' ? '已取消付款；如已扣款，可同步支付结果' : '付款结果尚在确认，请稍后同步支付结果，不必重复付款');
      await refresh();
    } catch (e) { if (sameBuyer(a)) host.toast((e.message || '支付暂未完成') + '；如已扣款，请点击同步支付结果'); }
    finally { if (sameBuyer(a)) { busy = false; repaint(); } }
  }
  const can = module => team?.active && ['read', 'edit'].includes(team.permissions[module]);
  const canEdit = module => team?.active && team.permissions[module] === 'edit';
  function auth() { return host.auth(); }
  function repaint() { if (host?.page() === 'team') host.render(); }
  function reset() {
    tabsScrollLeft = 0;
    teamInfoOpen = true;
    membershipPage = false; previewKind = ''; previewClosed = false;
    sessionGeneration++; refreshVersion++; species = ''; tab = 'overview';
    teams = []; invitations = []; team = null; selected = ''; loaded = loading = busy = false; error = ''; dialog = ''; products = []; purchaseInfo = null; productLoaded = false; purchaseError = ''; canCreate = hasOwn = false; formDraft = null; cardImage = ''; membership = null; syncAt = syncNotice = saveState = ''; linkTarget = {}; breedYear = breedSpecies = breedMother = ''; breedCompare = 'mother'; ledgerRange = { mode: 'all' }; reportRange = { mode: 'month' }; month = today().slice(0, 7); ledgerKind = reportKind = ''; ledgerMonth = ''; turtleLimit = 120; filter = ''; actor = ''; breedingStatus = 'all'; taskFilter = 'all';
  }
  async function api(action, extra = {}) {
    const generation = sessionGeneration, a = auth(), result = await host.api('/api/team', { ...a, action, teamId: selected, revision: team?.revision, month, range: reportRange, ...extra });
    if (generation !== sessionGeneration || `${a.phone}:${a.token}` !== session || `${a.phone}:${a.token}` !== `${auth().phone}:${auth().token}`) throw new Error('账号已切换，请刷新');
    return result;
  }
  async function refresh() {
    const version = ++refreshVersion, generation = sessionGeneration;
    const requested = { month, range: { ...reportRange }, species };
    const current = () => version === refreshVersion && generation === sessionGeneration;
    loading = true; error = ''; repaint();
    try {
      const result = await api('list');
      if (!current()) return;
      const nextSelected = result.teams.some(t => t.id === selected) ? selected : result.teams[0]?.id || '';
      const nextTeam = nextSelected ? (await api('get', { ...requested, teamId: nextSelected })).team : null;
      if (!current()) return;
      if (nextTeam?.report && requested.species) {
        nextTeam.report = (await api('report', { ...requested, teamId: nextSelected })).report;
        if (!current()) return;
      }
      const previousTeam = team;
      teams = result.teams; invitations = result.invitations; canCreate = result.canCreate; hasOwn = result.hasOwnTeam; membership = result.membership || null;
      selected = nextSelected; team = nextTeam;
      if (previousTeam && (previousTeam.id !== team?.id || previousTeam.visibleFrom !== team?.visibleFrom || JSON.stringify(previousTeam.permissions) !== JSON.stringify(team?.permissions))) { dialog = ''; formDraft = null; cardImage = ''; filter = ''; turtleLimit = 120; }
      if (previousTeam && team && previousTeam.id === team.id && previousTeam.revision !== team.revision) syncNotice = '发现团队更新，已同步最新数据';
      syncAt = new Date().toISOString();
    } catch (e) { if (current()) { error = e.message; team = null; } }
    finally { if (current()) { loading = false; loaded = true; repaint(); } }
  }
  async function mutate(action, extra = {}) {
    if (busy) return;
    const generation = sessionGeneration;
    const current = () => generation === sessionGeneration;
    // A read started before this write must not replace the saved result.
    refreshVersion++; loading = false;
    busy = true; saveState = '正在保存…'; repaint();
    document.querySelectorAll('.ts-dialog button[type="submit"]').forEach(b => b.disabled = true);
    try {
      const result = await api(action, extra);
      if (!current()) return;
      if (result.team) { team = result.team; selected = team.id; }
      if (action === 'accept' && result.accepted) { selected = extra.teamId; membershipPage = false; tab = 'overview'; }
      dialog = ''; formDraft = null; saveState = result.message || '保存成功'; host.toast(result.message || '已保存'); await refresh();
    } catch (e) {
      if (!current()) return;
      saveState = '保存失败：' + e.message + '；填写内容已保留，请核对后重试'; host.toast(e.message);
      if (e.status === 409) { await refresh(); if (current()) error = '团队已更新，已保留你的填写内容，请核对后重新提交。'; }
    } finally { if (current()) { busy = false; repaint(); } }
  }
  async function preparePurchase() {
    if (productLoaded || !auth().phone) return;
    productLoaded = true;
    const a = auth();
    try {
      if (androidPay()) {
        const info = await host.api('/api/alipay/team/purchases', { ...a, action: 'prepare' });
        if (!sameBuyer(a)) return;
        purchaseInfo = info; products = info.products || [];
        if (!info.configured) purchaseError = '支付宝会员付款暂未开放，请稍后再试。';
        if (info.configured) await syncAlipay(false);
        return;
      }
      if (!native()) return;
      const info = await host.api('/api/apple/purchases', { ...a, action: 'prepare' });
      if (`${a.phone}:${a.token}` !== session) return;
      purchaseInfo = info;
      const plugin = native();
      if (plugin) {
        if (!nativeListener) nativeListener = await plugin.addListener('transactionUpdated', () => { if (host.page() === 'team') void restore(false); });
        const result = await plugin.products();
        if (`${a.phone}:${a.token}` !== session) return;
        products = result.products || [];
        if (!products.length) purchaseError = '暂时未能加载订阅价格，请稍后重试。';
        await restore(false);
      }
    } catch (e) { if (sameBuyer(a)) purchaseError = e.message; }
    finally { if (sameBuyer(a)) repaint(); }
  }
  async function verifyTransaction(transaction, a) {
    const result = await host.api('/api/apple/purchases', { ...a, action: 'verify', transactionId: transaction.transactionId, environment: transaction.environment });
    // Finish only after the server has durably acknowledged the transaction.
    await native().finish({ transactionId: transaction.transactionId });
    return result;
  }
  async function purchase(productId) {
    if (busy) return;
    if (!auth().phone) return host.login();
    if (!purchaseInfo?.configured) return host.toast('购买服务正在配置中，请稍后再试');
    busy = true; repaint();
    try {
      const a = auth(), result = await native().purchase({ productId, appAccountToken: purchaseInfo.appAccountToken });
      if (result.cancelled) return;
      if (result.pending) { host.toast('购买等待批准，批准后会自动同步'); return; }
      const verified = await verifyTransaction(result, a);
      if (verified.active) membershipPage = false;
      host.toast(verified.active ? '团队会员已开通' : '订阅已同步');
      await refresh();
    } catch (e) { host.toast(e.message || '购买未完成，请重试恢复购买'); }
    finally { busy = false; repaint(); }
  }
  async function restore(explicit = true) {
    if (!auth().phone) return host.login();
    const plugin = native(); if (!plugin) return explicit && host.toast('请在 iPhone App 内恢复苹果订阅');
    const a = auth();
    try {
      const result = await plugin.restore({ sync: explicit });
      let count = 0;
      for (const transaction of result.transactions || []) {
        if (transaction.appAccountToken?.toLowerCase() !== purchaseInfo?.appAccountToken?.toLowerCase()) continue;
        await verifyTransaction(transaction, a); count++;
      }
      if (explicit) host.toast(count ? '购买状态已恢复' : '未找到绑定当前账号的有效购买');
      if (count) await refresh();
    } catch (e) { if (explicit) host.toast(e.message); }
  }
  function feature(name, title, sub) { return `<div class="ts-feature"><i>${icon(name)}</i><div><h3>${title}</h3><p>${sub}</p></div></div>`; }
  function previewWorkspace() {
    const current = moduleTabs.find(([key]) => key === tab) || moduleTabs[0];
    const date = today().slice(0, 7);
    const row = (title, sub, value) => `<div class="ts-preview-row"><div><h3>${title}</h3><p>${sub}</p></div><strong>${value}</strong></div>`;
    const panel = (title, sub, content, action = '') => `<section class="ts-panel ts-preview-content"><div class="ts-section-title"><div><span class="ts-kicker">示例数据</span><h2>${title}</h2></div>${action ? button('preview.subscribe', action, '', 'ts-primary') : ''}</div><p class="ts-muted">${sub}</p>${content}</section>`;
    const records = {
      purchase: [['黄缘闭壳龟 · HY-001', '购入 2 只 · ' + date + '-03 09:30', '−1,200.00']],
      sold: [['黄缘闭壳龟 · HY-002', '售出 1 只 · ' + date + '-08 14:20', '+1,800.00']],
      loss: [['草龟 · CG-003', '损耗 1 只 · ' + date + '-10 10:15 · 非现金成本', '−100.00']],
      other: [['幼龟颗粒粮', '龟粮 · ' + date + '-06 11:00', '−120.00'], ['水温计与过滤棉', '器材 · ' + date + '-07 16:30', '−180.00']]
    };
    const finance = () => `<div class="ts-finance-grid">${['purchase', 'sold', 'loss', 'other'].map((kind, i) => `<button type="button" class="ts-finance-card ${kind === 'sold' ? 'is-income' : ''}" data-ts="preview.finance" data-kind="${kind}"><span>${typeName(kind)}${icon('arrow')}</span><strong>¥${['1,200.00', '1,800.00', '100.00', '300.00'][i]}</strong><small>查看示例明细</small></button>`).join('')}</div>${previewKind ? `<div class="ts-preview-details"><h3>${typeName(previewKind)}明细</h3>${records[previewKind].map(r => row(...r)).join('')}</div>` : ''}`;
    const views = {
      overview: () => `<div class="ts-metrics">${metric('在养档案', '12', '示例 · 只')}${metric('协作成员', '2 / 6', '示例 · 子账号')}${metric('销售收入', '1,800.00', '示例 · 元', 'ts-positive')}${metric('收支结余', '300.00', '示例 · 元')}</div>` + panel('共享看板', '一个团队共用主账号的记录，按成员设置查看范围。', row('HY-001 · 黄缘闭壳龟', '雌 · 健康 · 种龟池', '320 g') + row('CG-002 · 草龟', '雄 · 健康 · 成长池', '180 g') + `<div class="ts-inline">${button('preview.tab', '查看孵化', 'data-tab="hatching"')}${button('preview.tab', '查看待办任务', 'data-tab="tasks"')}</div>`),
      ledger: () => panel('每笔往来，都有来处', '收购、售出、损耗和其他支出分别汇总，点击查看明细。', finance(), '记一笔'),
      reports: () => panel('经营报表', '按月份、近一年或自选日期统计，导出报表用于对账。', `<div class="ts-metrics">${metric('销售收入', '1,800.00', '元', 'ts-positive')}${metric('现金支出', '1,500.00', '元')}${metric('收支结余', '300.00', '元 · 不等于净利润')}${metric('损耗成本', '100.00', '元 · 单独列示')}</div><div class="ts-preview-chart" aria-label="示例近六期收入趋势">${[26, 45, 32, 68, 56, 90].map((v, i) => `<div><i style="height:${v}px"></i><small>第 ${i + 1} 期</small></div>`).join('')}</div>${finance()}<div class="ts-inline">${button('preview.subscribe', '导出月度报表')}${button('preview.subscribe', '导出对账单')}</div>`),
      hatching: () => panel('孵化管理', '产蛋、受精、分批出壳一窝一档；标记孵化完成后计入最终孵化率。', `<div class="ts-chips">${button('preview.hatch', '进行中', 'data-closed="false"', !previewClosed ? 'selected' : '')}${button('preview.hatch', '已结束 · 最终孵化', 'data-closed="true"', previewClosed ? 'selected' : '')}</div><article class="ts-nest"><div class="ts-nest-title"><h3>黄缘 · 一号种母</h3><span class="ts-tag">${previewClosed ? '孵化完成' : '进行中'}</span></div><p class="ts-muted">${date}-01 · 一号孵化箱</p><div class="ts-nest-counts"><span>产蛋<b>6<em>枚</em></b></span><span>受精<b>5<em>枚</em></b></span><span>出壳<b>${previewClosed ? 4 : 3}<em>只</em></b></span></div><div class="ts-nest-progress"><div><span>${previewClosed ? '最终孵化率' : '当前出壳进度'}</span><strong>${previewClosed ? 80 : 60}%</strong></div><div class="ts-rate-track"><i style="width:${previewClosed ? 80 : 60}%"></i></div></div><details class="ts-hatch-events"><summary>查看分批出壳示例</summary>${row(date + '-12', '第一批出壳', '3 只')}${previewClosed ? row(date + '-15', '第二批出壳', '1 只') : ''}</details></article>`, '记录出壳'),
      care: () => panel('护理与提醒', '共享换水、喂食和健康检查记录，持续跟进每只龟的状态。', row('一号池换水', date + '-10 09:00 · 每周重复', '换水') + row('黄缘种龟称重', date + '-12 14:00 · 记录体重变化', '称重'), '新增护理'),
      tasks: () => panel('团队任务', '安排执行人、到期时间和完成状态，让成员清楚今天要做什么。', row('一号池换水，检查水温', '小林 · 今天 09:00', '待完成') + row('幼龟投喂并清理食台', '小周 · 今天 08:30', '已完成'), '新任务'),
      members: () => panel('成员与子账号', '1 位主账号 + 最多 6 位成员。新成员默认只读，可分别设置数据起始日期和权限。', row('龟场主账号', '管理成员、账目与全部权限', '所有者') + row('小林', '看板、账本、护理、孵化：只读', '成员') + row('小周', '仅查看 ' + date + '-09 起的记录（含当天）', '成员') + '<p class="ts-note">受邀成员使用自己的账号接受邀请，无需另外订阅。</p>', '添加子账号'),
      logs: () => panel('操作记录', '查看谁在什么时间进行了操作，支持按成员筛选。', `<div class="ts-timeline"><article><i></i><div><strong>小林</strong><p>完成一号池换水任务</p><small>${date}-10 09:20:00</small></div></article><article><i></i><div><strong>主账号</strong><p>记录幼龟出壳 3 只</p><small>${date}-12 10:30:00</small></div></article></div>`),
      approvals: () => panel('重要操作审批', '开启审批后，成员提交的出售、损耗与账目更正由主账号确认。', row('小林提交 · 黄缘售出', date + '-08 14:20 · ¥1,800.00', '待审批') + `<div class="ts-inline">${button('preview.subscribe', '通过', '', 'ts-primary')}${button('preview.subscribe', '退回')}</div>`),
      settings: () => panel('龟场品牌与设置', '设置龟场名称、Logo 和联系方式，生成带品牌的分享卡。', `<div class="ts-brand-preview">${icon('card')}<div><h3>青禾龟场 · 示例</h3><p>记录成长，分享照料成果</p></div></div><p class="ts-note">分享卡展示档案与成长信息，不包含成本、账目或内部备注。</p>`, '编辑品牌与审批设置')
    };
    return `<div class="ts-workhead"><div><span class="ts-kicker">先了解，再开启协作</span><h1>团队空间 <span class="ts-tag">功能预览</span></h1></div>${button('preview.subscribe', '开通会员', '', 'ts-primary')}</div><div class="ts-preview-notice" role="note">${icon('grid')}<div><strong>${team && !team.active ? '团队会员已到期 · 当前为功能预览' : '功能预览 · 以下均为示例数据'}</strong><p>可自由浏览全部模块，开通后使用真实团队数据。受邀成员无需重复订阅。</p></div></div><nav class="ts-tabs ts-preview-tabs" aria-label="团队模块">${moduleTabs.map(([key, glyph, label]) => button('preview.tab', icon(glyph) + label, `data-tab="${key}" aria-current="${current[0] === key ? 'page' : 'false'}"`, current[0] === key ? 'selected' : '')).join('')}</nav><div data-preview-module="${current[0]}">${views[current[0]]()}</div><section class="ts-preview-subscription" aria-label="${current[2]}订阅提示"><p class="ts-note">正在预览「${current[2]}」。开通团队会员后，与伙伴一起使用真实数据协作。</p>${purchaseSection()}</section>`;
  }
  function teamSetup() {
    if (hasOwn) return '';
    const signedIn = Boolean(auth().phone), ready = signedIn && loaded && !error && canCreate;
    const status = !signedIn ? '登录后开启' : error ? '状态待确认' : !loaded ? '正在同步' : ready ? (membership?.testing ? '测试权限已开通' : '团队会员已开通') : '团队会员未开通';
    const content = `<section class="ts-panel ts-setup" aria-label="添加子账号"><div class="ts-section-title"><div><span class="ts-kicker">从第一位伙伴开始</span><h2>添加子账号</h2></div><span class="ts-tag">${status}</span></div>
    <p class="ts-muted">先创建团队，再用成员的注册手机号邀请。每位成员使用自己的账号登录，接受邀请后加入协作。</p>
    <ol class="ts-steps"><li><b>01</b><div><strong>创建团队</strong><small>主账号开通后创建</small></div></li><li><b>02</b><div><strong>邀请成员</strong><small>设置看板、账本与任务权限</small></div></li><li><b>03</b><div><strong>接受邀请</strong><small>最多 6 位成员共同协作</small></div></li></ol>
    ${ready ? `<p class="ts-note">${membership?.testing ? `测试有效期至 ${E(membership.expiresAt.slice(0, 10))}，到期自动结束。` : '团队权限已就绪。'}创建后会直接进入成员管理。团队共享主账号的云端档案和账本。${membership?.testing ? '请使用测试数据验证操作。' : ''}</p>${button('create', '创建团队并添加子账号 ' + icon('arrow'), '', 'ts-primary ts-wide')}` : !signedIn ? button('login', '登录并查看团队状态', '', 'ts-primary ts-wide') : `<p class="ts-note">${error ? '暂时未能确认团队权限，请刷新状态。' : !loaded ? '正在确认当前账号的团队权限。' : '当前账号还不能创建团队。开通团队会员后即可添加子账号；受邀成员无需单独订阅。'}</p>${button('create', '开通后创建团队', 'disabled', 'ts-primary ts-wide')}${button('refresh', '刷新团队状态', loading ? 'disabled' : '', 'ts-wide')}`}</section>`;
    return ready ? content : `<details class="ts-setup-guide"><summary>开通后，如何添加子账号？<span>查看步骤</span></summary>${content}</details>`;
  }

  function purchaseSection() {
    const ios = Boolean(native());
    const android = Boolean(androidPay());
    const androidPlans = `<div class="ts-plans">${['monthly', 'yearly'].map(period => {
      const p = products.find(p => p.id === period);
      return `<div class="ts-plan ${period === 'yearly' ? 'ts-plan-year' : ''}"><small>单次购买 · 手动续费</small><h3>${period === 'yearly' ? '年度会员' : '月度会员'}</h3><strong>${p ? E(p.displayPrice) : '加载价格中'}<em> / ${p ? E(p.days) + '天' : period === 'yearly' ? '年' : '月'}</em></strong>${button('alipay.purchase', busy ? '处理中…' : '支付宝购买', `data-id="${period}" ${!p || busy || !purchaseInfo?.configured ? 'disabled' : ''}`, 'ts-primary ts-wide')}</div>`;
    }).join('')}</div><p class="ts-fine">由本公司提供团队会员服务。一次付款开通所选时长，到期不自动扣款；支付宝会员续费从现有支付宝会员到期日顺延。付款后由服务器核实并开通。</p><div class="ts-inline">${button('alipay.sync', '同步支付结果', busy ? 'disabled' : '')}</div>`;
    return `<section class="ts-panel ts-purchase" id="team-subscribe" aria-label="开通团队会员"><div class="ts-purchase-heading"><h2>选择你的团队会员</h2><span class="ts-tag">成员无需另付费</span></div>
    ${!auth().phone ? button('login', '登录后查看团队与会员', '', 'ts-primary ts-wide') : android ? androidPlans : ios ? `<div class="ts-plans">${['monthly', 'yearly'].map(period => {
      const p = products.find(p => p.id.endsWith(period));
      return `<div class="ts-plan ${period === 'yearly' ? 'ts-plan-year' : ''}"><small>${period === 'yearly' ? '安心经营一整年' : '灵活开启协作'}</small><h3>${period === 'yearly' ? '年度会员' : '月度会员'}</h3><strong>${p ? E(p.displayPrice) : '加载价格中'}<em> / ${period === 'yearly' ? '年' : '月'}</em></strong>${button('purchase', busy ? '处理中…' : '订阅' + (period === 'yearly' ? '年度' : '月度') + '会员', `data-id="keyoushouzhang.team.${period}" ${!p || busy || !purchaseInfo?.configured ? 'disabled' : ''}`, 'ts-primary ts-wide')}</div>`;
    }).join('')}</div><p class="ts-fine">自动续期，费用由 Apple 账户扣取。可在 Apple 订阅设置中取消续订；取消后可使用至当前周期结束。</p><div class="ts-inline">${button('restore', '恢复购买')}${button('manage', '管理订阅')}</div>` : `<p class="ts-muted">网页端支持管理已开通的团队和接受邀请。苹果订阅需在支持购买的 iPhone App 中开通，再用同一账号登录这里。</p>${purchaseInfo?.configured === false ? '<p class="ts-note">订阅购买暂未开放。</p>' : ''}`}
    ${purchaseError ? `<p class="ts-error">${E(purchaseError)}</p>${button('prices', '重新加载')}` : ''}
    <div class="ts-legal"><a href="./terms.html" target="_blank" rel="noopener">服务条款</a><span>·</span><a href="./privacy.html" target="_blank" rel="noopener">隐私政策</a>${ios ? '<span>·</span><a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener">Apple 标准使用条款</a>' : ''}</div></section>`;
  }
  function invitationPanel() {
    if (!invitations.length) return '';
    return `<section aria-label="待处理团队邀请"><div class="ts-section-title"><h2>团队邀请（${invitations.length}）</h2></div>${invitations.map(i => `<section class="ts-panel ts-invite"><div><small>邀请你加入团队</small><h3>${E(i.name)}</h3><p class="ts-note">加入后可切换团队，自己的团队、会员和数据保持不变。</p></div>${button('accept', '加入', `data-id="${E(i.id)}" data-team="${E(i.teamId)}" ${busy ? 'disabled' : ''}`, 'ts-primary')}${button('decline', '婉拒', `data-id="${E(i.id)}" data-team="${E(i.teamId)}" ${busy ? 'disabled' : ''}`)}</section>`).join('')}</section>`;
  }
  function landing() {
    return `${membershipPage ? button('preview.back', '← 返回团队空间', '', 'ts-wide') : ''}<section class="ts-hero ts-member-hero"><div class="ts-eyebrow"><span class="ts-spark"></span> 龟友手账 · 团队会员</div><h1>一个团队，一起照顾好龟场。</h1><p>共享记录 · 看清经营 · 跟进孵化</p><div class="ts-people"><span>主</span><span>01</span><span>02</span><span>+4</span><small>1 个主账号 · 6 个子账号</small></div><div class="ts-hero-ring"></div></section>
    ${canCreate && !hasOwn ? teamSetup() : purchaseSection()}
    
    <section class="ts-panel"><div class="ts-section-title"><div><span class="ts-kicker">为共同经营而设计</span><h2>不止是多几个账号</h2></div>${icon('shield')}</div><div class="ts-features">
      ${feature('users', '分工清楚，权限有界', '共享看板和账本，逐人设置查看、编辑权限。')}
      ${feature('chart', '经营数据，一目了然', '月度趋势、品种收支与带龟场名称的报表导出。')}
      ${feature('egg', '繁殖孵化，一窝一档', '跟进产蛋、受精与分批出壳，自动汇总孵化率。')}
      ${feature('check', '日常照料，不再遗漏', '喂食、换水、称重任务，分配到人，完成可见。')}
      ${feature('clock', '每次操作，都有记录', '按成员查阅操作记录，重要账目可先审批。')}
      ${feature('card', '分享档案，带上品牌', '专属名称、Logo 与联系方式，展示照料成果。')}
    </div></section>
    ${canCreate && !hasOwn ? purchaseSection() : teamSetup()}
    `;
  }
  const person = mid => mid === 'owner' ? team.owner.name : team.members.find(m => m.id === mid)?.name || '已离队成员';
  function metric(label, value, small, cls = '') { return `<div class="ts-metric ${cls}"><span>${label}</span><strong>${value}</strong><small>${small}</small></div>`; }
  const permissionNames = { dashboard: '共享看板', ledger: '账本与报表', tasks: '护理与任务', breeding: '繁殖与孵化' };
  function permissionSummary(perms, from, name = '该成员') {
    const groups = ['read', 'edit', 'none'].map(level => {
      const names = Object.keys(permissionNames).filter(k => (perms?.[k] || 'none') === level).map(k => permissionNames[k]);
      return names.length ? `${({ read: '只读', edit: '可新增或修改', none: '不开放' })[level]}：${names.join('、')}` : '';
    }).filter(Boolean);
    return `${E(name)}的数据范围：${from ? E(from) + ' 起（含当天）' : '全部历史'}。${groups.map(E).join('；')}。${Object.values(perms || {}).includes('edit') ? '' : '不能新增、修改或删除业务记录。'}成员管理、删除、导出和审批由主账号控制。`;
  }
  function syncFeedback(time = true) {
    if (!time && !saveState && !syncNotice) return '';
    return `<div class="ts-sync-state" role="status" aria-live="polite">${time ? `<span>${icon('clock')}${loading ? '正在同步…' : syncAt ? '最近同步：' + E(enteredAt(syncAt)) : '等待同步'}</span>` : `${saveState ? `<span class="${saveState.startsWith('保存失败') ? 'ts-save-error' : ''}">${E(saveState)}</span>` : ''}${syncNotice ? `<span>${E(syncNotice)}</span>${button('sync.dismiss', '知道了')}` : ''}`}</div>`;
  }
  function teamInfo() {
    const permission = team.own ? '主账号' : Object.values(team.permissions).includes('edit') ? '部分可编辑' : Object.values(team.permissions).includes('read') ? '只读' : '暂无数据权限';
    return `<details class="ts-team-info" ${teamInfoOpen ? 'open' : ''}><summary><span class="ts-team-summary">${icon('shield')}<strong>${team.visibleFrom ? E(team.visibleFrom) + ' 起' : '全部历史'}</strong><span class="ts-tag">${permission}</span>${team.testing ? '<span class="ts-tag">试用中</span>' : ''}</span><span class="ts-team-info-toggle">详情 <i aria-hidden="true">⌄</i></span></summary><div class="ts-team-info-body">${syncFeedback()}<div class="ts-data-scope"><div><strong>${team.own ? '共享主账号全部历史业务记录' : team.visibleFrom ? E(team.visibleFrom) + ' 起的数据（含当天）' : '可查看全部历史业务记录'}</strong><p>档案、账本、护理、繁殖与孵化直接读取主账号云端数据。${team.visibleFrom ? '范围外的记录不计入统计；更早产蛋的窝次整体隐藏。' : '在个人页或团队页记录，都会同步显示。'}</p></div></div>${team.testing ? `<div class="ts-test-status">测试协作中 · 有效期至 ${E(team.expiresAt.slice(0, 10))} · 到期自动结束</div>` : ''}${!team.own ? `<div class="ts-permission-preview">${permissionSummary(team.permissions, team.visibleFrom, '你')}</div>` : ''}</div></details>${syncFeedback(false)}`;
  }
  function attentionPanel() {
    const assigned = can('tasks') ? team.tasks.filter(t => !t.done && (team.own || t.assignee === team.selfId)) : [];
    const soon = new Date(Date.parse(today() + 'T00:00:00Z') + 2 * 86400000).toISOString().slice(0, 10);
    const late = assigned.filter(t => t.due && t.due < today()), near = assigned.filter(t => t.due >= today() && t.due <= soon);
    const pending = team.approvals.filter(p => p.status === 'pending');
    const results = !team.own ? team.approvals.filter(p => p.status !== 'pending').sort((a, b) => String(b.decidedAt).localeCompare(String(a.decidedAt))).slice(0, 5) : [];
    if (!can('tasks') && !team.own && !can('ledger')) return '';
    return `<section class="ts-panel ts-attention"><div class="ts-section-title"><div><span class="ts-kicker">打开团队，先看这里</span><h2>${team.own ? '团队待办' : '我的待办'}</h2></div><span class="ts-tag">团队内提醒</span></div><div class="ts-attention-grid">${can('tasks') ? `${button('attention', `<strong>${assigned.length}</strong><span>${team.own ? '待完成任务' : '分配给我的任务'}</span>`, 'data-target="tasks" data-filter="mine"')}${button('attention', `<strong>${late.length}</strong><span>已逾期</span>`, 'data-target="tasks" data-filter="late"')}${button('attention', `<strong>${near.length}</strong><span>今天至后天到期</span>`, 'data-target="tasks" data-filter="soon"')}` : ''}${team.own || can('ledger') ? button('attention', `<strong>${pending.length}</strong><span>${team.own ? '等待我审批' : '我的申请待审批'}</span>`, 'data-target="approvals"') : ''}</div>${assigned.length ? `<div class="ts-attention-list">${[...late, ...near, ...assigned.filter(t => !late.includes(t) && !near.includes(t))].slice(0, 5).map(taskRow).join('')}</div>` : can('tasks') ? '<p class="ts-muted">当前没有待完成任务。</p>' : ''}${results.length ? `<h3>最近审批结果</h3>${results.map(p => `<div class="ts-review-result"><span class="ts-tag">${p.status === 'approved' ? '已通过' : '已退回'}</span><div><strong>${E(p.command.record?.title || '账目更正')}</strong><p>${E(p.reason || (p.status === 'approved' ? '已生效，可在账本查看。' : '请联系主账号了解原因。'))}</p><small>${E(enteredAt(p.decidedAt))}</small></div></div>`).join('')}` : ''}</section>`;
  }
  function linkedRecords() {
    if (!can('ledger')) return [];
    if (linkTarget.turtle) return team.ledger.filter(r => (r.associationIds || []).includes(linkTarget.turtle));
    const chosen = team.ledger.find(r => r.id === linkTarget.record);
    if (!chosen) return [];
    const ids = new Set(chosen.associationIds || []);
    return team.ledger.filter(r => r.id === chosen.id || (r.associationIds || []).some(id => ids.has(id)) || r.relatedLossId === chosen.id || chosen.relatedLossId === r.id || (chosen.relatedLossId && r.relatedLossId === chosen.relatedLossId));
  }
  function ledgerLinksModal() {
    const rows = linkedRecords(), ids = new Set(rows.flatMap(r => r.associationIds || []));
    const archives = can('dashboard') ? team.turtles.filter(t => ids.has(t.id)) : [];
    return `<div class="ts-backdrop"><section class="ts-dialog ts-history-dialog" role="dialog" aria-modal="true" aria-labelledby="ts-dialog-title"><header><h2 id="ts-dialog-title">关联账目与档案</h2>${button('close', '×', 'aria-label="关闭"')}</header><p class="ts-note">按档案关联展示授权范围内的记录，不受当前报表月份筛选限制。批量收购、售出显示整笔金额，不当作某一只龟的单独成本或利润。损耗是成本损失，不再次扣作现金支出。</p>${archives.length ? `<div class="ts-inline">${archives.map(t => button('turtle-detail', E(t.code || t.name || t.speciesName) + ' · 档案', `data-id="${E(t.id)}"`)).join('')}</div>` : '<p class="ts-fine">关联档案已移出、未开放或不在可见范围内；仍可查看有权限的账目。</p>'}<div class="ts-history-list">${[...rows].reverse().map(r => `<article><span class="ts-tag">${E(typeName(r.type))}</span><div><strong>${E(r.title || r.speciesName || '未命名事项')}</strong><small>${E(r.recordDate)} ${E(r.recordTime || '（未记录时间）')}</small>${r.category ? `<p>费用分类：${E(r.category)}</p>` : ''}${r.note ? `<p>${E(r.note)}</p>` : ''}${r.restoredPurchase ? '<small>损耗前原购入成本还原，仅对应损耗个体</small>' : ''}</div><b>${r.type === 'sold' ? '+' : '−'}${money(r.amount)}</b></article>`).join('') || empty('暂无可见关联记录', '没有关联档案的费用仍可在其他支出中查看。')}</div></section></div>`;
  }
  function nestStats(rows) {
    const s = rows.reduce((s, r) => ({ eggs: s.eggs + r.eggCount, fertile: s.fertile + r.fertileCount, hatch: s.hatch + r.hatchCount }), { eggs: 0, fertile: 0, hatch: 0 });
    const valid = rows.every(r => [r.eggCount, r.fertileCount, r.hatchCount].every(n => Number.isSafeInteger(n) && n >= 0) && r.hatchCount <= r.fertileCount && r.fertileCount <= r.eggCount);
    return { ...s, count: rows.length, rate: valid && s.fertile > 0 ? Math.round(s.hatch / s.fertile * 1000) / 10 : null };
  }
  function breedingAnalysis(rows) {
    const ongoing = nestStats(rows.filter(r => !r.incubationClosed)), ended = nestStats(rows.filter(r => r.incubationClosed));
    const key = r => breedCompare === 'species' ? r.speciesName || '未记录品种' : breedCompare === 'year' ? r.date.slice(0, 4) || '未记录年份' : !r.motherId || ['manual', '__keep__'].includes(r.motherId) ? 'name:' + r.motherName : r.motherId;
    const groups = new Map();
    for (const r of rows) { const k = key(r); const g = groups.get(k) || { name: breedCompare === 'mother' ? r.motherName : k, rows: [] }; g.rows.push(r); groups.set(k, g); }
    return `<div class="ts-breeding-analysis">${[[ongoing, '进行中 · 当前出壳进度', '还会继续出壳，不能作为最终成绩'], [ended, '已结束 · 最终孵化率', '仅统计已标记结束的窝次']].map(([s, title, note]) => `<section class="ts-panel"><span class="ts-kicker">${title}</span><strong>${percentage(s.rate)}</strong><p>${s.count} 窝 · 出壳 ${s.hatch} / 受精 ${s.fertile} / 产蛋 ${s.eggs}</p><small>${note}。按总出壳数 ÷ 总受精数计算。</small></section>`).join('')}</div><section class="ts-panel"><div class="ts-section-title"><h2>繁殖对比</h2><select data-breed-compare aria-label="繁殖对比维度">${[['mother', '按种母'], ['species', '按品种'], ['year', '按年份']].map(([v, label]) => `<option value="${v}" ${breedCompare === v ? 'selected' : ''}>${label}</option>`).join('')}</select></div><p class="ts-fine">对比使用已结束窝次的最终孵化率；未结束的窝单独计数，不参与最终成绩。</p>${[...groups.values()].map(g => { const s = nestStats(g.rows.filter(r => r.incubationClosed)); return `<div class="ts-compare-row"><div><strong>${E(g.name)}</strong><small>已结束 ${s.count} 窝 · 进行中 ${g.rows.length - s.count} 窝 · 出壳 ${s.hatch} / 受精 ${s.fertile}</small></div><b>${percentage(s.rate)}</b></div>`; }).join('') || '<p class="ts-muted">当前筛选下暂无窝次。</p>'}</section>`;
  }

  function overview() {
    const r = team.report;
    return `<div class="ts-metrics">${metric('在养档案', can('dashboard') ? team.turtles.filter(t => !['已死亡', '已转让'].includes(t.status)).length : '—', '主账号云端档案')}${metric('协作成员', `${team.members.filter(m => m.status === 'active' || !m.status).length}<em>/ 6</em>`, '另含 1 位主账号')}${r ? metric(reportRange.mode === 'month' ? '所选月份销售收入' : '所选期间销售收入', money(r.income), '元 · 已记录销售', 'ts-positive') + metric(reportRange.mode === 'month' ? '所选月份收支结余' : '所选期间收支结余', money(r.balance), '元 · 收入减现金支出') : ''}</div>
    ${attentionPanel()}
    ${can('dashboard') ? `<section class="ts-panel"><div class="ts-section-title"><h2>共享看板</h2><small>${team.turtles.length} 份档案</small></div><input class="ts-search" type="search" data-filter="turtles" placeholder="搜索编号或品种" value="${E(filter)}" aria-label="搜索档案"><div class="ts-turtles">${team.turtles.filter(t => `${t.code} ${t.speciesName}`.includes(filter)).slice(0, turtleLimit).map(t => `<article class="ts-turtle"><div class="ts-turtle-photo">${safePhoto(t.photo) ? `<img src="${E(safePhoto(t.photo))}" alt="${E(t.code)}" loading="lazy">` : icon('card')}</div><div><strong>${E(t.code || t.name || '未编号')}</strong><small>${E(t.speciesName || t.speciesCode)} · ${E(t.gender)}</small><span class="ts-tag">${E(t.health || t.status || '在养')}</span></div>${button('turtle-detail', '详情', `data-id="${E(t.id)}"`)}${canEdit('dashboard') ? button('turtle', '更新', `data-id="${E(t.id)}"`) : ''}${team.own ? button('card', '分享', `data-id="${E(t.id)}"`) : ''}</article>`).join('') || empty('暂无匹配档案', '主账号同步到云端的档案会显示在这里。')}</div>${team.turtles.filter(t => `${t.code} ${t.speciesName}`.includes(filter)).length > turtleLimit ? button('turtles.more', '继续加载历史档案', '', 'ts-wide') : ''}</section>${poolPanel()}` : empty('看板未开放', '主账号可在成员权限中开放看板。')}`;
  }
  function taskMatches(t) {
    const assigned = team.own || t.assignee === team.selfId;
    const soon = new Date(Date.parse(today() + 'T00:00:00Z') + 2 * 86400000).toISOString().slice(0, 10);
    return taskFilter === 'all' || (taskFilter === 'open' && !t.done) || (taskFilter === 'mine' && !t.done && t.assignee === (team.own ? 'owner' : team.selfId))
      || (taskFilter === 'late' && assigned && !t.done && t.due && t.due < today())
      || (taskFilter === 'soon' && assigned && !t.done && t.due >= today() && t.due <= soon) || (taskFilter === 'done' && t.done);
  }
  function tabBadge(key) {
    const n = key === 'tasks' ? team.tasks.filter(t => !t.done && (team.own || t.assignee === team.selfId)).length : key === 'approvals' ? team.approvals.filter(p => p.status === 'pending').length : 0;
    return n ? `<span class="ts-nav-count" aria-label="${n} 项待处理">${n}</span>` : '';
  }
  function breedingFilters(rows) {
    const select = (key, title, values, selected) => `<label><span>${title}</span><select data-breed-filter="${key}" aria-label="繁殖${title}"><option value="">全部${title}</option>${[...new Set(values)].filter(Boolean).sort().map(v => `<option value="${E(v)}" ${v === selected ? 'selected' : ''}>${E(v)}</option>`).join('')}</select></label>`;
    return `<div class="ts-breeding-filters">${select('year', '年份', rows.map(r => r.date.slice(0, 4)), breedYear)}${select('species', '品种', rows.map(r => r.speciesName || '未记录品种'), breedSpecies)}${select('mother', '种母', rows.map(r => r.motherName), breedMother)}</div>`;
  }
  function safePhoto(src) { const s = String(src || ''); return /^(https?:\/\/|\/uploads\/|\/assets\/|\.\/assets\/|data:image\/(png|jpeg|webp);base64,)/.test(s) ? s : ''; }
  function poolPanel() {
    if (!(team.pools || []).length) return '';
    return `<section class="ts-panel"><div class="ts-section-title"><h2>养殖池</h2><span class="ts-count">${team.pools.length} 个</span></div><div class="ts-nests">${team.pools.map(p => `<article class="ts-nest"><div class="ts-nest-title"><h3>${E(p.name)}</h3><span class="ts-tag">${E(({ hatchling: '幼龟池', juvenile: '成长池', breeder: '种龟池' })[p.type] || '养殖池')}</span></div><p class="ts-muted">可见在养档案 ${p.count} 只${p.length && p.width ? ` · ${E(p.length)} × ${E(p.width)}${p.height ? ' × ' + E(p.height) : ''} cm` : ''}</p>${p.note ? `<p class="ts-nest-note">${E(p.note)}</p>` : ''}</article>`).join('')}</div></section>`;
  }
  function care() {
    if (!can('tasks')) return empty('护理记录未开放', '主账号可以在“护理与任务”权限中开放。');
    const rows = (team.memos || []).filter(m => `${m.title} ${m.content}`.includes(filter));
    return `<section class="ts-panel"><div class="ts-section-title"><div><span class="ts-kicker">与主账号共用护理记录</span><h2>护理与提醒 <span class="ts-count">${rows.length}</span></h2></div>${canEdit('tasks') ? button('memo', '+ 新增护理', '', 'ts-primary') : '<span class="ts-tag">只读</span>'}</div><input class="ts-search" type="search" data-filter="care" value="${E(filter)}" placeholder="搜索护理事项" aria-label="搜索护理事项"><div class="ts-care-list">${rows.map(m => `<article class="ts-care-row"><div><small>${E(m.date || '未填写日期')} · ${E(m.remindTime || '未设提醒时间')} · ${m.repeat ? '重复提醒' : '单次提醒'}</small><h3>${E(m.title)}</h3><p>${E(m.content || '暂无补充说明')}</p>${m.weekdays.length ? `<small>每周 ${m.weekdays.map(E).join('、')}</small>` : ''}</div>${canEdit('tasks') ? button('memo', '编辑', `data-id="${E(m.id)}"`) : ''}</article>`).join('') || empty('暂无匹配护理事项', '主账号在个人页记录的护理事项也会显示在这里。')}</div></section>`;
  }
  const percentage = value => value == null ? '—' : `${value}%`;
  function breedingView() {
    if (!can('breeding')) return empty('繁殖与孵化未开放', '请主账号在成员权限中开放“繁殖与孵化”。');
    const allNests = team.breedingRecords || [];
    const rows = allNests.filter(r => (!breedYear || r.date.startsWith(breedYear)) && (!breedSpecies || (r.speciesName || '未记录品种') === breedSpecies) && (!breedMother || r.motherName === breedMother) && `${r.motherName} ${r.date} ${r.poolName}`.includes(filter) && (breedingStatus === 'all' || (breedingStatus === 'open' ? !r.incubationClosed : r.incubationClosed)));
    return `<section class="ts-breed-head"><div><span class="ts-kicker">从一窝蛋，到新的生命</span><h2>孵化管理</h2><p class="ts-muted">与主账号共用产蛋、受精与分批出壳记录；主动标记孵化完成后计入最终孵化率。</p></div>${canEdit('breeding') ? button('breeding', icon('plus') + '新增繁殖', '', 'ts-primary') : '<span class="ts-tag">只读</span>'}</section>${breedingFilters(allNests)}${breedingAnalysis(rows)}
    <section class="ts-panel"><div class="ts-section-title"><h2>按窝跟进 <span class="ts-count">${rows.length}</span></h2></div><input class="ts-search" type="search" data-filter="breeding" value="${E(filter)}" placeholder="搜索种母、日期或养殖池" aria-label="搜索繁殖记录"><div class="ts-chips">${[['all', '全部'], ['open', '进行中'], ['closed', '已结束']].map(([v, l]) => button('breeding.filter', l, `data-value="${v}"`, breedingStatus === v ? 'selected' : '')).join('')}</div>
    <div class="ts-nests">${rows.map(r => `<article class="ts-nest"><div class="ts-nest-title"><div><small>${E(r.date)}${r.poolName ? ' · ' + E(r.poolName) : ''}</small><h3>${E(r.motherName)}</h3></div><span class="ts-tag">${r.incubationClosed ? '孵化完成' : '进行中'}</span></div>
    ${safePhoto(r.photo) ? `<img class="ts-nest-photo" src="${E(safePhoto(r.photo))}" alt="${E(r.motherName)} 繁殖照片" loading="lazy">` : ''}
    <div class="ts-nest-counts"><span>产蛋<b>${r.eggCount}<em>枚</em></b></span><span>受精<b>${r.fertileCount}<em>枚</em></b></span><span>出壳<b>${r.hatchCount}<em>只</em></b></span></div>
    <div class="ts-nest-progress"><div><span>${r.incubationClosed ? '最终孵化率' : '当前出壳进度'}</span><strong>${percentage(r.hatchRate)}</strong></div><div class="ts-rate-track"><i style="width:${r.hatchRate == null ? 0 : Math.max(0, Math.min(100, r.hatchRate))}%"></i></div><small>${r.hatchRate == null ? '待完善受精数据或核对出壳数' : `受精率 ${percentage(r.fertileRate)} · 出壳占总产蛋 ${percentage(r.totalRate)}`}</small></div>
    ${r.note ? `<p class="ts-nest-note">${E(r.note)}</p>` : ''}
    ${`<details class="ts-hatch-events" ${r.hatchEvents.length ? 'open' : ''}><summary>分批出壳记录 · ${r.hatchEvents.length} 次</summary>${[...r.hatchEvents].reverse().map(e => `<div><span>${E(e.date)}<small>${e.historicalLink ? '历史档案补建 · 不重复计数' : '独立出壳批次'}</small></span><b>${e.count} 只</b></div>`).join('') || '<p>还没有分批出壳记录。</p>'}</details>`}
    ${canEdit('breeding') ? `<div class="ts-nest-actions">${button('breeding', '编辑', `data-id="${E(r.id)}"`)}${!r.incubationClosed ? button('hatch', '+ 记录出壳', `data-id="${E(r.id)}"`, 'ts-primary') : ''}${r.unlinked ? button('hatch', `补建历史幼龟（${r.unlinked}）`, `data-id="${E(r.id)}" data-historical="true"`) : ''}</div>` : ''}</article>`).join('') || empty('暂无匹配窝次', canEdit('breeding') ? '点击“新增繁殖”，填写种母、产蛋数与受精数。' : '主账号开放的繁殖记录会显示在这里。')}</div></section>`;
  }
  const hatching = () => breedingView();
  function selectedPeriod(context) {
    const value = context === 'ledger' ? ledgerRange : reportRange;
    if (value.mode === 'all') return { ...value, label: '全部可见历史' };
    if (value.mode === 'custom') return { ...value, label: `${value.start} 至 ${value.end}` };
    if (value.mode === 'year') {
      const end = today(), start = new Date(Date.parse(end + 'T00:00:00Z') - 364 * 86400000).toISOString().slice(0, 10);
      return { ...value, start, end, label: `近一年 · ${start} 至 ${end}` };
    }
    const m = context === 'ledger' ? ledgerMonth || today().slice(0, 7) : month;
    const last = new Date(`${m}-01T00:00:00Z`); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
    return { mode: 'month', start: m + '-01', end: last.toISOString().slice(0, 10), label: m + ' 月' };
  }
  function periodControls(context) {
    const p = selectedPeriod(context), title = context === 'ledger' ? '账本' : '报表';
    return `<div class="ts-period-controls" data-period-context="${context}"><label><span>日期范围</span><select data-period-mode="${context}" aria-label="${title}日期范围" ${loading ? 'disabled' : ''}>${[['month', '按月'], ['year', '近一年'], ['custom', '自定义日期'], ['all', '全部历史']].map(([key, name]) => `<option value="${key}" ${p.mode === key ? 'selected' : ''}>${name}</option>`).join('')}</select></label>${p.mode === 'month' ? `<label><span>月份</span><input type="month" ${context === 'ledger' ? 'data-ledger-month' : 'data-month'} value="${E(context === 'ledger' ? ledgerMonth || today().slice(0, 7) : month)}" aria-label="${title}月份" ${loading ? 'disabled' : ''}></label>` : ''}</div>`;
  }
  function customPeriod(context) {
    const p = selectedPeriod(context);
    return p.mode !== 'custom' ? '' : `<div class="ts-custom-period" data-period-custom="${context}"><label><span>开始日期</span><input type="date" data-period-start value="${E(p.start)}" aria-label="${context === 'ledger' ? '账本' : '报表'}开始日期"></label><span class="ts-date-dash">—</span><label><span>结束日期</span><input type="date" data-period-end value="${E(p.end)}" aria-label="${context === 'ledger' ? '账本' : '报表'}结束日期"></label>${button('period.apply', '应用日期', `data-context="${context}"`, 'ts-primary')}</div>`;
  }

  function reports() {
    if (!can('ledger')) return empty('经营数据未开放', '需要主账号授予账本查看权限。');
    const r = team.report;
    const max = Math.max(1, ...r.trend.flatMap(t => [t.income, t.expense]));
    return `<section class="ts-panel"><div class="ts-section-title ts-finance-heading"><div><span class="ts-kicker">经营报表</span><h2>${E(team.branding.name || team.name)}</h2></div>${periodControls('report')}</div>${customPeriod('report')}<p class="ts-fine">${E(selectedPeriod('report').label)} · 起止日期均包含当天</p><div class="ts-metrics">${metric('销售收入', money(r.income), '元', 'ts-positive')}${metric('现金支出', money(r.purchase + r.expenses), '收购＋日常支出')}${metric('收支结余', money(r.balance), '不等同于净利润')}${metric('损耗成本', money(r.loss), `${r.lossCount} 笔 · 单独展示`)}</div><p class="ts-note">收支按记账日期统计；损耗为购入成本转移，不重复扣作现金支出。${r.missingCostCount ? `有 ${r.missingCostCount} 份在养档案未填写购入成本。` : '未记录的费用不会计入报表。'}</p></section>
    <section class="ts-panel"><div class="ts-section-title"><h2>${reportRange.mode === 'month' ? '近六个月趋势' : '所选期间趋势'}</h2><small><i class="ts-dot"></i>收入 <i class="ts-dot ts-gold"></i>支出</small></div><div class="ts-chart" role="img" aria-label="${reportRange.mode === 'month' ? '近六个月' : '所选期间'}收入支出对比">${r.trend.map(t => `<div class="ts-bar-group"><div class="ts-bars"><i style="height:${Math.max(2, t.income / max * 130)}px" title="收入 ${money(t.income)}"></i><i style="height:${Math.max(2, t.expense / max * 130)}px" title="支出 ${money(t.expense)}"></i></div><small>${E(reportRange.mode === 'month' ? t.month.slice(5) + '月' : t.month)}</small></div>`).join('')}</div><details><summary>查看趋势数值</summary>${r.trend.map(t => `<p>${E(t.month)}：收入 ${money(t.income)} / 支出 ${money(t.expense)}</p>`).join('')}</details></section>
    <section class="ts-panel"><div class="ts-section-title"><h2>账目分类</h2><span class="ts-kicker">点击查看每笔明细</span></div>${financeCards(r.entries || [], 'report')}</section>${reportKind ? financeDetails(r.entries || [], reportKind, 'report') : ''}${team.own ? `<section class="ts-panel"><h2>导出与对账</h2><p class="ts-muted">CSV 表格含龟场名称，可用 Excel 打开。</p><div class="ts-inline">${button('export', '期间报表', 'data-kind="report"')}${button('export', '库存清单', 'data-kind="inventory"')}${button('export', '期间对账单', 'data-kind="ledger"')}</div></section>` : ''}`;
  }
  const financeTypes = ['purchase', 'sold', 'loss', 'other'];
  const sumRows = rows => rows.reduce((n, r) => n + Math.round(Number(r.amount || 0) * 100), 0) / 100;
  const timeNow = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date());
  function enteredAt(value) {
    if (!value || !String(value).includes('T') || !Number.isFinite(Date.parse(value))) return '未记录';
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value));
  }
  function financeCards(rows, context) {
    return `<div class="ts-finance-grid">${financeTypes.map(type => {
      const list = rows.filter(r => r.type === type);
      return `<button type="button" class="ts-finance-card ${type === 'sold' ? 'is-income' : ''}" data-ts="finance.open" data-context="${context}" data-kind="${type}"><span>${E(typeName(type))}<i>${icon('arrow')}</i></span><strong>¥${money(sumRows(list))}</strong><small>${list.length} 笔${type === 'loss' ? ' · 非现金成本' : ''} · 查看明细</small></button>`;
    }).join('')}</div>`;
  }
  function financeDetails(rows, kind, context) {
    const list = rows.filter(r => r.type === kind);
    return `<section class="ts-panel ts-finance-detail"><div class="ts-section-title"><div><span class="ts-kicker">${E(selectedPeriod(context).label)}</span><h2>${E(typeName(kind))}明细</h2></div>${button('finance.back', '返回汇总', `data-context="${context}"`)}</div><div class="ts-finance-total"><span>${list.length} 笔 · 合计</span><strong>¥${money(sumRows(list))}</strong></div>${kind === 'loss' ? '<p class="ts-note">损耗表示龟的成本损失，不再计入现金支出。损耗产生的额外费用列在“其他支出”。</p>' : ''}<p class="ts-fine">业务时间与录入时间分别展示，时间采用北京时间。未保存具体时间的历史记录会明确标注。</p>${list.map(r => `<article class="ts-finance-record"><div class="ts-finance-record-head"><div><span class="ts-kicker">${E(r.type === 'other' ? r.category || '其他' : r.speciesName || '未记录品种')}</span><h3>${E(r.title || r.turtleCode || '未命名事项')}</h3></div><strong class="${r.type === 'sold' ? 'ts-positive' : ''}">${r.type === 'sold' ? '+' : '−'}${money(r.amount)}</strong></div><dl><div><dt>业务时间</dt><dd>${E(r.recordDate || '未记录日期')} ${E(r.recordTime || '（未记录时间）')}</dd></div><div><dt>录入时间</dt><dd>${E(enteredAt(r.createdAt))}</dd></div>${r.type === 'other' ? `<div><dt>费用分类</dt><dd>${E(r.category || '其他')}</dd></div>` : ''}${r.speciesName ? `<div><dt>龟的品种</dt><dd>${E(r.speciesName)}</dd></div>` : ''}${r.turtleCode ? `<div><dt>档案编号</dt><dd>${E(r.turtleCode)}</dd></div>` : ''}${r.quantity ? `<div><dt>数量</dt><dd>${E(r.quantity)} 只</dd></div>` : ''}${r.poolName ? `<div><dt>养殖池</dt><dd>${E(r.poolName)}</dd></div>` : ''}<div><dt>备注</dt><dd>${E(r.note || '未填写')}</dd></div></dl>${r.restoredPurchase ? '<p class="ts-note">损耗前的原收购记录，按原购入日期还原成本；此处金额为对应损耗个体的购入成本。</p>' : ''}${safePhoto(r.photo) ? `<details class="ts-finance-photo"><summary>查看凭证 / 档案图片</summary><img src="${E(safePhoto(r.photo))}" alt="账目凭证或龟档案照片" loading="lazy"></details>` : ''}${button('ledger-links', '查看关联账目 / 档案', `data-record="${E(r.id)}"`)}${!r.restoredPurchase && (canEdit('ledger') && ['sold', 'other'].includes(r.type)) ? `<div class="ts-inline">${button('ledger', '修改账目', `data-id="${E(r.id)}"`)}${team.own && r.type === 'other' ? button('ledger.delete', '删除', `data-id="${E(r.id)}"`, 'ts-danger') : ''}</div>` : ''}</article>`).join('') || empty('暂无' + typeName(kind) + '记录', '当前可见范围内没有这类账目。')}</section>`;
  }
  function ledger() {
    if (!can('ledger')) return empty('账本未开放', '主账号可以设置只读或编辑权限。');
    const period = selectedPeriod('ledger');
    const rows = team.ledger.filter(r => (period.mode === 'all' || (String(r.recordDate || '').slice(0, 10) >= period.start && String(r.recordDate || '').slice(0, 10) <= period.end)) && `${r.title} ${r.note || ''} ${r.category || ''} ${r.speciesName || ''} ${r.turtleCode || ''}`.includes(filter));
    return `<section class="ts-panel"><div class="ts-section-title ts-finance-heading"><div><span class="ts-kicker">共享账本</span><h2>每笔往来，都有来处</h2></div>${periodControls('ledger')}</div>${customPeriod('ledger')}<div class="ts-inline"><input class="ts-search" type="search" data-filter="ledger" value="${E(filter)}" placeholder="搜索事项、品种、支出分类" aria-label="搜索账目">${canEdit('ledger') ? button('ledger', icon('plus') + '记一笔', '', 'ts-primary') : '<span class="ts-tag">只读</span>'}</div>${team.approvalRequired ? '<p class="ts-note">成员提交出售、损耗及账目更正后，由主账号审批生效。</p>' : ''}<p class="ts-fine">${E(period.label)} · 共 ${rows.length} 笔 · 与主账号系统账本共用数据</p>${financeCards(rows, 'ledger')}<p class="ts-fine">收购包含损耗前的原购入成本；损耗单独展示，不重复扣作现金支出。</p></section>${ledgerKind ? financeDetails(rows, ledgerKind, 'ledger') : ''}`;
  }

  function taskRow(t) {
    const overdue = !t.done && t.due < today();
    return `<div class="ts-task ${t.done ? 'is-done' : ''}"><button type="button" class="ts-task-check" data-ts="task.toggle" data-id="${E(t.id)}" aria-label="${t.done ? '重新打开' : '完成'} ${E(t.title)}" ${!canEdit('tasks') || (!team.own && t.assignee !== team.selfId) ? 'disabled' : ''}>${t.done ? '✓' : ''}</button><div><strong>${E(t.title)}</strong><small>${E(person(t.assignee))} · ${E(t.kind || '日常照料')}</small></div><span class="ts-tag ${overdue ? 'ts-late' : ''}">${t.done ? '已完成' : (overdue ? '逾期 · ' : '') + E(t.due.slice(5))}</span>${team.own ? button('task.delete', '删除', `data-id="${E(t.id)}"`, 'ts-danger') : ''}</div>`;
  }
  function tasks() {
    if (!can('tasks')) return empty('任务未开放', '主账号可以在成员权限中设置任务访问权限。');
    return `<section class="ts-panel"><div class="ts-section-title"><div><span class="ts-kicker">把照料安排妥当</span><h2>团队任务</h2></div>${canEdit('tasks') ? button('task', '+ 新任务', '', 'ts-primary') : ''}</div><div class="ts-chips">${[['all', '全部'], ['open', '待完成'], ['late', '已逾期'], ['soon', '即将到期'], ['mine', '我的任务'], ['done', '已完成']].map(([v, l]) => button('task.filter', l, `data-value="${v}"`, taskFilter === v ? 'selected' : '')).join('')}</div>${team.tasks.filter(taskMatches).map(taskRow).join('') || empty('这里暂时没有任务', '安排喂食、换水、称重，让每一项照料都有负责人。')}<p class="ts-fine">到期任务会在团队首页提醒；打开团队空间时自动同步进度。</p></section>`;
  }
  function members() {
    return `<section class="ts-panel"><div class="ts-section-title"><div><span class="ts-kicker">同心经营，各司其职</span><h2>成员与子账号 <span class="ts-count">${team.members.length} / 6</span></h2></div>${team.own && team.active ? button('invite', '+ 添加子账号', `${team.members.length >= 6 ? 'disabled' : ''}`, 'ts-primary') : ''}</div><div class="ts-member"><span class="ts-avatar">主</span><div><strong>${E(team.owner.name)}</strong><small>主账号 · 管理全部权限</small></div><span class="ts-tag">所有者</span></div>${team.members.map(m => `<div class="ts-member"><span class="ts-avatar">${E(m.name.slice(0, 1))}</span><div><strong>${E(m.name)}</strong><small>${m.status === 'pending' ? '等待接受邀请 · ' : ''}${m.phone ? E(m.phone.slice(0, 3) + '****' + m.phone.slice(-4)) : '团队成员'}</small>${m.visibleFrom !== undefined ? `<span class="ts-perm-summary">数据范围：${m.visibleFrom ? E(m.visibleFrom) + ' 起（含当天）' : '全部历史记录'}</span>` : ''}${m.permissions ? `<span class="ts-perm-summary">${['dashboard', 'ledger', 'tasks', 'breeding'].map(k => `${({ dashboard: '看板', ledger: '账本', tasks: '任务', breeding: '繁殖孵化' })[k]}·${({ none: '关闭', read: '只读', edit: '编辑' })[m.permissions[k]]}`).join('　')}</span>` : ''}</div>${team.own && team.active ? button('member', '权限', `data-id="${E(m.id)}"`) : ''}</div>`).join('')}${team.members.length === 0 ? empty('邀请第一位伙伴', '使用成员注册手机号邀请，对方登录后接受邀请。') : ''}<p class="ts-note">编辑权限允许新增或修改。成员管理、删除、导出及审批由主账号控制。</p></section>`;
  }
  function logs() {
    const visibleLogs = [...team.logs, ...(team.personalLogs || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const actors = [...new Map(visibleLogs.map(l => [l.actorId, l.actorName])).entries()];
    return `<section class="ts-panel"><div class="ts-section-title"><h2>操作记录</h2><select data-actor aria-label="按成员筛选操作"><option value="">全部成员</option>${actors.map(([id, name]) => `<option value="${E(id)}" ${id === actor ? 'selected' : ''}>${E(name)}</option>`).join('')}</select></div><p class="ts-muted">汇集主账号与团队操作，按可见数据范围展示。设置起始日期后，无法确认数据归属的历史操作摘要不展示。</p><div class="ts-timeline">${visibleLogs.filter(l => !actor || l.actorId === actor).map(l => `<article><i></i><div><strong>${E(l.actorName)}</strong><p>${E(l.summary)}</p><small>${E(new Date(l.at).toLocaleString('zh-CN'))}</small></div></article>`).join('') || empty('还没有操作记录', '成员操作后会自动记录在这里。')}</div></section>`;
  }
  function approvals() {
    return `<section class="ts-panel"><div class="ts-section-title"><h2>重要操作审批</h2><span class="ts-tag">${team.approvalRequired ? '已开启' : '未开启'}</span></div>${team.approvals.map(p => `<article class="ts-approval"><div><span class="ts-kicker">${E(p.actorName)} · ${E(enteredAt(p.at))}</span><h3>${E(p.command.kind === 'edit' ? '账目更正' : typeName(p.command.record?.type))}</h3><p>${E(p.command.record?.title || p.command.patch?.note || '修改金额或日期')} ${p.command.record?.type !== 'loss' ? '¥' + money(p.command.record?.amount ?? p.command.patch?.amount) : '按档案购入成本核算'}</p></div><span class="ts-tag">${({ pending: '待审批', approved: '已通过', rejected: '已退回' })[p.status]}</span>${p.reason ? `<p class="ts-note">退回原因：${E(p.reason)}</p>` : ''}${team.own && p.status === 'pending' ? `<div class="ts-inline">${button('approve', '通过', `data-id="${E(p.id)}"`, 'ts-primary')}${button('reject', '拒绝', `data-id="${E(p.id)}"`)}</div>` : ''}</article>`).join('') || empty('暂无审批申请', '开启审批后，成员的重要账目操作将在这里等待确认。')}</section>`;
  }
  function settings() {
    if (!team.own) return empty('由主账号管理', '品牌与审批设置仅对主账号开放。');
    return `<section class="ts-panel"><span class="ts-kicker">让每次分享，都带上你的名字</span><h2>龟场品牌</h2><div class="ts-brand-preview">${team.branding.logo ? `<img src="${E(team.branding.logo)}" alt="龟场 Logo">` : icon('card')}<div><h3>${E(team.branding.name || team.name)}</h3><p>${E(team.branding.contact || '添加联系方式，让客户找到你')}</p></div></div>${button('settings', '编辑品牌与审批设置', '', 'ts-primary ts-wide')}<p class="ts-note">在共享看板中选择“分享”，可生成品牌档案卡。卡片不包含成本、账目或内部备注。</p></section><section class="ts-panel"><h2>会员与账单</h2><p class="ts-muted">${team.testing ? '测试权限' : '会员'}有效期至 ${E(team.expiresAt.slice(0, 10))}。到期后主账号仍可在个人空间使用原有档案和账本。</p><div class="ts-inline">${button('membership', '查看会员方案')}${native() ? button('restore', '恢复购买') + button('manage', '管理订阅') : ''}</div></section>`;
  }
  function workspace() {
    const tabs = moduleTabs;
    const farmHeading = `<div class="ts-workhead ts-workhead-compact"><div class="ts-farm-name${teams.length > 1 ? ' ts-farm-switch' : ''}"><h1 title="${E(team.name)}">${E(team.name)}</h1>${teams.length > 1 ? `<span class="ts-farm-chevron" aria-hidden="true">⌄</span><select data-team-select aria-label="切换龟场，当前：${E(team.name)}" ${loading || busy ? 'disabled' : ''}>${teams.map(t => `<option value="${E(t.id)}" ${t.id === team.id ? 'selected' : ''}>${E(t.name)}${t.own ? '（我的龟场）' : ''}</option>`).join('')}</select>` : ''}</div>${button('refresh', icon('clock') + (loading ? '同步中' : '同步'), loading || busy ? 'disabled' : '')}</div>`;
    return `
    ${farmHeading}
    ${team.own && team.active && tab === 'overview' ? button('tab', icon('users') + '添加子账号 / 管理成员', 'data-tab="members"', 'ts-primary ts-wide') : ''}
    <nav class="ts-tabs" data-team-workspace aria-label="团队模块">${tabs.map(([key, glyph, label]) => button('tab', icon(glyph) + label + tabBadge(key), `data-tab="${key}" aria-current="${tab === key ? 'page' : 'false'}"`, tab === key ? 'selected' : '')).join('')}</nav>
    ${tab === 'settings' ? teamInfo() : syncFeedback(false)}
    ${!team.active ? `<section class="ts-panel">${empty('团队会员已到期', '成员协作已暂停，主账号个人数据仍然保留。')}${team.own ? button('membership', '查看会员方案', '', 'ts-primary ts-wide') : ''}</section>` : ({ overview, ledger, reports, hatching, care, tasks, members, logs, approvals, settings })[tab]()}`;
  }
  function field(label, name, value = '', type = 'text', extra = '') { return `<label class="ts-field"><span>${label}</span><input name="${name}" type="${type}" value="${E(value)}" ${extra}></label>`; }
  function permissionFields(value = { dashboard: 'read', ledger: 'read', tasks: 'read', breeding: 'read' }) {
    return ['dashboard', 'ledger', 'tasks', 'breeding'].map(k => `<label class="ts-field"><span>${({ dashboard: '共享看板', ledger: '共享账本', tasks: '护理与任务', breeding: '繁殖与孵化' })[k]}</span><select name="${k}">${[['none', '不开放'], ['read', '只读'], ['edit', '可以编辑']].map(([v, l]) => `<option value="${v}" ${value[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`).join('');
  }
  function modal() {
    if (!dialog || !team) return '';
    if (dialog === 'ledger-links') return ledgerLinksModal();
    if (dialog === 'card-preview') return `<div class="ts-backdrop"><section class="ts-dialog" role="dialog" aria-modal="true" aria-labelledby="ts-dialog-title"><header><h2 id="ts-dialog-title">品牌档案卡</h2>${button('close', '×', 'aria-label="关闭"')}</header><img class="ts-card-preview" src="${cardImage}" alt="生成的品牌档案分享卡">${button('card-save', '保存或分享图片', '', 'ts-primary ts-wide')}<p class="ts-fine">只包含你选择的公开信息。</p></section></div>`;
    if (dialog === 'turtle-detail') {
      const t = team.turtles.find(t => t.id === editId); if (!t) return '';
      return `<div class="ts-backdrop"><section class="ts-dialog" role="dialog" aria-modal="true" aria-labelledby="ts-dialog-title"><header><h2 id="ts-dialog-title">${E(t.code || t.name || '龟档案')}</h2>${button('close', '×', 'aria-label="关闭"')}</header>${safePhoto(t.photo) ? `<img class="ts-nest-photo" src="${E(safePhoto(t.photo))}" alt="${E(t.code)}">` : ''}<p class="ts-muted">${E(t.speciesName)} · ${E(t.gender)} · ${E(t.status)}<br>购入 / 入档日期：${E(t.acquiredDate || '未填写')}<br>来源：${E(t.source || '未填写')}${t.price !== undefined ? `<br>购入成本：¥${money(t.price)}` : ''}</p><div class="ts-metrics">${metric('体重', E(t.weight || 0), 'g')}${metric('背甲长度', E(t.carapaceLength || 0), 'cm')}</div>${t.note ? `<p class="ts-note">${E(t.note)}</p>` : ''}${can('ledger') ? button('ledger-links', '查看关联收购、支出与售出记录', `data-turtle="${E(t.id)}"`, 'ts-wide') : ''}<h3>成长记录</h3>${[...(t.measureHistory || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(h => `<article class="ts-care-row"><div><small>${E(String(h.date).slice(0, 10))}</small><p>体重 ${E(h.weight ?? '—')} g · 背甲 ${E(h.carapaceLength ?? '—')} cm${h.health ? ' · ' + E(h.health) : ''}</p>${safePhoto(h.photo) ? `<img class="ts-nest-photo" src="${E(safePhoto(h.photo))}" alt="成长照片">` : ''}</div></article>`).join('') || '<p class="ts-muted">暂无可见成长记录。</p>'}</section></div>`;
    }
    const member = team.members.find(m => m.id === editId), row = team.ledger.find(r => r.id === editId);
    const titles = { 'approval-reject': '退回账目申请', invite: '邀请团队成员', member: '成员权限', settings: '品牌与审批', task: '安排新任务', ledger: editId ? '更正账目' : '记一笔团队账目', turtle: '更新健康状态', memo: editId ? '编辑护理记录' : '新增护理记录', breeding: editId ? '编辑繁殖记录' : '新增繁殖记录', hatch: historicalHatch ? '补建历史幼龟档案' : '记录本次出壳', card: '生成品牌档案卡' };
    let content = '';
    if (dialog === 'approval-reject') content = '<p class="ts-note">填写需要修改的内容，让提交人知道如何处理。</p>' + field('退回原因', 'reason', '', 'text', 'required maxlength="500"');
    if (dialog === 'memo') {
      const m = (team.memos || []).find(m => m.id === editId);
      content = field('护理事项', 'title', m?.title || '', 'text', 'required maxlength="120"') + field('记录日期', 'date', m?.date || today(), 'date', `required ${team.visibleFrom ? `min="${E(team.visibleFrom)}"` : ''}`) + field('提醒时间', 'remindTime', m?.remindTime || '', 'time') + `<label class="ts-field"><span>提醒频率</span><select name="repeat"><option value="false">单次提醒</option><option value="true" ${m?.repeat ? 'selected' : ''}>重复提醒</option></select></label>` + field('补充说明', 'content', m?.content || '', 'text', 'maxlength="2000"') + '<p class="ts-note">此处修改会同步到主账号的护理提醒。已有的关联档案和每周提醒安排保持不变。</p>';
    }
    if (dialog === 'breeding') {
      const r = team.breedingRecords.find(r => r.id === editId);
      const parents = team.breedingParents || [], pools = team.breedingPools || [];
      content = field('产蛋日期', 'date', r?.date || today(), 'date', `required max="${today()}"`) + `<label class="ts-field"><span>关联种母</span><select name="motherId"><option value="manual">手动填写种母名称</option>${r && r.motherId !== 'manual' && !parents.some(t => t.id === r.motherId) ? `<option value="${E(r.motherId)}" selected>${E(r.motherName)}（原关联档案）</option>` : ''}${parents.map(t => `<option value="${E(t.id)}" ${r?.motherId === t.id ? 'selected' : ''}>${E(t.code)} · ${E(t.speciesName)}</option>`).join('')}</select></label>` + field('种母名称（手动填写时必填）', 'motherName', r?.motherName || '', 'text', 'maxlength="120" placeholder="例如：一号种母"') + `<label class="ts-field"><span>养殖池</span><select name="poolId"><option value="">未分配</option>${r?.poolId && !pools.some(p => p.id === r.poolId) ? `<option value="${E(r.poolId)}" selected>${E(r.poolName || '原养殖池')}</option>` : ''}${pools.map(p => `<option value="${E(p.id)}" ${r?.poolId === p.id ? 'selected' : ''}>${E(p.name)}</option>`).join('')}</select></label>` + field('产蛋数（枚）', 'eggCount', r?.eggCount ?? '', 'number', 'required min="0" max="1000000" step="1"') + field('受精蛋数（枚）', 'fertileCount', r?.fertileCount ?? 0, 'number', 'required min="0" max="1000000" step="1"') + field('繁殖备注', 'note', r?.note || '', 'text', 'maxlength="500"') + '<label class="ts-field"><span>繁殖照片（可选，400KB 以内）</span><input type="file" name="photoFile" accept="image/png,image/jpeg,image/webp"></label>' + (r?.photo ? '<label class="ts-checkline"><input type="checkbox" name="removePhoto">移除原照片</label>' : '') + `<label class="ts-checkline"><input type="checkbox" name="incubationClosed" ${r?.incubationClosed ? 'checked' : ''}>孵化完成（勾选后计入最终孵化率，取消勾选可继续记录）</label><p class="ts-note">已累计出壳 ${r?.hatchCount || 0} 只。新出壳请从“记录出壳”填写，系统会关联幼龟档案。尚未照蛋时可先填 0，确认受精后再更新。</p>`;
      content += `<label class="ts-field"><span>品种（手动种母可填写，关联档案优先）</span><select name="speciesCode"><option value="">未记录品种</option>${team.breedingSpecies.map(sp => `<option value="${E(sp.code)}" ${r?.speciesCode === sp.code ? 'selected' : ''}>${E(sp.name)}</option>`).join('')}</select></label>`;
    }
    if (dialog === 'hatch') {
      const r = team.breedingRecords.find(r => r.id === editId), parent = team.breedingParents.find(t => t.id === r.motherId);
      content = `<p class="ts-note">${E(r.motherName)} · ${E(r.date)} 产蛋<br>产蛋 ${r.eggCount} 枚 / 受精 ${r.fertileCount} 枚 / 已出壳 ${r.hatchCount} 只${historicalHatch ? `<br>尚有 ${r.unlinked} 只历史出壳未建档。本次只补建档案，不增加累计出壳数。` : '<br>本次出壳会新建一个幼龟批次，关联主账号看板。'}</p>` + field('本次出壳日期', 'hatchDate', today(), 'date', `required min="${E(r.date)}" max="${today()}"`) + field(historicalHatch ? '本次补建档案数' : '本次出壳数（只）', 'count', historicalHatch ? Math.min(1000, r.unlinked) : '', 'number', `required min="1" step="1" max="${historicalHatch ? Math.min(1000, r.unlinked) : Math.max(1, Math.min(1000, r.fertileCount - r.hatchCount))}"`) + `<label class="ts-field"><span>幼龟品种</span><select name="speciesCode" required><option value="">请选择品种</option>${team.breedingSpecies.map(s => `<option value="${E(s.code)}" ${parent?.speciesCode === s.code ? 'selected' : ''}>${E(s.name)}</option>`).join('')}</select></label><input type="hidden" name="eventId" value="${E(hatchEventId)}">`;
    }
    if (dialog === 'invite' || dialog === 'member') content = (dialog === 'invite' ? field('成员手机号', 'memberPhone', '', 'tel', 'required pattern="1[3-9][0-9]{9}" maxlength="11" placeholder="对方注册使用的手机号"') : `<p>${E(member.name)} · ${E(member.phone)}</p>`) + field('可查看数据的起始日期（留空表示全部历史）', 'visibleFrom', member?.visibleFrom || '', 'date') + '<p class="ts-note">包含所选当天。龟档案按购入日期，账本按记账日期，繁殖与孵化按产蛋日期整窝控制。护理按记录日期、任务按到期日。日期缺失的旧记录在限制范围时不展示。</p>' + permissionFields(member?.permissions) + '<div class="ts-permission-preview" data-permission-preview role="status" aria-live="polite"></div>' + (member ? button('remove', '移除成员并撤销权限', `data-id="${E(member.id)}"`, 'ts-danger') : '<p class="ts-fine">对方需要在“团队空间”接受邀请后才可访问数据。</p>');
    if (dialog === 'settings') content = field('团队名称', 'name', team.name, 'text', 'required maxlength="40"') + field('龟场品牌名称', 'brandName', team.branding.name, 'text', 'maxlength="40"') + field('公开联系方式', 'contact', team.branding.contact, 'text', 'maxlength="100"') + '<label class="ts-field"><span>品牌 Logo（最多 400KB）</span><input type="file" name="logoFile" accept="image/png,image/jpeg,image/webp"></label>' + `<label class="ts-checkline"><input type="checkbox" name="approvalRequired" ${team.approvalRequired ? 'checked' : ''}>出售、损耗和账目更正需要主账号审批</label>`;
    if (dialog === 'task') content = field('任务内容', 'title', '', 'text', 'required maxlength="120" placeholder="例如：一号池换水并检查水温"') + `<label class="ts-field"><span>任务类型</span><select name="kind"><option>喂食</option><option>换水</option><option>称重</option><option>健康检查</option><option>其他</option></select></label><label class="ts-field"><span>负责人</span><select name="assignee"><option value="owner">${E(team.owner.name)}（主账号）</option>${team.members.filter(m => m.status === 'active' || !m.status).map(m => `<option value="${E(m.id)}">${E(m.name)}</option>`).join('')}</select></label>` + field('到期日期', 'due', today(), 'date', 'required');
    if (dialog === 'ledger') content = (row ? `<p class="ts-note">${E(row.title)} · ${E(typeName(row.type))}</p>` : `<label class="ts-field"><span>类型</span><select name="type"><option value="other">日常支出</option><option value="sold">售出</option><option value="loss">损耗（自动核算成本）</option></select></label>${field('记账事项', 'title', '', 'text', 'maxlength="120"')}<label class="ts-field"><span>关联档案（售出和损耗必选）</span><select name="turtleId"><option value="">请选择</option>${(team.ledgerTurtles || []).map(t => `<option value="${E(t.id)}">${E(t.code)} · ${E(t.speciesName)}</option>`).join('')}</select></label>`) + field('金额（元，损耗时自动计算）', 'amount', row?.amount ?? '', 'number', 'min="0" step="0.01"') + field('记账日期', 'recordDate', row?.recordDate || today(), 'date', 'required') + field('业务时间（北京时间）', 'recordTime', row ? row.recordTime || '' : timeNow(), 'time', 'step="1"' + (row ? '' : ' required')) + ((!row || row.type === 'other') ? field('支出分类（其他支出使用）', 'category', row?.category || '其他', 'text', 'maxlength="120" placeholder="例如：龟粮、器材、水电"') : '') + field('内部备注', 'note', row?.note || '', 'text', 'maxlength="500"');
    if (dialog === 'turtle') {
      const turtle = team.turtles.find(t => t.id === editId);
      content = `<label class="ts-field"><span>健康状态</span><select name="health">${['健康', '观察', '治疗中'].map(h => `<option ${turtle.health === h ? 'selected' : ''}>${h}</option>`).join('')}</select></label>` + field('体重（g）', 'weight', turtle.weight, 'number', 'min="0" step="0.01"') + field('背甲长度（cm）', 'carapaceLength', turtle.carapaceLength, 'number', 'min="0" step="0.01"');
    }
    if (dialog === 'card') content = '<p class="ts-muted">品牌卡只展示对外档案信息，生成后可保存并分享。</p><label class="ts-checkline"><input type="checkbox" name="growth" checked>展示最近成长记录</label><label class="ts-checkline"><input type="checkbox" name="breeding">展示繁殖摘要</label>';
    return `<div class="ts-backdrop"><section class="ts-dialog" role="dialog" aria-modal="true" aria-labelledby="ts-dialog-title"><header><h2 id="ts-dialog-title">${titles[dialog]}</h2>${button('close', '×', 'aria-label="关闭"')}</header><form id="ts-form">${content}<button type="submit" class="ts-btn ts-primary ts-wide" ${busy ? 'disabled' : ''}>${busy ? '保存中…' : dialog === 'card' ? '生成并保存分享卡' : '确认保存'}</button></form></section></div>`;
  }
  async function saveCard(form) {
    const { card } = await api('share', { id: editId, growth: form.has('growth'), breeding: form.has('breeding') });
    const t = card.turtle, b = card.brand;
    // Render only the server's allowlisted public fields into a flat PNG.
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1440;
    const c = canvas.getContext('2d');
    const box = (x, y, w, h, r, color) => { c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); };
    const label = (value, x, y, size, color = '#244c3c', width = 920, weight = 400) => {
      c.font = `${weight} ${size}px "PingFang SC","Microsoft YaHei",sans-serif`; c.fillStyle = color;
      let str = String(value ?? ''); while (str.length && c.measureText(str).width > width) str = str.slice(0, -1);
      if (str !== String(value ?? '')) str = str.slice(0, -1) + '…'; c.fillText(str, x, y);
    };
    async function loadPhoto(src) {
      if (!safePhoto(src)) return null;
      return new Promise(resolve => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => resolve(null), 8000);
        img.onload = () => { clearTimeout(timer); resolve(img); }; img.onerror = () => { clearTimeout(timer); resolve(null); };
        img.src = src.startsWith('/uploads/') ? String(window.TURTLE_API_BASE_URL || '').replace(/\/$/, '') + src : src;
      });
    }
    const [photo, logo] = await Promise.all([loadPhoto(t.photo), loadPhoto(b.logo)]);
    box(0, 0, 1080, 1440, 0, '#f6f4ed'); box(38, 38, 1004, 1364, 32, '#fffcf5');
    box(38, 38, 1004, 190, 32, '#184e40');
    if (logo) c.drawImage(logo, 78, 77, 80, 80);
    label(b.name || team.name, logo ? 181 : 78, 115, 34, '#e9e5cf', logo ? 805 : 880, 600);
    label('龟 场 档 案  /  GROWTH JOURNAL', logo ? 181 : 78, 168, 20, '#acbfad', 820);
    c.save(); c.beginPath(); c.roundRect(78, 264, 924, 420, 20); c.clip();
    if (photo) {
      const scale = Math.max(924 / photo.width, 420 / photo.height);
      c.drawImage(photo, 78 + (924 - photo.width * scale) / 2, 264 + (420 - photo.height * scale) / 2, photo.width * scale, photo.height * scale);
    } else { box(78, 264, 924, 420, 20, '#e7eddf'); label('每一次记录，都在见证成长', 150, 490, 40, '#6f856a', 800); }
    c.restore();
    label(t.code || '龟友档案', 78, 765, 58, '#184e40', 924, 650);
    label(`${t.speciesName || t.speciesCode}  ·  ${t.gender || '未知'}  ·  ${t.health || '未记录健康状态'}`, 78, 816, 27, '#74856e');
    box(78, 853, 444, 118, 16, '#eff2e8'); box(548, 853, 454, 118, 16, '#eff2e8');
    label('体重 / g', 104, 888, 21, '#76836d'); label(t.weight || '—', 104, 943, 42, '#244c3c', 390, 600);
    label('背甲 / cm', 574, 888, 21, '#76836d'); label(t.carapaceLength || '—', 574, 943, 42, '#244c3c', 390, 600);
    const growth = (t.growth || []).slice(-3);
    label(growth.length ? '最近成长记录' : '认真照料，慢慢长大', 78, 1027, 26, '#244c3c', 924, 600);
    growth.forEach((r, i) => label(`${r.date || '日期未记录'}     ${r.weight || '—'} g  /  ${r.carapaceLength || '—'} cm`, 78, 1073 + i * 39, 23, '#74856e'));
    if (t.breeding?.length) label(`繁殖记录 ${t.breeding.length} 次 · 共 ${t.breeding.reduce((n, r) => n + Number(r.eggs || 0), 0)} 枚蛋`, 78, 1209, 24, '#74856e');
    box(78, 1250, 924, 1, 0, '#d6ddcc');
    const contact = String(b.contact || '');
    label(contact.slice(0, 32), 78, 1295, 26); label(contact.slice(32), 78, 1331, 23, '#74856e');
    label('龟友手账 · 认真记录每一次成长', 78, 1375, 20, '#84937a');
    cardImage = canvas.toDataURL('image/png'); cardFilename = `龟友档案-${String(t.code || '分享').replace(/[^\w\u4e00-\u9fa5-]/g, '')}.png`;
    await refresh(); dialog = 'card-preview'; formDraft = null; repaint();
  }
  async function exportCard() {
    const capacitor = window.Capacitor;
    if (capacitor?.isNativePlatform?.() && capacitor.getPlatform?.() === 'ios') {
      const plugin = capacitor.Plugins?.TurtleMediaPicker || capacitor.registerPlugin?.('TurtleMediaPicker');
      await plugin.shareImage({ filename: cardFilename, dataUrl: cardImage }); return;
    }
    const a = document.createElement('a'); a.href = cardImage; a.download = cardFilename;
    document.body.appendChild(a); a.click(); a.remove(); host.toast('已发起图片下载');
  }
  function bind() {
    const root = document.querySelector('.team-space'); if (!root) return;
    const tabs = root.querySelector('.ts-tabs');
    if (tabs) {
      tabs.scrollLeft = tabsScrollLeft;
      tabs.addEventListener('scroll', () => { if (tabs.isConnected) tabsScrollLeft = tabs.scrollLeft; }, { passive: true });
    }
    root.querySelector('.ts-team-info')?.addEventListener('toggle', e => { if (e.currentTarget.isConnected) teamInfoOpen = e.currentTarget.open; });
    // Host notifications can re-render the page while a form is being edited.
    const form = root.querySelector('#ts-form');
    const rememberDraft = () => { formDraft = [...form.elements].filter(el => el.name && el.type !== 'file').map(el => ({ name: el.name, value: el.value, checked: el.checked })); };
    form?.addEventListener('input', rememberDraft);
    form?.addEventListener('change', rememberDraft);
    const previewPermissions = () => { const out = root.querySelector('[data-permission-preview]'); if (out && form) { const values = Object.fromEntries(new FormData(form)); out.innerHTML = '<strong>保存后生效</strong><p>' + permissionSummary(values, values.visibleFrom, dialog === 'invite' ? '新成员' : team.members.find(m => m.id === editId)?.name || '该成员') + '</p>'; } };
    form?.addEventListener('input', previewPermissions); form?.addEventListener('change', previewPermissions);
    root.querySelectorAll('[data-breed-filter]').forEach(el => el.addEventListener('change', () => { if (el.dataset.breedFilter === 'year') breedYear = el.value; if (el.dataset.breedFilter === 'species') breedSpecies = el.value; if (el.dataset.breedFilter === 'mother') breedMother = el.value; repaint(); }));
    root.querySelector('[data-breed-compare]')?.addEventListener('change', e => { breedCompare = e.target.value; repaint(); });
    root.onclick = async event => {
      const b = event.target.closest('[data-ts]'); if (!b || busy) return;
      const action = b.dataset.ts;
      if (action === 'preview.subscribe') { membershipPage = true; dialog = ''; repaint(); window.scrollTo(0, 0); return; }
      if (action === 'preview.back') { membershipPage = false; repaint(); window.scrollTo(0, 0); return; }
      if (isPreview()) {
        if (action === 'preview.tab' && moduleTabs.some(([key]) => key === b.dataset.tab)) { tab = b.dataset.tab; previewKind = ''; repaint(); window.scrollTo(0, 0); return; }
        if (action === 'preview.finance' && ['purchase', 'sold', 'loss', 'other'].includes(b.dataset.kind)) { previewKind = b.dataset.kind; repaint(); document.querySelector('.ts-preview-details')?.scrollIntoView({ block: 'center' }); return; }
        if (action === 'preview.hatch') { previewClosed = b.dataset.closed === 'true'; repaint(); return; }
        if (!['purchase', 'restore', 'manage', 'prices', 'login', 'refresh', 'accept', 'decline'].includes(action)) return;
      }
      if (action === 'finance.open' || action === 'finance.back') { const kind = action === 'finance.back' ? '' : b.dataset.kind; if (kind && !financeTypes.includes(kind)) return; if (b.dataset.context === 'report') reportKind = kind; else ledgerKind = kind; repaint(); if (kind) document.querySelector('.ts-finance-detail')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
      if (action === 'sync.dismiss') { syncNotice = ''; repaint(); return; }
      if (action === 'ledger-links') { if (!can('ledger')) return; linkTarget = { record: b.dataset.record, turtle: b.dataset.turtle }; dialog = 'ledger-links'; formDraft = null; repaint(); return; }
      if (action === 'attention') { tab = b.dataset.target; if (tab === 'tasks') taskFilter = team.own && b.dataset.filter === 'mine' ? 'open' : b.dataset.filter || 'all'; repaint(); return; }
      if (action === 'period.apply') {
        const context = b.dataset.context, controls = root.querySelector('[data-period-custom="' + context + '"]');
        const start = controls.querySelector('[data-period-start]').value, end = controls.querySelector('[data-period-end]').value;
        if (!start || !end) return host.toast('请填写开始和结束日期');
        if (start > end) return host.toast('开始日期不能晚于结束日期');
        const value = { mode: 'custom', start, end };
        if (context === 'ledger') { ledgerRange = value; repaint(); } else { reportRange = value; await refresh(); }
        return;
      }
      if (action === 'close') { dialog = ''; formDraft = null; cardImage = ''; repaint(); return; }
      if (action === 'card-save') { try { await exportCard(); } catch (e) { if (e.name !== 'AbortError') host.toast(e.message); } return; }
      if (action === 'refresh') return refresh();
      if (action === 'login') return host.login();
      if (action === 'tab') { tab = b.dataset.tab; filter = ''; repaint(); return; }
      if (action === 'membership') { membershipPage = true; repaint(); window.scrollTo(0, 0); return; }
      if (action === 'prices') { productLoaded = false; purchaseError = ''; return preparePurchase(); }
      if (action === 'purchase') return purchase(b.dataset.id);
      if (action === 'alipay.purchase') return purchaseAlipay(b.dataset.id);
      if (action === 'alipay.sync') return syncAlipay();
      if (action === 'restore') return restore();
      if (action === 'manage') { try { await native()?.manage(); } catch (e) { host.toast(e.message); } return; }
      if (action === 'create') { await mutate('create'); if (team?.own) { membershipPage = false; tab = 'members'; repaint(); } return; }
      if (['accept', 'decline'].includes(action)) return mutate(action, { teamId: b.dataset.team, id: b.dataset.id });
      if (action === 'turtles.more') { turtleLimit += 120; repaint(); return; }
      if (action === 'ledger.all') { ledgerMonth = ''; repaint(); return; }
      if (action === 'breeding.filter') { breedingStatus = b.dataset.value; repaint(); return; }
      if (action === 'task.filter') { taskFilter = b.dataset.value; repaint(); return; }
      if (action === 'export') { try { const r = await api('export', { kind: b.dataset.kind }); await host.download(r.filename, r.content, 'text/csv;charset=utf-8'); } catch (e) { host.toast(e.message); } return; }
      if (action === 'remove' && window.confirm('移除后，这位成员将立即失去团队访问权限。继续？')) return mutate('member', { id: b.dataset.id, remove: true });
      if (action === 'task.toggle') return mutate('task', { id: b.dataset.id });
      if (action === 'task.delete' && window.confirm('确定删除这项任务？')) return mutate('task.delete', { id: b.dataset.id });
      if (action === 'ledger.delete' && window.confirm('确定删除这笔日常支出？')) return mutate('ledger', { id: b.dataset.id, kind: 'delete' });
      if (action === 'approve') return mutate('approval', { id: b.dataset.id, approve: true });
      if (action === 'reject') { dialog = 'approval-reject'; editId = b.dataset.id; formDraft = null; repaint(); return; }
      if (['invite', 'member', 'settings', 'task', 'ledger', 'turtle', 'card', 'breeding', 'hatch', 'memo', 'turtle-detail'].includes(action)) { dialog = action; editId = b.dataset.id || ''; if (action === 'hatch') { hatchEventId = crypto.randomUUID(); historicalHatch = b.dataset.historical === 'true'; } brandingLogo = team.branding.logo || ''; formDraft = null; repaint(); setTimeout(() => document.querySelector('.ts-dialog input, .ts-dialog select')?.focus(), 0); }
    };
    root.querySelector('[data-team-select]')?.addEventListener('change', e => { selected = e.target.value; tab = 'overview'; refresh(); });
    root.querySelectorAll('[data-period-mode]').forEach(el => el.addEventListener('change', async e => {
      const context = el.dataset.periodMode, mode = e.target.value;
      const value = { mode, ...(mode === 'custom' ? { start: today().slice(0, 7) + '-01', end: today() } : {}) };
      if (context === 'ledger') { ledgerRange = value; if (mode === 'month' && !ledgerMonth) ledgerMonth = today().slice(0, 7); repaint(); }
      else { reportRange = value; await refresh(); }
    }));
    root.querySelector('[data-ledger-month]')?.addEventListener('change', e => { ledgerMonth = e.target.value; ledgerRange = { mode: ledgerMonth ? 'month' : 'all' }; repaint(); });
    root.querySelectorAll('[data-month]').forEach(el => el.addEventListener('change', e => { if (!e.target.value) return; month = e.target.value; reportRange = { mode: 'month' }; species = ''; refresh(); }));
    root.querySelector('[data-species]')?.addEventListener('change', e => { species = e.target.value; refresh(); });
    root.querySelector('[data-actor]')?.addEventListener('change', e => { actor = e.target.value; repaint(); });
    root.querySelector('[data-filter]')?.addEventListener('change', e => { filter = e.target.value; repaint(); });
    root.querySelector('#ts-form')?.addEventListener('submit', async e => {
      e.preventDefault(); if (busy) return;
      const f = new FormData(e.target), values = Object.fromEntries(f);
      formDraft = [...e.target.elements].filter(el => el.name && el.type !== 'file').map(el => ({ name: el.name, value: el.value, checked: el.checked }));
      if (dialog === 'approval-reject') { await mutate('approval', { id: editId, approve: false, reason: values.reason }); return; }
      if (dialog === 'card') { busy = true; try { await saveCard(f); } catch (err) { host.toast(err.message); } finally { busy = false; repaint(); } return; }
      if (dialog === 'settings') {
        const file = f.get('logoFile');
        if (file?.size) {
          if (file.size > 400000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return host.toast('请上传 400KB 以内的 PNG、JPEG 或 WebP 图片');
          brandingLogo = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); });
        }
        values.logo = brandingLogo; values.approvalRequired = f.has('approvalRequired'); delete values.logoFile;
      }
      if (['invite', 'member'].includes(dialog)) values.permissions = Object.fromEntries(['dashboard', 'ledger', 'tasks', 'breeding'].map(k => [k, f.get(k)]));
      if (dialog === 'breeding') {
        values.incubationClosed = f.has('incubationClosed'); values.removePhoto = f.has('removePhoto');
        const file = f.get('photoFile'); delete values.photoFile;
        if (file?.size) {
          if (file.size > 400000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return host.toast('请上传 400KB 以内的 PNG、JPEG 或 WebP 图片');
          values.photo = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); });
        }
      }
      if (dialog === 'memo') values.repeat = f.get('repeat') === 'true';
      if (dialog === 'hatch') values.linkHistorical = historicalHatch;
      if (editId) values.id = editId;
      if (dialog === 'ledger') values.kind = editId ? 'edit' : 'add';
      await mutate(dialog, values);
    });
    if (formDraft) for (const value of formDraft) {
      const input = root.querySelector('#ts-form')?.elements.namedItem(value.name);
      if (input) { input.value = value.value; if (input.type === 'checkbox') input.checked = value.checked; }
    }
    previewPermissions();
    root.onkeydown = e => {
      if (e.key === 'Escape' && dialog && !busy) { dialog = ''; repaint(); }
      if (e.key === 'Tab' && dialog) {
        const nodes = [...root.querySelectorAll('.ts-dialog button:not(:disabled), .ts-dialog input, .ts-dialog select')];
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
  }
  window.TurtleTeam = {
    entry: () => `<button class="ts-entry" type="button" data-page="team"><span class="ts-entry-icon">${icon('users')}</span><span><small>龟友手账 · 团队空间</small><strong>一起记录，一起经营</strong><em>共享账本 / 成员权限 / 经营报表</em></span>${icon('arrow')}</button>`,
    render(context) {
      host = context;
      const a = auth(), key = `${a.phone}:${a.token}`;
      if (session !== key) { session = key; reset(); }
      else {
        // The host replaces the page DOM on tab changes and background updates.
        const tabs = document.querySelector('.team-space .ts-tabs');
        if (tabs) tabsScrollLeft = tabs.scrollLeft;
      }
      if (!loaded && !loading && a.phone) { loading = true; queueMicrotask(() => { loading = false; refresh(); }); }
      if (!productLoaded && a.phone) queueMicrotask(preparePurchase);
      return `${host.topbar('团队空间', true)}<main class="team-space"><div class="ts-container">${error ? `<div class="ts-error" role="alert">${E(error)} ${button('refresh', '重试')}</div>` : ''}${loading && !loaded ? '<div class="ts-loading" role="status"><span></span>正在连接团队空间…</div>' : ''}${invitationPanel()}${membershipPage ? landing() : isPreview() ? previewWorkspace() : team ? workspace() : landing()}</div>${modal()}</main>`;
    }, bind
  };
  function refreshVisibleTeam() {
    if (host?.page() === 'team' && auth().phone && !dialog && !busy && !loading && !document.hidden) void refresh();
  }
  setInterval(refreshVisibleTeam, 45000);
  window.addEventListener('focus', refreshVisibleTeam);
  document.addEventListener('visibilitychange', refreshVisibleTeam);
})();
