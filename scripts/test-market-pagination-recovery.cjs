'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { engine, launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await launchBrowser();
  const outcomes = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'market-pagination.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
    });
    async function test(name, run) {
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto('https://market-pagination.test/?skipIntro=1');
        await page.evaluate(() => {
          window.dismissTradeIntro?.();
          window.observers = [];
          window.nativeIntersectionObserver = window.IntersectionObserver;
          window.IntersectionObserver = class {
            constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
            observe(node) { this.targets.push(node); }
            disconnect() { this.targets = []; }
            unobserve(node) { this.targets = this.targets.filter(target => target !== node); }
          };
          window.intersectMarket = () => {
            for (const observer of [...observers]) {
              const sentinel = observer.targets.find(node => node.matches('[data-market-load-sentinel]'));
              if (sentinel) observer.callback([{ target: sentinel, isIntersecting: true }]);
            }
          };
          hasCloudSession = () => false;
          state = { ...state, ...emptyAccountData(), loggedInPhone: 'pagination-fixture', cloudToken: '', policyConsentRequired: false,
            page: 'market', marketSearch: '', marketFeedGeneration: 10, marketFeedInitialized: true, marketFeedSessionId: 'fixture-session',
            marketFeedNextOffset: 8, marketFeedHasMore: true, marketFeedLoadingMore: false,
            marketFeedOrderIds: Array.from({ length: 8 }, (_, index) => 'fixture-' + index),
            marketListings: Array.from({ length: 8 }, (_, index) => ({ id: 'fixture-' + index, title: '分页测试 ' + index, speciesCode: 'GHG', speciesName: '果核蛋龟', price: 100, status: 'active' })) };
          edgeBackSnapshots = []; marketLastLoadedAt = Date.now(); marketLoading = true; render();
          hasCloudSession = () => true;
          window.calls = []; window.responses = [];
          window.successPage = (id = 'next-fixture') => ({ listings: [{ id, title: '新商品', speciesCode: 'GHG', speciesName: '果核蛋龟', price: 100, status: 'active' }], rankingSession: 'fixture-session', nextOffset: 9, hasMore: false });
          apiPost = async (url, body) => {
            if (url !== '/api/market/list') throw new Error('Unexpected fixture request: ' + url);
            calls.push(body);
            const response = responses.shift();
            return typeof response === 'function' ? response(body) : response || successPage();
          };
          // Model a sentinel already inside the prefetch area. Observer delivery
          // is controlled so it can happen while a different request holds the lock.
          document.querySelector('[data-market-load-sentinel]').getBoundingClientRect = () => ({ top: 500, bottom: 545 });
          window.firstCard = document.querySelector('[data-view-market]');
        });
        await page.waitForTimeout(50);
        await run(page);
        assert.deepEqual(errors, []);
        outcomes.push({ name, pass: true });
      } catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
      finally { await page.close(); }
    }
    const waitForCalls = (page, count) => page.waitForFunction(count => calls.length >= count, count, { timeout: 1600 });
    await test('tab return keeps server ranking instead of flashing cached local sorting', async page => {
      await page.evaluate(() => {
        state.marketListings[7].createdAt = new Date(Date.now() + 60000).toISOString();
        state.marketListings.push({ ...state.marketListings[0], id: 'detail-only', createdAt: new Date(Date.now() + 120000).toISOString() });
        marketLoading = false; marketLastLoadedAt = 0;
        navigateBottomTab('ledger'); navigateBottomTab('market');
        window.returnedCard = document.querySelector('[data-view-market]');
        window.returnedOrder = [...document.querySelectorAll('[data-view-market]')].map(node => node.dataset.viewMarket);
      });
      assert.deepEqual(await page.evaluate(() => returnedOrder), Array.from({ length: 8 }, (_, i) => 'fixture-' + i));
      await page.waitForTimeout(220);
      assert.equal(await page.evaluate(() => returnedCard === document.querySelector('[data-view-market]')), true);
      assert.equal(await page.evaluate(() => calls.length), 0, 'tab return must not reset an established feed');
    });
    await test('switching tabs keeps loaded pages and continues at the same cursor', async page => {
      await page.evaluate(() => {
        state.marketListings.push({ ...state.marketListings[0], id: 'loaded-page-two' });
        state.marketFeedOrderIds.push('loaded-page-two'); state.marketFeedNextOffset = 16;
        marketLoading = false; navigateBottomTab('ledger'); navigateBottomTab('market');
      });
      assert.equal(await page.locator('[data-view-market="loaded-page-two"]').count(), 1);
      await page.evaluate(async () => {
        responses.push({ ...successPage(), nextOffset: 17 }); await loadMoreMarketListings();
      });
      assert.equal(await page.evaluate(() => calls[0].offset), 16);
      assert.equal(await page.evaluate(() => calls[0].rankingSession), 'fixture-session');
      assert.equal(await page.locator('[data-view-market="loaded-page-two"]').count(), 1);
    });
    await test('repeated tab switches do not request new ranking sessions', async page => {
      await page.evaluate(() => {
        marketLoading = false; marketLastLoadedAt = 0;
        for (let i = 0; i < 6; i++) { navigateBottomTab('ledger'); navigateBottomTab('market'); }
      });
      await page.waitForTimeout(220);
      assert.equal(await page.evaluate(() => calls.length), 0);
      assert.equal(await page.evaluate(() => state.marketFeedSessionId), 'fixture-session');
      assert.equal(await page.evaluate(() => state.marketFeedNextOffset), 8);
    });
    await test('pull refresh can still replace the established recommendation with fresh data', async page => {
      await page.evaluate(async () => {
        marketLoading = false;
        responses.push({ ...successPage('fresh-ranking'), rankingSession: 'fresh-session', nextOffset: 1 });
        await runPullRefresh();
      });
      assert.equal(await page.evaluate(() => calls[0].offset), 0);
      assert.equal(await page.evaluate(() => state.marketFeedSessionId), 'fresh-session');
      assert.equal(await page.locator('[data-view-market="fresh-ranking"]').count(), 1);
      assert.equal(await page.locator('[data-view-market="fixture-0"]').count(), 0);
    });
    await test('an uninitialized market still fetches its first page when entered', async page => {
      await page.evaluate(() => {
        marketLoading = false; marketLastLoadedAt = 0;
        navigateBottomTab('ledger');
        state.marketFeedInitialized = false; state.marketListings = []; state.marketFeedOrderIds = [];
        responses.push({ ...successPage('first-entry'), rankingSession: 'first-session', nextOffset: 1 });
        navigateBottomTab('market');
      });
      await waitForCalls(page, 1);
      await page.waitForFunction(() => !marketLoading);
      assert.equal(await page.locator('[data-view-market="first-entry"]').count(), 1);
    });
    await test('a late detail refresh resumes a visible feed without another intersection', async page => {
      await page.evaluate(() => {
        setState({ page: 'marketDetail', selectedMarketListingId: 'fixture-0' }, { skipSave: true });
        marketLoading = false;
        responses.push(() => new Promise(resolve => { window.resolveDetail = resolve; }));
        window.detailPending = refreshMarket(true);
        navigateBack();
        intersectMarket();
        resolveDetail({ listings: state.marketListings, myListings: [] });
      });
      await waitForCalls(page, 2);
      assert.equal(await page.evaluate(() => calls[1].offset), 8);
      assert.equal(await page.evaluate(() => firstCard.isConnected), true);
    });
    await test('return during an in-flight next page resumes pagination after settlement', async page => {
      await page.evaluate(() => {
        responses.push(() => new Promise(resolve => { window.resolvePage = resolve; }));
        marketLoading = false; window.pagePending = loadMoreMarketListings();
        setState({ page: 'marketDetail', selectedMarketListingId: 'fixture-0' }, { skipSave: true });
        navigateBack();
        resolvePage({ ...successPage(), hasMore: true });
      });
      await page.waitForFunction(() => !marketLoading, null, { timeout: 1600 });
      // A following page remains available; setup on return must not lose the observer.
      await page.evaluate(() => { state.marketFeedHasMore = true; intersectMarket(); });
      await waitForCalls(page, 2);
    });
    await test('failed requests stay idle, then an upward gesture retries at the same cursor', async page => {
      await page.evaluate(async () => {
        responses.push(() => { throw new Error('simulated offline'); });
        marketLoading = false; await loadMoreMarketListings();
        intersectMarket();
      });
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => calls.length), 1, 'no automatic failure retry loop');
      await page.evaluate(() => {
        const target = document.querySelector('[data-market-load-sentinel]');
        const start = new Event('touchstart', { bubbles: true });
        Object.defineProperty(start, 'touches', { value: [{ identifier: 1, target, clientX: 180, clientY: 700 }] });
        target.dispatchEvent(start);
        const end = new Event('touchend', { bubbles: true });
        Object.defineProperty(end, 'changedTouches', { value: [{ identifier: 1, target, clientX: 180, clientY: 620 }] });
        target.dispatchEvent(end);
      });
      await waitForCalls(page, 2);
      assert.equal(await page.evaluate(() => calls[1].offset), 8);
      assert.equal(await page.evaluate(() => firstCard.isConnected), true);
    });
    await test('the visible load-more control offers a tap retry after failure', async page => {
      await page.evaluate(async () => { responses.push(() => { throw new Error('simulated timeout'); }); marketLoading = false; await loadMoreMarketListings(); });
      await page.locator('[data-market-load-sentinel]').click();
      await waitForCalls(page, 2);
    });
    await test('scroll fallback loads when no intersection observer exists', async page => {
      await page.evaluate(() => { window.IntersectionObserver = undefined; setupMarketInfiniteScroll(); marketLoading = false; window.dispatchEvent(new Event('scroll')); });
      await waitForCalls(page, 1);
    });
    await test('network recovery retries the visible failed page', async page => {
      await page.evaluate(async () => { responses.push(() => { throw new Error('simulated offline'); }); marketLoading = false; await loadMoreMarketListings(); });
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await waitForCalls(page, 2);
    });
    await test('the native network status handler retries a visible failed page', async page => {
      await page.evaluate(async () => { responses.push(() => { throw new Error('simulated native offline'); }); marketLoading = false; await loadMoreMarketListings(); });
      await page.evaluate(() => updateMarketNetworkType({ connected: true, connectionType: 'wifi' }));
      await waitForCalls(page, 2);
      assert.equal(await page.evaluate(() => calls[1].offset), 8);
    });
    await test('repeated triggers cannot send concurrent page requests', async page => {
      await page.evaluate(() => {
        responses.push(() => new Promise(resolve => { window.resolvePage = resolve; }));
        marketLoading = false; intersectMarket();
        for (let index = 0; index < 8; index++) { intersectMarket(); window.dispatchEvent(new Event('scroll')); }
      });
      await page.waitForTimeout(120);
      assert.equal(await page.evaluate(() => calls.length), 1);
      await page.evaluate(() => resolvePage(successPage()));
      await page.waitForFunction(() => !marketLoading);
      assert.equal(await page.evaluate(() => state.marketFeedNextOffset), 9);
      assert.equal(await page.locator('[data-view-market="next-fixture"]').count(), 1);
    });
    await test('late failure after a filter change cannot mark the new feed as failed', async page => {
      await page.evaluate(() => {
        responses.push(() => new Promise((resolve, reject) => { window.rejectPage = reject; }));
        marketLoading = false; window.pagePending = loadMoreMarketListings();
        resetMarketFeed({ marketSearch: '新搜索' });
        responses.push({ ...successPage('new-filter'), rankingSession: 'new-session', nextOffset: 1 });
        rejectPage(new Error('old request failed'));
      });
      await waitForCalls(page, 2);
      await page.waitForFunction(() => !marketLoading);
      assert.equal(await page.evaluate(() => state.marketFeedSessionId), 'new-session');
      assert.equal(await page.evaluate(() => state.marketFeedHasMore), false);
      assert.equal(await page.evaluate(() => state.marketSearch), '新搜索');
    });
    await test('a non-advancing cursor stops automatic requests and preserves the page', async page => {
      await page.evaluate(async () => {
        responses.push({ listings: [], rankingSession: 'fixture-session', nextOffset: 8, hasMore: true });
        marketLoading = false; await loadMoreMarketListings(); intersectMarket();
      });
      await page.waitForTimeout(160);
      assert.equal(await page.evaluate(() => calls.length), 1);
      assert.equal(await page.evaluate(() => state.marketFeedNextOffset), 8);
      assert.equal(await page.evaluate(() => firstCard.isConnected), true);
      assert.match(await page.locator('[data-market-load-sentinel]').textContent(), /重试/);
    });
    await test('an empty page with a progressing cursor can continue to the next page', async page => {
      await page.evaluate(async () => {
        responses.push({ listings: [], rankingSession: 'fixture-session', nextOffset: 10, hasMore: true }, { ...successPage(), nextOffset: 11 });
        marketLoading = false; await loadMoreMarketListings();
      });
      await waitForCalls(page, 2);
      await page.waitForFunction(() => !marketLoading);
      assert.equal(await page.evaluate(() => calls[1].offset), 10);
      assert.equal(await page.evaluate(() => state.marketFeedNextOffset), 11);
      assert.equal(await page.locator('[data-view-market="next-fixture"]').count(), 1);
    });
    await test('real browser intersection and scrolling append once without replacing old cards', async page => {
      await page.evaluate(() => {
        window.IntersectionObserver = nativeIntersectionObserver;
        const sentinel = document.querySelector('[data-market-load-sentinel]');
        delete sentinel.getBoundingClientRect;
        setupMarketInfiniteScroll(); marketLoading = false;
        sentinel.scrollIntoView({ block: 'end' });
      });
      await waitForCalls(page, 1);
      await page.waitForFunction(() => !marketLoading);
      assert.equal(await page.evaluate(() => firstCard.isConnected), true);
      assert.equal(await page.evaluate(() => state.page), 'market');
      assert.equal(await page.locator('[data-view-market="next-fixture"]').count(), 1);
      assert.equal(await page.evaluate(() => calls.length), 1);
    });
    await test('a page received while detail is open is not skipped after returning', async page => {
      await page.evaluate(() => {
        responses.push(() => new Promise(resolve => { window.resolvePage = resolve; }));
        marketLoading = false; window.pagePending = loadMoreMarketListings();
        setState({ page: 'marketDetail', selectedMarketListingId: 'fixture-0' }, { skipSave: true });
        resolvePage(successPage());
      });
      await page.waitForFunction(() => !marketLoading);
      assert.equal(await page.evaluate(() => state.marketFeedNextOffset), 8);
      await page.evaluate(() => navigateBack());
      await waitForCalls(page, 2);
      await page.waitForFunction(() => !marketLoading);
      assert.equal(await page.evaluate(() => calls[1].offset), 8);
      assert.equal(await page.locator('[data-view-market="next-fixture"]').count(), 1);
    });
    await test('background geometry checks do not load while the sentinel is far below the viewport', async page => {
      await page.evaluate(() => {
        document.querySelector('[data-market-load-sentinel]').getBoundingClientRect = () => ({ top: 2500, bottom: 2544 });
        marketLoading = false; setupMarketInfiniteScroll(); intersectMarket();
        window.dispatchEvent(new Event('scroll'));
      });
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => calls.length), 0);
    });
    const file = process.argv.includes('--before') ? 'market-pagination-before.json' : 'market-pagination-regression.json';
    recordResult(root, file, { scope: 'Isolated desktop browser with controlled observer, request, network and touch events; no production data or native iPhone.', outcomes });
    console.log(JSON.stringify({ engine, outcomes }, null, 2));
    if (outcomes.some(item => !item.pass)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
