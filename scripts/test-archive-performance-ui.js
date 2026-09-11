const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'archive.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL = "";' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    await page.addInitScript(() => {
      const turtles = Array.from({ length: 850 }, (_, i) => ({ id: `t-${i}`, code: `GHG-${i + 1}`, speciesCode: 'GHG', speciesName: '果核蛋龟',
        poolId: i < 500 ? 'p1' : 'p2', gender: '未知', status: '正常饲养', health: '健康', price: i, acquiredDate: '2026-09-10', createdAt: '2026-09-10T00:00:00Z', measureHistory: [] }));
      const data = { turtles, keptSpecies: ['GHG'], turtlePools: [{ id: 'p1', name: '果核苗池', type: 'hatchling', count: 0 }, { id: 'p2', name: '果核压成池', type: 'juvenile', count: 0 }],
        ledgerRecords: turtles.map(t => ({ id: `cost-${t.id}`, turtleId: t.id, type: 'other', category: '看病', amount: 10 })), memos: [], themeColor: 'dark' };
      localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ page: 'home', loggedInPhone: 'test-account', registeredUsers: [{ phone: 'test-account', accountName: '性能测试', data }], policyConsentRequired: false }));
    });
    await page.goto('https://archive.test/', { waitUntil: 'load' });
    await page.locator('.turtle-row').first().waitFor();
    const skip = page.getByRole('button', { name: '跳过', exact: true });
    if (await skip.isVisible()) await skip.click();
    assert.equal(await page.locator('.turtle-row').count(), 30);
    assert.equal(await page.evaluate(() => stats().active), 850);
    assert.match(await page.locator('.archive-page-count').innerText(), /共 850 条/);
    assert.ok(await page.locator('.turtle-row > img').evaluateAll(images => images.every(image => image.loading === 'lazy' && image.decoding === 'async')));
    await page.evaluate(() => {
      window.archiveWrites = 0;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key === 'turtlekeeper-state-v1') archiveWrites++; return original.call(this, key, value); };
    });
    const next = page.getByRole('button', { name: '下一页', exact: true });
    await next.click();
    assert.equal(await page.locator('.turtle-row').first().getAttribute('data-view-turtle'), 't-30');
    await page.locator('.turtle-row').first().click();
    await page.locator('[data-back]').click();
    assert.equal(await page.locator('.turtle-row').first().getAttribute('data-view-turtle'), 't-30', 'Back returns to the same page');
    await page.locator('[data-toggle-turtle-menu]').first().click();
    await page.locator('[data-toggle-turtle-menu]').first().click();
    await page.locator('[data-filter-pool]').selectOption('p2');
    assert.equal(await page.locator('.turtle-row').first().getAttribute('data-view-turtle'), 't-500');
    await page.locator('[data-filter-pool]').selectOption('all');
    await page.locator('[data-archive-search]').fill('GHG-850');
    await page.waitForFunction(() => document.querySelectorAll('.turtle-row').length === 1);
    assert.equal(await page.locator('.turtle-row').getAttribute('data-view-turtle'), 't-849');
    await page.locator('[data-archive-search]').fill('不存在的龟');
    await page.getByText('没有符合条件的档案', { exact: true }).waitFor();
    await page.locator('[data-archive-search]').fill('');
    await page.waitForFunction(() => document.querySelectorAll('.turtle-row').length === 30);
    await page.locator('[data-sort-turtles]').selectOption('valueAsc');
    await page.locator('[data-toggle-turtle-value-sort]').click();
    assert.equal(await page.locator('.turtle-row').first().getAttribute('data-view-turtle'), 't-849');
    assert.equal(await page.evaluate(() => archiveWrites), 0, 'Viewing, paging, searching and sorting never rewrite the full account');
    const measurement = await page.evaluate(() => {
      const start = performance.now(); render();
      return { records: state.turtles.length, renderedRows: document.querySelectorAll('.turtle-row').length, renderMs: Math.round((performance.now() - start) * 10) / 10 };
    });
    await page.locator('[data-sort-turtles]').selectOption('default');
    for (const width of [320, 390, 1200]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Fits ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    fs.mkdirSync(path.join(root, 'output', 'archive-performance'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'output', 'archive-performance', 'dashboard-850.png') });
    // A real edit must still persist, despite the read-only shortcuts above.
    await page.evaluate(() => toggleTurtlePin(state.turtles[0].id));
    assert.ok(await page.evaluate(() => archiveWrites > 0));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('turtlekeeper-state-v1')).turtles.length), 850);
    assert.deepEqual(errors, []);
    console.log('Archive performance UI passed:', JSON.stringify(measurement));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
