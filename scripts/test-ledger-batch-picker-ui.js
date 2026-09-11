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
      if (localStorage.getItem('turtlekeeper-state-v1')) return;
      const turtles = Array.from({ length: 500 }, (_, i) => ({ id: `batch-${i}`, batchId: 'batch', batchName: '九月果核批次', code: `GHG-${i}`, speciesCode: 'GHG', speciesName: '果核蛋龟', poolId: 'pool', stage: 'hatchling', gender: '未知', status: '正常饲养', price: 2, acquiredDate: '2026-09-01' }));
      const purchase = { id: 'purchase', type: 'purchase', batchPurchase: true, turtleId: turtles[0].id, turtleIds: turtles.map(t => t.id), amount: 1000, turtleSnapshot: { ...turtles[0] } };
      turtles.push({ id: 'single', code: '小果', speciesCode: 'GHG', speciesName: '果核蛋龟', gender: '母', status: '正常饲养', price: 100 });
      turtles.push({ id: 'lost', code: '旧损耗', batchId: 'all-lost', speciesCode: 'GHG', speciesName: '果核蛋龟', status: '已死亡', lossRecordId: 'old-loss' });
      const data = { turtles, keptSpecies: ['GHG'], turtlePools: [{ id: 'pool', name: '苗池', type: 'hatchling', count: 0 }], ledgerRecords: [purchase], memos: [] };
      localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ loggedInPhone: 'preview', registeredUsers: [{ phone: 'preview', accountName: '预览', data }], policyConsentRequired: false }));
    });
    await page.goto('https://archive.test/', { waitUntil: 'load' });
    const skip = page.getByRole('button', { name: '跳过', exact: true });
    if (await skip.isVisible()) await skip.click();
    for (const [type, count, active] of [['loss', 5, 500], ['sold', 3, 495]]) {
      await page.evaluate(() => setState({ page: 'ledger' }, { skipSave: true }));
      await page.locator(`[data-new-ledger="${type}"]`).click();
      assert.equal(await page.locator('#ledgerForm [name="turtleId"] option[data-batch-count]').count(), 1);
      assert.equal(await page.locator('#ledgerForm [name="turtleId"] option[value="lost"]').count(), 0);
      await page.locator('#ledgerForm [name="note"]').fill('批次关联备注');
      if (type === 'sold') await page.locator('#ledgerForm [name="amount"]').fill('15');
      await page.locator('#ledgerForm .archive-directory-trigger').click();
      await page.locator('.archive-directory-list button').filter({ hasText: '果核蛋龟' }).click();
      assert.equal(await page.locator('.archive-directory-list button').count(), 2, 'One batch and one single turtle, no member expansion');
      await page.locator('.archive-directory-list').screenshot({ path: path.join(root, 'output', `ledger-batch-picker-${type}.png`) });
      await page.locator('.archive-directory-list button').filter({ hasText: '九月果核批次' }).click();
      assert.equal(await page.locator('#turtleBatchMovementForm [name="type"]').inputValue(), type);
      await page.waitForFunction(() => document.querySelector('#turtleBatchMovementForm [name="note"]').value === '批次关联备注');
      assert.equal(await page.evaluate(() => TurtleBatches.summary(state.turtles.filter(t => t.batchId === 'batch')).count), active, 'Selecting does not move inventory');
      await page.locator('#turtleBatchMovementForm [name="count"]').fill(String(count));
      if (type === 'sold') assert.equal(await page.locator('#turtleBatchMovementForm [name="amount"]').inputValue(), '15');
      await page.getByRole('button', { name: '记录数量变动', exact: true }).click();
      assert.equal(await page.evaluate(() => TurtleBatches.summary(state.turtles.filter(t => t.batchId === 'batch')).count), active - count);
    }
    await page.evaluate(() => openLedgerForm('loss'));
    await page.locator('#ledgerForm .archive-directory-trigger').click();
    await page.locator('.archive-directory-list button').filter({ hasText: '果核蛋龟' }).click();
    await page.locator('.archive-directory-list button').filter({ hasText: '小果' }).click();
    assert.equal(await page.locator('#ledgerForm [name="turtleId"]').inputValue(), 'single');
    assert.equal(await page.locator('#turtleBatchMovementForm').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Ledger picker passed: 500-member batch stays one option, loss/sale quantity flow, draft retained, unavailable archives excluded, singles unchanged.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
