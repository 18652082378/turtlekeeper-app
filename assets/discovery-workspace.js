(function () {
  'use strict';
  // Discovery uses the signed-in account's existing records. Nothing is posted,
  // subscribed or fetched until a person explicitly chooses an action.
  const prompts = {
    habitat: { label: '晒龟池', topic: 'daily', circleId: 'habitat', title: '分享我的龟池布置', content: '饲养品种：\n龟池尺寸与水深：\n过滤和晒台：\n想和大家交流的地方：' },
    feeding: { label: '聊喂食', topic: 'daily', circleId: 'general', title: '聊聊大家的日常喂食', content: '饲养品种与大小：\n常用食物：\n喂食频率：\n想请教大家：' },
    breeding: { label: '晒孵化', topic: 'daily', circleId: 'breeding', title: '记录这一次孵化过程', content: '繁殖品种：\n产蛋或出壳日期：\n孵化环境：\n这次观察到的变化：' },
    identify: { label: '求鉴定', topic: 'identify', circleId: 'identify', title: '请龟友帮忙看看品种', content: '目前体重和背甲长度：\n我观察到的特征：\n希望确认的问题：\n（可添加清晰的背甲、腹甲和头部照片）' },
    question: { label: '问养护', topic: 'question', circleId: 'health', title: '想请教一个养护问题', content: '饲养品种与大小：\n环境与水温：\n饮食和日常状态：\n问题出现的时间与变化：\n已采取的措施：' }
  };
  let templateContent = '';
  const resetDraft = () => { templateContent = ''; };
  const canPublishDraft = () => !templateContent || Boolean(communityDraftText.trim() && communityDraftText.trim() !== templateContent.trim());
  const interestKey = () => `turtlekeeper-market-interests-v1:${encodeURIComponent(state.loggedInPhone || 'guest')}`;
  function marketInterests() {
    try {
      const saved = JSON.parse(localStorage.getItem(interestKey()) || '{}');
      const codes = list => new Set(Array.isArray(list) ? list.filter(code => typeof code === 'string').map(speciesCodeKey) : []);
      return { added: codes(saved?.added), removed: codes(saved?.removed) };
    } catch { return { added: new Set(), removed: new Set() }; }
  }
  function speciesEntries(kind) {
    const entries = new Map();
    const add = (code, reason) => {
      const item = speciesByCode(code);
      if (!item || (entries.has(item.code) && entries.get(item.code).reason !== '品种图鉴') || (kind === 'market' && isMarketProhibitedSpecies(item))) return;
      entries.set(item.code, { item, reason });
    };
    (state.turtles || []).filter(item => TurtleBatches.isActive(item)).forEach(item => add(item.speciesCode, '在养'));
    (state.keptSpecies || []).forEach(code => add(code, '常用'));
    const interests = kind === 'market' ? marketInterests() : null;
    if (interests) {
      const favorites = new Set((state.marketFavoriteIds || []).map(String));
      if (favorites.size) (state.marketListings || []).forEach(item => { if (favorites.has(String(item.id))) add(item.speciesCode, '收藏'); });
    }
    const personal = entries.size > 0;
    if (!personal) ['GHG', 'HMG', 'TBG', 'AMBKG'].forEach(code => add(code, '品种图鉴'));
    interests?.added.forEach(code => add(code, '关注'));
    interests?.removed.forEach(code => entries.delete(code));
    return { personal, entries: kind === 'market' ? [...entries.values()] : [...entries.values()].slice(0, 4) };
  }
  function marketInterestCodes() {
    return speciesEntries('market').entries.filter(({ reason }) => reason !== '品种图鉴').map(({ item }) => item.code);
  }
  function speciesMarkup(kind) {
    const { personal, entries } = speciesEntries(kind);
    const chips = entries.map(({ item, reason }) => `<button type="button" data-discovery-species="${escapeHtml(item.code)}" data-discovery-source="${kind}"><span class="discovery-species-name">${escapeHtml(item.name)}</span>${reason === '品种图鉴' ? '' : `<small>${reason}</small>`}</button>`).join('');
    if (kind === 'market') return `<div class="discovery-species" aria-label="按品种找龟"><div class="discovery-species-header"><span>你感兴趣的品种</span><button type="button" data-discovery-manage>管理品种</button></div>${chips ? `<div class="discovery-species-chips">${chips}</div>` : '<p class="discovery-interest-empty">暂无感兴趣的品种，可在管理品种中添加。</p>'}</div>`;
    if (!entries.length) return '';
    return `<div class="discovery-species" aria-label="按品种找龟友"><span>${personal ? '你感兴趣的品种' : '从品种开始看看'}</span><div class="discovery-species-chips">${chips}</div></div>`;
  }
  function communityEntry() {
    return `<section class="discovery-community-entry">${speciesMarkup('community')}</section>`;
  }
  function marketEntry() {
    return `<section class="discovery-market-entry">${speciesMarkup('market')}<div class="discovery-market-links"><button type="button" data-page="marketFavorites">我的收藏 <span aria-hidden="true">›</span></button><button type="button" data-page="marketMy">我发布的 <span aria-hidden="true">›</span></button><button type="button" data-page="marketAlerts">上新提醒 <span aria-hidden="true">›</span></button></div></section>`;
  }
  function patchMarketEntry(root) {
    const current = root.querySelector('.discovery-market-entry .discovery-species');
    if (!current) return;
    const template = document.createElement('template'); template.innerHTML = speciesMarkup('market');
    const next = template.content.firstElementChild;
    if (next && !current.isEqualNode(next)) current.replaceWith(next);
  }
  function interestSelection(entries) {
    return entries.map(({ item, reason }) => `<button type="button" data-discovery-interest-remove="${escapeHtml(item.code)}" aria-label="移除${escapeHtml(item.name)}"><span>${escapeHtml(item.name)} <small>${reason}</small></span><span aria-hidden="true">×</span></button>`).join('') || '<p class="discovery-interest-empty">暂无感兴趣的品种。</p>';
  }
  function interestChoices(codes, query = '') {
    const selected = new Set(codes);
    const term = query.trim().toLowerCase();
    return accountSpeciesList().filter(item => !selected.has(item.code) && !isMarketProhibitedSpecies(item) && speciesCatalogKeywords(item).includes(term))
      .map(item => `<button type="button" data-discovery-interest-add="${escapeHtml(item.code)}" aria-label="添加${escapeHtml(item.name)}"><span>${escapeHtml(item.name)}</span><span aria-hidden="true">＋</span></button>`).join('') || '<p class="discovery-interest-empty">没有可添加的匹配品种。</p>';
  }
  function marketInterestPage() {
    const { entries } = speciesEntries('market');
    return `${topbar('感兴趣的品种', true)}<main class="content market-alert-page market-interest-page">
      <section class="fresh-card"><h2>当前品种</h2><p class="market-alert-muted">添加或移除龟集市首页的快捷品种。本机按账号保存，上新提醒可单独设置。</p><div class="discovery-interest-list" data-discovery-interest-selected>${interestSelection(entries)}</div></section>
      <section class="fresh-card"><h2>添加品种</h2><label class="market-alert-search">查找品种<input type="search" data-discovery-interest-search maxlength="60" placeholder="输入品种名称或代码" autocomplete="off"></label><div class="discovery-interest-list" data-discovery-interest-choices>${interestChoices(entries.map(({ item }) => item.code))}</div></section>
    </main>`;
  }
  function changeMarketInterest(page, code, adding) {
    const item = speciesByCode(code);
    if (!item || isMarketProhibitedSpecies(item)) return;
    const { added, removed } = marketInterests();
    if (adding) { removed.delete(item.code); added.add(item.code); }
    else { added.delete(item.code); removed.add(item.code); }
    try { localStorage.setItem(interestKey(), JSON.stringify({ added: [...added], removed: [...removed] })); }
    catch { return toast('本机无法保存品种设置，请重试'); }
    const search = page.querySelector('[data-discovery-interest-search]');
    const { entries } = speciesEntries('market');
    page.querySelector('[data-discovery-interest-selected]').innerHTML = interestSelection(entries);
    page.querySelector('[data-discovery-interest-choices]').innerHTML = interestChoices(entries.map(({ item }) => item.code), search.value);
    toast(adding ? `已添加${item.name}` : `已移除${item.name}`);
  }
  function composePrompts() {
    const keys = communityDraftTopic === 'identify' ? ['identify'] : communityDraftTopic === 'question' ? ['question'] : communityDraftTopic === 'growth' ? [] : ['habitat', 'feeding', 'breeding'];
    if (!keys.length) return '';
    return `<section class="discovery-compose-prompts" aria-label="发帖灵感"><span>不知道写什么？用提纲起个头</span><div>${keys.map(key => `<button type="button" data-discovery-prompt="${key}">${prompts[key].label}</button>`).join('')}</div><small>提纲可自由修改，写你自己的真实情况即可。</small></section>`;
  }
  function archivePhoto() {
    if (communityDraftTopic !== 'growth') return '';
    const turtle = (state.turtles || []).find(item => item.id === communityDraftTurtleId);
    const photo = String(turtle?.photo || '').trim();
    if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(photo)) return photo;
    try {
      const url = new URL(photo, location.href);
      if (/^https?:$/.test(url.protocol) && !url.pathname.includes('/assets/') && (photo.startsWith('/uploads/') || /^https?:\/\//.test(photo))) return photo;
    } catch { /* A bundled default or invalid photo is not a user's real photo. */ }
    return '';
  }
  function archivePhotoChoice() {
    const photo = archivePhoto();
    if (!photo) return '';
    const included = communityDraftMediaItems.some(item => item.archiveSource === photo);
    const full = communityDraftMediaItems.length >= 9;
    return `<div class="discovery-archive-photo"><span>本次档案照片可单独选择加入</span><button type="button" data-discovery-archive-photo ${included || full ? 'disabled' : ''}>${included ? '已加入，可在上方移除' : full ? '图片已满（9张）' : '加入档案实拍'}</button></div>`;
  }
  function communityEmpty() {
    const filtered = communitySelectedCircleId !== 'all' || communityForumSort !== 'latest';
    const pending = communityForumSort === 'unanswered';
    return `<div class="empty small-empty discovery-empty"><div><strong>${pending ? '已加载内容里暂时没有待回复的求助' : filtered ? '当前分类还没有帖子' : '从第一篇真实分享开始'}</strong><p>${pending && state.communityFeedHasMore ? '可以继续向下浏览，加载更多帖子。' : '晒一张照片，或讲讲你的养龟经验。'}</p><button type="button" ${filtered ? 'data-discovery-all-posts' : 'data-discovery-new-post'}>${filtered ? '看看全部帖子' : '分享我的养龟日常'}</button></div></div>`;
  }
  function usePrompt(key) {
    const prompt = prompts[key];
    if (!prompt || state.page !== 'communityAdd' || communityPublishInFlight) return;
    if (communityDraftText.trim() && !confirm('使用提纲会替换当前正文，是否继续？标题、图片和展示范围会保留。')) return;
    communityDraftTopic = prompt.topic; communityDraftCircleId = prompt.circleId;
    communityDraftText = templateContent = prompt.content;
    if (!communityDraftTitle.trim()) communityDraftTitle = prompt.title;
    render();
  }
  function bind() {
    if (document.__discoveryBound) return;
    document.__discoveryBound = true;
    document.addEventListener('input', event => {
      if (state.page !== 'marketInterests' || !event.target.matches('[data-discovery-interest-search]')) return;
      const page = event.target.closest('.market-interest-page');
      const codes = [...page.querySelectorAll('[data-discovery-interest-remove]')].map(button => button.dataset.discoveryInterestRemove);
      page.querySelector('[data-discovery-interest-choices]').innerHTML = interestChoices(codes, event.target.value);
    });
    document.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !button.isConnected) return;
      if (button.hasAttribute('data-discovery-manage') && state.page === 'market') {
        setState({ page: 'marketInterests' }, { skipSave: true, skipCloud: true });
      } else if (state.page === 'marketInterests' && (button.dataset.discoveryInterestAdd || button.dataset.discoveryInterestRemove)) {
        const page = button.closest('.market-interest-page');
        changeMarketInterest(page, button.dataset.discoveryInterestAdd || button.dataset.discoveryInterestRemove, Boolean(button.dataset.discoveryInterestAdd));
      } else if (button.hasAttribute('data-discovery-species')) {
        const item = speciesByCode(button.dataset.discoverySpecies); if (!item) return;
        if (button.dataset.discoverySource === 'community') void TurtleSearch.search('community', item.name, item.code);
        else {
          const patch = { marketSearch: item.name, marketStage: 'all', marketRegion: '', marketPriceOrder: '', marketFreshOnly: false, marketDelivery: '', marketAssistMenu: '' };
          pendingPageScrollReset = true;
          if (hasCloudSession()) resetMarketFeed(patch);
          else setState({ ...patch, marketFeedSessionId: '', marketFeedOrderIds: [] }, { skipCloud: true });
        }
      } else if (button.hasAttribute('data-discovery-prompt')) usePrompt(button.dataset.discoveryPrompt);
      else if (button.hasAttribute('data-community-growth-source')) {
        const turtle = (state.turtles || []).find(item => item.id === button.dataset.communityGrowthSource);
        if (turtle) openCommunityComposer('growth', { turtleId: turtle.id });
      } else if (button.hasAttribute('data-discovery-archive-photo')) {
        const photo = archivePhoto();
        if (!photo || communityDraftMediaItems.length >= 9 || communityDraftMediaItems.some(item => item.archiveSource === photo)) return;
        communityDraftMediaItems.push({ archiveSource: photo, previewUrl: photo, type: 'image', duration: 0 });
        syncCommunityDraftMediaLegacyState(); render();
      } else if (button.hasAttribute('data-discovery-all-posts')) {
        communitySelectedCircleId = 'all'; communityForumSort = 'latest'; render();
      } else if (button.hasAttribute('data-discovery-new-post')) openCommunityComposer('daily');
    });
  }
  window.TurtleDiscovery = { communityEntry, marketEntry, marketInterestPage, marketInterestCodes, patchMarketEntry, composePrompts, archivePhotoChoice, communityEmpty, bind, resetDraft, canPublishDraft };
})();
