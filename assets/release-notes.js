(() => {
  'use strict';
  const releases = {
    '1.1.9': [
      ['龟友圈更适合手机阅读', '调整帖子列表、图片和详情布局，压缩回复留白，点击回复可直接输入，失败时保留草稿。'],
      ['交流更容易接着聊', '列表显示最新回复摘要，互动消息可定位对应评论，被回复的龟友也能收到站内提醒。'],
      ['商品在售确认更方便', '商品发布后 7 天提醒确认，30 天未确认才下架；确认在售不会改变商品排序。'],
      ['弱网操作更可靠', '完善请求超时、异常返回和评论重试去重，优化搜索栏及登录输入体验。']
    ],
    '1.1.8': [
      ['咨询码查找商品', '在龟集市搜索框粘贴商品咨询码，或整段咨询内容，查找对应在售商品；同码商品会全部展示供核对。'],
      ['品种旁显示公母', '单只乌龟在品种旁显示“公”或“母”，未知性别和批次不增加性别标记。'],
      ['提醒跟随有效档案', '关联档案已删除的提醒不再显示，残留的成长提醒也可取消；普通未关联档案的养护提醒保留。']
    ],
    '1.1.7': [
      ['新增忘记密码', '在登录页点击“忘记密码？”，通过注册手机号接收短信验证码设置新密码，原有记录保留。'],
      ['养护记录更清晰', '喂食、换水、手动记录直接可达，历史按日期归组。点击每条记录右上角的“•••”，即可编辑或删除。'],
      ['提醒时间一目了然', '时间、重复周期和通知状态分开展示，调整与移除统一放在“更多”中。'],
      ['新增独立搜索页', '龟集市与龟友圈支持历史搜索和推荐品种，根据养龟、收藏、浏览与搜索记录提供推荐。'],
      ['常用页面更整齐', '优化看板、档案、账本、繁殖、消息和空间布局，龟友圈发帖入口更直接，关键信息更容易查看。'],
      ['查找与历史查看更顺手', '成长记录分批展示，全部历史可继续查看；集市无搜索结果时可清除筛选，品种导航与报表显示更清晰。']
    ],
    '1.1.6': [
      ['新增温度提醒', '在「日常养护 → 温度提醒」设置养龟地点、温度和温差，可选择当天或提前1～7天，在每天设定的时间提醒低温。'],
      ['提醒设置更清晰', '地点说明、搜索和提醒条件重新排版，填写和操作更方便。']
    ]
  };
  const key = 'turtlekeeper-release-notes-seen-version';
  let context, dialog, observer, queued = false, cancelled = false, memorySeen = '';
  let previousFocus;
  function hasPending() {
    if (!context || cancelled || !releases[context.version] || memorySeen === context.version) return false;
    try { return localStorage.getItem(key) !== context.version; } catch { return true; }
  }
  function removeDialog() {
    if (!dialog) return;
    document.removeEventListener('keydown', keyboard);
    dialog.remove(); dialog = null;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  function stopWatching() {
    observer?.disconnect(); observer = null;
    document.removeEventListener('visibilitychange', reconsider);
  }
  function acknowledge() {
    memorySeen = context.version;
    try { localStorage.setItem(key, context.version); } catch { /* This runtime still remembers acknowledgment. */ }
    stopWatching(); removeDialog();
  }
  function cancel() { cancelled = true; stopWatching(); removeDialog(); }
  function keyboard(event) {
    if (!dialog) return;
    if (event.key === 'Escape') { event.preventDefault(); acknowledge(); return; }
    if (event.key !== 'Tab') return;
    const controls = dialog.querySelectorAll('button');
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function blocked() {
    return document.hidden || context.blocked?.() || Boolean([...document.querySelectorAll('[aria-modal="true"], .modal-overlay, .trade-guide, .trade-intro')]
      .some(node => !dialog?.contains(node) && node !== dialog && node.getClientRects().length));
  }
  function show() {
    if (!hasPending()) { stopWatching(); return; }
    if (blocked()) { removeDialog(); return; }
    if (dialog?.isConnected) return;
    previousFocus = document.activeElement;
    window.dismissTradeIntro?.();
    dialog = document.createElement('div');
    dialog.className = 'release-notes-overlay';
    const panel = document.createElement('section');
    panel.className = 'release-notes-dialog';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'releaseNotesTitle');
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'release-notes-close'; close.setAttribute('aria-label', '关闭更新说明'); close.textContent = '×'; close.onclick = acknowledge;
    const version = document.createElement('p'); version.className = 'release-notes-version'; version.textContent = '龟友手账 ' + context.version;
    const title = document.createElement('h2'); title.id = 'releaseNotesTitle'; title.textContent = '这次更新了什么';
    const list = document.createElement('ul');
    for (const [heading, description] of releases[context.version]) {
      const item = document.createElement('li'), h3 = document.createElement('h3'), p = document.createElement('p');
      h3.textContent = heading; p.textContent = description; item.append(h3, p); list.append(item);
    }
    const done = document.createElement('button'); done.type = 'button'; done.className = 'release-notes-done'; done.textContent = '我知道了'; done.onclick = acknowledge;
    panel.append(close, version, title, list, done); dialog.append(panel); document.body.append(dialog);
    document.addEventListener('keydown', keyboard); done.focus({ preventScroll: true });
  }
  function reconsider() {
    if (queued) return;
    queued = true; queueMicrotask(() => { queued = false; show(); });
  }
  function start(options) {
    context = options; cancelled = Boolean(location.search || location.hash || context.cancelled?.());
    if (!hasPending()) return false;
    observer = new MutationObserver(reconsider);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden'] });
    document.addEventListener('visibilitychange', reconsider);
    show(); return hasPending();
  }
  window.TurtleReleaseNotes = { start, hasPending, cancel };
})();
