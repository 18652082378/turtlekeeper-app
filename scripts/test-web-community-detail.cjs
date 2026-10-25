'use strict';
// Reviewed legacy website, synthetic posts and intercepted network only.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output/web-community-detail');
const mobilePlatform = process.env.COMMUNITY_MOBILE_PLATFORM || '';
assert.ok(['', 'ios', 'android'].includes(mobilePlatform));
const bundle = path.join(root, 'www');
const artifactOutput = mobilePlatform ? path.join(root, 'output/community-mobile-ui', mobilePlatform) : output;
const legacy = mobilePlatform ? '' : require('./deploy-web-update-gate.cjs').patch(fs.readFileSync(path.join(root, 'output/web-update-gate/online-app.js'), 'utf8'));
const asset = mobilePlatform ? '' : fs.readFileSync(path.join(root, 'deploy/web-community/web-community-engagement.js'), 'utf8');
const css = mobilePlatform ? '' : fs.readFileSync(path.join(root, 'deploy/web-community/web-community-engagement.css'), 'utf8');
const fixture = require('./ui-audit-fixture.cjs')();
const portrait = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="900"><rect width="400" height="900" fill="#deebe4"/><path d="M0 630Q220 480 400 650V900H0" fill="#b2cbb8"/><ellipse cx="200" cy="470" rx="115" ry="160" fill="#6d9175"/><circle cx="200" cy="275" r="55" fill="#95af84"/><path d="m200 335 80 70v130l-80 90-80-90V405Z" fill="none" stroke="#dce4ab" stroke-width="12"/><text x="200" y="820" text-anchor="middle" fill="#365e48" font-size="25">本地竖图布局示例</text></svg>');
const base = { id: 'detail-post', authorId: 'author-one', authorName: '阿禾的养龟日记', circleId: 'mud', topic: 'daily', title: '今天的养龟记录，一起来聊聊',
  content: '记录一下小家伙今天的状态。\n也想看看大家最近的养龟日常，欢迎分享自己的观察。', comments: [], mediaItems: [{ url: '/assets/species/ABQ.jpg', type: 'image' }],
  createdAt: '2026-10-22T01:24:46Z', likeCount: 0, isOwn: false };
const comment = { id: 'root-comment', authorId: 'friend-one', authorName: '慢慢养龟', content: '我最近也调整了晒台，想听听大家的布置经验。', createdAt: '2026-10-22T02:00:00Z', likeCount: 0, canDelete: false };
(async () => {
  fs.mkdirSync(artifactOutput, { recursive: true });
  const browser = await launchBrowser();
  const results = [], layouts = [], errors = [], requests = [];
  let serverPosts = [], commentMode = 'ok', held = null;
  const page = await browser.newPage({ viewport: { width: mobilePlatform ? 390 : 1251, height: mobilePlatform ? 844 : 1000 }, hasTouch: Boolean(mobilePlatform), isMobile: Boolean(mobilePlatform), reducedMotion: 'reduce', timezoneId: 'Asia/Shanghai' });
  if (mobilePlatform) await page.addInitScript(platform => {
    const app = { getInfo: async () => ({ build: '136' }), getLaunchUrl: async () => ({}), addListener: async () => ({ remove() {} }) };
    const push = { checkPermissions: async () => ({ receive: 'denied' }), addListener: async () => ({ remove() {} }), register: async () => {}, unregister: async () => {} };
    window.keyboardCalls = [];
    const bars = { setTheme: async () => {}, getDisplayMetrics: async () => ({}), addListener: async () => ({ remove() {} }), hideKeyboard: async () => keyboardCalls.push('hide') };
    const keyboard = { setAccessoryBarVisible: async ({ isVisible }) => keyboardCalls.push(isVisible), hide: async () => keyboardCalls.push('hide') };
    const plugins = { App: app, PushNotifications: push, TurtleAndroidWindow: bars, TurtleAndroidPush: push, ...(platform === 'ios' ? { Keyboard: keyboard } : {}) };
    window.Capacitor = { getPlatform: () => platform, isNativePlatform: () => true, isPluginAvailable: name => Boolean(plugins[name]), Plugins: plugins, registerPlugin: name => plugins[name] || {} };
  }, mobilePlatform);
  page.setDefaultTimeout(6000); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'community-detail.test') return route.abort();
    if (url.pathname === '/app.js') {
      let source = mobilePlatform ? fs.readFileSync(path.join(bundle, 'app.js'), 'utf8') : legacy;
      if (mobilePlatform === 'android') source = require('./android/adapt-shared-asset.cjs')('app.js', source, { androidBuild: 17, androidVersion: '1.1.8', updateChannel: 'store' });
      return route.fulfill({ body: source, contentType: 'text/javascript' });
    }
    if (url.pathname === '/config.js') return route.fulfill({ body: 'window.TURTLE_API_BASE_URL="https://community-detail.test";window.TURTLE_APP_BUILD=109;', contentType: 'text/javascript' });
    if (url.pathname === '/styles.css') return route.fulfill({ body: fs.readFileSync(path.join(root, mobilePlatform ? 'www/styles.css' : 'output/web-update-gate/online-styles.css')), contentType: 'text/css' });
    if (url.pathname === '/') {
      let html = fs.readFileSync(path.join(root, mobilePlatform ? 'www/index.html' : 'output/web-update-gate/online-index.html'), 'utf8');
      if (mobilePlatform === 'android') html = html.replace('</head>', '<link rel="stylesheet" href="/android-layout.css"></head>');
      return route.fulfill({ body: html, contentType: 'text/html' });
    }
    if (url.pathname === '/android-layout.css') return route.fulfill({ body: fs.readFileSync(path.join(root, 'scripts/android/layout.css')), contentType: 'text/css' });
    if (url.pathname === '/android-fonts/NotoSansSC-VF.ttf') return route.fulfill({ body: fs.readFileSync(path.join(root, 'scripts/android/fonts/NotoSansSC-VF.ttf')), contentType: 'font/ttf' });
    if (url.pathname.startsWith('/api/')) {
      const body = route.request().postDataJSON(); requests.push({ path: url.pathname, body });
      if (mobilePlatform && url.pathname === '/api/community/list' && body?.postId) return route.fulfill({ json: { ok: true, targetPost: serverPosts.find(post => post.id === body.postId) || null, posts: serverPosts, hasMore: false } });
      if (url.pathname === '/api/community/comment') {
        if (commentMode === 'failure') return route.fulfill({ status: 503, json: { ok: false, message: '合成网络错误，请重试' } });
        if (commentMode === 'unsupported') return route.fulfill({ status: 405, json: { ok: false, message: '方法不支持' } });
        if (commentMode === 'malformed') return route.fulfill({ json: { ok: true } });
        const duplicate = body.submissionId && serverPosts.some(post => post.id === body.postId && post.comments.some(item => item.submissionId === body.submissionId));
        if (!duplicate) serverPosts = serverPosts.map(post => post.id === body.postId ? { ...post, comments: [...post.comments, { ...comment, id: 'synthetic-' + requests.length, authorId: 'audit-me', submissionId: body.submissionId, content: body.content, replyToCommentId: body.replyToCommentId || '' }] } : post);
        if (commentMode === 'accepted-lost') return route.abort('failed');
        const response = { ok: true, posts: structuredClone(serverPosts) };
        if (held) await held;
        return route.fulfill({ json: response });
      }
      return route.fulfill({ json: { ok: true, minimumBuild: 0, latestBuild: 0, posts: [], listings: [], friends: [], messages: [], notifications: [], items: [] } });
    }
    const assetRoot = mobilePlatform ? bundle : root;
    const file = path.resolve(assetRoot, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(assetRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
  });
  async function seed(post = base, changes = {}) {
    serverPosts = [structuredClone(post)]; commentMode = 'ok';
    await page.evaluate(({ fixture, post, changes }) => {
      dismissTradeIntro?.(); window.TurtleReleaseNotes?.cancel();
      state = { ...initialState, ...emptyAccountData(), ...fixture, loggedInPhone: '13000000000', cloudToken: 'detail-synthetic', isCommunityAdmin: false, page: 'communityPostDetail',
        communityPosts: [post], selectedCommunityPostId: post.id, communityFeedInitialized: true, communityFeedHasMore: false, communityFeedLoadingMore: false, themeColor: 'teal', ...changes };
      communityLastLoadedAt = Date.now(); communityLoading = false; forceUpdateState = { required: false }; communityReplyTarget = null;
      communityForumSort = 'latest'; communitySelectedCircleId = 'all';
      pendingPageEnterMotion = false; edgeBackSnapshots = []; window.detailNotes = []; toast = text => detailNotes.push(text);
      render(); scrollTo(0, 0);
    }, { fixture, post, changes });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // User clears the current local draft between independent synthetic scenarios.
    if (await page.locator('.forum-reply-composer input').count()) await page.locator('.forum-reply-composer input').fill('');
    if (await page.locator('[data-web-community-action="circles"][aria-expanded="true"]').count()) await page.locator('[data-web-community-action="circles"]').click();
  }
  async function check(name, run) { await run(); assert.deepEqual(errors, []); results.push(name); }
  async function sendReply() {
    if (mobilePlatform) await page.getByRole('textbox', { name: '回复内容', exact: true }).press('Enter');
    else await page.locator('.forum-reply-composer button[type="submit"]').click();
  }
  try {
    await page.goto('https://community-detail.test/?skipIntro=1'); await seed(base, { isCommunityAdmin: true });
    if (!mobilePlatform) { await page.screenshot({ path: path.join(output, 'detail-before-desktop.png') }); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: asset }); }
    else assert.equal(await page.evaluate(() => Boolean(window.TurtleMobileCommunity?.installed)), true, 'native bridge must activate the bundled mobile UI');
    await check(mobilePlatform ? 'Native mobile bundle uses single-column detail and original photo preview' : 'Desktop separates reading and discussion; photo preview and original source remain available', async () => {
      const layout = await page.locator('.web-community-detail').evaluate(el => {
        const article = el.querySelector('article').getBoundingClientRect(), panel = el.querySelector('.web-community-detail-discussion').getBoundingClientRect();
        return { article: { left: article.left, right: article.right, bottom: article.bottom, width: article.width }, panel: { left: panel.left, top: panel.top }, width: el.getBoundingClientRect().width };
      });
      if (mobilePlatform) { assert.ok(layout.panel.top >= layout.article.bottom); assert.ok(layout.width <= 480); }
      else { assert.ok(layout.panel.left > layout.article.right); assert.ok(layout.width <= 1120); }
      assert.ok(layout.article.width < 760);
      const image = page.locator('.community-detail-media-button img'); await image.evaluate(img => img.decode());
      assert.ok((await image.getAttribute('src')).includes('/assets/species/ABQ.jpg'));
      await page.locator('.community-detail-media-button').click(); assert.equal(await page.locator('.image-preview-overlay').count(), 1);
      await page.locator('.image-preview-close').click(); assert.equal(await page.locator('.image-preview-overlay').count(), 0);
      await page.waitForTimeout(400); // Existing preview prevents close-button click-through for 360 ms.
    });
    await check('Secondary actions and moderation keep real permissions, accessible controls and escape dismissal', async () => {
      assert.equal(await page.locator('.community-detail-actions > button').count(), 3);
      assert.equal(await page.locator('.web-community-detail-admin [data-community-admin-action]').count(), 4);
      await page.locator('.web-community-detail-admin > summary').click();
      assert.equal(await page.locator('.web-community-detail-admin [data-community-admin-action]:visible').count(), 4);
      await page.locator('.web-community-detail-admin > summary').click();
      await page.locator('.web-community-detail-more > summary').click();
      assert.equal(await page.locator('.web-community-detail-more-panel [data-open-content-report]').isVisible(), true);
      assert.equal(await page.locator('.web-community-detail-more-panel [data-delete-community-post]').isVisible(), true);
      await page.locator('.web-community-detail-more-panel [data-open-content-report]').focus(); await page.keyboard.press('Escape');
      assert.equal(await page.locator('.web-community-detail-more').getAttribute('open'), null);
      await page.locator('.web-community-detail-more > summary').click();
      await page.locator('.web-community-detail-more-panel [data-open-content-report]').click();
      assert.equal(await page.getByRole('dialog', { name: '举报内容', exact: true }).count(), 1);
      await page.locator('[data-content-report-close]').click();
      await seed(base); assert.equal(await page.locator('.web-community-detail-admin').count(), 0); assert.equal(await page.locator('[data-delete-community-post]').count(), 0);
      await seed({ ...base, isOwn: true }); assert.equal(await page.locator('[data-open-content-report]').count(), 0); assert.equal(await page.locator('[data-delete-community-post]').count(), 1);
    });
    await check('Empty reply invitation and comment action focus the actual composer without requests or rerenders', async () => {
      await seed(base);
      await page.evaluate(() => { window.mainBeforeReplyFocus = document.querySelector('main'); });
      const before = requests.filter(x => x.path === '/api/community/comment').length;
      await page.getByRole('button', { name: '写第一条回复', exact: true }).click();
      assert.equal(await page.getByRole('textbox', { name: '回复内容', exact: true }).evaluate(el => el === document.activeElement), true);
      assert.equal(await page.evaluate(() => mainBeforeReplyFocus === document.querySelector('main')), true);
      await page.locator('.community-detail-actions [data-web-community-action="reply-focus"]').click();
      assert.equal(requests.filter(x => x.path === '/api/community/comment').length, before);
    });
    await check('Reply target, cancellation and nested expansion preserve a typed draft', async () => {
      const replies = Array.from({ length: 5 }, (_, i) => ({ ...comment, id: 'nested-' + i, replyToCommentId: comment.id, replyToName: comment.authorName }));
      await seed({ ...base, comments: [comment, ...replies] });
      await page.getByRole('textbox', { name: '回复内容', exact: true }).fill('这是还未发送的草稿。');
      if (mobilePlatform) await page.evaluate(() => { window.replyInputBefore = document.querySelector('.forum-reply-composer input'); window.replyMainBefore = document.querySelector('main'); });
      await page.locator('button[data-reply-community-comment="root-comment"]').click();
      assert.equal(await page.getByRole('textbox', { name: '回复内容', exact: true }).inputValue(), '这是还未发送的草稿。');
      assert.match(await page.locator('.web-community-reply-target').innerText(), /慢慢养龟/);
      await page.locator('[data-web-community-action="cancel-reply"]').click();
      assert.equal(await page.locator('.web-community-reply-target').count(), 0);
      if (mobilePlatform) assert.equal(await page.evaluate(() => replyInputBefore === document.querySelector('.forum-reply-composer input') && replyMainBefore === document.querySelector('main')), true, 'reply/cancel must retain the input and page DOM');
      await page.locator('[data-expand-comment-replies]').click();
      assert.equal(await page.locator('.forum-nested-replies [data-community-comment-row]').count(), 5);
      assert.equal(await page.getByRole('textbox', { name: '回复内容', exact: true }).inputValue(), '这是还未发送的草稿。');
    });
    if (mobilePlatform) {
      await check('Vertical content drags dismiss the keyboard in both directions, preserving draft and recipient', async () => {
        await seed({ ...base, comments: [comment] });
        await page.locator('button[data-reply-community-comment="root-comment"]').click();
        await page.locator('.forum-reply-composer input').fill('滑动后保留草稿');
        async function drag(dx, dy, inComposer = false, multiTouch = false) {
          return page.evaluate(({ dx, dy, inComposer, multiTouch }) => {
            const input = document.querySelector('.forum-reply-composer input'); input.focus({ preventScroll: true });
            const target = inComposer ? input : document.querySelector('[data-community-comment-row]');
            const point = { identifier: 1, clientX: 100, clientY: 300 };
            const dispatch = (name, touches) => { const event = new Event(name, { bubbles: true }); Object.defineProperty(event, 'touches', { value: touches }); target.dispatchEvent(event); };
            dispatch('touchstart', [point]);
            dispatch('touchmove', [{ ...point, clientX: 100 + dx, clientY: 300 + dy }, ...(multiTouch ? [{ ...point, identifier: 2 }] : [])]);
            dispatch('touchend', []);
            return { focused: document.activeElement === input, value: input.value, recipient: communityReplyTarget?.commentId };
          }, { dx, dy, inComposer, multiTouch });
        }
        for (const [dx, dy, inComposer, multiTouch] of [[2, 5], [80, 5], [0, 60, true], [0, 60, false, true]]) assert.equal((await drag(dx, dy, inComposer, multiTouch)).focused, true);
        await page.evaluate(() => { document.dispatchEvent(new Event('scroll')); window.visualViewport.dispatchEvent(new Event('scroll')); });
        assert.equal(await page.locator('.forum-reply-composer input').evaluate(el => el === document.activeElement), true);
        const before = await page.evaluate(() => keyboardCalls.filter(x => x === 'hide').length);
        for (const dy of [-60, 60]) assert.deepEqual(await drag(2, dy), { focused: false, value: '滑动后保留草稿', recipient: 'root-comment' });
        assert.equal(await page.evaluate(() => keyboardCalls.filter(x => x === 'hide').length), before + 2);
        await page.evaluate(() => render());
        assert.equal(await page.locator('.forum-reply-composer input').inputValue(), '滑动后保留草稿');
        assert.match(await page.locator('.web-community-reply-target').innerText(), /慢慢养龟/);
      });
      await check('Keyboard-open dock removes duplicate safe-area padding and reserves its measured height', async () => {
        await seed({ ...base, comments: [comment] });
        await page.locator('button[data-reply-community-comment="root-comment"]').click();
        await page.evaluate(() => {
          document.documentElement.style.setProperty('--forum-safe-area-bottom', '34px');
          window[Capacitor.getPlatform() === 'ios' ? 'TURTLE_IOS_KEYBOARD_VISIBLE' : 'TURTLE_ANDROID_KEYBOARD_VISIBLE'] = false;
          syncMobileKeyboardUI();
        });
        assert.equal(await page.locator('.forum-reply-composer').evaluate(el => getComputedStyle(el).paddingBottom), '42px');
        await page.evaluate(() => {
          window[Capacitor.getPlatform() === 'ios' ? 'TURTLE_IOS_KEYBOARD_VISIBLE' : 'TURTLE_ANDROID_KEYBOARD_VISIBLE'] = true;
          syncMobileKeyboardUI();
        });
        await page.setViewportSize({ width: 390, height: 510 });
        await page.evaluate(() => { Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => 844 }); syncMobileKeyboardUI(); });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const dock = await page.locator('.forum-reply-composer').evaluate(el => ({ padding: getComputedStyle(el).paddingBottom, height: el.getBoundingClientRect().height, bottom: el.getBoundingClientRect().bottom, viewport: innerHeight, outline: getComputedStyle(el.querySelector('input')).outlineStyle, reserved: parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom) }));
        assert.equal(dock.padding, '8px'); assert.ok(Math.abs(dock.bottom - dock.viewport) <= 1, JSON.stringify(dock));
        assert.ok(dock.reserved >= dock.height + 11, JSON.stringify(dock)); assert.equal(dock.outline, 'none');
        await page.locator('.forum-reply-composer input').fill('这是还未发送的回复');
        await page.screenshot({ path: path.join(artifactOutput, 'comment-keyboard-compact.png') });
        await page.evaluate(() => {
          delete document.documentElement.clientHeight;
          delete window.TURTLE_IOS_KEYBOARD_VISIBLE; delete window.TURTLE_ANDROID_KEYBOARD_VISIBLE;
          document.documentElement.style.removeProperty('--forum-safe-area-bottom');
        });
        await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => syncMobileKeyboardUI());
      });
      if (mobilePlatform === 'ios') await check('iOS keyboard events track visibility and accessory toolbar follows route changes', async () => {
        await seed(base);
        for (const name of ['keyboardWillShow', 'keyboardDidShow', 'keyboardDidHide']) {
          await page.evaluate(name => { const event = new Event(name); event.keyboardHeight = 334; window.dispatchEvent(event); }, name);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
          assert.equal(await page.evaluate(() => document.documentElement.classList.contains('forum-keyboard-open')), name !== 'keyboardDidHide');
        }
        await page.evaluate(() => { const event = new Event('keyboardDidShow'); event.keyboardHeight = 0; window.dispatchEvent(event); });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('forum-keyboard-open')), false, 'a hardware keyboard show event must not lift the dock');
        assert.equal(await page.evaluate(() => keyboardCalls.filter(x => typeof x === 'boolean').at(-1)), false);
        await page.evaluate(() => setState({ page: 'community' }, { skipCloud: true }));
        await page.waitForFunction(() => keyboardCalls.filter(x => typeof x === 'boolean').at(-1) === true);
        await page.evaluate(() => { setState({ page: 'communityPostDetail' }, { skipCloud: true }); setState({ page: 'community' }, { skipCloud: true }); });
        await page.waitForFunction(() => keyboardCalls.filter(x => typeof x === 'boolean').at(-1) === true);
        await page.evaluate(() => { delete window.TURTLE_IOS_KEYBOARD_VISIBLE; });
        await seed(base);
      });
    }
    await check('Failure, unsupported and malformed responses preserve draft; a real acknowledgement clears it', async () => {
      for (const mode of ['failure', 'unsupported', 'malformed']) {
        await seed(base); commentMode = mode;
        await page.getByRole('textbox', { name: '回复内容', exact: true }).fill('需要保留的回复。');
        await sendReply();
        await page.waitForFunction(() => document.querySelector('.forum-reply-composer').getAttribute('aria-busy') === 'false');
        assert.equal(await page.getByRole('textbox', { name: '回复内容', exact: true }).inputValue(), '需要保留的回复。');
        assert.equal(await page.evaluate(() => state.communityPosts[0].comments.length), 0);
        assert.ok((await page.evaluate(() => detailNotes.length)) > 0);
      }
      commentMode = 'ok'; await sendReply();
      await page.waitForFunction(() => state.communityPosts[0].comments.length === 1);
      assert.equal(await page.getByRole('textbox', { name: '回复内容', exact: true }).inputValue(), '');
      if (mobilePlatform) assert.equal(await page.locator('.forum-reply-composer button[type="submit"]').count(), 0);
      else assert.equal(await page.locator('.forum-reply-composer button[type="submit"]').isDisabled(), true);
    });
    await check('Duplicate submission is blocked and a late result cannot replace another account state or draft', async () => {
      await seed(base); let release; held = new Promise(resolve => { release = resolve; });
      await page.getByRole('textbox', { name: '回复内容', exact: true }).fill('旧账号待发送内容');
      const before = requests.filter(x => x.path === '/api/community/comment').length;
      await sendReply();
      await page.waitForFunction(() => document.querySelector('.forum-reply-composer').getAttribute('aria-busy') === 'true');
      await page.evaluate(() => document.querySelector('.forum-reply-composer').requestSubmit());
      assert.equal(requests.filter(x => x.path === '/api/community/comment').length, before + 1);
      await seed({ ...base, id: 'new-owner-post', title: '新账号帖子' }, { loggedInPhone: '13100000000', cloudToken: 'new-owner-token' });
      await page.getByRole('textbox', { name: '回复内容', exact: true }).fill('新账号草稿');
      release(); held = null; await page.waitForTimeout(80);
      assert.equal(await page.evaluate(() => state.communityPosts[0].id), 'new-owner-post');
      assert.equal(await page.getByRole('textbox', { name: '回复内容', exact: true }).inputValue(), '新账号草稿');
      assert.equal(await page.evaluate(() => detailNotes.length), 0);
    });
    await check('An absent thread keeps the original not-found view and no reply form', async () => {
      await seed(base, { selectedCommunityPostId: 'missing' });
      assert.match(await page.locator('main').innerText(), /不存在/); assert.equal(await page.locator('.forum-reply-composer').count(), 0);
    });
    await check('Drafts stay with their thread and disappear when the authenticated owner changes', async () => {
      await seed(base); await page.getByRole('textbox', { name: '回复内容', exact: true }).fill('第一篇帖子的草稿');
      await page.evaluate(() => { state.communityPosts.push({ ...state.communityPosts[0], id: 'another-thread' }); state.selectedCommunityPostId = 'another-thread'; render(); });
      assert.equal(await page.getByRole('textbox', { name: '回复内容', exact: true }).inputValue(), '');
      await page.getByRole('textbox', { name: '回复内容', exact: true }).fill('另一篇帖子的草稿');
      await page.evaluate(() => { state.selectedCommunityPostId = 'detail-post'; render(); });
      assert.equal(await page.getByRole('textbox', { name: '回复内容', exact: true }).inputValue(), '第一篇帖子的草稿');
      await page.evaluate(() => { state.loggedInPhone = '13100000000'; state.cloudToken = 'new-draft-owner'; render(); });
      assert.equal(await page.getByRole('textbox', { name: '回复内容', exact: true }).inputValue(), '');
    });
    await check('The existing image-only community rule remains; mobile composer honors keyboard inset', async () => {
      await page.setViewportSize({ width: 390, height: 1000 });
      await seed({ ...base, mediaItems: [{ url: '/uploads/synthetic-layout-video.mp4', posterUrl: '/assets/species/ABQ.jpg', type: 'video' }] });
      assert.equal(await page.locator('.community-detail-media-gallery video').count(), 0);
      assert.equal(await page.locator('.community-detail-media-gallery').count(), 0);
      const bottom = await page.evaluate(() => { document.documentElement.style.setProperty('--forum-keyboard-bottom', '180px'); return document.querySelector('.forum-reply-composer').getBoundingClientRect().bottom; });
      assert.ok(bottom <= 821 && bottom >= 819);
      await page.evaluate(() => document.documentElement.style.removeProperty('--forum-keyboard-bottom'));
    });
    if (mobilePlatform) await check('Native home controls open the real composers and preserve the selected feed on back', async () => {
      for (const topic of ['daily', 'growth', 'identify', 'question']) {
        await seed(base, { page: 'community' });
        await page.evaluate(() => { communityDraftText = ''; communityDraftTitle = ''; communityDraftQuestion = ''; communityDraftMediaItems = []; });
        await page.locator('.community-invite [data-community-compose="' + topic + '"]').click();
        assert.equal(await page.evaluate(() => state.page), 'communityAdd');
        assert.equal(await page.evaluate(() => communityDraftTopic), topic);
      }
      await seed({ ...base, topic: 'question' }, { page: 'community' });
      await page.locator('[data-community-forum-sort="unanswered"]').click();
      await page.locator('[data-community-feed-card] h3').click();
      assert.equal(await page.evaluate(() => state.page), 'communityPostDetail');
      await page.evaluate(() => navigateBack());
      assert.equal(await page.evaluate(() => communityForumSort), 'unanswered');
      assert.equal(await page.evaluate(() => state.page), 'community');
      await page.locator('[data-web-community-action="circles"]').click();
      assert.equal(await page.locator('[data-web-community-action="circles"]').getAttribute('aria-expanded'), 'true');
    });
    if (mobilePlatform) {
      await check('A lost acknowledgement preserves the draft and retry key without publishing a second comment', async () => {
        await seed(base); commentMode = 'accepted-lost';
        const before = requests.filter(item => item.path === '/api/community/comment').length;
        await page.getByRole('textbox', { name: '回复内容', exact: true }).fill('已送达但回执丢失的回复');
        await sendReply();
        await page.waitForFunction(() => document.querySelector('.forum-reply-composer').getAttribute('aria-busy') === 'false');
        assert.equal(await page.getByRole('textbox', { name: '回复内容', exact: true }).inputValue(), '已送达但回执丢失的回复');
        commentMode = 'ok';
        await sendReply();
        await page.waitForFunction(() => state.communityPosts[0].comments.length === 1);
        const attempts = requests.filter(item => item.path === '/api/community/comment').slice(before);
        assert.equal(attempts.length, 2); assert.ok(attempts[0].body.submissionId);
        assert.equal(attempts[0].body.submissionId, attempts[1].body.submissionId);
        assert.equal(serverPosts[0].comments.length, 1);
        await page.getByRole('textbox', { name: '回复内容', exact: true }).fill('已送达但回执丢失的回复');
        await sendReply();
        await page.waitForFunction(() => state.communityPosts[0].comments.length === 2);
        assert.notEqual(requests.filter(item => item.path === '/api/community/comment').at(-1).body.submissionId, attempts[0].body.submissionId, 'a confirmed send ends its attempt');
      });
      await check('Reply previews choose the newest available reply, escape text and open the exact discussion', async () => {
        const old = { ...comment, id: 'old-reply', content: 'Older response', createdAt: '2026-10-20T00:00:00Z' };
        const latest = { ...comment, id: 'new-reply', authorName: '<b>龟友</b>', content: '<img src=x onerror=alert(1)> 我也想交流', createdAt: '2026-10-24T00:00:00Z' };
        await seed({ ...base, comments: [latest, old] }, { page: 'community' });
        const preview = page.locator('.mobile-community-reply-preview');
        assert.match(await preview.innerText(), /<img src=x onerror=alert\(1\)>/);
        assert.equal(await preview.locator('img').count(), 0);
        await page.screenshot({ path: path.join(artifactOutput, 'home-reply-preview.png') });
        await preview.click();
        await page.waitForFunction(() => document.activeElement?.dataset.replyCommunityComment === 'new-reply');
        assert.equal(await page.evaluate(() => state.page), 'communityPostDetail');
        assert.equal(await page.locator('.mobile-community-comment-target').getAttribute('data-reply-community-comment'), 'new-reply');
        await seed({ ...base, commentCount: 6, comments: [] }, { page: 'community' });
        assert.equal(await page.locator('.mobile-community-reply-preview').count(), 0, 'counts cannot invent comment text');
      });
      await check('The home reply action immediately focuses the real composer', async () => {
        await seed({ ...base, topic: 'question' }, { page: 'community' });
        await page.locator('[data-open-community-comments]').click();
        await page.waitForFunction(() => document.activeElement?.matches('.forum-reply-composer input'));
      });
      await check('Notification opens and highlights a collapsed nested comment; missing and legacy targets degrade safely', async () => {
        const replies = Array.from({ length: 7 }, (_, i) => ({ ...comment, id: 'notice-child-' + i, replyToCommentId: comment.id, createdAt: `2026-10-22T02:00:0${i}Z` }));
        const post = { ...base, comments: [comment, ...replies] };
        await seed(post, { page: 'communityActivity', communityActivityItems: [{ id: 'notice', type: 'comment', actorName: '慢慢养龟', postId: base.id, commentId: 'notice-child-6', replyToYou: true, preview: '接着聊聊', read: true }] });
        assert.match(await page.locator('[data-open-community-notification]').innerText(), /回复了你的评论/);
        await page.locator('[data-open-community-notification]').click();
        await page.waitForFunction(() => document.activeElement?.dataset.replyCommunityComment === 'notice-child-6');
        const target = page.locator('.mobile-community-comment-target');
        assert.equal(await target.getAttribute('data-reply-community-comment'), 'notice-child-6');
        const box = await target.boundingBox(); assert.ok(box.y >= 0 && box.y < 844);
        await page.screenshot({ path: path.join(artifactOutput, 'notification-comment-target.png') });
        await page.getByRole('textbox', { name: '回复内容', exact: true }).fill('定位后保留的草稿');
        await page.evaluate(() => TurtleMobileCommunity.openComment(state.selectedCommunityPostId, 'notice-child-5'));
        await page.waitForFunction(() => document.activeElement?.dataset.replyCommunityComment === 'notice-child-5');
        assert.equal(await page.getByRole('textbox', { name: '回复内容', exact: true }).inputValue(), '定位后保留的草稿');
        await page.evaluate(() => TurtleMobileCommunity.openComment(state.selectedCommunityPostId, 'deleted-"-comment'));
        await page.waitForFunction(() => detailNotes.some(note => note.includes('回复已删除')));
        assert.equal(await page.locator('.mobile-community-comment-target').count(), 0);
        await seed(base, { page: 'communityActivity', communityActivityItems: [{ id: 'old-notice', type: 'comment', postId: base.id, preview: '旧版通知', read: true }] });
        await page.locator('[data-open-community-notification]').click();
        await page.waitForFunction(() => state.page === 'communityPostDetail');
        assert.equal(await page.evaluate(() => detailNotes.length), 0);
      });
      await check('A native notification target survives the existing authenticated post load', async () => {
        await seed({ ...base, comments: [comment] });
        await page.evaluate(async () => {
          const action = { route: 'messages', postId: 'detail-post', commentId: 'root-comment' };
          pendingNativePushAction = action;
          await openNativePushCommunityPost(action);
        });
        await page.waitForFunction(() => document.activeElement?.dataset.replyCommunityComment === 'root-comment');
        assert.equal(await page.evaluate(() => pendingNativePushAction), null);
      });
    }
    for (const width of mobilePlatform ? [320, 360, 390, 430] : [320, 390, 720, 1251, 1440]) for (const theme of ['teal', 'dark']) for (const scenario of ['photo', 'portrait', 'gallery', 'comments', 'text']) {
      const post = { ...base, ...(scenario === 'portrait' ? { mediaItems: [{ url: portrait, type: 'image' }] } : {}),
        ...(scenario === 'gallery' ? { mediaItems: [{ url: '/assets/species/ABQ.jpg', type: 'image' }, { url: portrait, type: 'image' }, { url: '/assets/species/ALG.jpg', type: 'image' }] } : {}),
        ...(scenario === 'text' ? { mediaItems: [], content: '超长内容与链接测试：' + 'abcdefghijklmnopqrstuvwxyz'.repeat(12) } : {}), ...(scenario === 'comments' ? { comments: Array.from({ length: 12 }, (_, i) => ({ ...comment, id: 'c-' + i, content: comment.content + 'abcdefghijklmnopqrstuvwxyz'.repeat(4) })) } : {}) };
      await page.setViewportSize({ width, height: mobilePlatform ? 844 : 1000 }); await seed(post, { themeColor: theme, isCommunityAdmin: scenario === 'portrait' });
      if (scenario === 'photo') await page.locator('.community-detail-media-button img').evaluate(img => img.decode());
      const problems = await page.evaluate(() => {
        const out = [], main = document.querySelector('.web-community-detail');
        if (document.documentElement.scrollWidth > innerWidth + 1) out.push('document overflows');
        for (const selector of ['.community-detail-card', '.web-community-detail-discussion', '.forum-reply-composer', '.community-detail-media-gallery', '.forum-detail-title']) {
          const element = main.querySelector(selector); if (!element) continue;
          const box = element.getBoundingClientRect(); if (box.left < -1 || box.right > innerWidth + 1) out.push(selector + ' overflows');
        }
        const form = main.querySelector('.forum-reply-composer').getBoundingClientRect(); if (form.bottom > innerHeight + 1) out.push('composer below viewport');
        return out;
      });
      assert.deepEqual(problems, [], `${width}/${theme}/${scenario}`); layouts.push({ width, theme, scenario, problems });
      if ([390, 1251].includes(width) && ['photo', 'portrait', 'comments'].includes(scenario)) {
        await page.getByRole('textbox', { name: '回复内容', exact: true }).blur();
        await page.screenshot({ path: path.join(artifactOutput, `detail-${scenario}-${width}-${theme}.png`) });
      }
    }
    // Wide homepage gets the same controlled reading width and an independent navigation column.
    for (const width of mobilePlatform ? [390, 430] : [390, 1251, 1440]) {
      await page.setViewportSize({ width, height: mobilePlatform ? 844 : 1000 }); await seed(base, { page: 'community' });
      const position = await page.evaluate(() => ({ sidebar: document.querySelector('.web-community-home-sidebar, .community-invite').getBoundingClientRect().left,
        feed: document.querySelector('.community-feed').getBoundingClientRect().left, overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
      assert.equal(position.overflow, false); if (!mobilePlatform && width >= 1000) assert.ok(position.feed > position.sidebar);
      if (width === 1251 || (mobilePlatform && width === 390)) await page.screenshot({ path: path.join(artifactOutput, mobilePlatform ? 'home-mobile.png' : 'home-desktop.png') });
    }
    recordResult(root, mobilePlatform ? `community-mobile-ui-${mobilePlatform}.json` : 'web-community-detail.json', { results, layouts, errors, syntheticOnly: true, privateData: false, mobilePlatform, nativeDevice: false });
    console.log(`PASS: ${mobilePlatform || 'legacy web'}: ${results.length} interactions, ${layouts.length} responsive detail layouts, ${mobilePlatform ? 'phone' : 'wide'} homepage and intercepted synthetic comment requests.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
