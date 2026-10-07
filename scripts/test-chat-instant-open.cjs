'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { engine, launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await launchBrowser(), outcomes = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'instant-chat.test') return route.abort();
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://instant-chat.test";' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, latestBuild: 0, friends: [], posts: [], messages: [] } });
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
  });
  async function check(name, run) {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto('https://instant-chat.test/?skipIntro=1');
      await page.evaluate(() => {
        window.dismissTradeIntro?.(); localStorage.clear(); if (messageUnreadTimer) clearInterval(messageUnreadTimer);
        state = { ...state, ...emptyAccountData(), loggedInPhone: 'instant-account', cloudToken: 'instant-token', page: 'messages', policyConsentRequired: false,
          communityFriendsInitialized: true, communityConversationState: { clearVersions: {}, hiddenIds: [] },
          selectedCommunityFriendId: '', selectedCommunityFriend: null, communityChatMessages: [], communityChatListing: null,
          communityFriends: [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }] };
        communityLoading = messageUnreadLoading = communityChatLoading = false; cloudHydrationComplete = true;
        refreshMessageUnread = refreshCommunity = () => {}; communityChatCachePhone = ''; communityChatCache = new Map();
        window.requests = []; window.notes = []; toast = text => notes.push(text); window.confirm = () => true;
        apiPost = async (route, body) => {
          if (!['/api/community/chat/list', '/api/community/chat/send', '/api/community/chat/delete'].includes(route)) return { ok: true };
          return new Promise((resolve, reject) => requests.push({ route, body, resolve, reject }));
        };
        window.reply = (userId, text = 'cached-' + userId, patch = {}) => ({ ok: true, friend: { id: userId, name: userId === 'a' ? 'Alice' : 'Bob' },
          messages: [{ id: 'msg-' + userId, content: text, rawContent: text, createdAt: '2026-10-07T09:00:00Z' }], marketListing: null, ...patch });
        window.seed = id => { const value = reply(id); cacheCommunityChat(id, value.friend, value.messages, value.marketListing); };
        window.open = id => { window.opening = openCommunityChat(id); };
        window.finish = async (index, value) => { requests[index].resolve(value || reply(requests[index].body.userId)); await Promise.resolve(); await Promise.resolve(); };
        render();
      });
      let timer;
      try { await Promise.race([run(page), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Scenario deadline exceeded: ' + name)), 15000); })]); }
      finally { clearTimeout(timer); }
      assert.deepEqual(errors, []); outcomes.push({ name, pass: true });
    } catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
    finally { await page.close(); }
  }
  try {
    await check('each cached contact shows its own messages synchronously before the network finishes', async page => {
      const result = await page.evaluate(() => {
        seed('a'); seed('b'); open('a'); const a = $app.innerText;
        setState({ page: 'messages' }, { skipCloud: true }); open('b'); const b = $app.innerText;
        setState({ page: 'messages' }, { skipCloud: true }); open('a');
        return { a, b, again: $app.innerText, loading: document.querySelectorAll('.community-chat-opening').length, requests: requests.length };
      });
      assert.match(result.a, /cached-a/); assert.doesNotMatch(result.a, /cached-b/);
      assert.match(result.b, /cached-b/); assert.doesNotMatch(result.b, /cached-a/);
      assert.match(result.again, /cached-a/); assert.equal(result.loading, 0); assert.equal(result.requests, 3);
    });
    await check('uncached chat opens its composer immediately without a blocking spinner', async page => {
      const result = await page.evaluate(() => { open('a'); return { page: state.page, composer: !!document.querySelector('#communityChatForm'), text: $app.innerText }; });
      assert.equal(result.page, 'communityChat'); assert.equal(result.composer, true); assert.doesNotMatch(result.text, /正在打开聊天/);
      await page.evaluate(async () => { await finish(0); await opening; }); assert.match(await page.locator('#app').innerText(), /cached-a/);
    });
    await check('unchanged synchronization preserves chat nodes, images, typing and open tools', async page => {
      await page.evaluate(() => { seed('a'); open('a'); state.communityChatToolsOpen = true; render(); window.main = $app.querySelector('main'); });
      await page.locator('#communityChatForm input[name="content"]').fill('draft while syncing');
      await page.evaluate(async () => { await finish(0); await opening; });
      assert.equal(await page.evaluate(() => main === $app.querySelector('main')), true);
      assert.equal(await page.locator('#communityChatForm input[name="content"]').inputValue(), 'draft while syncing');
      assert.equal(await page.evaluate(() => state.communityChatToolsOpen), true);
    });
    await check('new messages arrive in the background without replaying chat entrance or losing typing', async page => {
      await page.evaluate(() => { seed('a'); open('a'); });
      await page.locator('#communityChatForm input[name="content"]').fill('my unsent draft');
      await page.evaluate(async () => { await finish(0, reply('a', 'new-a')); await opening; });
      assert.match(await page.locator('#app').innerText(), /new-a/);
      assert.equal(await page.locator('#communityChatForm input[name="content"]').inputValue(), 'my unsent draft');
      assert.equal(await page.evaluate(() => readCommunityChatCache('a').messages[0].content), 'new-a');
    });
    await check('late old contact reply cannot overwrite the current contact or release its request lock', async page => {
      await page.evaluate(() => { seed('a'); seed('b'); open('a'); open('b'); });
      await page.evaluate(() => finish(0, reply('a', 'late-a')));
      assert.equal(await page.evaluate(() => state.selectedCommunityFriendId), 'b');
      assert.match(await page.locator('#app').innerText(), /cached-b/); assert.doesNotMatch(await page.locator('#app').innerText(), /late-a/);
      assert.equal(await page.evaluate(() => communityChatLoading), true);
      assert.equal(await page.evaluate(() => readCommunityChatCache('a').messages[0].content), 'late-a');
      await page.evaluate(async () => { await finish(1); await opening; }); assert.equal(await page.evaluate(() => communityChatLoading), false);
    });
    await check('superseded reply for the same contact cannot roll back the latest timeline', async page => {
      await page.evaluate(() => { seed('a'); open('a'); open('a'); });
      await page.evaluate(async () => { await finish(1, reply('a', 'latest-a')); await opening; await finish(0, reply('a', 'obsolete-a')); });
      assert.match(await page.locator('#app').innerText(), /latest-a/); assert.doesNotMatch(await page.locator('#app').innerText(), /obsolete-a/);
      assert.equal(await page.evaluate(() => readCommunityChatCache('a').messages[0].content), 'latest-a');
    });
    await check('cached history survives a failed synchronization and remains writable', async page => {
      await page.evaluate(() => { seed('a'); open('a'); window.main = $app.querySelector('main'); });
      await page.evaluate(async () => { requests[0].reject(Error('offline')); await opening; });
      assert.match(await page.locator('#app').innerText(), /cached-a/); assert.equal(await page.evaluate(() => main === $app.querySelector('main')), true);
      await page.locator('#communityChatForm input[name="content"]').fill('still typing');
      assert.equal(await page.evaluate(() => notes.length), 0);
    });
    await check('device cache restores after a real page reload and remains account isolated', async page => {
      await page.evaluate(() => { seed('a'); saveState({ skipCloud: true }); });
      await page.reload();
      const result = await page.evaluate(() => { if (messageUnreadTimer) clearInterval(messageUnreadTimer); return readCommunityChatCache('a'); });
      assert.equal(result?.messages[0].content, 'cached-a');
      const other = await page.evaluate(() => { setState({ loggedInPhone: 'other-account', cloudToken: 'other-token', page: 'messages' }, { skipCloud: true }); return readCommunityChatCache('a'); });
      assert.equal(other, null);
    });
    await check('account switch ignores a late reply and resets busy state', async page => {
      await page.evaluate(() => { seed('a'); open('a'); setState({ loggedInPhone: 'other-account', cloudToken: 'other-token', page: 'messages' }, { skipCloud: true }); });
      await page.evaluate(() => finish(0, reply('a', 'private-old-account')));
      assert.doesNotMatch(await page.locator('#app').innerText(), /private-old-account/);
      assert.equal(await page.evaluate(() => readCommunityChatCache('a')), null); assert.equal(await page.evaluate(() => communityChatLoading), false);
    });
    await check('deletion removes cache immediately and failed deletion restores only that contact', async page => {
      await page.evaluate(() => { seed('a'); seed('b'); window.deleting = deleteCommunityConversation('a'); });
      assert.equal(await page.evaluate(() => communityChatCache.has('a')), false);
      await page.evaluate(async () => { requests[0].reject(Error('offline')); await deleting; });
      assert.equal(await page.evaluate(() => readCommunityChatCache('a').messages[0].content), 'cached-a');
      assert.equal(await page.evaluate(() => readCommunityChatCache('b').messages[0].content), 'cached-b');
    });
    await check('another device clear invalidates inactive contact cache and keeps other contacts', async page => {
      const result = await page.evaluate(() => { seed('a'); seed('b'); reconcileCommunityConversationState({ conversationState: { clearVersions: { a: 'new-clear' }, hiddenIds: ['a'] } });
        open('a'); return { a: readCommunityChatCache('a'), b: readCommunityChatCache('b'), text: $app.innerText }; });
      assert.equal(result.a, null); assert.equal(result.b.messages[0].content, 'cached-b'); assert.doesNotMatch(result.text, /cached-a/);
    });
    await check('recall with unchanged message id refreshes both visible bubble and device cache', async page => {
      await page.evaluate(() => { seed('a'); open('a'); });
      await page.evaluate(async () => { const value = reply('a'); value.messages[0].recalled = true; await finish(0, value); await opening; });
      assert.match(await page.locator('#app').innerText(), /对方撤回了一条消息/);
      assert.equal(await page.evaluate(() => readCommunityChatCache('a').messages[0].recalled), true);
    });
    await check('send acknowledgement updates its own cache while another contact stays visible', async page => {
      await page.evaluate(() => { seed('a'); seed('b'); window.request = communityChatRequestContext('a'); open('b'); applyCommunityChatSendResult(reply('a', 'sent-a'), { requestContext: request }); });
      assert.match(await page.locator('#app').innerText(), /cached-b/); assert.doesNotMatch(await page.locator('#app').innerText(), /sent-a/);
      assert.equal(await page.evaluate(() => readCommunityChatCache('a').messages[0].content), 'sent-a');
    });
    await check('cached product video cover is present before the chat request finishes', async page => {
      const result = await page.evaluate(() => { const value = reply('a'); cacheCommunityChat('a', value.friend, value.messages,
        { id: 'product', title: 'Video product', price: 25, city: '上海市', mediaUrl: '/video.mp4', mediaType: 'video', mediaPosterUrl: '/cover.jpg', status: 'active' });
        open('a'); return { title: document.querySelector('.community-chat-product-info strong')?.textContent, cover: document.querySelector('.community-chat-product-media img')?.getAttribute('src') }; });
      assert.equal(result.title, 'Video product'); assert.match(result.cover, /cover\.jpg$/);
    });
    await check('seller inquiry opens cached history and late acknowledgement preserves the next contact draft', async page => {
      await page.evaluate(() => {
        seed('a'); seed('b'); recordMarketWant = () => {};
        state.marketListings = [{ id: 'product', title: 'My product', sellerId: 'a', sellerName: 'Alice', status: 'active', price: 25 }];
        window.contacting = contactMarketSeller('product');
      });
      assert.match(await page.locator('#app').innerText(), /cached-a/);
      await page.evaluate(() => open('b'));
      await page.locator('#communityChatForm input[name="content"]').fill('Bob draft');
      await page.evaluate(async () => { requests.find(item => item.route === '/api/community/chat/send').resolve(reply('a', 'seller-ack')); await contacting; });
      assert.match(await page.locator('#app').innerText(), /cached-b/); assert.doesNotMatch(await page.locator('#app').innerText(), /seller-ack/);
      assert.equal(await page.locator('#communityChatForm input[name="content"]').inputValue(), 'Bob draft');
      assert.equal(await page.evaluate(() => marketChatDraft), 'Bob draft');
      assert.equal(await page.evaluate(() => communityChatLoading), true);
      assert.equal(await page.evaluate(() => readCommunityChatCache('a').messages[0].content), 'seller-ack');
    });
    await check('cancelling logout keeps cached history and the active account', async page => {
      const result = await page.evaluate(() => { seed('a'); window.confirm = () => false; logoutAccount();
        return { phone: state.loggedInPhone, cache: readCommunityChatCache('a'), stored: localStorage.getItem(CHAT_CACHE_STORAGE + 'instant-account') }; });
      assert.equal(result.phone, 'instant-account'); assert.equal(result.cache.messages[0].content, 'cached-a'); assert.ok(result.stored);
    });
    await check('cache is bounded and logout removes private device history', async page => {
      const result = await page.evaluate(() => { for (let i = 0; i < 45; i++) cacheCommunityChat('contact-' + i, { id: 'contact-' + i },
        Array.from({ length: 250 }, (_, j) => ({ id: String(j), content: 'message' })), null);
        const count = communityChatCache.size, messages = readCommunityChatCache('contact-44').messages.length;
        logoutAccount(); return { count, messages, stored: localStorage.getItem(CHAT_CACHE_STORAGE + 'instant-account'), memory: communityChatCache.size }; });
      assert.ok(result.count <= 40); assert.equal(result.messages, 200); assert.equal(result.stored, null); assert.equal(result.memory, 0);
    });
    recordResult(root, 'chat-instant-open.json', { outcomes, externalTraffic: false });
    console.log(JSON.stringify({ engine, outcomes }, null, 2)); assert.ok(outcomes.every(item => item.pass));
  } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
