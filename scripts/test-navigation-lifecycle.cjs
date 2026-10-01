const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { engine, launchBrowser, artifactName } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'output'), { recursive: true });

(async () => {
  const browser = await launchBrowser();
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
    for (const mode of ['button', 'gesture', 'html']) await check(`${mode} return does not schedule redundant page replacements`, async page => {
      await secondary(page);
      await page.evaluate(mode => {
        if (mode === 'html') edgeBackSnapshots.at(-1).liveDom = null;
        if (mode === 'gesture') showEdgeBackPreview(edgeBackSnapshots.at(-1));
        navigateBack({ fromEdgeGesture: mode === 'gesture' });
        window.returnedContent = $app.querySelector('main');
        // Repeated acknowledgements arrive after navigation, but change no UI.
        setState({}, { skipCloud: true });
        setState({ messageUnreadCount: state.messageUnreadCount }, { skipCloud: true });
        setState({}, { skipCloud: true });
      }, mode);
      await page.waitForTimeout(750);
      assert.equal(await page.evaluate(() => returnedContent === $app.querySelector('main')), true, 'unchanged return must keep its DOM after the settle window');
    });
    await check('user opens a care draft immediately after return without delayed rerender', async page => {
      await page.evaluate(() => {
        setState({ page: 'memos', careTab: 'care', careDraft: null }, { skipSave: true, pageMotion: 'none' });
        setState({ page: 'about' }, { skipSave: true, pageMotion: 'none' });
        navigateBack();
        document.querySelector('[data-new-care="feeding"]').click();
      });
      assert.equal(await page.locator('#careForm').count(), 1, 'local UI changes render immediately');
      await page.locator('[name="note"]').fill('返回后填写的内容');
      await page.waitForTimeout(750);
      assert.equal(await page.locator('[name="note"]').inputValue(), '返回后填写的内容');
    });
    await check('back during settling returns only one level', async page => {
      await secondary(page); await swipe(page);
      await page.evaluate(() => navigateBack());
      await page.waitForTimeout(600); // Exceed both transition and fallback timer.
      assert.equal(await page.evaluate(() => state.page), 'about');
    });
    await check('personal space uses the same back gesture as other secondary pages', async page => {
      await page.evaluate(() => {
        setState({ page: 'messages' }, { skipSave: true, pageMotion: 'none' });
        setState({ page: 'mine' }, { skipSave: true, pageMotion: 'none' });
      });
      await swipe(page); await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => state.page), 'messages');
    });
    await check('short deliberate edge drag returns after holding still', async page => {
      await secondary(page);
      await page.mouse.move(5, 220); await page.mouse.down();
      await page.mouse.move(19, 220);
      await page.waitForTimeout(150);
      await page.mouse.move(35, 220);
      await page.waitForTimeout(350);
      await page.mouse.up(); await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => state.page), 'about');
      assert.equal(await page.locator('.edge-back-preview').count(), 0);
      assert.equal(await page.evaluate(() => $app.style.transform), '');
    });
    await check('quick 18 pixel edge swipe returns one level', async page => {
      await secondary(page);
      await page.mouse.move(5, 220); await page.mouse.down();
      await page.mouse.move(23, 221);
      await page.mouse.up(); await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => state.page), 'about');
    });
    await check('release position completes a short swipe without a final move event', async page => {
      await secondary(page);
      await page.mouse.move(5, 220); await page.mouse.down();
      await page.mouse.move(15, 220);
      await page.waitForTimeout(150);
      await page.evaluate(() => $app.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, isPrimary: true, pointerId: 1, pointerType: 'mouse', clientX: 35, clientY: 220
      })));
      await page.mouse.up(); await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => state.page), 'about');
      assert.equal(await page.evaluate(() => $app.style.transform), '');
    });
    await check('short right swipe outside the edge does not navigate back', async page => {
      await secondary(page);
      await page.mouse.move(100, 220); await page.mouse.down();
      await page.mouse.move(135, 220);
      await page.mouse.up(); await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => state.page), 'rules');
    });
    await check('tiny edge drag held still does not become a stale fling', async page => {
      await secondary(page);
      await page.mouse.move(5, 220); await page.mouse.down();
      await page.mouse.move(15, 220);
      await page.waitForTimeout(350);
      await page.mouse.up(); await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => state.page), 'rules');
      assert.equal(await page.locator('.edge-back-preview').count(), 0);
    });
    await check('reversing an edge swipe cancels even after the distance threshold', async page => {
      await secondary(page);
      await page.mouse.move(5, 220); await page.mouse.down();
      await page.mouse.move(220, 220, { steps: 5 });
      await page.mouse.move(110, 220);
      await page.mouse.up(); await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => state.page), 'rules');
    });
    await check('pulling back then pausing cancels a short edge swipe', async page => {
      await secondary(page);
      await page.mouse.move(5, 220); await page.mouse.down();
      await page.mouse.move(65, 220);
      await page.mouse.move(35, 220);
      await page.waitForTimeout(350);
      await page.mouse.up(); await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => state.page), 'rules');
      assert.equal(await page.locator('.edge-back-preview').count(), 0);
    });
    await check('vertical edge scroll does not navigate back', async page => {
      await secondary(page);
      await page.mouse.move(5, 220); await page.mouse.down();
      await page.mouse.move(10, 250);
      await page.mouse.move(35, 290);
      await page.mouse.up(); await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => state.page), 'rules');
    });
    await check('horizontal controls own their gesture even at the left screen edge', async page => {
      await secondary(page);
      await page.evaluate(() => {
        const strip = document.createElement('div');
        strip.style.cssText = 'position:fixed;left:0;top:180px;width:100%;height:120px;overflow-x:auto;z-index:99';
        strip.innerHTML = '<div style="width:1000px;height:100px">横向选项</div>';
        $app.append(strip);
      });
      await swipe(page);
      await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => state.page), 'rules');
    });
    await check('reduced motion avoids animated settling and preview parallax', async page => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await secondary(page);
      await swipe(page, false);
      assert.equal(await page.locator('.edge-back-preview').evaluate(el => el.style.transform), 'translate3d(0px, 0px, 0px)');
      await page.mouse.up();
      await page.waitForTimeout(80);
      assert.equal(await page.evaluate(() => state.page), 'about');
      assert.equal(await page.evaluate(() => $app.style.transform), '');
      assert.equal(await page.locator('.edge-back-preview').count(), 0);
    });
    await check('swipe preview is excluded from keyboard and screen reader interaction', async page => {
      await secondary(page); await swipe(page, false);
      const result = await page.locator('.edge-back-preview').evaluate(el => ({ inert: el.inert, hidden: el.getAttribute('aria-hidden') }));
      assert.deepEqual(result, { inert: true, hidden: 'true' });
      await page.mouse.up();
    });
    await check('a cancelled drag cannot click through but keyboard activation still works', async page => {
      await secondary(page);
      await page.evaluate(() => {
        window.auditClicks = 0;
        const button = document.createElement('button'); button.id = 'auditGestureClick';
        button.style.cssText = 'position:fixed;top:300px;left:50px;z-index:10';
        button.textContent = '操作'; button.addEventListener('click', () => auditClicks++); $app.append(button);
      });
      await page.mouse.move(5, 220); await page.mouse.down(); await page.mouse.move(15, 220);
      await page.waitForTimeout(180); await page.mouse.up();
      const counts = await page.evaluate(() => {
        const button = document.getElementById('auditGestureClick');
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
        const pointer = auditClicks;
        button.click();
        return { pointer, keyboard: auditClicks };
      });
      assert.deepEqual(counts, { pointer: 0, keyboard: 1 });
      await page.locator('#auditGestureClick').click();
      assert.equal(await page.evaluate(() => auditClicks), 2, 'a fresh deliberate tap remains usable');
      await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => state.page), 'rules');
    });
    await check('second finger cancels navigation without leaving displaced layers', async page => {
      await secondary(page); await swipe(page, false);
      await page.evaluate(() => $app.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, isPrimary: false, pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 250
      })));
      await page.mouse.up(); await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => state.page), 'rules');
      assert.equal(await page.evaluate(() => $app.style.transform), '');
      assert.equal(await page.locator('.edge-back-preview').count(), 0);
    });
    await check('declining an edge return keeps the unsaved form and navigation stack', async page => {
      await secondary(page);
      await page.evaluate(() => setState({ page: 'memos', careTab: 'care', careDraft: null }, { skipSave: true, pageMotion: 'none' }));
      await page.locator('[data-new-care="feeding"]').click();
      await page.locator('#careForm [name="note"]').fill('手势返回时保留草稿');
      const depth = await page.evaluate(() => edgeBackSnapshots.length);
      let prompted = false;
      page.once('dialog', dialog => { prompted = true; return dialog.dismiss(); });
      await page.mouse.move(5, 220); await page.mouse.down();
      await page.mouse.move(35, 220);
      await page.waitForTimeout(150);
      await page.mouse.up();
      await page.waitForTimeout(450);
      assert.equal(prompted, true, 'the dirty-form guard must run on gesture return');
      assert.equal(await page.locator('#careForm [name="note"]').inputValue(), '手势返回时保留草稿');
      assert.equal(await page.evaluate(() => edgeBackSnapshots.length), depth);
      assert.equal(await page.locator('.edge-back-preview').count(), 0);
      assert.equal(await page.evaluate(() => $app.style.transform), '');
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
      fs.writeFileSync(path.join(root, 'output', artifactName('navigation-pages.json')), JSON.stringify(results, null, 2));
      assert.deepEqual(results.filter(x => !x.pass), []);
    });
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    fs.writeFileSync(path.join(root, 'output', artifactName('navigation-lifecycle.json')), JSON.stringify(outcomes, null, 2));
    console.log(`Browser engine: ${engine}; desktop simulation, not a native iPhone`);
    console.log(JSON.stringify(outcomes, null, 2));
    assert.ok(outcomes.every(x => x.pass), 'all lifecycle cases must pass');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
