'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
const fixture = require('./ui-audit-fixture.cjs')();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
(async () => {
  const browser = await launchBrowser();
  const results = [], errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.Capacitor = { getPlatform: () => 'ios', isNativePlatform: () => true, Plugins: {} }; });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'dialog.test' || url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, items: [], listings: [], posts: [] } });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404 });
      return route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('https://dialog.test/?skipIntro=1');
    await page.evaluate(() => { window.dismissTradeIntro?.(); window.TurtleReleaseNotes?.cancel(); });
    const seed = async (route, theme, data = fixture) => page.evaluate(({ data, route, theme }) => {
      state = { ...initialState, ...emptyAccountData(), ...data, page: route, themeColor: theme, cloudToken: '', policyConsentRequired: false };
      forceUpdateState = { required: false }; pendingPageEnterMotion = false;
      render();
    }, { data, route, theme });
    for (const [width, height] of [[280, 600], [390, 844], [390, 300], [740, 280]]) for (const theme of ['teal', 'dark']) {
      await page.setViewportSize({ width, height });
      const audit = async (name, selector, action) => {
        const dialog = page.locator(selector);
        await dialog.waitFor({ state: 'visible' });
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        const result = await dialog.evaluate((el, name) => {
          const r = el.getBoundingClientRect(), problems = [];
          if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) problems.push('Dialog extends beyond viewport');
          if (el.scrollWidth > el.clientWidth + 2) problems.push('Dialog content clips horizontally');
          if (name === 'archive' && el.querySelector('.archive-directory-list')?.clientHeight < 50) problems.push('Archive list has no usable space');
          return problems;
        }, name);
        results.push({ name, width, height, theme, problems: result });
        // Check the real closing action is reachable even in a short viewport.
        if (!result.length) await dialog.locator(action).last().click();
        else await dialog.locator(action).last().evaluate(button => button.click()); // Clean up an already failed geometry case.
      };
      await seed('mine', theme);
      await page.evaluate(() => openGeneralServiceDialog());
      await audit('service', '.general-service-dialog', '[data-market-service-close]');
      await page.evaluate(() => openMarketDetailMore('ui-listing'));
      await audit('share', '.market-detail-more-sheet', '[data-market-detail-more-close]');
      await seed('communityAdd', theme);
      await page.locator('#communityPostForm').waitFor({ state: 'attached' });
      await page.locator('[data-open-community-visibility]').click();
      await audit('visibility', '.community-visibility-sheet', 'button[data-close-community-visibility]');
      // Visibility closes on its explicit button; Escape is not used there.
      if (await page.locator('.community-visibility-sheet').count()) {
        await page.evaluate(() => { communityVisibilitySheetOpen = false; render(); });
      }
      await seed('marketAdd', theme);
      await page.locator('#marketListingForm').waitFor({ state: 'attached' });
      await page.locator('.archive-directory-trigger').first().click();
      await audit('archive', '.archive-directory-dialog', '[data-directory-close]');
      if (height === 280 && !results.at(-1).problems.length) {
        await page.locator('.archive-directory-trigger').first().click();
        await page.locator('.directory-species-card').first().click();
        await page.locator('.directory-archive-card[data-directory-value="ui-turtle"]').click();
        await page.locator('.archive-directory-dialog').waitFor({ state: 'detached' });
        assert.equal(await page.locator('#marketListingForm [data-market-turtle-source]').inputValue(), 'ui-turtle');
      }
    }
    await seed('communityAdd', 'teal', { ...fixture, turtles: [] });
    await page.locator('#communityPostForm').waitFor({ state: 'attached' });
    await page.locator('[data-community-compose-mode="growth"]').click();
    await page.getByRole('button', { name: /先建立一份龟档案/ }).click();
    assert.equal(await page.evaluate(() => state.page), 'add');
    assert.deepEqual(errors, []);
    const failures = results.filter(test => test.problems.length);
    recordResult(root, 'active-dialog-layout.json', { status: failures.length ? 'failed' : 'passed', checks: results.length, failures, results, errors });
    if (failures.length) console.error(JSON.stringify(failures));
    assert.equal(failures.length, 0);
    console.log('PASS: ' + results.length + ' dialog cases and the empty growth archive shortcut.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
