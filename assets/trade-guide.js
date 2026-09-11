/* Local-only trading help: no media is fetched until the guide is opened. */
(() => {
  let closeGuide = null;
  let splashTimer;
  let startupCancelled = false;
  const introDayKey = 'turtlekeeper-trade-intro-last-day';
  window.dismissTradeIntro = () => {
    startupCancelled = true;
    clearTimeout(splashTimer);
    document.querySelector('.trade-intro')?.remove();
  };
  window.openTradeGuide = (initial = 'buyer') => {
    window.dismissTradeIntro();
    closeGuide?.();
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    const panel = document.createElement('div');
    panel.className = 'trade-guide';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', '交易指南');
    panel.innerHTML = `<header><button data-close aria-label="关闭交易指南">‹ 返回</button><strong>交易指南</strong><span></span></header><main><div class="trade-guide-hero"><small>壳友手账 · 交易帮助</small><h1>约定清楚，交易更安心</h1><p>了解买卖流程，留好每一份凭证。</p></div><nav aria-label="指南分类"><button data-tab="buyer">我想买龟</button><button data-tab="seller">我想卖龟</button><button data-tab="terms">完整条款</button></nav><div data-content></div></main><footer><div><small>中介微信</small><strong>keyousz001</strong></div><button data-copy>复制微信号</button></footer>`;
    const close = () => {
      document.removeEventListener('keydown', keydown);
      panel.remove();
      document.body.style.overflow = oldOverflow;
      closeGuide = null;
      if (previous?.isConnected) previous.focus();
    };
    const keydown = event => {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab') return;
      const buttons = [...panel.querySelectorAll('button, summary, a[href]')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    closeGuide = close;
    function select(tab) {
      panel.querySelectorAll('[data-tab]').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === tab);
        button.setAttribute('aria-pressed', String(button.dataset.tab === tab));
      });
      const content = panel.querySelector('[data-content]');
      content.replaceChildren();
      if (tab === 'terms') {
        const text = document.createElement('div');
        text.className = 'trade-terms';
        text.textContent = window.TURTLE_TRADE_TERMS;
        content.append(text);
      } else {
        const buyer = tab === 'buyer';
        const steps = buyer ? ['确认品种、品相与健康情况', '约定总价、运输风险及售后', '如需中介，联系微信并建群确认', '付款留凭证，发货同步物流', '连续录像开箱，及时反馈验收'] : ['准备近期实拍图片与细节视频', '填写数量、性别、尺寸和体重', '如实说明品相与已知健康问题', '确认费用、运输风险和验收售后', '发货前留存打包与寄件凭证'];
        content.innerHTML = `<section class="trade-fee"><strong>中介费 0.88% · 最低8.80元</strong><p>交易总价不足1000元收取8.80元，1000元及以上按0.88%收取。仅适用于中介服务；费用承担方请在付款前约定。</p></section><ol>${steps.map(step => `<li>${step}</li>`).join('')}</ol><p class="trade-caption">下方海报为流程摘要，收费及具体规则请查看完整条款。</p><img class="trade-poster" src="assets/trade-guide/${buyer ? 'buyer' : 'seller'}.png" alt="${buyer ? '交易流程须知' : '卖方信息确认清单'}" loading="lazy" decoding="async"><button class="trade-read-terms" data-read-terms>阅读完整交易条款 →</button>`;
        content.querySelector('[data-read-terms]').onclick = () => select('terms');
        content.querySelector('img').onclick = () => {
          const zoom = document.createElement('div');
          zoom.className = 'trade-zoom';
          zoom.innerHTML = `<button aria-label="关闭大图">关闭大图 ×</button><div><img src="${content.querySelector('img').getAttribute('src')}" alt="交易指南放大图"></div>`;
          panel.append(zoom);
          zoom.querySelector('button').onclick = () => zoom.remove();
          zoom.querySelector('button').focus();
        };
      }
      panel.querySelector('main').scrollTop = 0;
    }
    panel.querySelector('[data-close]').onclick = close;
    panel.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => select(button.dataset.tab));
    panel.querySelector('[data-copy]').onclick = () => copyText('keyousz001', '中介微信号已复制');
    document.addEventListener('keydown', keydown);
    document.body.style.overflow = 'hidden';
    document.body.append(panel);
    select(initial);
    panel.querySelector('[data-close]').focus();
  };
  window.showTradeIntro = () => {
    if (startupCancelled || document.hidden || location.search || location.hash || document.querySelector('.trade-intro')) return;
    // Use the device's calendar day, so reopening the app does not repeat the
    // intro and the next day's first launch can show it again.
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    try {
      if (localStorage.getItem(introDayKey) === day) return;
      localStorage.setItem(introDayKey, day);
    } catch {
      // An optional introduction must not block startup when storage is unavailable.
      return;
    }
    const intro = document.createElement('div');
    intro.className = 'trade-intro';
    intro.innerHTML = `<div class="trade-intro-brand">壳友手账<small>记录相遇 · 陪伴成长</small></div><button class="trade-intro-skip">跳过</button><button class="trade-intro-content" aria-label="查看交易指南"><img class="trade-intro-art" src="assets/trade-guide/intro-turtle.png" alt="抱着信封的小乌龟" fetchpriority="high"><span class="trade-intro-label">给每一次相遇，多一份安心</span><h1>遇见喜欢的龟<br>也懂怎么交易</h1><p>约定清楚，留好凭证</p><strong>查看交易指南 <i aria-hidden="true">→</i></strong></button><div class="trade-intro-footnote">从壳友相遇，到安心相伴</div>`;
    intro.querySelector('.trade-intro-skip').onclick = window.dismissTradeIntro;
    intro.querySelector('.trade-intro-content').onclick = () => window.openTradeGuide();
    document.body.append(intro);
    splashTimer = setTimeout(window.dismissTradeIntro, 2000);
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) window.dismissTradeIntro(); });
})();
