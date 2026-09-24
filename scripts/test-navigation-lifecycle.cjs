const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'output'), { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  const outcomes = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'lifecycle.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
    });
    async function check(name, test) {
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto('https://lifecycle.test/?skipIntro=1');
        await page.evaluate(() => {
          window.dismissTradeIntro?.();
          state = { ...state, ...emptyAccountData(), loggedInPhone: 'preview', cloudToken: '', policyConsentRequired: false, page: 'market' };
          state.marketListings = Array.from({ length: 25 }, (_, i) => ({ id: 'nav' + i, title: '测试龟 ' + i, speciesCode: 'GHG', speciesName: '果核蛋龟', price: 100, status: 'active' }));
          state.marketFeedInitialized = true; state.marketFeedHasMore = false;
          edgeBackSnapshots = []; render();
          window.auditTouch = (type, target, x, y, count = 1) => {
            const event = new Event(type, { bubbles: true });
            Object.defineProperty(event, 'touches', { value: Array.from({ length: count }, () => ({ clientX: x, clientY: y })) });
            target.dispatchEvent(event);
          };
        });
        await test(page);
        assert.deepEqual(errors, [], 'no runtime errors');
        outcomes.push({ name, pass: true });
      } catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
      finally { await page.close(); }
    }
    async function secondary(page) {
      await page.evaluate(() => { setState({ page: 'about' }, { skipSave: true }); setState({ page: 'rules' }, { skipSave: true }); });
      await page.waitForFunction(() => !$app.classList.contains('page-enter-motion'));
    }
    async function swipe(page, release = true) {
      await page.mouse.move(5, 220); await page.mouse.down(); await page.mouse.move(205, 221, { steps: 5 });
      if (release) await page.mouse.up();
    }
    await check('back during settling returns only one level', async page => {
      await secondary(page); await swipe(page);
      await page.evaluate(() => navigateBack());
      await page.waitForTimeout(600); // Exceed both transition and fallback timer.
      assert.equal(await page.evaluate(() => state.page), 'about');
    });
    await check('rerender during drag restores fixed layers', async page => {
      await secondary(page); await swipe(page, false);
      await page.evaluate(() => render());
      assert.equal(await page.locator('#app > .bottom-nav').evaluate(n => getComputedStyle(n).position), 'fixed');
      await page.mouse.up(); await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => state.page), 'rules');
    });
    await check('previous return frames cannot clear the next swipe preview', async page => {
      await secondary(page);
      await page.mouse.move(5, 220); await page.mouse.down();
      const previewSurvived = await page.evaluate(async () => {
        navigateBack();
        $app.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerId: 1, pointerType: 'mouse', clientX: 5, clientY: 220 }));
        $app.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, isPrimary: true, pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 220 }));
        const preview = document.querySelector('.edge-back-preview');
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return Boolean(preview?.isConnected);
      });
      await page.mouse.up();
      assert.equal(previewSurvived, true);
    });
    for (const mode of ['live', 'html']) await check(`community pagination resumes after ${mode} return`, async page => {
      const result = await page.evaluate(mode => {
        state.page = 'community'; state.communityFeedHasMore = true; state.communityFeedLoadingMore = false;
        state.communityPosts = [{ id: 'post', content: '测试动态', authorName: '测试', topic: 'daily', createdAt: '2026-09-25T00:00:00Z' }];
        render();
        const before = Boolean(communityLoadObserver);
        setState({ page: 'about' }, { skipSave: true });
        if (mode === 'html') edgeBackSnapshots.at(-1).liveDom = null;
        navigateBack();
        return { before, after: Boolean(communityLoadObserver), sentinel: Boolean(document.querySelector('[data-community-load-sentinel]')) };
      }, mode);
      assert.deepEqual(result, { before: true, after: true, sentinel: true });
    });
    await check('focused input without software keyboard keeps navigation visible', async page => {
      const hidden = await page.evaluate(() => {
        const input = document.createElement('input'); $app.append(input); input.focus();
        syncMobileKeyboardUI();
        return document.documentElement.classList.contains('keyboard-open');
      });
      assert.equal(hidden, false);
    });
    await check('native keyboard dismissal wins while input retains focus', async page => {
      const result = await page.evaluate(() => {
        const input = document.createElement('input'); $app.append(input); input.focus();
        window.TURTLE_ANDROID_KEYBOARD_VISIBLE = true; syncMobileKeyboardUI();
        const opened = document.documentElement.classList.contains('keyboard-open');
        window.TURTLE_ANDROID_KEYBOARD_VISIBLE = false; syncMobileKeyboardUI();
        return { opened, closed: !document.documentElement.classList.contains('keyboard-open') };
      });
      assert.deepEqual(result, { opened: true, closed: true });
    });
    await check('pinch zoom is not a keyboard', async page => {
      const result = await page.evaluate(() => forumComposerViewportState(844, { height: 422, offsetTop: 0, scale: 2 }, false, 844));
      assert.deepEqual(result, { bottom: 0, keyboardOpen: false });
    });
    await check('keyboard resize, dismissal and rotation preserve navigation', async page => {
      await page.evaluate(() => {
        const input = document.createElement('textarea'); $app.append(input); input.focus(); syncMobileKeyboardUI();
      });
      await page.setViewportSize({ width: 390, height: 500 });
      await page.evaluate(() => syncMobileKeyboardUI());
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('keyboard-open')), true);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => syncMobileKeyboardUI());
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('keyboard-open')), false);
      await page.setViewportSize({ width: 844, height: 390 });
      await page.evaluate(() => syncMobileKeyboardUI());
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('keyboard-open')), false);
    });
    await check('form rerender preserves typing and keyboard detection', async page => {
      await page.locator('[data-market-search]').fill('未提交搜索');
      await page.evaluate(() => syncMobileKeyboardUI());
      await page.setViewportSize({ width: 390, height: 500 });
      await page.evaluate(() => {
        syncMobileKeyboardUI();
        setState({}, { skipSave: true, preserveInputValues: true });
      });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      assert.equal(await page.locator('[data-market-search]').inputValue(), '未提交搜索');
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('keyboard-open')), true);
    });
    await check('ordinary pull refresh still starts and finishes', async page => {
      await page.evaluate(() => {
        const target = $app.querySelector('main'); scrollTo(0, 0);
        auditTouch('touchstart', target, 100, 120); auditTouch('touchmove', target, 100, 270);
        auditTouch('touchend', target, 100, 270, 0);
      });
      assert.equal(await page.evaluate(() => pullRefreshState.refreshing), true);
      await page.waitForFunction(() => !pullRefreshState.refreshing);
      assert.equal(await page.evaluate(() => document.body.classList.contains('pull-refresh-active')), false);
    });
    for (const interruption of ['route', 'blur', 'multitouch']) await check(`pull refresh clears on ${interruption}`, async page => {
      await page.evaluate(interruption => {
        const target = $app.querySelector('main'); scrollTo(0, 0);
        auditTouch('touchstart', target, 100, 120); auditTouch('touchmove', target, 100, 270);
        if (interruption === 'route') setState({ page: 'about' }, { skipSave: true });
        if (interruption === 'blur') window.dispatchEvent(new Event('blur'));
        if (interruption === 'multitouch') auditTouch('touchmove', target, 100, 270, 2);
      }, interruption);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      assert.equal(await page.evaluate(() => pullRefreshState.tracking || document.body.classList.contains('pull-refresh-active')), false);
    });
    await check('nested scroll area does not pull refresh the underlying feed', async page => {
      const tracking = await page.evaluate(() => {
        const scroller = document.createElement('div'); scroller.style.cssText = 'height:150px;overflow:auto';
        scroller.innerHTML = '<div style="height:1000px">nested scroll</div>';
        $app.prepend(scroller); scrollTo(0, 0); scroller.scrollTop = 150;
        auditTouch('touchstart', scroller.firstChild, 100, 120); auditTouch('touchmove', scroller.firstChild, 100, 270);
        return pullRefreshState.tracking;
      });
      assert.equal(tracking, false);
    });
    await check('service overlay owns touches instead of navigating the underlying page', async page => {
      await secondary(page); await page.evaluate(() => openGeneralServiceDialog()); await swipe(page);
      await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => state.page), 'rules');
    });
    const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const pageMap = source.slice(source.indexOf('  const pages = {', source.indexOf('function render()')), source.indexOf('// Reset before replacing content'));
    const routes = [...pageMap.matchAll(/^    (\w+):/gm)].map(match => match[1]);
    await check(`all ${routes.length} registered pages restore route and scroll on return`, async page => {
      const results = await page.evaluate(async routes => {
        Object.assign(state, {
          turtles: [{ id: 't', code: '测试龟', speciesCode: 'GHG', speciesName: '果核蛋龟', status: '正常饲养', gender: '母', stage: 'adult', weight: 100, price: 100 }],
          selectedTurtleId: 't', keptSpecies: ['GHG'],
          ledgerRecords: [{ id: 'l', type: 'expense', amount: 10, date: '2026-09-25', title: '测试账目' }], selectedLedgerId: 'l',
          breedingRecords: [{ id: 'b', motherId: 't', motherName: '测试龟', eggCount: 3, date: '2026-09-25' }], selectedBreedingId: 'b',
          communityPosts: [{ id: 'p', content: '测试动态', authorId: 'friend', authorName: '测试', comments: [], createdAt: '2026-09-25T00:00:00Z' }], selectedCommunityPostId: 'p',
          selectedCommunityFriendId: 'friend', selectedCommunityFriend: { id: 'friend', name: '测试好友' },
          selectedMarketListingId: 'nav0', selectedMarketListing: state.marketListings[0],
          communityFeedHasMore: false
        });
        const results = [];
        for (const route of routes) {
          try {
            edgeBackSnapshots = []; restoredSnapshotRenderHoldUntil = 0;
            setState({ page: route }, { skipSave: true, forceRender: true, pageMotion: 'none' });
            await new Promise(requestAnimationFrame);
            const text = $app.innerText.trim();
            scrollTo(0, 500);
            const y = scrollY;
            setState({ page: route === 'about' ? 'rules' : 'about' }, { skipSave: true, pageMotion: 'none' });
            navigateBack();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const nav = $app.querySelector(':scope > .bottom-nav');
            const fixed = !nav || getComputedStyle(nav).position === 'fixed' && Math.abs(nav.getBoundingClientRect().bottom - innerHeight) <= 2;
            results.push({ route, pass: Boolean(text) && state.page === route && Math.abs(scrollY - y) <= 2 && fixed, expectedScroll: y, actualScroll: scrollY, fixed });
          } catch (error) { results.push({ route, pass: false, error: error.message }); }
        }
        return results;
      }, routes);
      fs.writeFileSync(path.join(root, 'output/navigation-pages.json'), JSON.stringify(results, null, 2));
      assert.deepEqual(results.filter(x => !x.pass), []);
    });
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    fs.writeFileSync(path.join(root, 'output/navigation-lifecycle.json'), JSON.stringify(outcomes, null, 2));
    console.log(JSON.stringify(outcomes, null, 2));
    assert.ok(outcomes.every(x => x.pass), 'all lifecycle cases must pass');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
