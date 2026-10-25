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
  function speciesEntries(kind) {
    const entries = new Map();
    const add = (code, reason) => {
      const item = speciesByCode(code);
      if (!item || entries.has(item.code) || (kind === 'market' && isMarketProhibitedSpecies(item))) return;
      entries.set(item.code, { item, reason });
    };
    (state.turtles || []).filter(item => TurtleBatches.isActive(item)).forEach(item => add(item.speciesCode, '在养'));
    (state.keptSpecies || []).forEach(code => add(code, '常用'));
    if (kind === 'market') {
      const favorites = new Set((state.marketFavoriteIds || []).map(String));
      (state.marketListings || []).forEach(item => { if (favorites.has(String(item.id))) add(item.speciesCode, '收藏'); });
    }
    const personal = entries.size > 0;
    if (!personal) ['GHG', 'HMG', 'TBG', 'AMBKG'].forEach(code => add(code, '品种图鉴'));
    return { personal, entries: kind === 'market' ? [...entries.values()] : [...entries.values()].slice(0, 4) };
  }
  function speciesMarkup(kind) {
    const { personal, entries } = speciesEntries(kind);
    if (!entries.length) return '';
    return `<div class="discovery-species" aria-label="${kind === 'market' ? '按品种找龟' : '按品种找龟友'}"><span>${personal ? '你感兴趣的品种' : '从品种开始看看'}</span><div class="discovery-species-chips">${entries.map(({ item, reason }) => `<button type="button" data-discovery-species="${escapeHtml(item.code)}" data-discovery-source="${kind}"><span class="discovery-species-name">${escapeHtml(item.name)}</span>${personal ? `<small>${reason}</small>` : ''}</button>`).join('')}</div></div>`;
  }
  function communityEntry() {
    return `<section class="discovery-community-entry">${speciesMarkup('community')}</section>`;
  }
  function marketEntry() {
    return `<section class="discovery-market-entry">${speciesMarkup('market')}<div class="discovery-market-links"><button type="button" data-page="marketFavorites">我的收藏 <span aria-hidden="true">›</span></button><button type="button" data-page="marketMy">我发布的 <span aria-hidden="true">›</span></button></div></section>`;
  }
  function patchMarketEntry(root) {
    const current = root.querySelector('.discovery-market-entry .discovery-species');
    if (!current) return;
    const template = document.createElement('template'); template.innerHTML = speciesMarkup('market');
    const next = template.content.firstElementChild;
    if (next && !current.isEqualNode(next)) current.replaceWith(next);
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
    document.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !button.isConnected) return;
      if (button.hasAttribute('data-discovery-species')) {
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
  window.TurtleDiscovery = { communityEntry, marketEntry, patchMarketEntry, composePrompts, archivePhotoChoice, communityEmpty, bind, resetDraft, canPublishDraft };
})();
