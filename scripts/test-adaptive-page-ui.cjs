'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
const platform = process.env.MOBILE_UI_PLATFORM || 'ios';
const assets = path.join(root, platform === 'android' ? 'android/app/src/main/assets/public' : 'ios/App/App/public');
const fixture = require('./ui-audit-fixture.cjs')();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' };
(async () => {
  const browser = await launchBrowser(), results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(platform => {
      const app = { getInfo: async () => ({ build: '145' }), addListener: async () => ({ remove() {} }) };
      const bars = { setTheme: async () => {}, getDisplayMetrics: async () => ({}), addListener: async () => ({ remove() {} }) };
      const plugins = { App: app, TurtleAndroidWindow: bars };
      window.Capacitor = { getPlatform: () => platform, isNativePlatform: () => true, Plugins: plugins, registerPlugin: name => plugins[name] || {} };
    }, platform);
    await page.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.hostname !== 'adaptive.test' || u.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, posts: [], listings: [], items: [] } });
      const file = path.resolve(assets, '.' + (u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname)));
      if (!file.startsWith(assets + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404 });
      return route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('https://adaptive.test/?skipIntro=1');
    await page.evaluate(() => { window.dismissTradeIntro?.(); window.TurtleReleaseNotes?.cancel(); });
    const seed = async (route, theme, patch = {}) => page.evaluate(({ fixture, route, theme, patch }) => {
      state = { ...initialState, ...emptyAccountData(), ...fixture, cloudToken: '', themeColor: theme, page: route, policyConsentRequired: false, ...patch };
      forceUpdateState = { required: false }; pendingPageEnterMotion = false; render(); scrollPageTo(0, 0);
    }, { fixture, route, theme, patch });
    for (const width of [280, 320, 370, 375, 390, 440, 720]) {
      await page.setViewportSize({ width, height: 844 });
      for (const theme of ['teal', 'forest', 'ocean', 'plum', 'dark']) {
        for (const sort of ['default', 'valueAsc']) {
          await seed('home', theme, { turtleSort: sort });
          const layout = await page.locator('.home-archive-section .filter-dock').evaluate(group => {
            const canvas = document.createElement('canvas').getContext('2d');
            const clipped = [...group.querySelectorAll('select')].filter(el => {
              const css = getComputedStyle(el);
              canvas.font = [css.fontWeight, css.fontSize, css.fontFamily].join(' ');
              return css.appearance !== 'none' || el.clientHeight < 44 ||
                canvas.measureText(el.selectedOptions[0].textContent).width > el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight) + 1;
            }).map(el => el.selectedOptions[0].textContent);
            const rows = new Map();
            for (const el of group.children) {
              const top = Math.round(el.getBoundingClientRect().top);
              rows.set(top, (rows.get(top) || 0) + 1);
            }
            return { clipped, rows: [...rows.values()] };
          });
          assert.deepEqual(layout.clipped, [], width + '/' + theme + '/' + sort + ': selected labels must fit without clipping');
          assert.deepEqual(layout.rows, sort === 'default' ? (width <= 370 ? [2, 1] : [3]) : (width <= 560 ? [2, 2] : [4]),
            width + '/' + theme + '/' + sort + ': controls must share their grid rows');
          results.push({ page: 'home-filters', width, theme, sort });
        }
      }
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await seed('home', 'teal', { turtleSort: 'latest' });
    const before = await page.evaluate(() => JSON.stringify(state.turtles));
    await page.locator('[data-archive-search]').fill('fixture-does-not-exist');
    await page.locator('[data-reset-archive-filters]').click();
    assert.equal(await page.locator('[data-archive-search]').inputValue(), '');
    assert.equal(await page.locator('[data-sort-turtles]').inputValue(), 'latest');
    assert.equal(await page.evaluate(() => JSON.stringify(state.turtles)), before);
    await seed('home', 'teal', { turtles: [] });
    await page.locator('.archive-empty [data-page="add"]').click();
    assert.equal(await page.evaluate(() => state.page), 'add');
    results.push({ page: 'home-empty-actions' });
    for (const width of [280, 390, 720]) for (const theme of ['teal', 'dark']) {
      await page.setViewportSize({ width, height: 844 });
      await seed('reports', theme, { ledgerRecords: [{ id: 'large-total', type: 'purchase', amount: 99999999.99, recordDate: '2026-11-13' }] });
      const report = await page.locator('.report-profit-breakdown').evaluate(el => {
        const rows = new Set([...el.children].map(metric => Math.round(metric.getBoundingClientRect().top)));
        return { rows: rows.size, fullValues: [...el.querySelectorAll('b')].every(value => value.scrollWidth <= value.clientWidth + 1) };
      });
      assert.deepEqual(report, { rows: width <= 620 ? 2 : 1, fullValues: true });
      results.push({ page: 'report-values', width, theme });
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await seed('account', 'dark', { loggedInPhone: '', accountMode: 'login' });
    const form = await page.locator('#accountForm').evaluate(form => {
      const label = form.querySelector('.survey-field > span').getBoundingClientRect();
      const input = form.querySelector('input[name="phone"]').getBoundingClientRect();
      const consent = form.querySelector('.account-login-footer .auth-agreement > span');
      const forgot = form.querySelector('.account-forgot-password');
      const tab = document.querySelector('.auth-tabs .active');
      return { stacked: label.bottom <= input.top, sameSize: getComputedStyle(consent).fontSize === getComputedStyle(forgot).fontSize,
        sameTop: Math.abs(consent.getBoundingClientRect().top - forgot.getBoundingClientRect().top) < 2,
        activeThemed: getComputedStyle(tab).backgroundColor !== 'rgba(0, 0, 0, 0)' };
    });
    assert.deepEqual(form, { stacked: true, sameSize: true, sameTop: true, activeThemed: true });
    results.push({ page: 'account-form' });
    await seed('marketAdd', 'teal');
    const field = page.locator('#marketListingForm input[name="price"]');
    await field.evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
    const focusBounds = await field.evaluate(el => ({ top: el.getBoundingClientRect().top, chrome: document.querySelector('.topbar').getBoundingClientRect().bottom,
      mainName: document.querySelector('#app > main').getAttribute('aria-label') }));
    assert(focusBounds.top >= focusBounds.chrome, 'A scrolled-to field must remain below the fixed title');
    assert.equal(focusBounds.mainName, '发布出售');
    results.push({ page: 'form-focus-and-landmark' });
    for (const width of [280, 390, 720]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [route, selector] of [
        ['marketDetail', '.market-seller-actions'],
        ['communityPostDetail', '.community-detail-head .community-author-actions']
      ]) {
        await seed(route, 'teal');
        const buttons = await page.locator(selector + ' > button').evaluateAll(buttons => buttons.map(button => {
          const { width, height, left, right } = button.getBoundingClientRect();
          return { width, height, fits: left >= 0 && right <= document.documentElement.clientWidth };
        }));
        assert.equal(buttons.length, 2, route + ': follow and chat actions should both be available');
        assert(buttons.every(button => button.width >= 44 && button.height >= 44 && button.fits),
          route + '/' + width + ': contact buttons need room to tap without overflowing');
        results.push({ page: route, width, contactActions: buttons.length });
      }
    }
    assert.deepEqual(errors, []);
    recordResult(root, 'adaptive-page-ui-' + platform + '.json', { status: 'passed', checks: results.length, results });
    console.log('PASS ' + platform + ': ' + results.length + ' adaptive UI scenarios.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
