'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { engine, launchBrowser } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await launchBrowser(), outcomes = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'chat-recovery.test') return route.abort();
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://chat-recovery.test";' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, latestBuild: 0, friends: [], posts: [], messages: [], listings: [], notifications: [], items: [] } });
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
  });
  async function check(name, run) {
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto('https://chat-recovery.test/?skipIntro=1');
      await page.evaluate(() => {
        window.dismissTradeIntro?.(); localStorage.clear();
        if (messageUnreadTimer) clearInterval(messageUnreadTimer);
        state = { ...state, ...emptyAccountData(), loggedInPhone: 'audit-a', cloudToken: 'token-a', page: 'messages', policyConsentRequired: false,
          communityChatTextOutbox: {}, communityFriendsInitialized: true, communityConversationState: { clearVersions: {}, hiddenIds: [] },
          communityFriends: [{ id: 'friend-b', name: 'B', lastMessage: '旧记录' }], selectedCommunityFriendId: 'friend-b', selectedCommunityFriend: { id: 'friend-b', name: 'B' },
          communityChatMessages: Array.from({ length: 35 }, (_, i) => ({ id: 'old-' + i, content: '用于上下滚动的历史记录 ' + i, createdAt: '2026-10-05T10:00:00Z' })) };
        communityLoading = messageUnreadLoading = communityChatLoading = false; cloudHydrationComplete = true;
        window.notes = []; toast = value => notes.push(value);
        window.realApiPost = apiPost; window.requests = []; window.gates = [];
        apiPost = async (route, body) => {
          if (route !== '/api/community/chat/send') return { ok: true, friends: state.communityFriends, messages: state.communityChatMessages };
          requests.push(body); return new Promise((resolve, reject) => gates.push({ resolve, reject }));
        };
        edgeBackSnapshots = []; render(); setState({ page: 'communityChat' }, { skipCloud: true, pageMotion: 'none' });
        window.reply = () => ({ ok: true, friend: { id: 'friend-b', name: 'B' }, messages: [{ id: 'sent', content: requests.at(-1).content }], conversationState: { clearVersions: {}, hiddenIds: [] } });
        window.submit = count => { for (let i = 0; i < count; i++) document.querySelector('#communityChatForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); };
        window.touchDefault = () => { const e = new Event('touchmove', { bubbles: true, cancelable: true }); Object.defineProperty(e, 'touches', { value: [{ clientX: 45, clientY: 220 }] }); $app.querySelector('main').dispatchEvent(e); return e.defaultPrevented; };
      });
      await run(page); assert.deepEqual(errors, []); outcomes.push({ name, pass: true });
    } catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
    finally { await page.close(); }
  }
  const input = page => page.locator('#communityChatForm input[name="content"]');
  const button = page => page.locator('#communityChatForm button[type="submit"]');
  async function finish(page, failure = false) { await page.evaluate(failure => { if (failure) gates.at(-1).reject(Error('offline')); else gates.at(-1).resolve(reply()); }, failure); await page.waitForFunction(() => communityChatTextSending.size === 0); }
  async function drag(page, x = 55, y = 220) { await page.mouse.move(5, 220); await page.mouse.down(); await page.mouse.move(x, y, { steps: 3 }); await page.waitForFunction(() => $app.classList.contains('edge-back-dragging')); }
  async function enableNative(page, unavailable = false) {
    await page.evaluate(unavailable => {
      window.nativeCalls = [];
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { TurtleEdgeBack: {
        configure: async payload => { nativeCalls.push({ method: 'configure', ...payload }); if (unavailable) throw Error('not installed'); return { enabled: payload.enabled, generation: payload.generation }; },
        cancel: async payload => { nativeCalls.push({ method: 'cancel', ...payload }); }
      } } };
      $app.syncNativeChatEdgeBack();
      window.nativeEvent = (phase, x = 45, y = 220, extra = {}) => window.dispatchEvent(new CustomEvent('turtle-native-edge-back', { detail: {
        phase, generation: nativeCalls.filter(item => item.method === 'configure').at(-1).generation, sequence: 1,
        startX: 5, startY: 220, x, y, velocityX: 0, width: innerWidth, height: innerHeight, ...extra
      } }));
    }, unavailable);
    await page.waitForTimeout(35);
  }
  try {
    await check('20 rapid submits send once and rerender keeps the pending button disabled', async page => {
      await input(page).fill(' 同一条消息 '); await page.evaluate(() => { for (let i = 0; i < 20; i++) document.querySelector('#communityChatForm input[name="content"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
      assert.equal(await page.evaluate(() => requests.length), 1); assert.equal(await button(page).isDisabled(), true);
      await page.evaluate(() => render()); assert.equal(await button(page).isDisabled(), true);
      const geometry = await page.evaluate(() => { const form = document.querySelector('#communityChatForm').getBoundingClientRect(); const controls = [...document.querySelectorAll('#communityChatForm input[name="content"], #communityChatForm button')].map(node => node.getBoundingClientRect()); return { fits: controls.every(rect => rect.x >= form.x && rect.right <= form.right + 1), inputWidth: controls[0].width }; });
      assert.equal(geometry.fits, true); assert.ok(geometry.inputWidth > 180);
      fs.mkdirSync(path.join(root, 'output/chat-send-qa'), { recursive: true }); await page.screenshot({ path: path.join(root, 'output/chat-send-qa/composer-' + engine + '.png') });
      await finish(page); assert.equal(await input(page).inputValue(), ''); assert.equal(await button(page).isVisible(), false);
      assert.equal(await page.evaluate(() => Object.keys(state.communityChatTextOutbox).length), 0);
    });
    await check('network failure retries the same intent and keeps the draft', async page => {
      await input(page).fill('网络重试'); await page.evaluate(() => submit(1)); await finish(page, true);
      assert.equal(await input(page).inputValue(), '网络重试'); assert.equal(await button(page).isDisabled(), false);
      await page.evaluate(() => { const stored = TurtleLocalData.parse(localStorage.getItem(STORAGE)); window.persistedIntent = stored.communityChatTextOutbox['friend-b']; submit(1); });
      assert.equal(await page.evaluate(() => requests[0].clientMessageId === requests[1].clientMessageId && persistedIntent.clientMessageId === requests[0].clientMessageId), true);
      await finish(page);
    });
    await check('newly typed draft survives the previous send acknowledgement', async page => {
      await input(page).fill('第一条'); await page.evaluate(() => submit(1)); await input(page).fill('第二条草稿'); await finish(page);
      assert.equal(await input(page).inputValue(), '第二条草稿');
    });
    await check('deliberately sending identical text again uses a new request ID', async page => {
      await input(page).fill('好的'); await page.evaluate(() => submit(1)); await finish(page);
      await input(page).fill('好的'); await page.evaluate(() => submit(1));
      assert.equal(await page.evaluate(() => requests[0].clientMessageId !== requests[1].clientMessageId), true); await finish(page);
    });
    await check('late send acknowledgement cannot replace another account chat', async page => {
      await input(page).fill('旧账号消息'); await page.evaluate(() => { submit(1); setState({ loggedInPhone: 'audit-other', cloudToken: 'other-token' }, { skipCloud: true }); }); await finish(page);
      assert.equal(await page.evaluate(() => state.communityChatMessages.length), 0); assert.equal(await page.evaluate(() => notes.length), 0);
    });
    await check('real request timeout releases the send lock and retains retry identity', async page => {
      await page.evaluate(() => {
        apiPost = realApiPost;
        window.setTimeout = ((original) => (callback, delay, ...args) => original(callback, delay === 15000 ? 35 : delay, ...args))(window.setTimeout.bind(window));
        window.fetch = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
      });
      await input(page).fill('超时消息'); await page.evaluate(() => submit(1));
      await page.waitForFunction(() => communityChatTextSending.size === 0 && notes.length > 0);
      assert.match(await page.evaluate(() => notes.at(-1)), /发送超时/); assert.equal(await button(page).isDisabled(), false);
      assert.equal(await page.evaluate(() => Boolean(state.communityChatTextOutbox['friend-b']?.clientMessageId)), true);
    });
    await check('chat polling during an owned drag preserves DOM and completes back once', async page => {
      await input(page).blur(); await drag(page);
      await page.evaluate(() => { window.dragMain = $app.querySelector('main'); setState({ communityChatMessages: [...state.communityChatMessages, { id: 'polled', content: '轮询新消息' }] }, { skipCloud: true }); });
      assert.equal(await page.evaluate(() => dragMain === $app.querySelector('main') && $app.classList.contains('edge-back-dragging')), true);
      assert.equal(await page.evaluate(() => touchDefault()), true);
      await page.mouse.up(); await page.waitForFunction(() => state.page === 'messages');
      assert.equal(await page.evaluate(() => $app.style.transform), ''); assert.equal(await page.locator('.edge-back-preview').count(), 0);
    });
    await check('chat polling during settling cannot cancel the return animation', async page => {
      await drag(page); await page.mouse.up();
      await page.evaluate(() => setState({ communityChatMessages: [...state.communityChatMessages, { id: 'settling', content: '动画期间新消息' }] }, { skipCloud: true }));
      await page.waitForFunction(() => state.page === 'messages');
    });
    await check('owned horizontal back keeps ownership when the finger curves vertically', async page => {
      await drag(page, 40, 220); await page.mouse.move(50, 300); await page.mouse.up(); await page.waitForFunction(() => state.page === 'messages');
    });
    if (engine === 'chromium') await check('native touch back survives a diagonal curve while chat refreshes', async page => {
      const session = await context.newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 5, y: 220 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 30, y: 220 }] });
      await page.waitForFunction(() => $app.classList.contains('edge-back-dragging'));
      await page.evaluate(() => setState({ communityChatMessages: [...state.communityChatMessages, { id: 'native-polled', content: '触摸时刷新' }] }, { skipCloud: true }));
      for (const [x, y] of [[40, 240], [50, 270], [60, 310]]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => state.page === 'messages'); await session.detach();
    });
    await check('reversed swipe cancels and then renders deferred messages', async page => {
      await drag(page, 100, 220); await page.evaluate(() => setState({ communityChatMessages: [...state.communityChatMessages, { id: 'deferred', content: '回弹后新消息' }] }, { skipCloud: true }));
      await page.mouse.move(25, 220); await page.mouse.up();
      await page.waitForFunction(() => $app.textContent.includes('回弹后新消息'));
      assert.equal(await page.evaluate(() => state.page), 'communityChat'); assert.equal(await page.evaluate(() => $app.style.transform), '');
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.community-chat-form')).position), 'fixed');
    });
    await check('vertical gesture keeps native scrolling and never opens the back preview', async page => {
      await page.mouse.move(5, 220); await page.mouse.down(); await page.mouse.move(7, 270);
      assert.equal(await page.evaluate(() => touchDefault()), false); assert.equal(await page.locator('.edge-back-preview').count(), 0); await page.mouse.up();
      assert.equal(await page.evaluate(() => state.page), 'communityChat');
      assert.match(await page.evaluate(() => getComputedStyle(document.querySelector('.community-chat-page')).touchAction), /pan-y/);
      if (engine === 'chromium') {
        const session = await context.newCDPSession(page); await page.evaluate(() => window.scrollTo(0, 0));
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 500 }] });
        for (const y of [470, 430, 390, 340, 280]) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(() => window.scrollY > 30); await session.detach();
      }
    });
    await check('interrupted chat back restores fixed composer and applies pending refresh', async page => {
      await drag(page, 100, 220);
      await page.evaluate(() => { setState({ communityChatMessages: [...state.communityChatMessages, { id: 'interrupted', content: '中断后更新' }] }, { skipCloud: true }); window.dispatchEvent(new Event('blur')); });
      await page.mouse.up(); await page.waitForFunction(() => $app.textContent.includes('中断后更新'));
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.community-chat-form')).position), 'fixed');
      assert.equal(await page.evaluate(() => $app.style.transform), ''); assert.equal(await page.locator('.edge-back-preview').count(), 0);
    });
    await check('iOS bridge takes ownership over a pending vertical gesture and tracks freely', async page => {
      await enableNative(page);
      const payload = await page.evaluate(() => nativeCalls[0]); assert.equal(payload.enabled, true); assert.ok(payload.excludedRegions.length > 0);
      await page.evaluate(() => {
        // Native begin is emitted after UIKit wins arbitration, regardless of
        // any old DOM pointer stream from the scroll it interrupted.
        $app.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: 200, clientY: 400, bubbles: true }));
        nativeEvent('begin', 16, 220); window.nativeMain = $app.querySelector('main');
        nativeEvent('move', 65, 310);
        setState({ communityChatMessages: [...state.communityChatMessages, { id: 'native-update', content: '原生拖动期间新消息' }] }, { skipCloud: true });
      });
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(() => nativeMain === $app.querySelector('main') && $app.classList.contains('edge-back-dragging')), true);
      assert.equal(await page.evaluate(() => nativeCalls.filter(item => item.method === 'configure').length), 1, 'translated composer must not reconfigure/cancel its native owner');
      await page.evaluate(() => nativeEvent('end', 65, 310)); await page.waitForFunction(() => state.page === 'messages');
      await page.waitForFunction(() => nativeCalls.filter(item => item.method === 'configure').at(-1).enabled === false);
    });
    await check('iOS native velocity completes a short edge return', async page => {
      await enableNative(page); await page.evaluate(() => { nativeEvent('begin', 15); nativeEvent('end', 23, 220, { velocityX: 900 }); });
      await page.waitForFunction(() => state.page === 'messages'); assert.equal(await page.locator('.edge-back-preview').count(), 0);
    });
    await check('iOS native cancellation restores the composer and deferred chat update', async page => {
      await enableNative(page); await page.evaluate(() => {
        nativeEvent('begin', 50); setState({ communityChatMessages: [{ id: 'cancel-update', content: '原生取消后新消息' }] }, { skipCloud: true }); nativeEvent('cancel', 50);
      });
      await page.waitForFunction(() => $app.textContent.includes('原生取消后新消息'));
      assert.equal(await page.evaluate(() => state.page), 'communityChat'); assert.equal(await page.evaluate(() => $app.style.transform), '');
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.community-chat-form')).position), 'fixed');
      assert.ok(await page.evaluate(() => nativeCalls.some(item => item.method === 'cancel' && item.sequence === 1)));
    });
    await check('DOM cancellation cannot steal an active UIKit return and duplicate end is ignored', async page => {
      await enableNative(page); await page.evaluate(() => {
        nativeEvent('begin', 45);
        $app.dispatchEvent(new PointerEvent('pointercancel', { pointerId: -1001, pointerType: 'touch', bubbles: true }));
      });
      assert.equal(await page.evaluate(() => $app.classList.contains('edge-back-dragging')), true);
      await page.evaluate(() => { nativeEvent('end', 50); nativeEvent('end', 50); }); await page.waitForFunction(() => state.page === 'messages');
    });
    await check('mounted dialog cancels native ownership and disables its next edge touch', async page => {
      await enableNative(page); await page.evaluate(() => {
        nativeEvent('begin', 45); const dialog = document.createElement('section'); dialog.setAttribute('role', 'dialog'); dialog.textContent = '测试弹窗'; document.body.appendChild(dialog);
      });
      await page.waitForFunction(() => nativeCalls.filter(item => item.method === 'configure').at(-1).enabled === false);
      assert.equal(await page.evaluate(() => $app.style.transform), ''); assert.equal(await page.locator('.edge-back-preview').count(), 0);
      await page.evaluate(() => nativeEvent('begin', 50)); assert.equal(await page.locator('.edge-back-preview').count(), 0);
    });
    await check('old route generation cannot navigate a newly entered chat', async page => {
      await enableNative(page); await page.evaluate(() => {
        window.oldGeneration = nativeCalls[0].generation;
        setState({ page: 'about' }, { skipCloud: true, pageMotion: 'none' });
        setState({ page: 'communityChat' }, { skipCloud: true, pageMotion: 'none' });
      });
      await page.waitForTimeout(35);
      await page.evaluate(() => { nativeEvent('begin', 45, 220, { generation: oldGeneration }); nativeEvent('end', 65, 220, { generation: oldGeneration }); });
      await page.waitForTimeout(450); assert.equal(await page.evaluate(() => state.page), 'communityChat'); assert.equal(await page.locator('.edge-back-preview').count(), 0);
    });
    await check('unavailable native bridge keeps the web edge-back fallback usable', async page => {
      await enableNative(page, true); await drag(page); await page.mouse.up(); await page.waitForFunction(() => state.page === 'messages');
    });
    const report = { engine, outcomes }; fs.mkdirSync(path.join(root, 'output/chat-send-qa'), { recursive: true });
    fs.writeFileSync(path.join(root, 'output/chat-send-qa/ui-' + engine + '.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
    if (outcomes.some(item => !item.pass)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
