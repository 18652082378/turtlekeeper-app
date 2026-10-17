'use strict';
// Exercise the actual packaged files, not the source directory. Browser tests
// approximate the rendering engines; they are not a native-device certification.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const fixture = require('./ui-audit-fixture.cjs');
const root = path.resolve(__dirname, '..');
const platform = process.env.MOBILE_UI_PLATFORM || 'ios';
assert.ok(['ios', 'android'].includes(platform));
const engine = process.env.BROWSER_ENGINE || (platform === 'ios' ? 'webkit' : 'chromium');
process.env.BROWSER_ENGINE = engine;
const { launchBrowser } = require('./browser-test-engine.cjs');
const assetRoot = path.join(root, platform === 'ios' ? 'ios/App/App/public' : 'android/app/src/main/assets/public');
const output = path.join(root, 'output/mobile-qa', platform + '-' + engine);
const routeSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8').split('  const pages = {')[1].split('\n  };')[0];
const routes = [...routeSource.matchAll(/^\s+(\w+):/gm)].map(m => m[1]);
assert.ok(routes.includes('team') && routes.includes('search') && routes.length >= 45, 'Cover every render route, including module renderers');
const cases = routes.map(name => ({ name, page: name }));
cases.push({ name: 'weather', page: 'memos', careTab: 'weather' }, { name: 'reminders', page: 'memos', careTab: 'reminders' },
  { name: 'login', page: 'account', accountMode: 'login', loggedInPhone: '', cloudToken: '' },
  { name: 'password-reset', page: 'account', accountMode: 'reset', loggedInPhone: '', cloudToken: '' });
cases.push({ name: 'register', page: 'account', accountMode: 'register', loggedInPhone: '', cloudToken: '' },
  { name: 'reminder-form', page: 'memos', careTab: 'reminders', memoDraftOpen: true });
for (const type of ['purchase', 'sold', 'loss', 'other']) cases.push({ name: 'ledger-form-' + type, page: 'ledger', ledgerDraftType: type });
cases.push({ name: 'archive-measures-expanded', page: 'add', openDetails: true });
for (const type of ['purchase', 'sold', 'loss']) cases.push({ name: 'ledger-measures-' + type, page: 'ledger', ledgerDraftType: type, openDetails: true });
for (const tab of ['analytics', 'market', 'feedback', 'safety', 'health', 'chats']) cases.push({ name: 'operations-' + tab, page: 'operations', operationsTab: tab });
for (const tab of ['overview', 'ledger', 'reports', 'hatching', 'care', 'tasks', 'members', 'logs', 'approvals', 'settings']) cases.push({ name: 'team-preview-' + tab, page: 'team', teamTab: tab });
const strictAndroid = platform === 'android' && process.env.ANDROID_STRICT === '1';
const sizes = strictAndroid
  ? [[280, 653], [320, 568], [360, 800], [390, 844], [430, 932], [600, 800], [720, 960], [840, 720], [1024, 768], [1280, 900], [1600, 1000], [800, 360], [600, 280]]
  : [[320, 720], [390, 844], [430, 932], [720, 960], [1024, 768]];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };
(async () => {
  fs.mkdirSync(output, { recursive: true });
  for (const file of fs.readdirSync(output)) if (/^failure-[\w-]+\.png$/.test(file)) fs.unlinkSync(path.join(output, file));
  let browser;
  const checks = [], failures = [], errors = [], interactions = [];
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce', timezoneId: 'Asia/Shanghai' });
    await context.addInitScript('window.auditMobileControls = (' + require('./mobile-control-layout.cjs').toString() + ');');
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.pathname.startsWith('/api/')) {
        const weather = u.pathname.startsWith('/api/weather/');
        return route.fulfill({ json: weather ? { ok: true, settings: { enabled: false, targetTemperature: 20, difference: 3, remindTime: '18:00', advanceDays: 0, location: null }, notices: [], providerConfigured: true, pushConfigured: true, hasPushDevice: true } : { ok: true, minimumBuild: 0, friends: [], messages: [], items: [], posts: [], listings: [] } });
      }
      if (u.hostname !== 'mobile.test') return route.abort();
      const file = path.resolve(assetRoot, '.' + (u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname)));
      if (!file.startsWith(assetRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    await context.addInitScript(({ platform }) => {
      window.mobileUi = { listeners: {}, pushListeners: {}, minimizeCount: 0 };
      const App = { getInfo: async () => ({ build: platform === 'ios' ? '134' : '17' }), getLaunchUrl: async () => ({}), addListener: async (n, f) => { mobileUi.listeners[n] = f; return { remove() {} }; }, minimizeApp: async () => { mobileUi.minimizeCount++; } };
      const bars = { setTheme: async () => {}, getDisplayMetrics: async () => ({}), addListener: async (n, f) => { mobileUi.listeners[n] = f; f({ visible: false }); return { remove() {} }; } };
      const push = { checkPermissions: async () => ({ receive: 'denied' }), requestPermissions: async () => ({ receive: 'denied' }), addListener: async (n, f) => { mobileUi.pushListeners[n] = f; return { remove() {} }; }, register: async () => {}, unregister: async () => {} };
      const plugins = { App, TurtleAndroidWindow: bars, PushNotifications: push, TurtleAndroidPush: push };
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform, Plugins: plugins, registerPlugin: n => plugins[n] || {} };
    }, { platform });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://mobile.test/?skipIntro=1');
    await page.waitForFunction(() => typeof state !== 'undefined' && typeof render === 'function');
    await page.evaluate(async () => { await document.fonts.ready; window.dismissTradeIntro?.(); window.TurtleReleaseNotes?.cancel(); });
    const seed = fixture();
    const datasets = [{ name: 'populated', seed, sizes }];
    if (strictAndroid) datasets.push({ name: 'empty', seed: { loggedInPhone: '13000000000', accountName: '界面空状态测试', policyConsentRequired: false }, sizes: [[320, 568], [720, 960]] });
    for (const dataset of datasets) for (const theme of ['teal', 'dark']) for (const [width, height] of dataset.sizes) {
      await page.setViewportSize({ width, height });
      for (const test of cases) {
        const errorStart = errors.length;
        await page.evaluate(({ seed, theme, test }) => {
          state = { ...initialState, ...emptyAccountData(), ...seed, themeColor: theme, cloudToken: 'synthetic-mobile-ui-only', ...test };
          forceUpdateState = { required: false }; pendingPageEnterMotion = false;
          render(); scrollTo(0, 0);
          if (test.openDetails) document.querySelectorAll('#app main details').forEach(el => { el.open = true; });
          if (test.teamTab) {
            const button = document.querySelector('[data-ts="preview.tab"][data-tab="' + test.teamTab + '"]');
            if (!button) throw Error('Missing team preview tab ' + test.teamTab);
            button.click();
          }
        }, { seed: dataset.seed, theme, test });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const problems = await page.evaluate(() => {
          const problems = [], width = innerWidth;
          if (document.documentElement.scrollWidth > width + 1) problems.push('document wider than viewport');
          if (!document.querySelector('#app main')) problems.push('missing page content');
          for (const el of document.querySelectorAll('#app main *, #app > .topbar, #app > .bottom-nav, .search-workspace-form')) {
            const style = getComputedStyle(el), r = el.getBoundingClientRect();
            if (!r.width || !r.height || style.visibility === 'hidden' || el.closest('.sr-only, .edge-back-preview, [hidden]')) continue;
            let clipped = false;
            for (let p = el.parentElement; p && p.id !== 'app'; p = p.parentElement) {
              if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) { clipped = true; break; }
            }
            if (!clipped && (r.right > width + 2 || r.left < -2)) problems.push('offscreen ' + el.tagName + '.' + String(el.className).replace(/\s+/g, '.') + ': ' + String(el.textContent).trim().slice(0, 48) + ' [' + Math.round(r.left) + ',' + Math.round(r.right) + '] parent=' + el.parentElement?.className);
            if (el.matches('input:not([type=checkbox]):not([type=radio]), select, textarea, button') && r.width > width + 2) problems.push('control wider than viewport');
          }
          const bar = document.querySelector('#app > .topbar'), title = bar?.querySelector('h1');
          if (title) {
            const t = title.getBoundingClientRect();
            for (const el of bar.querySelectorAll('button, .market-trade-guide-entry')) {
              const r = el.getBoundingClientRect();
              if (r.width && r.height && r.right > t.left + 2 && r.left < t.right - 2 && r.bottom > t.top && r.top < t.bottom) problems.push('title/action overlap');
            }
          }
          const nav = document.querySelector('#app > .bottom-nav');
          if (nav) { const r = nav.getBoundingClientRect(); if (r.bottom > innerHeight + 2 || r.left < -1 || r.right > width + 1) problems.push('bottom navigation outside viewport'); }
          return [...new Set(problems)].slice(0, 12);
        });
        problems.push(...errors.slice(errorStart));
        const controls = await page.evaluate(() => window.auditMobileControls());
        problems.push(...controls.problems);
        const result = { dataset: dataset.name, route: test.name, width, height, theme, problems, groups: controls.groups };
        checks.push(result);
        if (problems.length) {
          failures.push(result);
          if (failures.length <= 20) await page.screenshot({ path: path.join(output, 'failure-' + dataset.name + '-' + test.name + '-' + width + '-' + theme + '.png') });
        } else if (dataset.name === 'populated' && theme === 'teal' && ((strictAndroid && [360, 720].includes(width)) || (width === 390 && ['home', 'market', 'community', 'memos', 'weather', 'login', 'search'].includes(test.name)) || (width === 320 && ['communityAdd', 'operations'].includes(test.name)))) {
          await page.screenshot({ path: path.join(output, test.name + '-' + width + '.png') });
        }
      }
      console.log(platform + '/' + engine + ' ' + dataset.name + '/' + theme + '/' + width + ': ' + checks.length + ' checks, ' + failures.length + ' failures');
    }
    // These are separate interactions: equal screenshots at rest cannot prove
    // that fixed search bars remain attached while content scrolls or focuses.
    await page.setViewportSize({ width: 390, height: 844 });
    for (const source of ['market', 'community']) {
      await page.evaluate(({ seed, source }) => {
        state = { ...initialState, ...emptyAccountData(), ...seed, themeColor: 'teal', page: source };
        forceUpdateState = { required: false }; pendingPageEnterMotion = false;
        render(); scrollTo(0, 0);
        // Test-only content makes scrolling possible without any API traffic.
        const fill = document.createElement('div'); fill.style.height = '2200px'; document.querySelector('#app main').append(fill);
      }, { seed, source });
      const before = await page.locator('.feed-search-dock').boundingBox();
      await page.evaluate(() => scrollTo(0, 500));
      await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
      const after = await page.locator('.feed-search-dock').boundingBox();
      assert.ok(before && after && Math.abs(before.y - after.y) < 1, source + ' search follows fixed title during scroll');
      await page.locator('[data-open-search]').first().click();
      const input = page.locator('[data-workspace-search]'); await input.focus();
      const focus = await input.evaluate(el => ({ outline: getComputedStyle(el).outlineStyle, border: getComputedStyle(el).borderTopWidth, ring: getComputedStyle(el.closest('.search-workspace-control')).boxShadow }));
      assert.equal(focus.outline, 'none'); assert.equal(focus.border, '0px'); assert.notEqual(focus.ring, 'none');
      await input.fill('果核');
      const first = await page.locator('.search-workspace-form').boundingBox();
      await page.evaluate(() => { const fill = document.createElement('div'); fill.style.height = '2200px'; document.querySelector('#app main').append(fill); scrollTo(0, 500); });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
      const second = await page.locator('.search-workspace-form').boundingBox();
      assert.ok(first && second && Math.abs(first.y - second.y) < 1, 'search page toolbar remains fixed');
      interactions.push(source + ': feed/search fixed bars and rounded focus');
    }
    assert.deepEqual(errors, [], 'No JavaScript errors');
  } catch (error) {
    errors.push(error.message);
    throw error;
  } finally {
    const controlGroupsChecked = checks.reduce((total, check) => total + (check.groups?.length || 0), 0);
    const controlCoverage = [...new Set(checks.flatMap(check => (check.groups || []).map(group => group.selector)))];
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ platform, engine, status: failures.length || errors.length ? 'failed' : 'passed', nativeDevice: false, checkedAt: new Date().toISOString(), checks: checks.length, controlGroupsChecked, controlCoverage, interactions, routes: cases.map(c => c.name), sizes, failures, errors }, null, 2));
    await browser?.close();
    if (strictAndroid) fs.writeFileSync(path.join(output, 'gallery.html'), '<!doctype html><meta charset="utf-8"><title>安卓页面检查截图</title><style>body{font:16px system-ui;background:#edf3ef;margin:24px}section{display:flex;flex-wrap:wrap;gap:20px}figure{margin:0;width:360px;background:white;padding:12px;box-sizing:border-box}img{width:100%;height:auto}figcaption{padding:8px;overflow-wrap:anywhere}</style><h1>安卓页面检查截图</h1><p>本地合成数据，浏览器渲染检查，并非真机截图。状态与错误请查看 results.json。</p><section>' + cases.map(test => '<figure><figcaption>' + test.name + ' · 360px</figcaption><a href="' + test.name + '-360.png"><img loading="lazy" src="' + test.name + '-360.png"></a></figure>').join('') + '</section>');
  }
  assert.equal(failures.length, 0, platform + '/' + engine + ': ' + failures.length + ' failed layouts; see output/mobile-qa');
  console.log('PASS ' + platform + '/' + engine + ': ' + checks.length + ' packaged-page layout checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
