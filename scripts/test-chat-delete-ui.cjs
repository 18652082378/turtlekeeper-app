'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { engine, launchBrowser } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await launchBrowser(), outcomes = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'chat-delete.test') return route.abort();
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://chat-delete.test";' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, latestBuild: 0, friends: [], posts: [], messages: [], listings: [], notifications: [], items: [] } });
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
  });
  async function check(name, run) {
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto('https://chat-delete.test/?skipIntro=1');
      await page.evaluate(() => {
        window.dismissTradeIntro?.(); localStorage.clear(); window.confirm = () => true;
        if (messageUnreadTimer) clearInterval(messageUnreadTimer);
        state = { ...state, ...emptyAccountData(), loggedInPhone: 'audit-a', cloudToken: 'token-a', registeredUsers: [], page: 'messages', policyConsentRequired: false,
          communityFriendsInitialized: true, communityConversationState: { clearVersions: {}, hiddenIds: [] },
          communityFriends: [{ id: 'friend-b', name: 'B', lastMessage: '旧记录', lastMessageAt: '2026-10-01T10:00:00Z', unreadCount: 2 }, { id: 'friend-c', name: 'C', lastMessage: '其他会话', unreadCount: 1 }],
          selectedCommunityFriendId: 'friend-b', selectedCommunityFriend: { id: 'friend-b', name: 'B' },
          communityChatMessages: [{ id: 'old-message', content: '旧记录', createdAt: '2026-10-01T10:00:00Z' }], communityChatListing: { id: 'old-product' }, messageUnreadCount: 3 };
        communityLoading = messageUnreadLoading = communityChatLoading = false; cloudHydrationComplete = true;
        window.notes = []; toast = value => notes.push(value);
        window.gates = {}; window.requests = [];
        window.deleteResult = { ok: true, friends: [state.communityFriends[1]], conversationState: { clearVersions: { 'friend-b': 'clear-1' }, hiddenIds: ['friend-b'] } };
        window.chatResult = { ok: true, friend: { id: 'friend-b', name: 'B' }, messages: [], marketListing: null, conversationState: deleteResult.conversationState };
        apiPost = async (route, body) => {
          requests.push({ route, body });
          if (route === '/api/community/chat/delete' || route === '/api/community/chat/list' || route === '/api/community/unread' || route === '/api/community/list')
            return new Promise((resolve, reject) => { gates[route] = { resolve, reject }; });
          return { ok: true };
        };
        render();
        window.beginDelete = () => { window.deleting = deleteCommunityConversation('friend-b'); };
        window.finishDelete = async () => { gates['/api/community/chat/delete'].resolve(deleteResult); if (window.deleting) await window.deleting; else await Promise.resolve(); };
      });
      await run(page); assert.deepEqual(errors, []); outcomes.push({ name, pass: true });
    } catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
    finally { await page.close(); }
  }
  try {
    await check('confirmed deletion immediately removes the native swipe row and cached timeline', async page => {
      await page.evaluate(() => { document.querySelector('[data-conversation-id="friend-b"]').classList.add('is-native-scrolling'); document.querySelector('[data-delete-conversation="friend-b"]').click(); });
      assert.equal(await page.locator('[data-conversation-id="friend-b"]').count(), 0);
      assert.equal(await page.evaluate(() => state.communityChatMessages.length), 0);
      await page.evaluate(() => finishDelete()); assert.equal(await page.locator('[data-conversation-id="friend-b"]').count(), 0);
    });
    await check('old unread response cannot restore a deleted conversation', async page => {
      await page.evaluate(() => { window.polling = refreshMessageUnread(true); beginDelete(); });
      await page.evaluate(() => finishDelete());
      await page.evaluate(async () => { gates['/api/community/unread'].resolve({ ok: true, friends: [{ id: 'friend-b', lastMessage: '旧记录' }], unreadCount: 2 }); await polling; });
      assert.equal(await page.locator('[data-conversation-id="friend-b"]').count(), 0); assert.ok(await page.evaluate(() => !state.communityFriends.some(friend => friend.id === 'friend-b')));
    });
    await check('failed deletion restores only that row and its cache without losing other updates', async page => {
      await page.evaluate(() => { beginDelete(); state.communityFriends = state.communityFriends.map(friend => ({ ...friend, lastMessage: 'C的新消息' })); });
      await page.evaluate(async () => { gates['/api/community/chat/delete'].reject(Error('offline')); await deleting; });
      assert.equal(await page.locator('[data-conversation-id="friend-b"]').count(), 1);
      assert.equal(await page.evaluate(() => state.communityFriends.find(friend => friend.id === 'friend-c').lastMessage), 'C的新消息');
      assert.equal(await page.evaluate(() => state.communityChatMessages[0]?.id), 'old-message');
    });
    await check('switching account while delete is pending ignores its late success', async page => {
      await page.evaluate(() => { beginDelete(); setState({ loggedInPhone: 'audit-other', cloudToken: 'other-token', page: 'messages' }, { skipCloud: true }); });
      await page.evaluate(() => finishDelete()); assert.equal(await page.evaluate(() => state.communityFriends.length), 0); assert.equal(await page.evaluate(() => notes.length), 0);
    });
    await check('renewing the same account session does not leave conversation refresh permanently blocked', async page => {
      await page.evaluate(() => { beginDelete(); setState({ cloudToken: 'renewed-token' }, { skipCloud: true }); });
      await page.evaluate(() => finishDelete());
      assert.equal(await page.evaluate(() => communityConversationDeleting.size), 0);
      assert.equal(await page.evaluate(() => notes.length), 0);
      await page.evaluate(() => { window.polling = refreshMessageUnread(true); });
      await page.evaluate(async () => { gates['/api/community/unread'].resolve(deleteResult); await polling; });
      assert.equal(await page.locator('[data-conversation-id="friend-b"]').count(), 0);
      assert.equal(await page.evaluate(() => state.communityConversationState.clearVersions['friend-b']), 'clear-1');
    });
    await check('opening after a successful delete is empty and does not recreate a conversation row', async page => {
      await page.evaluate(() => beginDelete()); await page.evaluate(() => finishDelete());
      await page.evaluate(() => { window.opening = openCommunityChat('friend-b'); });
      assert.equal(await page.evaluate(() => state.communityChatMessages.length), 0);
      await page.evaluate(async () => { gates['/api/community/chat/list'].resolve(chatResult); await opening; });
      assert.equal(await page.evaluate(() => state.communityChatMessages.length), 0); assert.equal(await page.evaluate(() => state.communityChatListing), null);
      await page.evaluate(() => setState({ page: 'messages' }, { skipCloud: true })); assert.equal(await page.locator('[data-conversation-id="friend-b"]').count(), 0);
    });
    await check('late conversation open response cannot restore deleted bubbles', async page => {
      await page.evaluate(() => { window.opening = openCommunityChat('friend-b'); setState({ page: 'messages' }, { skipCloud: true }); beginDelete(); });
      await page.evaluate(() => finishDelete());
      await page.evaluate(async () => { gates['/api/community/chat/list'].resolve({ ok: true, friend: { id: 'friend-b', name: 'B' }, messages: [{ id: 'old-message', content: '旧记录' }] }); await opening; });
      assert.equal(await page.evaluate(() => state.communityChatMessages.length), 0); assert.equal(await page.locator('[data-conversation-id="friend-b"]').count(), 0);
    });
    await check('clear from another device removes local cache and the visible chat bubbles', async page => {
      await page.evaluate(() => { setState({ page: 'communityChat' }, { skipCloud: true }); window.polling = refreshMessageUnread(true); });
      await page.evaluate(async () => { gates['/api/community/unread'].resolve(deleteResult); await polling; });
      assert.equal(await page.evaluate(() => state.communityChatMessages.length), 0); assert.ok(!(await page.locator('#app').innerText()).includes('旧记录'));
      await page.evaluate(() => setState({ page: 'messages' }, { skipCloud: true })); assert.equal(await page.locator('[data-conversation-id="friend-b"]').count(), 0);
    });
    await check('a fresh new message restores the row and only the new timeline', async page => {
      await page.evaluate(() => beginDelete()); await page.evaluate(() => finishDelete());
      await page.evaluate(() => { window.polling = refreshMessageUnread(true); });
      await page.evaluate(async () => {
        gates['/api/community/unread'].resolve({ ok: true, friends: [{ id: 'friend-b', name: 'B', lastMessage: '新消息', lastMessageAt: '2026-10-02T10:00:00Z' }], conversationState: { clearVersions: { 'friend-b': 'clear-1' }, hiddenIds: [] } }); await polling;
        window.opening = openCommunityChat('friend-b');
      });
      assert.equal(await page.evaluate(() => state.communityChatMessages.length), 0);
      await page.evaluate(async () => { gates['/api/community/chat/list'].resolve({ ...chatResult, messages: [{ id: 'new-message', content: '新消息' }], conversationState: { clearVersions: { 'friend-b': 'clear-1' }, hiddenIds: [] } }); await opening; });
      assert.deepEqual(await page.evaluate(() => state.communityChatMessages.map(item => item.id)), ['new-message']);
    });
    await check('navigation snapshots cannot restore the cleared timeline or old message row', async page => {
      await page.evaluate(() => {
        const template = document.createElement('template'); template.innerHTML = $app.innerHTML;
        edgeBackSnapshots = [{ page: 'messages', liveDom: template.content, html: $app.innerHTML }, { page: 'communityChat', html: '旧记录' }];
        beginDelete();
      });
      await page.evaluate(() => finishDelete());
      assert.ok(await page.evaluate(() => edgeBackSnapshots.every(snapshot => snapshot.page !== 'communityChat' && !snapshot.html.includes('data-conversation-id="friend-b"'))));
    });
    await check('cancelled deletion keeps the row and makes no request', async page => {
      await page.evaluate(() => { window.confirm = () => false; beginDelete(); });
      assert.equal(await page.locator('[data-conversation-id="friend-b"]').count(), 1); assert.equal(await page.evaluate(() => requests.filter(item => item.route === '/api/community/chat/delete').length), 0);
    });
    await check('a late send response from before deletion cannot restore the cache', async page => {
      await page.evaluate(() => { window.oldSendContext = communityChatRequestContext(); beginDelete(); }); await page.evaluate(() => finishDelete());
      await page.evaluate(() => applyCommunityChatSendResult({ friend: { id: 'friend-b', name: 'B' }, messages: [{ id: 'old-message', content: '旧记录' }] }, { requestContext: oldSendContext }));
      assert.equal(await page.evaluate(() => state.communityChatMessages.length), 0); assert.equal(await page.locator('[data-conversation-id="friend-b"]').count(), 0);
    });
    const report = { engine, outcomes }; fs.mkdirSync(path.join(root, 'output/chat-delete-qa'), { recursive: true });
    fs.writeFileSync(path.join(root, 'output/chat-delete-qa/ui-' + (process.env.CHAT_DELETE_BEFORE ? 'before' : engine) + '.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2)); if (outcomes.some(item => !item.pass)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
