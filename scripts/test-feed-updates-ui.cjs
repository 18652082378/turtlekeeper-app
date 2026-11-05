'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..'), platform = process.env.MOBILE_UI_PLATFORM || 'web';
const assetRoot = platform === 'ios' ? path.join(root, 'ios/App/App/public') : platform === 'android' ? path.join(root, 'android/app/src/main/assets/public') : root;
const local = process.argv.includes('--local-preview');
const localIndex = 'C:/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app/index.html';
(async () => {
  const browser = await launchBrowser(), page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/config.js')) return route.fulfill({ body: 'window.TURTLE_API_BASE_URL="";', contentType: 'text/javascript' });
    if (local && url.protocol === 'file:') return route.continue();
    if (url.hostname !== 'updates.test') return route.abort();
    const file = path.resolve(assetRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(assetRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };
    return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
  });
  try {
    await page.goto(local ? pathToFileURL(localIndex).href : 'https://updates.test/');
    await page.evaluate(() => {
      dismissTradeIntro?.(); TurtleReleaseNotes?.cancel(); hasCloudSession = () => false;
      window.seedPost = id => ({ id, authorId: 'writer', authorName: '龟友', title: '养龟日常 ' + id, content: '记录真实养龟生活，分享观察。'.repeat(8),
        circleId: 'mud', topic: 'daily', createdAt: '2026-11-01', comments: [], mediaItems: [] });
      const cached = Array.from({ length: 12 }, (_, index) => seedPost('cached-' + index));
      state = { ...initialState, ...emptyAccountData(), loggedInPhone: 'updates-fixture', cloudToken: 'fixture-token', policyConsentRequired: false,
        page: 'community', communityPosts: cached, communityFeedInitialized: true, communityFeedNextOffset: 12, communityFeedHasMore: false,
        communityFriends: [], messageUnreadCount: 9 };
      forceUpdateState = { required: false }; render();
      window.oldCard = document.querySelector('[data-community-feed-card="cached-0"]');
      window.postResponse = { posts: [seedPost('new-post'), ...cached.slice(0, 2)], nextOffset: 3, hasMore: false, isAdmin: false };
      window.calls = [];
      apiPost = async (url, body) => { calls.push({ url, body }); return url === '/api/community/list' ? postResponse : { ok: true, items: [] }; };
      hasCloudSession = () => true;
      communityLastLoadedAt = 0;
      scrollTo(0, 300); window.beforeY = scrollY;
    });
    const notice = () => page.locator('[data-feed-update-notice]');
    await page.evaluate(async () => {
      const newPostResponse = postResponse;
      postResponse = { posts: communityForumPosts(state.communityPosts).slice(0, 3), nextOffset: 3, hasMore: true };
      await refreshCommunity();
      await new Promise(resolve => requestAnimationFrame(resolve));
      postResponse = newPostResponse;
    });
    assert.equal(await notice().count(), 0, 'A matching first page with more results does not announce the already loaded tail as new content');
    assert.equal(await page.locator('[data-community-feed-card]').count(), 12, 'A matching first-page check retains every loaded card');
    assert.equal(await page.evaluate(() => state.communityFeedNextOffset), 12, 'A matching first-page check retains the cursor for those loaded cards');
    await page.evaluate(async () => { communityLastLoadedAt = 0; await refreshCommunity(); });
    await notice().waitFor();
    assert.match(await notice().innerText(), /1 条新作品/);
    assert.equal(await page.locator('[data-community-feed-card="new-post"]').count(), 0);
    assert.equal(await page.evaluate(() => oldCard === document.querySelector('[data-community-feed-card="cached-0"]')), true);
    assert.equal(await page.evaluate(() => scrollY === beforeY), true, 'Showing the floating notice does not shift the reading position');
    for (const width of [280, 390, 1180]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await notice().evaluate(button => { const box = button.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.height >= 44; }));
    }
    await page.evaluate(() => {
      window.previousNotice = document.querySelector('[data-feed-update-notice]');
      hasCloudSession = () => false;
      state.systemAnnouncements = [{ id: 'feed-prompt-test', title: '系统公告', content: '公告关闭前应暂停内容提示', status: 'active' }];
      render();
      previousNotice.click();
    });
    assert.equal(await notice().count(), 0, 'A new-content prompt never covers a blocking system announcement');
    assert.equal(await page.locator('[data-community-feed-card="new-post"]').count(), 0, 'An old detached button cannot update the list while a dialog is open');
    await page.locator('[data-dismiss-system-announcement="feed-prompt-test"]').click();
    await notice().waitFor();
    await page.evaluate(() => {
      state.systemAnnouncements = [];
      // Image previews are attached outside #app, so their close/open cycle
      // must also suspend and then restore the existing pending prompt.
      const overlay = document.createElement('div'); overlay.className = 'image-preview-overlay';
      overlay.dataset.feedPreviewFixture = ''; document.body.appendChild(overlay);
    });
    await notice().waitFor({ state: 'detached' });
    await page.evaluate(() => document.querySelector('[data-feed-preview-fixture]').remove());
    await notice().waitFor();
    await page.evaluate(() => {
      hasCloudSession = () => true;
      state.communityPosts = state.communityPosts.map(post => post.id === 'cached-0' ? { ...post, comments: [{ id: 'local-reply', content: '刚刚回复' }] } : post);
      state.messageUnreadCount = 11;
    });
    await notice().click();
    assert.equal(await page.locator('[data-community-feed-card="new-post"]').count(), 1);
    assert.equal(await page.evaluate(() => state.communityPosts.find(post => post.id === 'cached-0').comments[0].id), 'local-reply', 'Accepting a queued page retains comments changed since its request started');
    assert.equal(await page.evaluate(() => state.messageUnreadCount), 11, 'Queued content cannot restore an old unread count');
    assert.equal(await notice().count(), 0);
    await page.evaluate(async () => { postResponse = { posts: [seedPost('next-post'), seedPost('new-post')], nextOffset: 2, hasMore: false }; communityLastLoadedAt = 0; await refreshCommunity(); });
    await notice().waitFor();
    await page.evaluate(async () => { postResponse = { posts: [seedPost('manual-refresh')], nextOffset: 1, hasMore: false }; await refreshCommunity(true); });
    assert.equal(await notice().count(), 0, 'Manual refresh consumes the pending notice');
    assert.equal(await page.locator('[data-community-feed-card="manual-refresh"]').count(), 1);
    await page.evaluate(async () => {
      postResponse = { posts: [seedPost('older-pending'), seedPost('manual-refresh')], nextOffset: 2, hasMore: false };
      communityLastLoadedAt = 0; await refreshCommunity();
    });
    await notice().waitFor();
    await page.evaluate(async () => {
      hasCloudSession = () => false; state.page = 'messages'; render();
      postResponse = { posts: [seedPost('newer-off-page')], nextOffset: 1, hasMore: false };
      hasCloudSession = () => true; communityLastLoadedAt = 0; await refreshCommunity();
      hasCloudSession = () => false; state.page = 'community'; render();
    });
    assert.equal(await notice().count(), 0, 'A later immediate full snapshot invalidates the older queued page');
    assert.deepEqual(await page.evaluate(() => state.communityPosts.map(post => post.id)), ['newer-off-page'], 'Returning from messages cannot revive an older response');
    await page.evaluate(async () => {
      hasCloudSession = () => true;
      const originalApiPost = apiPost;
      let finish;
      const response = new Promise(resolve => { finish = resolve; });
      apiPost = async url => url === '/api/community/list' ? response : { ok: true, items: [] };
      const first = refreshCommunity(true);
      await refreshCommunity(true);
      finish({ posts: [seedPost('forced-page')], nextOffset: 1, hasMore: false });
      await first;
      apiPost = originalApiPost;
      postResponse = { posts: [seedPost('after-double-force')], nextOffset: 1, hasMore: false };
      communityLastLoadedAt = 0; await refreshCommunity();
    });
    await notice().waitFor();
    assert.equal(await page.locator('[data-community-feed-card="forced-page"]').count(), 1, 'Two explicit refreshes sharing a request do not bypass the next background notice');
    assert.equal(await page.locator('[data-community-feed-card="after-double-force"]').count(), 0);
    await notice().click();
    assert.equal(await page.locator('[data-community-feed-card="after-double-force"]').count(), 1);
    await page.evaluate(async () => { postResponse = { posts: [seedPost('private-pending')], nextOffset: 1, hasMore: false }; communityLastLoadedAt = 0; await refreshCommunity(); });
    await notice().waitFor();
    await page.evaluate(() => { hasCloudSession = () => false; setState({ loggedInPhone: 'another-account', cloudToken: 'another-token', page: 'home' }, { skipSave: true }); });
    assert.equal(await notice().count(), 0, 'Account/session changes discard private pending content');
    await page.evaluate(() => {
      hasCloudSession = () => false;
      state = { ...state, page: 'market', marketFeedError: 'load_failed', marketFeedInitialized: true, marketFeedSessionId: 'old-ranking', marketFeedNextOffset: 16, marketFeedHasMore: false,
        marketFeedOrderIds: ['old-listing', 'old-tail'], marketListings: [
          { id: 'old-listing', title: '已有商品', status: 'active', speciesCode: 'GHG', price: 100 },
          { id: 'old-tail', title: '已加载的下一页商品', status: 'active', speciesCode: 'GHG', price: 120 }
        ] };
      render();
      window.marketResponse = { listings: state.marketListings.slice(0, 1), rankingSession: 'head-check-ranking', nextOffset: 1, hasMore: true };
      apiPost = async () => marketResponse;
      hasCloudSession = () => true;
      feedEntryRefresh.market = { pending: true, at: 0, key: '' };
    });
    await page.evaluate(() => refreshMarket());
    assert.equal(await notice().count(), 0, 'A matching market first page does not announce the loaded tail as new');
    assert.equal(await page.locator('[data-view-market]').count(), 2, 'A matching market head retains the loaded page');
    assert.equal(await page.evaluate(() => state.marketFeedSessionId), 'old-ranking', 'A head-only check cannot replace the session for a retained tail');
    assert.equal(await page.evaluate(() => state.marketFeedNextOffset), 16);
    assert.equal(await page.evaluate(() => state.marketFeedError), '', 'A successful head check clears a previous request error while retaining the loaded pages');
    await page.evaluate(async () => {
      marketResponse = { listings: [{ id: 'new-listing', title: '新的商品', status: 'active', speciesCode: 'GHG', price: 150 }], rankingSession: 'new-ranking', nextOffset: 1, hasMore: false };
      feedEntryRefresh.market = { pending: true, at: 0, key: '' }; await refreshMarket();
    });
    await notice().waitFor();
    assert.equal(await page.locator('[data-view-market="old-listing"]').count(), 1);
    assert.equal(await page.evaluate(() => state.marketFeedNextOffset), 16);
    await notice().click();
    assert.equal(await page.locator('[data-view-market="new-listing"]').count(), 1);
    assert.equal(await page.evaluate(() => state.marketFeedNextOffset), 1);
    assert.equal(await page.evaluate(() => state.marketFeedSessionId), 'new-ranking');
    await page.evaluate(async () => {
      marketResponse = { listings: [{ id: 'previous-filter-pending', title: '旧筛选待显示商品', status: 'active', speciesCode: 'GHG', price: 180 }], rankingSession: 'previous-filter-ranking', nextOffset: 1, hasMore: false };
      feedEntryRefresh.market = { pending: true, at: 0, key: '' }; await refreshMarket();
    });
    await notice().waitFor();
    await page.evaluate(() => { hasCloudSession = () => false; state.marketSearch = '虎泥'; render(); });
    assert.equal(await notice().count(), 0, 'Changing market filters discards an unrelated pending ranking');
    assert.equal(await page.evaluate(() => state.marketListings.some(item => item.id === 'previous-filter-pending')), false);
    assert.deepEqual(errors, []);
    recordResult(root, `feed-updates-${platform}${local ? '-local' : ''}.json`, { errors, promptBeforeApply: true, originalPositionPreserved: true });
    console.log(`PASS ${platform}${local ? '/file:' : ''}: market/community new-content notice, stable cards/scroll, accept-to-update, latest comments/unread preservation, manual refresh, owner isolation and three viewports.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
