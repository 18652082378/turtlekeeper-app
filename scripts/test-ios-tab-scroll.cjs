'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, engine, recordResult } = require('./browser-test-engine.cjs');
const fixture = require('./ui-audit-fixture.cjs');
const root = path.resolve(__dirname, '..');
const entry = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

(async () => {
  const browser = await launchBrowser();
  const checks = [];
  try {
    for (const platform of ['ios', 'android', 'web']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'tabs.test' || url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, items: [], listings: [], posts: [], messages: [], friends: [], minimumBuild: 0 } });
        if (url.pathname === '/') return route.fulfill({ body: entry, contentType: 'text/html' });
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404 });
        return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
      });
      await context.addInitScript(platform => {
        const app = { getInfo: async () => ({ build: '145' }), getLaunchUrl: async () => ({}), addListener: async () => ({ remove() {} }) };
        window.Capacitor = { getPlatform: () => platform, isNativePlatform: () => platform !== 'web', Plugins: { App: app } };
      }, platform);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('https://tabs.test/?skipIntro=1');
      await page.waitForFunction(() => typeof render === 'function');
      await page.evaluate(async () => { await document.fonts.ready; window.dismissTradeIntro?.(); window.TurtleReleaseNotes?.cancel(); });
      const cdp = engine === 'chromium' ? await context.newCDPSession(page) : null;
      const seedPage = async (route, theme) => page.evaluate(({ seed, route, theme }) => {
        state = { ...initialState, ...emptyAccountData(), ...seed, page: route, themeColor: theme, cloudToken: '', policyConsentRequired: false };
        forceUpdateState = { required: false };
        pendingPageEnterMotion = false;
        render();
        scrollPageTo(0, 0);
        const filler = document.createElement('div');
        filler.id = 'scroll-fixture';
        filler.style.height = '1700px';
        document.querySelector('#app > main').append(filler);
      }, { seed: fixture(), route, theme });
      const bars = () => page.evaluate(() => ['.topbar', '.bottom-nav', '.feed-search-dock'].map(selector => {
        const rect = document.querySelector('#app > ' + selector)?.getBoundingClientRect();
        return rect ? [rect.y, rect.height, rect.bottom] : null;
      }));
      if (platform !== 'ios') {
        await seedPage('market', 'dark');
        assert.equal(await page.evaluate(() => Boolean(iosTabScroller())), false);
        await page.evaluate(() => scrollPageTo(0, 280));
        await page.waitForFunction(() => window.scrollY >= 270);
        assert.deepEqual(errors, [], platform + ': page errors');
        checks.push({ platform, documentScrollPreserved: true });
        await context.close();
        continue;
      }
      for (const width of [320, 390, 440]) {
        await page.setViewportSize({ width, height: 844 });
        for (const [route, theme] of [['market', 'dark'], ['community', 'dark'], ['ledger', 'teal'], ['home', 'teal'], ['messages', 'teal'], ['mine', 'dark']]) {
          const label = route + '/' + width;
          await seedPage(route, theme);
          const original = await bars();
          const layout = await page.evaluate(() => {
            const main = iosTabScroller();
            return main && {
              chrome: ['.topbar', '.bottom-nav'].map(s => getComputedStyle(document.querySelector('#app > ' + s)).position),
              y: main.getBoundingClientRect().top, bottom: main.getBoundingClientRect().bottom,
              rootMax: document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight,
              profile: !!main.querySelector('.space-profile-card')
            };
          });
          assert(layout, label + ': expected a separate content scroll area');
          assert.deepEqual(layout.chrome, ['absolute', 'absolute'], label);
          assert(Math.abs(layout.y - (original[2] || original[0])[2]) < 1, label + ': header overlaps content');
          assert(Math.abs(layout.bottom - original[1][0]) < 1, label + ': tab bar overlaps content');
          assert.equal(layout.rootMax, 0, label + ': document still scrolls');
          assert.equal(layout.profile, route === 'mine', label + ': profile must move with its content');
          async function fixed(phase) {
            assert.deepEqual(await bars(), original, label + '/' + phase + ': chrome changed geometry');
            assert.equal(await page.evaluate(() => window.scrollY), 0, label + '/' + phase + ': root moved');
          }
          async function drag(from, to, phase) {
            if (cdp) {
              await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: width / 2, y: from }] });
              for (let i = 1; i <= 8; i++) {
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: width / 2, y: from + (to - from) * i / 8 }] });
                await page.evaluate(() => new Promise(requestAnimationFrame));
                await fixed(phase + '/' + i);
              }
              await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            } else {
              // Playwright does not expose touch drags or wheel input on
              // mobile WebKit. Verify its layout across scroll positions.
              await page.evaluate(distance => scrollPageBy(0, distance), (from - to) * 2);
              await page.evaluate(() => new Promise(requestAnimationFrame));
            }
            await fixed(phase + '/release');
          }
          await drag(360, 565, 'top');
          if (cdp && ['market', 'community', 'messages'].includes(route)) {
            await page.waitForFunction(() => pullRefreshState.refreshing || document.querySelector('.pull-refresh-indicator')?.classList.contains('is-refreshing'));
            await page.waitForFunction(() => !pullRefreshState.refreshing);
            await fixed('after refresh');
          }
          await drag(650, 340, 'scroll down');
          await page.waitForFunction(() => pageScrollY() > 10);
          await drag(350, 580, 'scroll up');
          await page.evaluate(() => scrollPageTo(0, iosTabScroller().scrollHeight));
          await drag(640, 340, 'bottom');
          await fixed('settled');
          checks.push({ platform, route, theme, width, trustedTouch: Boolean(cdp) });
        }
      }
      await seedPage('market', 'dark');
      await page.evaluate(() => {
        const main = iosTabScroller();
        const sentinel = main.querySelector('[data-market-load-sentinel]') || document.createElement('div');
        sentinel.dataset.marketLoadSentinel = '';
        main.append(sentinel);
        state.cloudToken = 'local-test-only';
        state.marketFeedInitialized = true;
        state.marketFeedHasMore = true;
        window.testPageLoads = 0;
        loadMoreMarketListings = async () => { window.testPageLoads++; state.marketFeedHasMore = false; };
        scrollPageTo(0, main.scrollHeight);
      });
      await page.waitForFunction(() => window.testPageLoads === 1);
      checks.push({ platform, marketPaginationFromContentScroll: true });
      await seedPage('home', 'teal');
      const preserved = await page.evaluate(() => {
        scrollPageTo(0, 340);
        const before = pageScrollY();
        setState({ page: 'about' }, { skipSave: true, pageMotion: 'none' });
        const secondaryUsesWindow = !iosTabScroller();
        const snapshot = edgeBackSnapshots[edgeBackSnapshots.length - 1];
        const preview = showEdgeBackPreview(snapshot);
        const previewBars = ['.topbar', '.bottom-nav'].map(s => preview.querySelector(s).getBoundingClientRect());
        const previewPinned = Math.abs(previewBars[0].top) < 1 && Math.abs(previewBars[1].bottom - innerHeight) < 1;
        navigateBack();
        return { before, after: pageScrollY(), secondaryUsesWindow, previewPinned, restored: Boolean(iosTabScroller()) };
      });
      assert.deepEqual(preserved, { before: 340, after: 340, secondaryUsesWindow: true, previewPinned: true, restored: true });
      checks.push({ platform, scrollRestoredOnBack: true });
      assert.deepEqual(errors, [], platform + ': page errors');
      await context.close();
    }
    recordResult(root, 'ios-tab-scroll.json', { checks, status: 'passed' });
    console.log('PASS: ' + checks.length + ' cases; iOS stationary tab chrome, scrolling and back restore; Android/browser scroll unchanged (' + engine + (engine === 'chromium' ? ', trusted touch and refresh' : ', programmed scroll positions') + ').');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
