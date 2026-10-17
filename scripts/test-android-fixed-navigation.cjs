'use strict';
// Trusted Chromium touch input checks web layout/refresh behavior. Native edge
// stretching is separately tested on MainActivity with Robolectric.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), assets = path.join(root, 'android/app/src/main/assets/public');
const output = path.join(root, 'output/android/fixed-navigation');
const fixture = require('./ui-audit-fixture.cjs');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' };
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const checks = [], errors = [];
  try {
    for (const native of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      await context.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.hostname !== 'nav.test' || u.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, items: [], listings: [], posts: [], messages: [], friends: [], minimumBuild: 0 } });
        const file = path.resolve(assets, '.' + (u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname)));
        if (!file.startsWith(assets + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
      });
      if (native) await context.addInitScript(() => {
        const app = { getInfo: async () => ({ build: '19' }), getLaunchUrl: async () => ({}), addListener: async () => ({ remove() {} }) };
        const bars = { setTheme: async () => {}, getDisplayMetrics: async () => ({}), addListener: async () => ({ remove() {} }) };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { App: app, TurtleAndroidWindow: bars }, registerPlugin: name => name === 'App' ? app : name === 'TurtleAndroidWindow' ? bars : {} };
      });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      const cdp = await context.newCDPSession(page);
      await page.goto('https://nav.test/?skipIntro=1');
      await page.waitForFunction(() => typeof render === 'function');
      await page.evaluate(async () => { await document.fonts.ready; window.dismissTradeIntro?.(); window.TurtleReleaseNotes?.cancel(); });
      for (const width of [320, 360, 720]) {
        await page.setViewportSize({ width, height: 800 });
        for (const route of ['home', 'ledger', 'market', 'community', 'messages', 'mine']) {
          await page.evaluate(({ seed, route }) => {
            state = { ...initialState, ...emptyAccountData(), ...seed, page: route, cloudToken: '', policyConsentRequired: false };
            forceUpdateState = { required: false }; pendingPageEnterMotion = false; render(); scrollTo(0, 0);
            const target = document.createElement('div'); target.id = 'gesture-target'; target.style.cssText = 'height:130px;width:100%';
            document.querySelector('#app main').prepend(target);
            const filler = document.createElement('div'); filler.style.height = '1800px'; document.querySelector('#app main').append(filler);
            resetPullRefreshIndicator();
          }, { seed: fixture(), route });
          await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
          const baseline = await page.locator('#app > .bottom-nav').boundingBox();
          assert(baseline);
          const assertFixed = async phase => {
            const box = await page.locator('#app > .bottom-nav').boundingBox();
            assert(box && Math.abs(box.y - baseline.y) < 1 && Math.abs(box.height - baseline.height) < 1 && Math.abs(box.y + box.height - 800) < 1, `${native}/${route}/${width}/${phase}: navigation moved or stretched`);
          };
          const policy = await page.evaluate(() => [document.documentElement, document.body, document.querySelector('#app')].map(e => getComputedStyle(e).overscrollBehaviorY));
          assert.deepEqual(policy, ['none', 'auto', 'auto'], 'Only the viewport owns overscroll suppression; inner page containers must still pass ordinary scroll to it');
          const drag = async (from, to, label) => {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: width / 2, y: from }] });
            for (let i = 1; i <= 10; i++) {
              await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: width / 2, y: from + (to - from) * i / 10 }] });
              await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
              await assertFixed(label + '-drag-' + i);
            }
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await assertFixed(label + '-release');
          };
          const start = await page.locator('#gesture-target').boundingBox();
          await drag(Math.max(100, start.y + 25), Math.max(100, start.y + 25) + 210, 'top-edge-pull');
          if (['market', 'community', 'messages'].includes(route)) {
            assert(await page.evaluate(() => pullRefreshState.refreshing || document.querySelector('.pull-refresh-indicator')?.classList.contains('is-refreshing')), 'Pull-to-refresh remains reachable');
            await page.waitForFunction(() => !pullRefreshState.refreshing);
          }
          // A successful refresh replaces main's DOM; restore only the test
          // spacer so the following gesture still has content to scroll.
          await page.evaluate(() => {
            const filler = document.createElement('div'); filler.style.height = '1800px';
            document.querySelector('#app main').append(filler); scrollTo(0, 0);
          });
          await drag(580, 190, 'normal-scroll');
          await page.waitForTimeout(100);
          const scrollState = await page.evaluate(() => ({ scrollY, height: document.documentElement.scrollHeight, target: document.elementFromPoint(innerWidth / 2, 580)?.outerHTML.slice(0, 180), root: [document.documentElement, document.body, document.querySelector('#app')].map(e => ({ tag: e.tagName, scrollTop: e.scrollTop, height: e.clientHeight, total: e.scrollHeight, overflow: getComputedStyle(e).overflowY, touch: getComputedStyle(e).touchAction })) }));
          assert(scrollState.scrollY > 0, 'Disabling edge stretch must not disable ordinary touch scrolling: ' + JSON.stringify(scrollState));
          await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
          await drag(500, 160, 'bottom-edge-pull');
          await page.waitForTimeout(100);
          await assertFixed('after-rebound');
          checks.push({ native, route, width, fixed: true });
          if (width === 360 && native && ['home', 'ledger'].includes(route)) await page.screenshot({ path: path.join(output, route + '-fixed.png') });
        }
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log('PASS: ' + checks.length + ' Android navigation cases, trusted top/bottom pulls, scrolling, release and refresh; native/preview paths.');
  } catch (e) { errors.push(e.message); throw e; }
  finally { fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ status: errors.length ? 'failed' : 'passed', nativeDevice: false, checkedAt: new Date().toISOString(), checks, errors }, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
