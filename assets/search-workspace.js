(function () {
  'use strict';
  const LIMIT = 12;
  let owner = '', ownerSession = '', source = 'market', query = '', submitted = false, loading = false;
  let results = [], error = '', batch = 0, serial = 0, revision = 0;
  const account = () => String(state.loggedInPhone || 'guest');
  const session = () => `${account()}:${state.cloudToken || ''}`;
  const clean = value => String(value || '').trim().slice(0, 60);
  const key = () => `turtlekeeper-search-history-v1:${encodeURIComponent(account())}:${source}`;
  function reset() {
    owner = account(); ownerSession = session(); source = 'market'; query = ''; submitted = loading = false;
    results = []; error = ''; batch = 0; serial++; revision++;
  }
  function ensureOwner() { if (owner !== account() || ownerSession !== session()) reset(); }
  function history() {
    try {
      const saved = JSON.parse(localStorage.getItem(key()) || '[]');
      const seen = new Set();
      return (Array.isArray(saved) ? saved : []).filter(item => {
        if (!item || typeof item.query !== 'string' || !clean(item.query)) return false;
        const term = clean(item.query).toLocaleLowerCase();
        if (seen.has(term)) return false;
        seen.add(term); return true;
      }).slice(0, LIMIT).map(item => ({ query: clean(item.query), code: typeof item.code === 'string' ? item.code.slice(0, 80) : '' }));
    } catch { return []; }
  }
  function remember(term, code = '') {
    const items = [{ query: term, code }, ...history().filter(item => item.query.toLocaleLowerCase() !== term.toLocaleLowerCase())].slice(0, LIMIT);
    try { localStorage.setItem(key(), JSON.stringify(items)); }
    catch { toast('本机空间不足，本次搜索历史未保存'); }
    revision++;
  }
  function recommended() {
    const list = accountSpeciesList().filter(item => source !== 'market' || !isMarketProhibitedSpecies(item));
    const ranking = new Map(list.map((item, index) => [item.code, { item, score: 0, reason: '品种图鉴', index }]));
    const add = (code, score, reason) => {
      const entry = ranking.get(code); if (!entry) return;
      if (score > entry.score) entry.reason = reason;
      entry.score += score;
    };
    (state.keptSpecies || []).forEach(code => add(code, 10, '常用品种'));
    const owned = new Set((state.turtles || []).filter(turtle => TurtleBatches.isActive(turtle)).map(turtle => turtle.speciesCode));
    owned.forEach(code => add(code, 60, '你在饲养'));
    const favorites = new Set((state.marketFavoriteIds || []).map(String));
    const browsed = new Set((state.marketHistoryIds || []).map(String));
    const listings = new Map([...(state.marketListings || []), ...(state.myMarketListings || []), ...(state.selectedMarketListing ? [state.selectedMarketListing] : [])].map(item => [String(item.id), item]));
    const favoriteSpecies = new Set(), browsedSpecies = new Set();
    listings.forEach((item, id) => {
      if (favorites.has(id)) favoriteSpecies.add(item.speciesCode);
      if (browsed.has(id)) browsedSpecies.add(item.speciesCode);
    });
    favoriteSpecies.forEach(code => add(code, 35, '你曾收藏'));
    browsedSpecies.forEach(code => add(code, 15, '你曾浏览'));
    history().forEach((entry, index) => {
      const exact = ranking.has(entry.code) ? entry.code : speciesByImportName(entry.query)?.code;
      if (exact) add(exact, 40 - index, '最近搜索');
    });
    // With no personal signals, show catalogue examples without invented popularity.
    ['GHG', 'HMG', 'TBG', 'AMBKG', 'JQG', 'XSG'].forEach((code, index) => add(code, 1 - index / 10, '品种图鉴'));
    return [...ranking.values()].sort((a, b) => b.score - a.score || a.index - b.index);
  }
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>';
  function landing() {
    const items = history(), ranked = recommended();
    const start = ranked.length > 8 ? batch * 8 % ranked.length : 0;
    const cards = [...ranked.slice(start), ...ranked.slice(0, start)].slice(0, 8);
    return `<section class="search-history" aria-labelledby="searchHistoryTitle"><header><h2 id="searchHistoryTitle">历史搜索</h2>${items.length ? '<button type="button" class="search-clear-history" data-clear-search-history aria-label="清空搜索历史">清空</button>' : ''}</header>
      ${items.length ? `<div class="search-history-chips">${items.map((item, index) => `<button type="button" data-search-history="${index}">${escapeHtml(item.query)}</button>`).join('')}</div>` : '<p class="search-empty-history">搜索过的关键词会出现在这里</p>'}</section>
      <section class="search-discovery" aria-labelledby="searchDiscoveryTitle"><header><div><h2 id="searchDiscoveryTitle">推荐品种</h2><p>${ranked.some(entry => entry.score >= 10) ? '根据你的养龟、收藏和搜索记录推荐' : '从这些品种开始看看'}</p></div>${ranked.length > 8 ? '<button type="button" class="search-refresh" data-refresh-search-recommendations>换一批</button>' : ''}</header>
        <div class="search-species-grid">${cards.map(({ item, reason }) => `<button type="button" class="search-species-card" data-search-species="${escapeHtml(item.code)}"><img src="${escapeHtml(speciesPhoto(item))}" alt="" loading="lazy" data-fallback-photo><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(reason)}</small></button>`).join('')}</div>
      </section>`;
  }
  function suggestions() {
    const matches = marketPublishSpeciesMatches(query).filter(item => source !== 'market' || !isMarketProhibitedSpecies(item)).slice(0, 8);
    return `<section class="search-suggestion-list" aria-label="搜索建议"><button type="button" data-search-current>${icon}<span>搜索「${escapeHtml(query)}」</span></button>${matches.map(item => `<button type="button" data-search-species="${escapeHtml(item.code)}">${icon}<span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.code)}</small></button>`).join('')}</section>`;
  }
  function resultMarkup() {
    if (loading) return '<div class="search-feedback" role="status">正在搜索相关帖子…</div>';
    return `<section class="search-result-list" aria-label="搜索结果"><header><h2>相关帖子</h2><span>${results.length} 条</span></header>
      ${error ? `<div class="search-feedback" role="status"><p>${escapeHtml(error)}</p><button type="button" data-retry-workspace-search>重试</button></div>` : ''}
      ${results.map(post => {
        const media = communityPostMediaItems(post)[0];
        return `<button type="button" data-search-post="${escapeHtml(post.id)}"><div><strong>${escapeHtml(communityPostTitle(post))}</strong><p>${escapeHtml(String(post.content || post.question || '').replace(/\s+/g, ' ').slice(0, 100))}</p><small>${escapeHtml(post.authorName || '龟友')}</small></div>${media?.url ? `<img src="${escapeHtml(media.posterUrl || media.poster || media.url)}" alt="" loading="lazy" data-fallback-photo>` : ''}</button>`;
      }).join('') || '<div class="search-feedback"><strong>没有找到相关内容</strong><p>试试品种名称或其他关键词</p></div>'}</section>`;
  }
  function body() { return query ? (submitted && source === 'community' ? resultMarkup() : suggestions()) : landing(); }
  function renderPage() {
    ensureOwner();
    return `${topbar(source === 'market' ? '搜索商品' : '搜索龟友圈', true)}<form class="search-workspace-form" role="search" data-workspace-search-form>
      <label class="search-workspace-control">${icon}<input type="search" name="workspaceQuery" maxlength="60" value="${escapeHtml(query)}" placeholder="${source === 'market' ? '搜索品种、标题或城市' : '搜索帖子、品种或龟友'}" aria-label="${source === 'market' ? '搜索龟集市商品' : '搜索龟友圈'}" autocomplete="off" enterkeyhint="search" data-workspace-search><button type="button" data-clear-workspace-search aria-label="清除关键词" ${query ? '' : 'hidden'}>×</button></label>
      <button type="submit" class="search-workspace-submit">搜索</button></form><main class="content search-workspace"><div data-workspace-search-body>${body()}</div></main>`;
  }
  function refreshBody() {
    if (state.page !== 'search' || owner !== account() || ownerSession !== session()) return;
    const target = document.querySelector('[data-workspace-search-body]');
    if (!target) return;
    target.innerHTML = body(); bindBody(target); window.TurtleUI?.enhance(target); hydrateSpeciesImages();
  }
  function open(kind = 'market') {
    reset(); source = kind === 'community' ? 'community' : 'market';
    setState({ page: 'search' }, { skipCloud: true });
    document.querySelector('[data-workspace-search]')?.focus({ preventScroll: true });
  }
  async function submit(value = query, code = '', rememberHistory = true) {
    if (state.page !== 'search' || owner !== account() || ownerSession !== session()) return;
    const term = clean(value); if (!term) return;
    if (loading && query === term) return;
    query = term; if (rememberHistory) remember(term, code);
    const input = document.querySelector('[data-workspace-search]');
    if (input) { input.value = term; input.blur(); }
    if (source === 'market') {
      navigateBack();
      if (state.page !== 'market') setState({ page: 'market' }, { skipCloud: true, skipEdgeSnapshot: true });
      const patch = { marketSearch: term, marketAssistMenu: '' };
      if (hasCloudSession()) resetMarketFeed(patch);
      else setState({ ...patch, marketFeedGeneration: (state.marketFeedGeneration || 0) + 1 }, { skipCloud: true });
      return;
    }
    const request = ++serial, auth = session();
    submitted = loading = true; results = []; error = ''; revision++; refreshBody();
    const current = () => request === serial && auth === session() && owner === account() && state.page === 'search' && query === term;
    try {
      const response = CONFIGURED_SMS_BACKEND ? await apiPost('/api/community/search', communityAuthPayload({ query: term })) : { posts: localCommunitySearch(term) };
      if (!current()) return;
      results = normalizeCommunityPosts(response.posts || []).slice(0, 20);
    } catch {
      if (!current()) return;
      results = localCommunitySearch(term);
      error = '网络暂时不可用，以下为本机已加载内容';
    } finally {
      if (current()) { loading = false; revision++; refreshBody(); }
    }
  }
  function bindBody(root) {
    root.querySelector('[data-clear-search-history]')?.addEventListener('click', () => {
      if (state.page !== 'search' || !root.isConnected || owner !== account()) return;
      if (!confirm(`清空本机当前账号的${source === 'market' ? '商品' : '龟友圈'}搜索历史？`)) return;
      try { localStorage.removeItem(key()); revision++; refreshBody(); }
      catch { toast('搜索历史清空失败，请重试'); }
    });
    root.querySelector('[data-refresh-search-recommendations]')?.addEventListener('click', () => { if (root.isConnected && state.page === 'search') { batch++; revision++; refreshBody(); } });
    root.querySelectorAll('[data-search-history]').forEach(button => button.addEventListener('click', () => {
      if (!root.isConnected || state.page !== 'search') return;
      const item = history()[Number(button.dataset.searchHistory)]; if (item) void submit(item.query, item.code);
    }));
    root.querySelectorAll('[data-search-species]').forEach(button => button.addEventListener('click', () => {
      if (!root.isConnected || state.page !== 'search') return;
      const item = speciesByCode(button.dataset.searchSpecies); if (item) void submit(item.name, item.code);
    }));
    root.querySelector('[data-search-current]')?.addEventListener('click', () => { if (root.isConnected) void submit(); });
    root.querySelector('[data-retry-workspace-search]')?.addEventListener('click', () => { if (root.isConnected) void submit(query, '', false); });
    root.querySelectorAll('[data-search-post]').forEach(button => button.addEventListener('click', () => {
      if (!root.isConnected || state.page !== 'search' || owner !== account()) return;
      const post = results.find(item => String(item.id) === button.dataset.searchPost); if (!post) return;
      setState({ communityPosts: [post, ...(state.communityPosts || []).filter(item => String(item.id) !== String(post.id))], page: 'communityPostDetail', selectedCommunityPostId: post.id, openCommunityActionId: '', communityCommentPostId: '' }, { skipCloud: true });
    }));
  }
  function bind() {
    document.querySelectorAll('[data-open-search]').forEach(button => {
      if (button.__searchEntryBound) return; button.__searchEntryBound = true;
      button.addEventListener('click', () => { if (button.isConnected) open(button.dataset.openSearch); });
    });
    const form = document.querySelector('[data-workspace-search-form]');
    if (!form || form.__workspaceSearchBound) return; form.__workspaceSearchBound = true;
    const input = form.querySelector('[data-workspace-search]'); let composing = false;
    const update = () => {
      if (!form.isConnected || state.page !== 'search' || owner !== account()) return;
      query = clean(input.value); submitted = loading = false; results = []; error = ''; serial++; revision++;
      form.querySelector('[data-clear-workspace-search]').hidden = !input.value;
      if (!composing) refreshBody();
    };
    input.addEventListener('input', update);
    input.addEventListener('compositionstart', () => { composing = true; serial++; });
    input.addEventListener('compositionend', () => { composing = false; update(); });
    form.addEventListener('submit', event => { event.preventDefault(); if (!composing && !event.isComposing && form.isConnected) void submit(input.value); });
    form.querySelector('[data-clear-workspace-search]').addEventListener('click', () => { input.value = ''; composing = false; update(); input.focus({ preventScroll: true }); });
    bindBody(document.querySelector('[data-workspace-search-body]'));
  }
  function leave() {
    serial++;
    if (loading) { loading = false; submitted = false; results = []; revision++; }
  }
  window.TurtleSearch = { open, render: renderPage, bind, reset, leave, source: () => source, signature: () => `${source}:${query}:${revision}` };
})();
