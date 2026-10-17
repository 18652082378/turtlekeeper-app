const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../android/app/src/main/assets/public');
const output = path.resolve(__dirname, '../output/android/qa');
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 800 }, isMobile: true, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(error.message));
    // All business traffic is mocked. Never touch production account data.
    await page.route('**/*', route => route.request().url().startsWith(origin)
      ? route.continue() : route.fulfill({ contentType: 'application/json', body: '{"ok":true,"listings":[],"posts":[],"messages":[]}' }));
    await page.addInitScript(() => {
      window.androidTest = { listeners: {}, minimized: 0, dark: false };
      const app = {
        addListener: async (name, handler) => { androidTest.listeners[name] = handler; return { remove() {} }; },
        getLaunchUrl: async () => ({}), minimizeApp: async () => { androidTest.minimized++; }
      };
      const bars = { setTheme: async ({ dark, backgroundColor }) => { androidTest.dark = dark; androidTest.backgroundColor = backgroundColor; },
        hideKeyboard: async () => { androidTest.hiddenKeyboards = (androidTest.hiddenKeyboards || 0) + 1; androidTest.listeners.keyboardVisibilityChange({ visible: false }); },
        addListener: async (name, handler) => { androidTest.listeners[name] = handler; handler({ visible: false }); return { remove() {} }; } };
      window.Capacitor = { getPlatform: () => 'android', isNativePlatform: () => true,
        Plugins: { App: app, TurtleAndroidWindow: bars }, registerPlugin: name => name === 'App' ? app : name === 'TurtleAndroidWindow' ? bars : {} };
    });
    await page.goto(origin);
    await page.waitForFunction(() => window.androidTest.listeners.backButton && document.querySelector('.home-redesign'));
    const fontReady = await page.evaluate(async () => {
      await document.fonts.load('700 22px "Turtle Noto Sans SC"', '龟友手账');
      await document.fonts.ready;
      return [...document.fonts].some(face => face.family === 'Turtle Noto Sans SC' && face.status === 'loaded');
    });
    assert(fontReady, 'The packaged Chinese variable font must load, including offline');
    await page.evaluate(() => {
      window.dismissTradeIntro();
      window.TurtleReleaseNotes?.cancel();
      state.loggedInPhone = 'ui-test';
      state.policyConsentRequired = false;
      state.turtles = [1, 2].map(id => ({ id: String(id), code: '测试' + id, speciesCode: 'test', speciesName: '测试品种', gender: '未知', status: '健康', weight: 100, price: 20, photo: defaultPhoto, createdAt: '2026-09-14', history: [] }));
      render();
    });
    const results = [];
    for (const [width, height] of [[320,780],[360,800],[390,844],[440,900],[600,850],[720,900],[840,720],[960,600],[360,800]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);
      const result = await page.evaluate(() => {
        const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height }; };
        const guide = document.querySelector('.market-trade-guide-entry');
        const range = document.createRange(); range.selectNodeContents(guide);
        const textLines = new Set([...range.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))).size;
        return { width: innerWidth, doc: document.documentElement.scrollWidth, title: box('.nav-title h1'), guide: box('.market-trade-guide-entry'), guideLines: textLines,
          titleFont: getComputedStyle(document.querySelector('.nav-title h1')).fontFamily,
          titleWeight: getComputedStyle(document.querySelector('.nav-title h1')).fontWeight,
          hero: box('.home-hero'), filters: [...document.querySelectorAll('.filter-dock select')].map(el => Math.round(el.getBoundingClientRect().top)),
          filterTextFits: [...document.querySelectorAll('.filter-dock select')].every(el => {
            const css = getComputedStyle(el), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
            ctx.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
            return css.appearance === 'none' && ctx.measureText(el.selectedOptions[0].textContent).width <= el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight) + 1;
          }),
          nav: box('.bottom-nav'), add: box('.hero-add'), metrics: box('.home-overview-metrics'), columns: getComputedStyle(document.querySelector('.home-module-panel')).gridTemplateColumns.split(' ').length,
          overflowing: [...document.querySelectorAll('.home-redesign *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => el.className).slice(0, 8) };
      });
      assert.equal(result.width, width, 'viewport must not be widened by content');
      assert(result.doc <= width + 1, JSON.stringify(result));
      assert(result.title.x >= result.guide.right - 1, 'Title collides with guide: ' + JSON.stringify(result));
      assert.equal(result.columns, width >= 600 ? 4 : 2);
      assert(result.metrics.y >= result.add.bottom, 'Statistics must not cover the add button');
      assert(result.metrics.y < result.hero.bottom, 'Statistics retain the layered hero layout');
      assert.equal(result.guideLines, 1, 'Default-size trade guide must stay on one line');
      assert(result.titleFont.includes('Turtle Noto Sans SC') && Number(result.titleWeight) >= 600, 'Title uses the bundled bold Chinese font: ' + JSON.stringify(result));
      if (new Set(result.filters).size !== 1) { console.log(JSON.stringify(result)); console.log(await page.locator('.filter-dock').evaluate(el => ({ html: el.outerHTML, display: getComputedStyle(el).display, columns: getComputedStyle(el).gridTemplateColumns, rules: [...document.styleSheets].map(s=>s.href) }))); await page.screenshot({ path: path.join(output, 'filters-failed.png') }); }
      assert.equal(new Set(result.filters).size, 1, 'All three filters stay on the same row');
      assert(result.filterTextFits, 'Default filter labels must fit without native-arrow clipping');
      assert(result.nav.bottom <= height + 1 && result.nav.height >= 60, 'Bottom tabs must fit WebView');
      assert.equal(result.overflowing.length, 0, JSON.stringify(result));
      results.push(result);
      if ([360, 720].includes(width)) await page.screenshot({ path: path.join(output, `home-${width}.png`), fullPage: true });
    }
    // Other core pages must fit both outer and inner displays, in both themes.
    for (const theme of ['teal', 'dark']) {
      for (const width of [320, 720]) {
        await page.setViewportSize({ width, height: 850 });
        for (const name of ['home', 'ledger', 'market', 'community', 'messages', 'add', 'poolAdd', 'growth', 'memos', 'breeding', 'communityChat']) {
          await page.evaluate(({ theme, name }) => { state.themeColor = theme; state.page = name; render(); window.scrollTo(0, 0); }, { theme, name });
          await page.waitForTimeout(40);
          const geometry = await page.evaluate(() => ({
            width: innerWidth, doc: document.documentElement.scrollWidth,
            overflow: [...document.querySelectorAll('#app main *')].filter(el => {
              const r = el.getBoundingClientRect(); const style = getComputedStyle(el);
              for (let parent = el.parentElement; parent && !parent.matches('main'); parent = parent.parentElement) {
                if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowX)) return false;
              }
              return r.width > 0 && r.right > innerWidth + 1 && style.position !== 'absolute' && !el.closest('[class*="scroll"], .sr-only');
            }).map(el => ({ tag: el.tagName, cls: el.className })).slice(0, 10)
          }));
          assert(geometry.doc <= width + 1, `${name}/${theme}/${width}: ${JSON.stringify(geometry)}`);
          assert.equal(geometry.overflow.length, 0, `${name}/${theme}/${width}: ${JSON.stringify(geometry)}`);
          if (theme === 'dark' && ['home', 'communityChat'].includes(name)) await page.screenshot({ path: path.join(output, `${name}-${width}-dark.png`), fullPage: true });
        }
      }
    }
    assert.equal(await page.evaluate(() => androidTest.dark), true, 'System bars follow the app theme');
    for (const theme of ['teal', 'dark']) {
      await page.evaluate(theme => { state.themeColor = theme; state.page = 'home'; render(); }, theme);
      await page.waitForFunction(() => androidTest.backgroundColor === getComputedStyle(document.documentElement).getPropertyValue('--android-system-bar-bg').trim());
      const barColors = await page.evaluate(() => {
      const color = androidTest.backgroundColor;
      const rgb = `rgb(${parseInt(color.slice(1,3),16)}, ${parseInt(color.slice(3,5),16)}, ${parseInt(color.slice(5,7),16)})`;
      return { native: rgb, top: getComputedStyle(document.querySelector('#app > .topbar')).backgroundColor,
        bottom: getComputedStyle(document.querySelector('#app > .bottom-nav')).backgroundColor };
    });
      assert.equal(barColors.top, barColors.native, 'Header and native status background must match');
      assert.equal(barColors.bottom, barColors.native, 'Tab bar and native navigation background must match');
    }
    await page.evaluate(() => { window.androidWeatherPreviousToken=state.cloudToken; state.cloudToken='synthetic-android-weather-token'; state.page='memos'; state.careTab='weather'; render(); });
    await page.waitForSelector('#weatherForm');
      assert.doesNotMatch(await page.locator('.weather-content').innerText(), /安卓系统通知暂未开通/);
      assert.equal(await page.evaluate(() => window.TURTLE_ANDROID_PUSH_PROVIDER), 'aliyun');
      assert.equal(await page.evaluate(() => nativePushNotifications()), null, 'no Firebase fallback if Aliyun native bridge is absent');
    await page.evaluate(() => { state.cloudToken=window.androidWeatherPreviousToken; delete window.androidWeatherPreviousToken; });
    // Resizing a folded screen must not rerender or discard a partially filled form.
    await page.evaluate(() => { state.page = 'poolAdd'; render(); });
    await page.locator('#app > .content #turtlePoolForm input[name="name"]').fill('折叠测试草稿');

    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(await page.locator('#app > .content #turtlePoolForm input[name="name"]').inputValue(), '折叠测试草稿');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('keyboard-open')), false, 'Folding a focused form is not a keyboard');
    await page.evaluate(() => androidTest.listeners.keyboardVisibilityChange({ visible: true }));
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('keyboard-open')), true);
    assert.equal(await page.locator('.bottom-nav').isVisible(), false, 'IME must hide bottom tabs rather than cover the form');
    await page.setViewportSize({ width: 360, height: 360 });
    await page.locator('#turtlePoolForm input[name="name"]').scrollIntoViewIfNeeded();
    const imeField = await page.locator('#turtlePoolForm input[name="name"]').boundingBox();
    assert(imeField && imeField.y >= 0 && imeField.y + imeField.height <= 360, 'Focused field remains reachable in the reduced keyboard viewport');
      const keyboardPage = await page.evaluate(() => state.page);
      await page.waitForTimeout(270);
      await page.evaluate(() => androidTest.listeners.backButton({ canGoBack: false }));
      assert.equal(await page.evaluate(() => state.page), keyboardPage, 'First system back hides IME without navigating');
      assert.equal(await page.locator('#turtlePoolForm input[name="name"]').inputValue(), '折叠测试草稿', 'Back while IME is visible retains the draft');
      assert.equal(await page.evaluate(() => androidTest.hiddenKeyboards), 1);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.evaluate(() => androidTest.listeners.keyboardVisibilityChange({ visible: false }));
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('keyboard-open')), false, 'Hide keyboard restores navigation even if input retains focus');
    assert.equal(await page.locator('.bottom-nav').isVisible(), true, 'Closing IME restores bottom tabs');
    await page.setViewportSize({ width: 720, height: 850 });
    assert.equal(await page.locator('#app > .content #turtlePoolForm input[name="name"]').inputValue(), '折叠测试草稿');
    await page.locator('#app > .content #turtlePoolForm input[name="name"]').blur();
    // Exercise the real app's page stack, with input and scroll retained.
    await page.evaluate(() => { state.page = 'home'; render(); setState({ page: 'pools' }); setState({ page: 'poolAdd' }); });
    const back = async () => { await page.waitForTimeout(270); await page.evaluate(() => androidTest.listeners.backButton({ canGoBack: false })); };
    await back();
    assert.equal(await page.evaluate(() => state.page), 'pools');
    await back();
    assert.equal(await page.evaluate(() => state.page), 'home');
    await page.evaluate(() => openTradeGuide());
    await back();
    assert.equal(await page.locator('.trade-guide').count(), 0);
    assert.equal(await page.evaluate(() => state.page), 'home');
    // A nested media preview closes before the guide beneath it.
    await page.evaluate(() => {
      openTradeGuide();
      const overlay = document.createElement('div'); overlay.className = 'image-preview-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999';
      overlay.innerHTML = '<button aria-label="关闭图片预览">关闭</button>';
      overlay.querySelector('button').onclick = () => overlay.remove(); document.body.append(overlay);
    });
    await back();
    assert.equal(await page.locator('.image-preview-overlay').count(), 0);
    assert.equal(await page.locator('.trade-guide').count(), 1);
    await back();
    await page.evaluate(() => { state.page = 'ledger'; render(); });
    await back();
    assert.equal(await page.evaluate(() => state.page), 'home');
    await back();
    assert.equal(await page.evaluate(() => androidTest.minimized), 1);
    assert.equal(await page.evaluate(() => state.turtles.length), 2, 'Back navigation must preserve records');
    if (process.env.ANDROID_EXTENDED === '1') await require('./android/responsive-audit.cjs')(page, output);
    if (process.env.ANDROID_TYPOGRAPHY === '1') await require('./android/typography-audit.cjs')(page, output);
    if (process.env.ANDROID_CARDS === '1') await require('./android/archive-card-audit.cjs')(page, output);
    if (process.env.ANDROID_CARDS === '1') await require('./android/batch-card-audit.cjs')(page, output);
    if (process.env.ANDROID_LEDGER === '1') await require('./android/ledger-card-audit.cjs')(page, output);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(output, 'run-status.json'), JSON.stringify({ status: 'passed', checkedAt: new Date().toISOString(), nativeDevice: false, extended: process.env.ANDROID_EXTENDED === '1', typography: process.env.ANDROID_TYPOGRAPHY === '1', cards: process.env.ANDROID_CARDS === '1', ledger: process.env.ANDROID_LEDGER === '1' }, null, 2));
    console.log('PASS: Android real-page responsive layouts, live fold resize, back stack, nested dialogs, root minimize and data preservation.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); fs.writeFileSync(path.join(output, 'run-status.json'), JSON.stringify({ status: 'failed', checkedAt: new Date().toISOString(), nativeDevice: false, error: error.message }, null, 2)); server.close(); process.exitCode = 1; });
