'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const platform = process.env.MOBILE_UI_PLATFORM || 'ios';
process.env.BROWSER_ENGINE ||= platform === 'ios' ? 'webkit' : 'chromium';
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, platform === 'ios' ? 'ios/App/App/public' : 'android/app/src/main/assets/public');
const fixture = require('./ui-audit-fixture.cjs')();
(async () => {
  const browser = await launchBrowser(), errors = []; let checks = 0;
  const output = path.join(root, 'output/market-publish-layout', platform); fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 720 }, hasTouch: true, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url()); if (url.hostname !== 'publish.test') return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, items: [], notices: [], listings: [] } });
      const file = path.resolve(publicRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('https://publish.test/');
    await page.evaluate(() => { dismissTradeIntro?.(); TurtleReleaseNotes?.cancel(); });
    for (const width of [280, 320, 360, 390, 430, 720, 1024]) for (const theme of ['teal', 'dark']) for (const mode of ['new', 'archive', 'edit']) for (const intrinsicStress of [false, true]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(({ fixture, theme, mode, intrinsicStress }) => {
        state = { ...initialState, ...emptyAccountData(), ...fixture, page: 'marketAdd', themeColor: theme, cloudToken: '', policyConsentRequired: false,
          marketDraftTurtleId: mode === 'archive' ? fixture.turtles[0].id : '',
          editingMarketListingId: mode === 'edit' ? fixture.marketListings[0].id : '',
          marketDraftCity: '杭州市', marketDraftDescription: '', marketDraftMedia: mode === 'archive' ? Array.from({ length: 9 }, () => ({ type: 'image', dataUrl: fixture.__image })) : [] };
        window.publishBusinessSnapshot = JSON.stringify([state.turtles, state.ledgerRecords, state.marketListings, state.myMarketListings]);
        forceUpdateState = { required: false }; pendingPageEnterMotion = false; render();
        // Native controls have different intrinsic widths on Mac/Windows.
        // A large preferred textarea width must not expand the form's grid.
        if (intrinsicStress) document.querySelector('#marketListingForm textarea').cols = 60;
      }, { fixture, theme, mode, intrinsicStress });
      await page.locator('#marketListingForm [name="title"]').fill('界面检查用的商品标题');
      await page.locator('#marketListingForm [name="description"]').fill('本地测试说明，不会发布商品。');
      await page.locator('#marketListingForm [name="stage"]').selectOption('juvenile');
      await page.locator('#marketListingForm [name="gender"]').selectOption('母');
      const bounds = await page.evaluate(() => {
        const main = document.querySelector('.market-publish-page'), form = document.querySelector('#marketListingForm');
        const r = main.getBoundingClientRect(), s = getComputedStyle(main);
        const left = r.left + parseFloat(s.paddingLeft), right = r.right - parseFloat(s.paddingRight);
        const nodes = [form, ...form.children, ...form.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select, textarea, .market-form-two, .market-price-input')];
        const outside = nodes.flatMap(el => {
          const b = el.getBoundingClientRect(); if (!b.width || !b.height || getComputedStyle(el).display === 'none') return [];
          return b.left < left - 1 || b.right > right + 1 ? [{ tag: el.tagName, name: el.name || el.className, left: b.left, right: b.right }] : [];
        });
        return { left, right, outside, formWidth: form.getBoundingClientRect().width, overflow: getComputedStyle(form).overflowX };
      });
      if (bounds.outside.length) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
      assert.deepEqual(bounds.outside, [], JSON.stringify({ platform, width, theme, mode, intrinsicStress, bounds }));
      assert(Math.abs(bounds.formWidth - (bounds.right - bounds.left)) <= 1, 'Form fills the available content width');
      assert(!['hidden', 'clip'].includes(bounds.overflow), 'Do not conceal overflowing controls to pass the audit');
      await page.setViewportSize({ width: width + 10, height: 844 });
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.locator('[name="title"]').inputValue(), '界面检查用的商品标题');
      assert.equal(await page.locator('[name="description"]').inputValue(), '本地测试说明，不会发布商品。');
      assert.equal(await page.locator('[name="stage"]').inputValue(), 'juvenile');
      assert.equal(await page.locator('[name="gender"]').inputValue(), '母');
      assert(await page.evaluate(() => JSON.stringify([state.turtles, state.ledgerRecords, state.marketListings, state.myMarketListings]) === window.publishBusinessSnapshot), 'Layout must not change account records');
      if (width === 320 && mode === 'new' && !intrinsicStress) {
        await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
        await page.screenshot({ path: path.join(output, `${theme}-320.png`), fullPage: true });
      }
      checks++;
    }
    assert.deepEqual(errors, []);
    recordResult(root, 'market-publish-layout-' + platform + '.json', { checks, errors });
    console.log(`PASS ${platform}: ${checks} market publish layouts: narrow/wide, both themes, new/archive/edit, native intrinsic width stress and preserved form values.`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
