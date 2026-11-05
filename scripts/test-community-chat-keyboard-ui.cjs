'use strict';

// Browser-only fixtures and intercepted requests; never contacts a live account.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { engine, launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
const platform = process.env.COMMUNITY_MOBILE_PLATFORM || process.env.MOBILE_UI_PLATFORM || 'web';
assert.ok(['web', 'ios', 'android'].includes(platform));
const localPreview = process.argv.includes('--local-preview');
const localIndex = 'C:/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app/index.html';
const assetRoot = localPreview ? path.resolve(path.dirname(localIndex)) : process.argv.includes('--source') ? root
  : platform === 'ios' ? path.join(root, 'ios/App/App/public') : platform === 'android' ? path.join(root, 'android/app/src/main/assets/public') : root;
const fixture = require('./ui-audit-fixture.cjs')();
const inputSelector = '#communityChatForm input[name="content"]';

(async () => {
  const browser = await launchBrowser({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const errors = [], results = [];
  page.setDefaultTimeout(6000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(platform => {
    window.keyboardCalls = [];
    if (platform === 'web') return;
    const app = { getInfo: async () => ({ build: '139' }), getLaunchUrl: async () => ({}), addListener: async () => ({ remove() {} }) };
    const push = { checkPermissions: async () => ({ receive: 'denied' }), addListener: async () => ({ remove() {} }), register: async () => {}, unregister: async () => {} };
    const bars = { setTheme: async () => {}, getDisplayMetrics: async () => ({}), addListener: async () => ({ remove() {} }), hideKeyboard: async () => keyboardCalls.push('hide') };
    const keyboard = { setAccessoryBarVisible: async ({ isVisible }) => keyboardCalls.push(isVisible), hide: async () => keyboardCalls.push('hide') };
    const plugins = { App: app, PushNotifications: push, TurtleAndroidWindow: bars, TurtleAndroidPush: push, ...(platform === 'ios' ? { Keyboard: keyboard } : {}) };
    window.Capacitor = { getPlatform: () => platform, isNativePlatform: () => true, isPluginAvailable: name => Boolean(plugins[name]), Plugins: plugins, registerPlugin: name => plugins[name] || {} };
  }, platform);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/config.js')) return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";window.TURTLE_APP_BUILD=139;window.TURTLE_APP_VERSION="1.1.9";' });
    if (localPreview && url.protocol === 'file:') return route.continue();
    if (url.hostname !== 'chat-keyboard.test') return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, latestBuild: 0, friends: [], messages: [], posts: [], listings: [], items: [], notifications: [] } });
    const file = path.resolve(assetRoot, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(assetRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' })[path.extname(file)] || 'application/octet-stream' });
  });
  async function check(name, run) {
    await run();
    assert.deepEqual(errors, []);
    results.push(name);
  }
  async function snapshot() {
    return page.evaluate(selector => {
      const input = document.querySelector(selector);
      return { value: input.value, start: input.selectionStart, end: input.selectionEnd, focused: input === document.activeElement, draft: marketChatDraft,
        hideCalls: keyboardCalls.filter(value => value === 'hide').length, recipient: state.selectedCommunityFriendId };
    }, inputSelector);
  }
  async function draft(text, start = text.length, end = start) {
    await page.locator(inputSelector).fill(text);
    await page.locator(inputSelector).evaluate((input, selection) => { input.focus(); input.setSelectionRange(selection.start, selection.end); document.dispatchEvent(new Event('selectionchange')); }, { start, end });
  }
  async function drag({ selector = '.community-chat-list', dx = 0, dy = 45, multi = false, phase = 'all', identifier = 1 } = {}) {
    return page.evaluate(({ selector, dx, dy, multi, phase, identifier }) => {
      const target = document.querySelector(selector);
      const touch = (x, y, id = identifier) => ({ identifier: id, target, clientX: x, clientY: y });
      const event = (name, touches) => {
        const value = new Event(name, { bubbles: true, cancelable: true });
        Object.defineProperty(value, 'touches', { value: touches }); target.dispatchEvent(value); return value.defaultPrevented;
      };
      const prevented = [];
      if (phase !== 'move') prevented.push(event('touchstart', multi ? [touch(100, 200), touch(130, 200, 2)] : [touch(100, 200)]));
      if (phase !== 'start') {
        prevented.push(event('touchmove', multi ? [touch(100 + dx, 200 + dy), touch(130, 200, 2)] : [touch(100 + dx, 200 + dy)]));
        prevented.push(event('touchend', []));
      }
      return prevented;
    }, { selector, dx, dy, multi, phase, identifier });
  }
  async function open(userId) { await page.evaluate(userId => openCommunityChat(userId), userId); }
  try {
    // WebKit uses the same entry and versioned asset bytes behind a test origin.
    await page.goto(localPreview && engine !== 'webkit' ? pathToFileURL(localIndex).href + '?skipIntro=1' : 'https://chat-keyboard.test/?skipIntro=1');
    await page.evaluate(fixture => {
      dismissTradeIntro?.(); window.TurtleReleaseNotes?.cancel();
      const friend = { ...fixture.communityFriends[0], id: 'chat-a', name: '合成龟友甲' };
      const second = { ...friend, id: 'chat-b', name: '合成龟友乙' };
      state = { ...initialState, ...emptyAccountData(), ...fixture, loggedInPhone: '13000000000', cloudToken: 'chat-keyboard-synthetic', page: 'communityChat',
        selectedCommunityFriendId: friend.id, selectedCommunityFriend: friend, communityFriends: [friend, second], communityChatMessages: fixture.communityChatMessages,
        communityConversationState: { clearVersions: {}, hiddenIds: [] } };
      forceUpdateState = { required: false }; marketChatDraft = ''; communityChatOpening = false;
      pendingPageEnterMotion = false; edgeBackSnapshots = []; canUseCommunity = () => true;
      render();
    }, fixture);
    assert.equal(await page.evaluate(() => TurtleMobileCommunity?.revision), '20261101-chat-keyboard');
    await check('Vertical message-list gestures dismiss in both directions, retain text and caret, and keep native scrolling', async () => {
      for (const dy of [-45, 45]) {
        await draft('尚未发送的私信内容', 2, 5);
        const before = await snapshot();
        assert.deepEqual(await drag({ dy }), [false, false, false]);
        const after = await snapshot();
        assert.equal(after.focused, false); assert.equal(after.value, before.value); assert.equal(after.draft, before.value);
        assert.equal(after.start, 2); assert.equal(after.end, 5); assert.equal(after.recipient, 'chat-a');
        assert.equal(after.hideCalls, before.hideCalls + (platform === 'web' ? 0 : 1));
        await page.evaluate(() => render());
        assert.deepEqual(await snapshot(), after, 'rerender after dismissal must not reopen the keyboard or lose the caret');
      }
    });
    await check('Horizontal gestures, input selection, short drags, dialogs, multitouch and cancelled gestures keep the input focused', async () => {
      await draft('选择文字时不收键盘', 1, 4);
      await page.evaluate(() => {
        const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); dialog.id = 'chat-test-dialog';
        document.querySelector('.community-chat-list').append(dialog);
      });
      for (const options of [{ dx: 70, dy: 3 }, { dy: 11 }, { selector: inputSelector }, { selector: '#chat-test-dialog' }, { multi: true }]) {
        const before = await snapshot(); await drag(options); const after = await snapshot();
        assert.equal(after.focused, true); assert.equal(after.hideCalls, before.hideCalls); assert.equal(after.value, before.value);
      }
      await drag({ phase: 'start' });
      await page.evaluate(() => document.querySelector('.community-chat-list').dispatchEvent(new Event('touchcancel', { bubbles: true })));
      await drag({ phase: 'move' }); assert.equal((await snapshot()).focused, true);
    });
    await check('Incoming-message rerenders retain the focused input and selected range', async () => {
      await draft('来消息时继续编辑', 2, 6);
      await page.locator(inputSelector).evaluate(input => input.setSelectionRange(2, 6, 'backward'));
      await page.evaluate(() => setState({ communityChatMessages: [...state.communityChatMessages, { id: 'chat-incoming', content: '合成新消息', createdAt: new Date().toISOString() }] }, { skipCloud: true, preserveInputValues: true }));
      const current = await snapshot();
      assert.equal(current.value, '来消息时继续编辑'); assert.equal(current.draft, current.value);
      assert.equal(current.focused, true); assert.equal(current.start, 2); assert.equal(current.end, 6);
    });
    await check('Returning from a profile snapshot keeps the live editor associated with its conversation', async () => {
      for (const htmlFallback of [false, true]) {
        await draft('返回聊天后继续输入', 2, 5);
        await page.evaluate(htmlFallback => {
          setState({ page: 'communityProfile', selectedCommunityUserId: state.selectedCommunityFriendId }, { skipCloud: true });
          if (htmlFallback) edgeBackSnapshots[edgeBackSnapshots.length - 1].liveDom = null;
          navigateBack();
        }, htmlFallback);
        assert.equal((await snapshot()).value, '返回聊天后继续输入');
        await page.locator(inputSelector).focus();
        await page.locator(inputSelector).evaluate(input => input.setSelectionRange(1, 4, 'backward'));
        await page.evaluate(() => render());
        const current = await snapshot(); assert.equal(current.focused, true); assert.equal(current.start, 1); assert.equal(current.end, 4);
        assert.equal(await page.locator(inputSelector).evaluate(input => input.selectionDirection), 'backward');
      }
    });
    await check('Recipient changes retain separate drafts and carets without carrying focus into another conversation', async () => {
      await draft('龟友甲的草稿', 2, 4); await open('chat-b');
      assert.equal((await snapshot()).value, ''); assert.equal((await snapshot()).focused, false);
      await draft('龟友乙的草稿', 1, 3); await open('chat-a');
      let current = await snapshot(); assert.equal(current.value, '龟友甲的草稿'); assert.equal(current.start, 2); assert.equal(current.end, 4);
      await open('chat-b'); current = await snapshot(); assert.equal(current.value, '龟友乙的草稿'); assert.equal(current.start, 1); assert.equal(current.end, 3);
    });
    await check('A gesture started in another conversation cannot close the current keyboard', async () => {
      await draft('手势切换测试'); await drag({ phase: 'start' });
      await open('chat-a'); await page.locator(inputSelector).focus();
      const before = await snapshot(); await drag({ phase: 'move' });
      const after = await snapshot(); assert.equal(after.focused, true); assert.equal(after.hideCalls, before.hideCalls);
    });
    await check('Successful sends clear cached drafts; a late send for another recipient preserves the visible draft', async () => {
      await draft('这条已发送');
      await page.evaluate(() => applyCommunityChatSendResult({ messages: [], friend: state.selectedCommunityFriend }, { draft: '' }));
      assert.equal((await snapshot()).value, ''); await open('chat-b'); await open('chat-a'); assert.equal((await snapshot()).value, '');
      await draft('另一条已发送'); await page.evaluate(() => { window.chatPendingRequest = communityChatRequestContext(); });
      await open('chat-b'); await draft('龟友乙继续输入', 2, 3);
      await page.evaluate(() => applyCommunityChatSendResult({ messages: [], friend: state.communityFriends.find(friend => friend.id === 'chat-a') }, { requestContext: chatPendingRequest, draft: '' }));
      assert.equal((await snapshot()).value, '龟友乙继续输入');
      await open('chat-a'); assert.equal((await snapshot()).value, '');
      await draft('这条仍在发送');
      await page.evaluate(() => { window.chatPendingRequest = communityChatRequestContext(); });
      await open('chat-b'); await open('chat-a'); await draft('等待期间另写的新私信', 2, 4); await open('chat-b');
      await page.evaluate(() => applyCommunityChatSendResult({ messages: [], friend: state.communityFriends.find(friend => friend.id === 'chat-a') }, { requestContext: chatPendingRequest, draft: '' }));
      await open('chat-a'); assert.equal((await snapshot()).value, '等待期间另写的新私信', 'A late offscreen acknowledgement cannot clear newer unsent text');
      assert.equal((await snapshot()).start, 2); assert.equal((await snapshot()).end, 4);
      await page.evaluate(() => { window.chatPendingRequest = communityChatRequestContext(); });
      await draft('页面里继续输入的新内容', 1, 3);
      await page.evaluate(() => applyCommunityChatSendResult({ messages: [], friend: state.selectedCommunityFriend }, { requestContext: chatPendingRequest, draft: '' }));
      assert.equal((await snapshot()).value, '页面里继续输入的新内容', 'The same guard must protect the currently visible editor');
    });
    await check('An automatic market inquiry clears its original text but preserves edits made while its send is pending', async () => {
      for (const edited of [false, true]) {
        await page.evaluate(() => {
          const listing = { id: 'chat-inquiry-listing', title: '合成咨询商品', status: 'active', sellerId: 'chat-a', sellerName: '合成龟友甲', speciesCode: 'GHG', price: 588 };
          state.marketListings = normalizeMarketListings([listing]);
          window.inquiryOriginalApi = apiPost;
          window.inquirySentBody = null;
          apiPost = (url, body, ...rest) => url === '/api/community/chat/send'
            ? new Promise(resolve => { window.inquirySentBody = body; window.resolveInquiry = resolve; })
            : inquiryOriginalApi(url, body, ...rest);
          window.inquiryPending = contactMarketSeller(listing.id);
        });
        await page.waitForFunction(() => Boolean(window.inquirySentBody));
        assert.match((await snapshot()).value, /你好，我想咨询「合成咨询商品」/);
        if (edited) await draft('等待咨询结果时编辑的新内容', 2, 5);
        await page.evaluate(async () => {
          resolveInquiry({ ok: true, friend: state.communityFriends.find(friend => friend.id === 'chat-a'), messages: [] });
          await inquiryPending;
          apiPost = inquiryOriginalApi;
        });
        assert.equal((await snapshot()).value, edited ? '等待咨询结果时编辑的新内容' : '');
        if (edited) { assert.equal((await snapshot()).start, 2); assert.equal((await snapshot()).end, 5); }
      }
    });
    await check('Cleared or hidden conversations and changed account sessions cannot resurrect private drafts', async () => {
      await draft('清空前的草稿');
      await page.evaluate(() => { state.communityConversationState = { clearVersions: { 'chat-a': 'cleared-1' }, hiddenIds: [] }; marketChatDraft = ''; render(); });
      assert.equal((await snapshot()).value, ''); await open('chat-b'); await open('chat-a'); assert.equal((await snapshot()).value, '');
      await draft('删除前的草稿'); await open('chat-b');
      await page.evaluate(() => { state.communityConversationState.hiddenIds = ['chat-a']; render(); state.communityConversationState.hiddenIds = []; });
      await open('chat-a'); assert.equal((await snapshot()).value, '');
      await draft('属于旧账号的私信');
      await page.evaluate(() => { state.loggedInPhone = '13100000000'; state.cloudToken = 'chat-other-session'; render(); });
      assert.equal((await snapshot()).value, ''); assert.equal((await snapshot()).draft, '');
      await page.evaluate(() => { state.loggedInPhone = '13000000000'; state.cloudToken = 'chat-keyboard-synthetic'; render(); });
      assert.equal((await snapshot()).value, '');
    });
    recordResult(root, `community-chat-keyboard-ui-${platform}.json`, { assetRoot, localPreview, cases: results, errors });
    console.log(`PASS: ${results.length} private-chat keyboard/draft cases (${platform}); no live accounts or requests.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
