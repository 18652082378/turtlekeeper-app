'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { launchBrowser, engine, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
const platform = process.env.MOBILE_UI_PLATFORM || 'web';
const assetRoot = platform === 'ios' ? path.join(root, 'ios/App/App/public')
  : platform === 'android' ? path.join(root, 'android/app/src/main/assets/public') : root;
const preference = 'turtlekeeper-archive-prices-hidden-v1';
const localPreview = process.argv.includes('--local-preview')
  ? 'C:/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app/index.html' : '';
const output = path.join(root, 'output', 'archive-price-privacy');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await launchBrowser();
  const errors = [];
  let checks = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (localPreview && url.protocol === 'file:') {
        if (url.pathname.endsWith('/config.js')) return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL = "";' });
        return route.continue();
      }
      if (url.hostname !== 'privacy.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL = "";' });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, items: [], minimumBuild: 0 } });
      const file = path.resolve(assetRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(assetRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    await page.addInitScript(() => {
      if (localStorage.getItem('turtlekeeper-state-v1')) return;
      const base = { speciesCode: 'GHG', speciesName: '果核蛋龟', poolId: 'one', status: '正常饲养', health: '健康', gender: '母',
        acquiredDate: '2026-10-01', createdAt: '2026-10-01T00:00:00Z', weight: 65, carapaceLength: 6.89, measureHistory: [] };
      const turtles = [
        ...Array.from({ length: 32 }, (_, i) => ({ ...base, id: 'single-' + i, code: '小果-' + i, price: 1400 + i,
          ...(i === 31 ? { speciesCode: 'HNG', speciesName: '虎泥蛋龟', poolId: 'two' } : {}) })),
        ...Array.from({ length: 2 }, (_, i) => ({ ...base, id: 'batch-' + i, code: '批次-' + i,
          batchId: 'batch', batchName: '果核苗批次', price: 60, batchTotalPrice: 120, pinned: true }))
      ];
      const data = { turtles, keptSpecies: ['GHG', 'HNG'], ledgerRecords: [{ id: 'medical', type: 'other', turtleId: 'single-0', category: '看病', amount: 12.5 }],
        turtlePools: [{ id: 'one', name: '一号池' }, { id: 'two', name: '二号池' }], memos: [], themeColor: 'teal' };
      localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ loggedInPhone: 'privacy-fixture', accountName: '价格展示测试',
        registeredUsers: [{ phone: 'privacy-fixture', accountName: '价格展示测试', data }], policyConsentRequired: false }));
    });
    const toggle = () => page.locator('[data-toggle-archive-prices]');
    const prices = () => page.locator('.home-archive-section .turtle-price');
    const badgeGeometry = () => prices().evaluateAll(items => items.map(item => {
      const { x, y, width, height } = item.getBoundingClientRect();
      return { x, y, width, height };
    }));
    async function expectUnmovedToggle() {
      const geometry = await badgeGeometry();
      await toggle().click();
      const after = await badgeGeometry();
      assert.equal(after.length, geometry.length);
      geometry.forEach((box, index) => {
        for (const dimension of ['x', 'y', 'width', 'height']) assert(Math.abs(box[dimension] - after[index][dimension]) < 0.1,
          `Price badge ${dimension} stays fixed during masking`);
      });
    }
    async function expectMasked(count) {
      assert.equal(await prices().count(), count, 'Masking preserves the existing price badges');
      const expected = await page.evaluate(() => [...document.querySelectorAll('.home-archive-section .turtle-price')].map(item => {
        const turtle = sortedTurtles().find(turtle => turtle.id === item.closest('[data-view-turtle]').dataset.viewTurtle);
        const cost = turtle.batchId ? TurtleBatches.summary(turtle.batchMembers || TurtleBatches.members(turtle, state.turtles)).cost : turtleTotalCost(turtle);
        return '¥' + money(cost).replace(/\d/g, '*');
      }));
      assert.deepEqual(await prices().allTextContents(), expected, 'Every digit is masked in place, preserving the decimal point and character count');
      assert.deepEqual(await prices().evaluateAll(items => items.map(item => item.getAttribute('aria-label'))), Array(count).fill('价格已隐藏'));
      assert(await prices().evaluateAll(items => items.every(item => !/\d/.test(item.outerHTML))), 'No real amount leaks through badge text or attributes');
    }
    const records = () => page.evaluate(() => JSON.stringify({ turtles: state.turtles, ledgerRecords: state.ledgerRecords }));
    async function layout(width, theme) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(theme => setState({ themeColor: theme }, { skipSave: true }), theme);
      const boxes = await page.locator('.archive-list-toolbar').evaluate(bar => {
        const a = bar.querySelector('.archive-page-count').getBoundingClientRect();
        const b = bar.querySelector('button').getBoundingClientRect();
        const r = bar.getBoundingClientRect();
        return { countRight: a.right, buttonLeft: b.left, buttonRight: b.right, barRight: r.right, height: b.height,
          fits: document.documentElement.scrollWidth <= innerWidth };
      });
      assert(boxes.fits && boxes.countRight <= boxes.buttonLeft && boxes.buttonRight <= boxes.barRight + 1, `${platform}/${width}/${theme}: count and right-side toggle fit`);
      assert(boxes.height >= 44, 'Toggle has a touch target of at least 44px');
      checks++;
    }
    await page.goto(localPreview ? pathToFileURL(localPreview).href : 'https://privacy.test/');
    await page.evaluate(() => { dismissTradeIntro?.(); TurtleReleaseNotes?.cancel(); });
    await toggle().waitFor();
    assert.equal(await toggle().innerText(), '隐藏价格');
    assert.equal(await toggle().getAttribute('aria-pressed'), 'false');
    assert.equal(await prices().count(), 30);
    assert.equal(await page.locator('[data-view-turtle="single-0"] .turtle-price').innerText(), '¥1412.50');
    assert.equal(await page.locator('.turtle-batch-row .turtle-price').innerText(), '¥120.00');
    const before = await records();
    await page.evaluate(() => {
      window.privacyWrites = [];
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { privacyWrites.push(key); return original.call(this, key, value); };
    });
    await expectUnmovedToggle();
    assert.equal(await toggle().innerText(), '显示价格');
    assert.equal(await toggle().getAttribute('aria-pressed'), 'true');
    await expectMasked(30);
    assert.doesNotMatch(await page.locator('.home-archive-section').innerText(), /1412\.50|120\.00/);
    assert.match(await page.locator('[data-view-turtle="single-0"]').innerText(), /65g[\s\S]*背甲 6\.89cm/);
    assert.equal(await records(), before, 'Hiding prices leaves all turtle and ledger data intact');
    assert.deepEqual(await page.evaluate(() => privacyWrites), [preference], 'Only the device preference is saved');
    await page.locator('[data-view-turtle="single-0"] [data-toggle-turtle-menu]').click();
    await toggle().click();
    assert.equal(await page.locator('.archive-turtle-menu').count(), 0, 'Toggle closes an open row menu');
    assert.equal(await prices().count(), 30);
    await toggle().click();
    await page.locator('[data-view-turtle="single-0"]').click();
    await page.locator('[data-back]').click();
    assert.equal(await toggle().innerText(), '显示价格');
    await expectMasked(30);
    await toggle().click();
    assert.equal(await prices().count(), 30, 'Restored navigation nodes retain working toggle handlers');
    await toggle().click();
    assert.equal(await records(), before);
    for (const width of [280, 320, 390, 430, 768, 1200]) {
      for (const theme of ['teal', 'dark']) {
        await layout(width, theme);
        await expectUnmovedToggle();
        await expectUnmovedToggle();
        await expectMasked(30);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => setState({ themeColor: 'teal' }, { skipSave: true }));
    await page.locator('.archive-list-toolbar').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `${platform}-${engine}-hidden.png`) });
    await page.locator('[data-archive-page="1"]').click();
    const pageIds = await page.locator('.turtle-row').evaluateAll(rows => rows.map(row => row.dataset.viewTurtle));
    await toggle().click();
    assert.equal(await prices().count(), 3);
    assert.deepEqual(await page.locator('.turtle-row').evaluateAll(rows => rows.map(row => row.dataset.viewTurtle)), pageIds, 'Toggle retains pagination');
    await toggle().click();
    await page.locator('[data-filter-species]').selectOption('GHG');
    await expectMasked(30);
    await layout(280, 'teal');
    await page.locator('[data-filter-pool]').selectOption('two');
    assert.equal(await page.locator('.turtle-row').count(), 0);
    assert.equal(await toggle().innerText(), '显示价格', 'Empty filtered lists retain the toggle');
    await page.locator('[data-filter-species]').selectOption('all');
    assert.equal(await page.locator('.turtle-row').count(), 1);
    await expectMasked(1);
    await page.reload();
    await toggle().waitFor();
    assert.equal(await toggle().innerText(), '显示价格', 'Hidden preference survives reload');
    await expectMasked(30);
    assert.equal(await records(), before);
    await toggle().click();
    assert.equal(await prices().count(), 30);
    await page.reload();
    await toggle().waitFor();
    assert.equal(await toggle().innerText(), '隐藏价格', 'Restored visibility survives reload');
    assert.equal(await page.locator('[data-view-turtle="single-0"] .turtle-price').innerText(), '¥1412.50');
    await page.evaluate(() => { Storage.prototype.setItem = function() { throw new Error('Storage unavailable'); }; });
    await toggle().click();
    await expectMasked(30);
    assert.equal(await records(), before);
    assert.deepEqual(errors, []);
    recordResult(root, `archive-price-privacy-${platform}.json`, { checks, errors, recordsPreserved: true });
    console.log(`PASS ${platform}/${engine}: ${checks} layouts, single/batch masked badges without amount leakage, no financial data writes, pagination, filters, reload and storage failure.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
