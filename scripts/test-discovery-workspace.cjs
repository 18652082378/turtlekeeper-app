'use strict';
// Real packaged client, synthetic accounts and intercepted network only.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const platform = process.env.MOBILE_UI_PLATFORM || 'ios';
process.env.BROWSER_ENGINE ||= platform === 'ios' ? 'webkit' : 'chromium';
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const fixture = require('./ui-audit-fixture.cjs')();
const root = path.resolve(__dirname, '..'), publicRoot = path.join(root, platform === 'ios' ? 'ios/App/App/public' : 'android/app/src/main/assets/public');
const output = path.join(root, 'output/discovery-workspace', platform);
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
(async () => {
  const browser = await launchBrowser(), errors = [], results = [];
  fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
    page.setDefaultTimeout(6000);
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url()); if (url.hostname !== 'discovery.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ body: 'window.TURTLE_API_BASE_URL="";', contentType: 'text/javascript' });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, posts: [], listings: [], items: [], notices: [] } });
      const file = path.resolve(publicRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('https://discovery.test/');
    await page.evaluate(({ fixture, png }) => {
      dismissTradeIntro?.(); TurtleReleaseNotes?.cancel(); forceUpdateState = { required: false };
      state = { ...initialState, ...emptyAccountData(), ...fixture, cloudToken: 'synthetic-token', page: 'community' };
      state.turtles[0] = { ...state.turtles[0], photo: png, privateNote: 'PRIVATE-NOTE', price: 98765, measureHistory: [{ oldSnapshot: { weight: 150 }, newSnapshot: { weight: 168 }, oldLength: 8, newLength: 8.5 }] };
      state.turtles.unshift({ ...state.turtles[0], id: 'other', code: '虎泥测试龟', speciesCode: 'HNG', speciesName: '虎泥蛋龟', weight: 220, photo: png, measureHistory: [] });
      window.discoveryBaseline = JSON.stringify([state.turtles, state.ledgerRecords, state.breedingRecords]);
      window.discoveryCanUse = canUseCommunity;
      canUseCommunity = () => true; // Transport/auth is isolated; exercise the real composer and submission below.
      requireCloudImageSession = () => {}; // Image transport is also mocked, never pointed at a live service.
      window.discoveryApi = apiPost;
      window.discoveryUploadMedia = apiUploadMediaFile;
      window.discoveryCalls = [];
      apiPost = async (url, data) => { discoveryCalls.push({ url, data }); return { ok: true, url: '/uploads/test.png', posts: [] }; };
      communitySelectedCircleId = 'all'; communityForumSort = 'latest';
      ensureCommunityDraftOwner(); render();
    }, { fixture, png });
    async function check(name, run) { await run(); assert.deepEqual(errors, []); results.push(name); }
    async function chooseArchive(name) {
      await page.locator('.forum-publish-growth .archive-directory-trigger').click();
      await page.locator('[data-directory-search]').fill(name);
      await page.locator('.directory-archive-card').filter({ hasText: name }).first().click();
    }
    async function choosePrompt(name) {
      const details = page.locator('.community-editor-prompts');
      if (await details.count() && await details.getAttribute('open') === null) await details.locator('summary').click();
      await page.locator(`[data-discovery-prompt="${name}"]`).click();
    }
    await check('Species discovery opens real community search and market keyword flow without posts or subscriptions', async () => {
      await page.locator('[data-discovery-source="community"][data-discovery-species="GHG"]').click();
      assert.equal(await page.locator('[data-workspace-search]').inputValue(), '果核蛋龟');
      assert.equal(await page.evaluate(() => TurtleSearch.source()), 'community');
      await page.evaluate(() => { state = { ...state, page: 'market', marketSearch: '' }; render(); });
      assert.equal(await page.locator('[data-market-assist-menu="sort"]').isVisible(), true);
      await page.locator('[data-discovery-source="market"][data-discovery-species="GHG"]').click();
      assert.equal(await page.evaluate(() => state.marketSearch), '果核蛋龟');
      assert.equal(await page.locator('.market-card-wrap').count(), 1);
      assert.equal(await page.evaluate(() => discoveryCalls.length), 0);
    });
    await check('Growth entry selects the exact archive, limits imported fields and requires explicit photo selection', async () => {
      await page.evaluate(() => { state.page = 'turtleReward'; state.selectedTurtleId = 'ui-turtle'; render(); });
      await page.locator('[data-community-growth-source="ui-turtle"]').click();
      assert.equal(await page.evaluate(() => state.page), 'communityAdd');
      assert.equal(await page.evaluate(() => communityDraftTurtleId), 'ui-turtle');
      assert.match(await page.locator('[name="content"]').inputValue(), /150g → 168g/);
      assert.match(await page.locator('[name="content"]').inputValue(), /第 2 次成长记录/);
      assert.doesNotMatch(await page.locator('[name="content"]').inputValue(), /98765|PRIVATE-NOTE/);
      assert.equal(await page.evaluate(() => communityDraftMediaItems.length), 0);
      await page.locator('[data-discovery-archive-photo]').click();
      assert.equal(await page.evaluate(() => communityDraftMediaItems.length), 1);
      assert.equal(await page.locator('[data-discovery-archive-photo]').isDisabled(), true);
      await page.evaluate(() => { window.discoveryPhotoDraft = communityDraftMediaItems; communityDraftMediaItems = Array.from({ length: 9 }, () => ({ type: 'image', previewUrl: '/uploads/mock.png' })); render(); });
      assert.equal(await page.locator('[data-discovery-archive-photo]').isDisabled(), true);
      assert.match(await page.locator('[data-discovery-archive-photo]').textContent(), /图片已满/);
      await page.evaluate(() => { communityDraftMediaItems = discoveryPhotoDraft; render(); });
      await chooseArchive('虎泥测试龟');
      assert.equal(await page.evaluate(() => communityDraftMediaItems.length), 0, 'Old archive photo must not follow a new archive');
      assert.match(await page.locator('[name="title"]').inputValue(), /虎泥/);
      await page.locator('[name="title"]').fill('自己编辑的成长标题');
      await page.locator('[name="content"]').fill('我手动记录的一段成长观察');
      await chooseArchive('青禾');
      assert.equal(await page.locator('[name="title"]').inputValue(), '自己编辑的成长标题');
      assert.equal(await page.locator('[name="content"]').inputValue(), '我手动记录的一段成长观察');
    });
    await check('Templates preserve images and visibility, cancel keeps writing, untouched outlines cannot be published', async () => {
      await page.evaluate(() => { communityDraftTopic = 'daily'; communityDraftText = ''; communityDraftTitle = ''; communityDraftVisibility = 'private'; render(); });
      await choosePrompt('habitat');
      assert.equal(await page.evaluate(() => communityDraftCircleId), 'habitat');
      assert.equal(await page.evaluate(() => communityDraftVisibility), 'private');
      assert.equal(await page.locator('.community-compose-submit').isDisabled(), true);
      await page.locator('[name="content"]').fill('这是我自己布置的龟池，水深十二厘米。');
      assert.equal(await page.locator('.community-compose-submit').isDisabled(), false);
      page.once('dialog', dialog => dialog.dismiss());
      await choosePrompt('feeding');
      assert.match(await page.locator('[name="content"]').inputValue(), /水深十二/);
      await page.evaluate(() => { state.page = 'community'; render(); });
      await page.locator('[data-community-compose="daily"]').first().click();
      assert.match(await page.locator('[name="content"]').inputValue(), /水深十二/);
    });
    await check('Waiting-for-reply view excludes answered and ordinary posts, and an empty filter offers a working exit', async () => {
      await page.evaluate(() => {
        state.page = 'community'; state.communityPosts = [
          { id: 'ask', title: '想请教一下龟池布置', topic: 'question', comments: [], createdAt: '2026-10-01' },
          { id: 'answered', title: '已经得到回复的求助', topic: 'identify', comments: [{}], createdAt: '2026-10-02' },
          { id: 'daily', title: '分享今天的一张照片', topic: 'daily', comments: [], createdAt: '2026-10-03' }
        ]; render();
      });
      await page.locator('[data-community-forum-sort="unanswered"]').click();
      assert.equal(await page.locator('[data-community-feed-card]').count(), 1);
      assert.equal(await page.locator('[data-community-feed-card]').getAttribute('data-community-feed-card'), 'ask');
      await page.evaluate(() => { const before = state.communityPosts; state.communityPosts = before.map(p => ({ ...p, comments: [{}] })); patchVisibleCommunityFeed(state.communityPosts, before); });
      await page.locator('[data-discovery-all-posts], [data-web-community-action="reset"]').click();
      assert.equal(await page.locator('[data-community-feed-card]').count(), 3);
    });
    await check('Photo submission retains chosen visibility and species, with no private archive fields in its payload', async () => {
      await page.evaluate(() => { clearCommunityDraftMedia(); communityDraftText = communityDraftTitle = ''; openCommunityComposer('growth', { turtleId: 'ui-turtle' }); communityDraftVisibility = 'private'; render(); discoveryCalls = []; });
      await page.locator('[data-discovery-archive-photo]').click();
      await page.locator('.community-compose-submit').click();
      await page.waitForFunction(() => !communityPublishInFlight);
      const calls = await page.evaluate(() => discoveryCalls);
      assert.equal(calls.filter(c => c.url === '/api/upload/image').length, 1);
      const payload = calls.find(c => c.url === '/api/community/create').data;
      assert.equal(payload.visibility, 'private'); assert.equal(payload.speciesCode, 'GHG');
      assert.equal(payload.mediaItems.length, 1); assert.doesNotMatch(JSON.stringify(payload), /98765|PRIVATE-NOTE/);
    });
    await check('A published template keeps its chosen circle and leaves no stale template restriction on the next post', async () => {
      await page.evaluate(() => { openCommunityComposer('daily'); discoveryCalls = []; });
      await choosePrompt('habitat');
      await page.locator('[name="content"]').fill('这是我观察和调整龟池水深的实际过程。');
      await page.locator('.community-compose-submit').click();
      await page.waitForFunction(() => !communityPublishInFlight);
      assert.equal(await page.evaluate(() => discoveryCalls.find(c => c.url === '/api/community/create').data.circleId), 'habitat');
      assert.equal(await page.evaluate(() => TurtleDiscovery.canPublishDraft()), true);
    });
    await check('A late background publication cannot navigate away from another form or erase its unsaved input', async () => {
      await page.evaluate(() => {
        openCommunityComposer('daily'); communityDraftTitle = '后台发布完成的边界测试'; communityDraftText = '这是一篇本地合成内容。'; render();
        apiPost = (url, data) => { discoveryCalls.push({ url, data }); return new Promise(resolve => { window.resolveBoundaryPublish = resolve; }); };
      });
      await page.locator('.community-compose-submit').click();
      await page.waitForFunction(() => Boolean(window.resolveBoundaryPublish));
      await page.evaluate(() => { setState({ page: 'feedbackAdd' }, { skipCloud: true }); window.boundaryForm = document.querySelector('#feedbackForm'); });
      await page.locator('#feedbackForm [name="content"]').fill('正在填写另一份反馈，这些内容必须保留。');
      await page.evaluate(() => resolveBoundaryPublish({ posts: [] }));
      await page.waitForFunction(() => !communityPublishInFlight);
      assert.equal(await page.evaluate(() => state.page), 'feedbackAdd');
      assert.equal(await page.evaluate(() => boundaryForm === document.querySelector('#feedbackForm')), true);
      assert.match(await page.locator('#feedbackForm [name="content"]').inputValue(), /必须保留/);
    });
    await check('Pending publication rejects both quick-camera entry and an already-open photo chooser', async () => {
      await page.evaluate(() => {
        state.page = 'community'; openCommunityComposer('daily'); communityDraftTitle = '发布中不能覆盖原有图片'; communityDraftText = '本地发布边界测试'; render();
        window.resolveBoundaryPublish = null;
        window.beforePendingSignature = navigationDataSignature('communityAdd');
        apiPost = () => new Promise(resolve => { window.resolveBoundaryPublish = resolve; });
      });
      await page.locator('.community-compose-submit').click();
      await page.waitForFunction(() => Boolean(window.resolveBoundaryPublish));
      await page.evaluate(() => {
        window.pendingPickerClicks = 0;
        document.querySelector('[data-community-quick-media]').addEventListener('click', e => { e.preventDefault(); pendingPickerClicks++; });
      });
      await page.locator('[data-community-camera-button]').click();
      assert.equal(await page.evaluate(() => pendingPickerClicks), 0);
      await page.locator('[data-community-quick-media]').setInputFiles({ name: 'pending.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
      assert.equal(await page.evaluate(() => state.page), 'community');
      assert.equal(await page.evaluate(() => communityDraftMediaItems.length), 0);
      assert.equal(await page.evaluate(() => navigationDataSignature('communityAdd') !== beforePendingSignature), true, 'A cached editable form must not be reused during publication');
      await page.evaluate(() => setState({ page: 'communityAdd' }, { skipCloud: true }));
      assert.equal(await page.locator('#communityPostForm').count(), 0);
      assert.equal(await page.locator('.discovery-pending').isVisible(), true);
      await page.locator('.discovery-pending [data-page="community"]').click();
      await page.evaluate(() => resolveBoundaryPublish({ posts: [] }));
      await page.waitForFunction(() => !communityPublishInFlight);
    });
    await check('A failed publication restores the draft when the user has returned to the pending editor', async () => {
      await page.evaluate(() => {
        openCommunityComposer('daily'); communityDraftTitle = '发布失败后恢复编辑状态'; communityDraftText = '这段未发出的文字不能丢失'; communityDraftVisibility = 'private'; render();
        window.rejectPendingEditor = null;
        apiPost = () => new Promise((_resolve, reject) => { window.rejectPendingEditor = reject; });
      });
      await page.locator('.community-compose-submit').click();
      await page.waitForFunction(() => Boolean(window.rejectPendingEditor));
      await page.evaluate(() => setState({ page: 'communityAdd' }, { skipCloud: true }));
      assert.equal(await page.locator('.discovery-pending').count(), 1);
      await page.evaluate(() => rejectPendingEditor(new Error('synthetic publish failure')));
      await page.waitForFunction(() => !communityPublishInFlight);
      assert.equal(await page.locator('.discovery-pending').count(), 0);
      assert.match(await page.locator('#communityPostForm [name="content"]').inputValue(), /不能丢失/);
      assert.equal(await page.evaluate(() => communityDraftVisibility), 'private');
      await page.evaluate(() => { clearCommunityDraftMedia(); communityDraftText = communityDraftTitle = communityDraftQuestion = ''; state.page = 'community'; render(); });
    });
    await check('Unsupported publish preserves the draft and never creates a fake successful local post', async () => {
      await page.evaluate(() => { openCommunityComposer('growth', { turtleId: 'ui-turtle' }); communityDraftVisibility = 'private'; render(); apiPost = async () => { throw Object.assign(new Error('方法不支持'), { status: 405 }); }; });
      // An existing cloud photo needs no new upload, so the simulated 405 is
      // returned by the publish endpoint itself.
      await page.evaluate(() => { communityDraftMediaItems = [{ type: 'image', previewUrl: '/uploads/original.png', archiveSource: '/uploads/original.png' }]; render(); });
      await page.locator('.community-compose-submit').click();
      await page.waitForFunction(() => !communityPublishInFlight);
      assert.equal(await page.evaluate(() => state.communityPosts.some(p => p.pendingLocal)), false);
      assert.match(await page.evaluate(() => communityDraftText), /150g/);
      const submissionId = await page.evaluate(() => communityPublishSubmissionId);
      await page.locator('[data-community-compose="growth"]').click();
      assert.match(await page.locator('[name="content"]').inputValue(), /150g/);
      assert.equal(await page.evaluate(() => communityDraftVisibility), 'private');
      assert.equal(await page.evaluate(() => communityDraftMediaItems[0].archiveSource), '/uploads/original.png');
      assert.equal(await page.evaluate(() => communityPublishSubmissionId), submissionId, 'Retry keeps its original deduplication key');
    });
    await check('Old refresh, pagination and failed-list responses cannot erase a new post or corrupt its loading state', async () => {
      for (const mode of ['refresh', 'more', 'failed-refresh']) {
      await page.evaluate(() => {
        clearCommunityDraftMedia(); communityDraftText = communityDraftTitle = ''; communityDraftQuestion = '';
        openCommunityComposer('daily'); communityDraftTitle = '慢网络下保留新发布帖子'; communityDraftText = '一篇本地合成的测试帖子'; render();
        window.originalDiscoverySession = hasCloudSession; hasCloudSession = () => true; communityLoading = true;
        window.originalDiscoveryScroll = setupCommunityInfiniteScroll; setupCommunityInfiniteScroll = () => {};
        window.resolveOldCommunityList = window.rejectOldCommunityList = window.resolveNewPublication = null;
        apiPost = (url) => new Promise((resolve, reject) => {
          if (url === '/api/community/list') { window.resolveOldCommunityList = resolve; window.rejectOldCommunityList = reject; }
          else if (url === '/api/community/create') window.resolveNewPublication = resolve;
          else resolve({ ok: true, posts: [], listings: [], items: [] });
        });
      });
      await page.locator('.community-compose-submit').click();
      await page.waitForFunction(() => Boolean(window.resolveNewPublication));
      await page.evaluate(mode => { communityLoading = false; state.communityFeedHasMore = true; state.communityFeedNextOffset = 10; window.pendingOldList = mode === 'more' ? loadMoreCommunityPosts() : refreshCommunity(true); }, mode);
      await page.waitForFunction(() => Boolean(window.resolveOldCommunityList));
      await page.evaluate(() => resolveNewPublication({ posts: [{ id: 'new-publication', title: '慢网络下保留新发布帖子', topic: 'daily', content: '本地测试', comments: [], createdAt: new Date().toISOString() }] }));
      await page.waitForFunction(() => !communityPublishInFlight);
      assert.equal(await page.evaluate(() => state.communityPosts.some(post => post.id === 'new-publication')), true);
      await page.evaluate(async mode => {
        if (mode === 'failed-refresh') rejectOldCommunityList(new Error('synthetic old request failed'));
        else resolveOldCommunityList({ posts: [{ id: 'stale-page', title: '过时的一条数据', topic: 'daily', comments: [] }], hasMore: false, nextOffset: 200 });
        await pendingOldList; hasCloudSession = originalDiscoverySession; setupCommunityInfiniteScroll = originalDiscoveryScroll;
      }, mode);
      assert.equal(await page.evaluate(() => state.communityPosts.some(post => post.id === 'new-publication')), true);
      assert.equal(await page.evaluate(() => state.communityPosts.some(post => post.id === 'stale-page')), false);
      assert.equal(await page.evaluate(() => state.communityFeedLoadingMore), false);
      assert.equal(await page.evaluate(() => state.communityFeedNextOffset), 10, 'The old page cannot advance the current cursor');
      assert.equal(await page.evaluate(() => state.communityFeedError), '');
      assert.equal(await page.locator('[data-community-feed-card="new-publication"]').count(), 1);
      }
    });
    await check('Account changes clear old drafts, and late photo uploads cannot publish under a different account', async () => {
      await page.evaluate(() => {
        state.loggedInPhone = '13100000000'; state.cloudToken = 'another-synthetic-token'; state.page = 'communityAdd'; render();
      });
      assert.equal(await page.locator('[name="content"]').inputValue(), '');
      assert.equal(await page.evaluate(() => communityDraftMediaItems.length), 0);
      await page.evaluate(() => {
        communityDraftTitle = '账号切换测试的一篇帖子'; communityDraftText = '仅用于本地测试';
        communityDraftMediaItems = [{ type: 'image', previewUrl: '/uploads/mock.png', file: new File(['test'], 'test.png', { type: 'image/png' }) }];
        apiUploadMediaFile = () => new Promise(resolve => { window.resolveDiscoveryUpload = resolve; });
        discoveryCalls = []; apiPost = async (...args) => { discoveryCalls.push(args); return { posts: [] }; }; render();
      });
      await page.locator('.community-compose-submit').click();
      await page.waitForFunction(() => Boolean(window.resolveDiscoveryUpload));
      await page.evaluate(() => { state.loggedInPhone = '13200000000'; state.cloudToken = 'third-synthetic-token'; resolveDiscoveryUpload({ url: '/uploads/test.png' }); });
      await page.waitForFunction(() => !communityPublishInFlight);
      assert.equal(await page.evaluate(() => discoveryCalls.length), 0);
      await page.evaluate(() => { state.page = 'communityAdd'; render(); });
      assert.equal(await page.locator('[name="content"]').inputValue(), '');
    });
    await check('Changing the token while an archive image is compressing cannot upload it into the new session', async () => {
      await page.evaluate(() => {
        window.discoveryCompress = compressImageDataUrl;
        compressImageDataUrl = () => new Promise(resolve => { window.resolveDiscoveryCompression = resolve; });
        discoveryCalls = [];
        const owner = { phone: state.loggedInPhone, token: currentCloudToken() };
        window.pendingDiscoveryCompression = uploadDataUrlToCloud('data:image/png;base64,' + 'A'.repeat(260001), 'image', { owner }).then(() => 'unexpected upload', e => e.message);
      });
      await page.waitForFunction(() => Boolean(window.resolveDiscoveryCompression));
      await page.evaluate(png => { state.cloudToken = 'changed-during-compression'; resolveDiscoveryCompression(png); }, png);
      assert.match(await page.evaluate(() => pendingDiscoveryCompression), /账号已变更/);
      assert.equal(await page.evaluate(() => discoveryCalls.length), 0);
      await page.evaluate(() => { compressImageDataUrl = discoveryCompress; });
    });
    await check('A failed image upload cannot retry with another account or token', async () => {
      const result = await page.evaluate(async () => {
        apiUploadMediaFile = discoveryUploadMedia;
        const originalFetch = window.fetch; let requests = 0;
        window.fetch = async () => { requests++; return new Response(JSON.stringify({ ok: false, message: 'synthetic temporary failure' }), { status: 503 }); };
        const owner = { phone: state.loggedInPhone, token: currentCloudToken() };
        try {
          await apiUploadMediaFile(new File(['test'], 'test.png', { type: 'image/png' }), 0, { owner, onRetry: () => { state.cloudToken = 'changed-during-retry'; } });
          return { requests, error: 'unexpected upload' };
        } catch (e) { return { requests, error: e.message }; }
        finally { window.fetch = originalFetch; }
      });
      assert.equal(result.requests, 1); assert.match(result.error, /账号已变更/);
    });
    assert.equal(await page.evaluate(() => JSON.stringify([state.turtles, state.ledgerRecords, state.breedingRecords]) === discoveryBaseline), true, 'Discovery and sharing never mutate private business records');
    let layoutChecks = 0;
    for (const width of [280, 320, 360, 390, 430, 441, 720, 1024]) for (const theme of ['teal', 'dark']) for (const scenario of ['community', 'market', 'marketSort', 'marketRegion', 'marketDelivery', 'communityAdd', 'growthComposer', 'pendingComposer', 'turtleReward']) {
      const route = ['growthComposer', 'pendingComposer'].includes(scenario) ? 'communityAdd' : scenario.startsWith('market') ? 'market' : scenario;
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(({ fixture, route, scenario, theme, png }) => {
        state = { ...initialState, ...emptyAccountData(), ...fixture, cloudToken: 'layout-synthetic-token', page: route, themeColor: theme };
        communitySelectedCircleId = 'all'; communityForumSort = 'latest'; ensureCommunityDraftOwner();
        communityPublishInFlight = scenario === 'pendingComposer';
        document.querySelectorAll('.ui-toast').forEach(el => el.remove());
        communityDraftTopic = scenario === 'growthComposer' ? 'growth' : 'daily'; communityDraftTurtleId = 'ui-turtle';
        if (scenario === 'growthComposer') state.turtles[0].photo = png;
        state.marketAssistMenu = { marketSort: 'sort', marketRegion: 'region', marketDelivery: 'filter' }[scenario] || '';
        pendingPageEnterMotion = false; forceUpdateState = { required: false }; render(); scrollTo(0, 0);
      }, { fixture, route, scenario, theme, png });
      const problems = await page.evaluate(() => {
        const problems = [];
        for (const el of document.querySelectorAll('.discovery-species-chips button,.discovery-market-links button,.discovery-compose-prompts button,.discovery-growth-share button,.discovery-archive-photo button,.discovery-pending button,.forum-sort-tabs button,.market-assist-bar button')) {
          const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
          if (r.left < -1 || r.right > innerWidth + 1 || r.width < 43 || r.height < 43) problems.push(el.outerHTML.slice(0, 160));
        }
        if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('Page overflows viewport');
        return problems;
      });
      assert.deepEqual(problems, [], `${platform}/${scenario}/${theme}/${width}`); layoutChecks++;
      if ([280, 390].includes(width)) await page.screenshot({ path: path.join(output, `${scenario}-${width}-${theme}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    recordResult(root, 'discovery-workspace-' + platform + '.json', { results, layoutChecks, errors });
    console.log(`PASS ${platform}: ${results.length} discovery/publishing/privacy flows and ${layoutChecks} responsive layouts; no real requests or data changes.`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
