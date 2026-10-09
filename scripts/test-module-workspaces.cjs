'use strict';
// Actual client code, synthetic records and intercepted requests only.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, engine } = require('./browser-test-engine.cjs');
const fixture = require('./ui-audit-fixture.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output/ui-upgrade-132/modules');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await launchBrowser(), results = [], density = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'modules.test') return route.abort();
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, posts: [], messages: [], listings: [], friends: [], minimumBuild: 0 } });
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' })[path.extname(file)] || 'application/octet-stream' });
  });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(6000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.dismiss());
  const tick = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function seed(route, patch = {}) {
    await page.evaluate(({ base, route, patch }) => {
      window.dismissTradeIntro?.(); $app.cancelEdgeBackGesture?.();
      document.querySelectorAll('.image-preview-overlay').forEach(overlay => overlay.__closePreview?.());
      state = { ...initialState, ...emptyAccountData(), ...base, page: route, themeColor: 'teal', ...patch };
      growthHistoryLimit = 40; communitySelectedCircleId = 'all'; communityForumSort = 'latest';
      edgeBackSnapshots = []; pendingPageEnterMotion = false; forceUpdateState = { required: false };
      render(); scrollTo(0, 0);
    }, { base: fixture(), route, patch }); await tick();
  }
  async function check(name, run) {
    const startErrors = errors.length;
    try { await run(); assert.deepEqual(errors.slice(startErrors), []); results.push({ name, pass: true }); console.log('PASS ' + name); }
    catch (error) { results.push({ name, pass: false, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message); }
  }
  try {
    await page.goto('https://modules.test/?skipIntro=1');
    await check('dashboard shortcuts and social composer remain direct, aligned and touch-sized', async () => {
      for (const theme of ['teal', 'dark']) for (const width of [320, 390, 430, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await seed('home', { themeColor: theme });
        const targets = await page.locator('.home-module-panel > button').evaluateAll(nodes => nodes.map(el => { const b = el.getBoundingClientRect(); return { w: b.width, h: b.height }; }));
        assert.equal(targets.length, 4); assert.ok(targets.every(r => r.w >= 44 && r.h >= 44));
        await seed('community', { themeColor: theme });
        const hub = await page.locator('.community-invite').boundingBox();
        assert.ok(hub.height < 165, `composer height ${hub.height}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.locator('.community-invite-publish').click();
        assert.equal(await page.evaluate(() => state.page), 'community');
        assert.match(await page.locator('.toast').innerText(), /需要连接云端/);
      }
    });
    await check('archive first screen exposes measurements, preserves zero and still opens the photo', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      const turtle = { ...fixture().turtles[0], weight: 0, carapaceLength: 0 };
      await seed('turtleDetail', { turtles: [turtle], selectedTurtleId: turtle.id });
      assert.equal(await page.locator('main h2').filter({ hasText: turtle.code }).count(), 1);
      assert.match(await page.locator('.detail-grid-card').innerText(), /0g/);
      assert.match(await page.locator('.detail-grid-card').innerText(), /0cm/);
      const metrics = await page.locator('.detail-grid-card').boundingBox(); assert.ok(metrics.y < 450);
      await page.locator('[data-growth-photo-preview]').click();
      assert.equal(await page.locator('.image-preview-overlay:visible').count(), 1);
      await page.keyboard.press('Escape'); assert.equal(await page.locator('.image-preview-overlay:visible').count(), 0);
    });
    await check('105 growth archives paginate without duplicates or loss; changing the filter resets the window', async () => {
      const turtles = Array.from({ length: 105 }, (_, i) => ({ ...fixture().turtles[0], id: `growth-${i}`, code: `成长 ${i}`, measureHistory: [{ id: `history-${i}`, updatedAt: new Date(Date.UTC(2026, 9, 7, 0, i)).toISOString(), oldSnapshot: { weight: 100, carapaceLength: 8 }, newSnapshot: { weight: 110, carapaceLength: 8.2 } }] }));
      await seed('growth', { turtles, breedingRecords: [] });
      assert.equal(await page.locator('.growth-update-card').count(), 40);
      const before = await page.locator('.growth-update-card').evaluateAll(nodes => nodes.map(el => el.dataset.viewTurtle));
      await page.locator('[data-more-growth]').click(); assert.equal(await page.locator('.growth-update-card').count(), 80);
      await page.locator('[data-more-growth]').click(); assert.equal(await page.locator('.growth-update-card').count(), 105);
      const ids = await page.locator('.growth-update-card').evaluateAll(nodes => nodes.map(el => el.dataset.viewTurtle));
      assert.equal(new Set(ids).size, 105); assert.deepEqual(ids.slice(0, 40), before);
      assert.equal(await page.evaluate(() => state.turtles.length), 105);
      await page.locator('[data-growth-filter="breeding"]').click(); assert.equal(await page.locator('.growth-update-card').count(), 0);
      await page.locator('[data-growth-filter="all"]').click(); assert.equal(await page.locator('.growth-update-card').count(), 40);
      density.push({ archives: 105, initialCards: 40, afterTwoLoads: 105 });
    });
    await check('an empty market search offers clearing filters, retains local data and returns the original product', async () => {
      await seed('market', { marketSearch: '不匹配关键词', marketStage: 'hatchling', marketFreshOnly: true, marketDelivery: '仅自提' });
      assert.equal(await page.locator('[data-view-market]').count(), 0);
      assert.match(await page.locator('.market-empty').innerText(), /清除筛选/);
      assert.equal(await page.locator('.market-empty [data-page="marketAdd"]').count(), 0);
      await page.locator('[data-market-search-reset]').click();
      assert.equal(await page.locator('[data-view-market="ui-listing"]').count(), 1);
      assert.equal(await page.evaluate(() => state.marketListings.length), 1);
      assert.equal(await page.evaluate(() => state.marketSearch), '');
    });
    await check('species index never covers rows; searching and selecting preserve the existing flow', async () => {
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 844 }); await seed('species');
        const rail = await page.locator('.species-alpha-nav').boundingBox(), row = await page.locator('.species-row').first().boundingBox();
        assert.ok(row.x + row.width <= rail.x, `species row overlaps index at ${width}px: ${JSON.stringify({ row, rail })}`);
        assert.ok(rail.y >= 78 && rail.y + rail.height <= 844, 'alphabet index must fit below the header');
        const firstLetter = await page.locator('[data-scroll-letter="A"]').boundingBox();
        assert.ok(firstLetter.y >= rail.y && firstLetter.y + firstLetter.height <= rail.y + rail.height, 'A must be reachable at the start of the index');
        await page.locator('.species-alpha-nav').evaluate(el => { el.scrollTop = el.scrollHeight; });
        const lastLetter = await page.locator('[data-scroll-letter="Z"]').boundingBox();
        assert.ok(lastLetter.y >= rail.y && lastLetter.y + lastLetter.height <= rail.y + rail.height, 'Z must be reachable at the end of the index');
        await page.locator('.species-alpha-nav').evaluate(el => { el.scrollTop = 0; });
        assert.ok(row.height <= 110, 'simple species cards should not split the action into another row');
        await page.locator('[data-species-search]').fill('果核');
        assert.ok(await page.locator('.species-row:visible').count() > 0);
        const button = page.locator('.species-row:visible [data-add-species]').first(), code = await button.getAttribute('data-add-species');
        if (await page.evaluate(code => state.keptSpecies.includes(code), code)) await button.click();
        await page.locator(`[data-add-species="${code}"]`).click();
        assert.equal(await page.evaluate(code => state.keptSpecies.includes(code), code), true);
      }
    });
    await check('report totals are readable in both themes; frequent personal actions precede color settings', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      for (const theme of ['teal', 'dark']) {
        await seed('reports', { themeColor: theme });
        const colors = await page.locator('.report-profit-copy strong').evaluate(el => ({ foreground: getComputedStyle(el).color, background: getComputedStyle(el.closest('.report-profit-card')).backgroundColor }));
        assert.notEqual(colors.foreground, colors.background);
        const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const values = [luminance(colors.foreground), luminance(colors.background)].sort((a, b) => a - b);
        assert.ok((values[1] + .05) / (values[0] + .05) >= 4.5, 'report total needs readable text contrast');
        assert.match(await page.locator('.report-profit-copy strong').innerText(), /388\.50/);
        await page.screenshot({ path: path.join(output, `reports-${theme}-${engine}.png`) });
      }
      await seed('mine');
      assert.ok(await page.locator('[data-page="reports"]').evaluate(el => el.getBoundingClientRect().top < document.querySelector('.theme-row').getBoundingClientRect().top));
      await page.locator('[data-theme="dark"]').click();
      assert.equal(await page.evaluate(() => state.themeColor), 'dark');
      assert.equal(await page.locator('[data-theme="dark"]').getAttribute('aria-pressed'), 'true');
    });
    for (const route of ['home', 'turtleDetail', 'growth', 'market', 'community', 'messages', 'mine', 'reports', 'species']) {
      await page.setViewportSize({ width: 390, height: 844 }); await seed(route);
      await page.screenshot({ path: path.join(output, `${route}-390-${engine}.png`), animations: 'disabled' });
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, `results-${engine}.json`), JSON.stringify({ engine, scope: 'Synthetic client/browser interactions; no production or native device access.', results, density }, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
