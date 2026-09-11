const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output', 'batch-tests');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // All content and data stay inside this disposable browser context.
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'batch.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL = "";' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    await page.addInitScript(() => {
      if (localStorage.getItem('turtlekeeper-state-v1')) return;
      const turtles = Array.from({ length: 500 }, (_, i) => ({ id: `batch-${i}`, batchId: 'batch-september', batchName: '九月果核批次',
        code: `GHG-${i + 1}`, speciesCode: 'GHG', speciesName: '果核蛋龟', poolId: 'p1', stage: 'hatchling', gender: '未知',
        status: '正常饲养', health: '健康', price: 2, batchTotalPrice: 1000, acquiredDate: '2026-09-10', createdAt: '2026-09-10T00:00:00Z', measureHistory: [] }));
      const data = { turtles, keptSpecies: ['GHG'], turtlePools: [{ id: 'p1', name: '果核苗池', type: 'hatchling', count: 0 }, { id: 'p2', name: '果核压成池', type: 'juvenile', count: 0 }],
        ledgerRecords: [{ id: 'purchase', type: 'purchase', batchId: 'batch-september', batchPurchase: true, turtleId: turtles[0].id, turtleIds: turtles.map(t => t.id), amount: 1000, turtleSnapshot: turtles[0] }], memos: [], themeColor: 'dark' };
      localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ page: 'home', loggedInPhone: 'test-account', registeredUsers: [{ phone: 'test-account', accountName: '批次测试', data }], policyConsentRequired: false }));
    });
    await page.goto('https://batch.test/', { waitUntil: 'load' });
    await page.locator('.turtle-batch-row').waitFor();
    const introSkip = page.getByRole('button', { name: '跳过', exact: true });
    if (await introSkip.isVisible()) await introSkip.click();
    assert.equal(await page.locator('.turtle-row').count(), 1);
    assert.match(await page.locator('.turtle-batch-row').innerText(), /在养 500 只/);
    await page.locator('.turtle-batch-row').screenshot({ path: path.join(output, 'batch-dashboard-390.png') });
    await page.locator('.turtle-batch-row').click();
    for (const theme of ['teal', 'dark']) {
      await page.evaluate(async theme => {
        setState({ themeColor: theme }, { skipSave: true });
        await Promise.all(document.querySelector('.content').getAnimations().map(animation => animation.finished.catch(() => {})));
        window.scrollTo({ top: 0, behavior: 'instant' });
      }, theme);
      await page.screenshot({ path: path.join(output, `batch-detail-${theme}-390.png`), fullPage: true });
    }
    await page.getByRole('button', { name: '更新批次', exact: true }).click();
    assert.equal(await page.locator('#turtleDetailForm [name="weight"]').count(), 0);
    await page.locator('#turtleDetailForm [name="stage"]').selectOption('juvenile');
    await page.locator('#turtleDetailForm [name="poolId"]').selectOption('p2');
    await page.locator('#turtleDetailForm [name="maleCount"]').fill('200');
    await page.locator('#turtleDetailForm [name="femaleCount"]').fill('250');
    await page.locator('#turtleDetailForm [name="unknownCount"]').fill('50');
    await page.locator('#turtleDetailForm [name="note"]').fill('整批转池，观察开食情况');
    await page.locator('#turtleDetailForm').screenshot({ path: path.join(output, 'batch-update-390.png') });
    await page.getByRole('button', { name: '保存批次更新', exact: true }).click();
    await page.locator('#turtleBatchMovementForm').waitFor();
    assert.match(await page.locator('.turtle-batch-detail').innerText(), /200 公 · 250 母 · 50 性别未知/);
    assert.deepEqual(await page.evaluate(() => state.turtlePools.map(pool => TurtleBatches.poolCount(pool, state.turtles))), [0, 500]);
    await page.locator('#turtleBatchMovementForm [name="type"]').selectOption('loss');
    assert.equal(await page.locator('[data-batch-amount-label]').innerText(), '损耗金额（元）');
    assert.equal(await page.locator('#turtleBatchMovementForm [name="amount"]').getAttribute('placeholder'), '按购入成本自动计算');
    await page.locator('#turtleBatchMovementForm [name="type"]').selectOption('sold');
    assert.equal(await page.locator('[data-batch-amount-label]').innerText(), '售出总金额（元）');
    await page.locator('#turtleBatchMovementForm [name="type"]').selectOption('loss');
    await page.locator('#turtleBatchMovementForm [name="gender"]').selectOption('未知');
    await page.locator('#turtleBatchMovementForm [name="count"]').fill('12');
    await page.getByRole('button', { name: '记录数量变动', exact: true }).click();
    await page.waitForFunction(() => TurtleBatches.summary(state.turtles).count === 488);
    assert.deepEqual(await page.evaluate(() => state.turtlePools.map(pool => TurtleBatches.poolCount(pool, state.turtles))), [0, 488]);
    await page.evaluate(() => setState({ page: 'pools' }));
    assert.match(await page.locator('.turtle-pool-list').innerText(), /488/);
    await page.screenshot({ path: path.join(output, 'batch-pools-390.png'), fullPage: true });
    for (const width of [320, 390, 1200]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => setState({ page: 'home' }));
      assert.equal(await page.locator('.turtle-row').count(), 1);
      assert.match(await page.locator('.turtle-row').innerText(), /在养 488 只/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Dashboard fits ${width}px`);
      await page.locator('.turtle-batch-row').click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Detail fits ${width}px`);
    }
    await page.evaluate(() => setState({ page: 'home' }));
    await page.locator('[data-toggle-turtle-menu]').click();
    await page.getByRole('menuitem', { name: '按数量售出' }).click();
    assert.equal(await page.locator('#turtleBatchMovementForm [name="type"]').inputValue(), 'sold');
    await page.locator('#turtleBatchMovementForm [name="gender"]').selectOption('公');
    await page.locator('#turtleBatchMovementForm [name="count"]').fill('100');
    await page.locator('#turtleBatchMovementForm [name="amount"]').fill('300');
    await page.getByRole('button', { name: '记录数量变动', exact: true }).click();
    await page.waitForFunction(() => TurtleBatches.summary(state.turtles).count === 388);
    assert.equal(await page.evaluate(() => TurtleBatches.poolCount(state.turtlePools[1], state.turtles)), 388);
    // Reproduce the reported storage failure with one shared embedded image.
    await page.evaluate(() => {
      state.turtles = []; state.ledgerRecords = []; state.memos = [];
      state.formPhoto = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><desc>' + 'X'.repeat(24000) + '</desc></svg>');
      const form = new FormData();
      for (const [key, value] of Object.entries({ batchStage: 'hatchling', batchCount: '499', batchTotalPrice: '179640', poolId: 'p1' })) form.set(key, value);
      submitBatchTurtles(form, { code: 'GHG', name: '果核蛋龟' });
    });
    assert.equal(await page.evaluate(() => {
      const packed = JSON.parse(localStorage.getItem(STORAGE));
      return packed.strings.filter(text => text.startsWith('data:image/')).length;
    }), 1, 'The entire batch stores one image, referenced by all members');
    await page.locator('#turtleBatchMovementForm [name="type"]').selectOption('loss');
    await page.locator('#turtleBatchMovementForm [name="count"]').fill('399');
    await page.getByRole('button', { name: '记录数量变动', exact: true }).click();
    assert.equal(await page.evaluate(() => TurtleBatches.summary(state.turtles).count), 100);
    assert.equal(await page.locator('.local-backup-warning').count(), 0);
    const savedSize = await page.evaluate(() => localStorage.getItem(STORAGE).length);
    assert.ok(savedSize < 4 * 1024 * 1024, `Full offline account with recovery user copy fits storage: ${savedSize} characters`);
    await page.reload({ waitUntil: 'load' });
    const reloadSkip = page.getByRole('button', { name: '跳过', exact: true });
    if (await reloadSkip.isVisible()) await reloadSkip.click();
    assert.equal(await page.evaluate(() => TurtleBatches.summary(state.turtles).count), 100);
    assert.equal(await page.evaluate(() => TurtleBatches.summary(state.turtles).lost), 399);
    await page.locator('.turtle-batch-row').click();
    await page.evaluate(() => {
      window.rejectLocalBackup = true;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (window.rejectLocalBackup && key === STORAGE) throw new DOMException('Storage full', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await page.locator('#turtleBatchMovementForm [name="type"]').selectOption('loss');
    await page.locator('#turtleBatchMovementForm [name="count"]').fill('1');
    await page.getByRole('button', { name: '记录数量变动', exact: true }).click();
    await page.locator('.local-backup-warning').waitFor();
    assert.equal(await page.evaluate(() => TurtleBatches.summary(state.turtles).count), 99);
    assert.equal(await page.evaluate(() => TurtleBatches.summary(TurtleLocalData.parse(localStorage.getItem(STORAGE)).turtles).count), 100, 'Keep the previous good backup when the new save fails');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出完整备份', exact: true }).click();
    const backup = require('../assets/local-data-codec').parse(fs.readFileSync(await (await downloadPromise).path(), 'utf8'));
    assert.equal(backup.data.turtles.filter(t => t.status === '正常饲养').length, 99, 'Emergency JSON includes unsaved changes and photos');
    await page.evaluate(() => { window.rejectLocalBackup = false; });
    await page.getByRole('button', { name: '重试保存', exact: true }).click();
    assert.equal(await page.locator('.local-backup-warning').count(), 0);
    assert.equal(await page.evaluate(() => TurtleBatches.summary(TurtleLocalData.parse(localStorage.getItem(STORAGE)).turtles).count), 99, 'Retry saves without applying loss a second time');
    assert.deepEqual(errors, [], 'No runtime errors during navigation, edit and movement');
    console.log(`Batch UI passed at 320, 390 and 1200px. Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
