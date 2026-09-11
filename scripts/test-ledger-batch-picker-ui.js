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
    async function assertFormPosition(selector) {
      await page.waitForFunction(selector => {
        const form = document.querySelector(selector);
        const header = document.querySelector('.topbar');
        return form && header && Math.abs(form.getBoundingClientRect().top - header.getBoundingClientRect().bottom - 10) < 2;
      }, selector, { timeout: 5000 }).catch(async error => {
        console.error(await page.evaluate(selector => ({ selector, width: innerWidth, scrollY, height: innerHeight, documentHeight: document.documentElement.scrollHeight, formTop: document.querySelector(selector)?.getBoundingClientRect().top, headerBottom: document.querySelector('.topbar')?.getBoundingClientRect().bottom }), selector));
        throw error;
      });
    }
    for (const width of [1280, 430, 390]) {
      await page.setViewportSize({ width, height: 844 });
      // A taller header also covers the safe-area inset used by iPhone builds.
      const insetStyle = width === 430 ? await page.addStyleTag({ content: '.topbar { height: 110px !important; min-height: 110px !important; }' }) : null;
      for (const action of ['sold', 'loss', 'update']) {
        await page.evaluate(() => setState({ page: 'home', updatingTurtleId: '', openTurtleMenuId: '' }, { skipSave: true }));
        await page.locator('[data-toggle-turtle-menu="batch-0"]').click();
        await page.locator(action === 'update' ? '[data-update-turtle="batch-0"]' : `[data-ledger-for-turtle="${action}:batch-0"]`).click();
        const selector = action === 'update' ? '#turtleDetailForm' : '#turtleBatchMovementForm';
        await assertFormPosition(selector);
        if (action !== 'update') assert.equal(await page.locator(`${selector} [name="type"]`).inputValue(), action);
        else assert.match(await page.locator('.topbar').innerText(), /更新批次/);
        if (width === 390) await page.screenshot({ path: path.join(root, 'output', `batch-navigation-${action}.png`) });
      }
      if (insetStyle) await insetStyle.evaluate(element => element.remove());
    }
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
      await assertFormPosition('#turtleBatchMovementForm');
      assert.equal(await page.evaluate(() => TurtleBatches.summary(state.turtles.filter(t => t.batchId === 'batch')).count), active, 'Selecting does not move inventory');
      await page.locator('#turtleBatchMovementForm [name="count"]').fill(String(count));
      if (type === 'sold') assert.equal(await page.locator('#turtleBatchMovementForm [name="amount"]').inputValue(), '15');
      await page.getByRole('button', { name: '记录数量变动', exact: true }).click();
      assert.equal(await page.evaluate(() => TurtleBatches.summary(state.turtles.filter(t => t.batchId === 'batch')).count), active - count);
      await page.evaluate(type => setState({ page: 'ledger', ledgerTab: type, ledgerDraftType: '' }, { skipSave: true }), type);
      assert.equal(await page.locator('.ledger-row').count(), 1, 'One row per batch movement');
      assert.match(await page.locator('.ledger-row').innerText(), new RegExp(`本次${type === 'loss' ? '损耗' : '售出'} ${count} 只`));
      assert.equal(await page.locator('.ledger-row .ledger-amount').innerText(), type === 'loss' ? '-10.00' : '+15.00');
      await page.locator('.ledger-row').click();
      assert.match(await page.locator('.ledger-detail-card').innerText(), new RegExp(`${count} 只`));
      assert.equal(await page.locator('.ledger-detail-card h2').innerText(), '九月果核批次');
    }
    // A second loss from the same batch/date remains a separate operation.
    await page.evaluate(() => openLedgerForm('loss', state.turtles.find(t => t.batchId === 'batch' && TurtleBatches.isActive(t)).id));
    await page.locator('#turtleBatchMovementForm [name="count"]').fill('2');
    await page.locator('#turtleBatchMovementForm').evaluate(form => form.requestSubmit());
    await page.reload({ waitUntil: 'load' });
    if (await skip.isVisible()) await skip.click();
    await page.evaluate(() => setState({ page: 'ledger', ledgerTab: 'loss', ledgerDraftType: '' }, { skipSave: true }));
    assert.equal(await page.locator('.ledger-row').count(), 2, 'Reload preserves separate movements');
    await page.locator('.ledger-row').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, 'output', 'ledger-grouped-loss.png') });
    const firstLoss = page.locator('.ledger-row').filter({ hasText: '本次损耗 5 只' });
    await firstLoss.locator('[data-toggle-ledger-menu]').click();
    page.once('dialog', dialog => dialog.dismiss());
    await firstLoss.locator('[data-delete-ledger]').click();
    assert.equal(await page.evaluate(() => state.ledgerRecords.filter(r => r.type === 'loss').length), 7, 'Cancel keeps every member');
    page.once('dialog', dialog => { assert.match(dialog.message(), /5 只/); dialog.accept(); });
    await firstLoss.locator('[data-delete-ledger]').click();
    await page.waitForFunction(() => state.ledgerRecords.filter(r => r.type === 'loss').length === 2);
    assert.equal(await page.locator('.ledger-row').count(), 1);
    assert.equal(await page.evaluate(() => TurtleBatches.summary(state.turtles.filter(t => t.batchId === 'batch')).count), 495, 'Deleting a grouped loss restores all five archives');
    assert.equal(await page.evaluate(() => state.ledgerRecords.find(r => r.type === 'purchase').amount), 996, 'Only the remaining two losses reduce purchase cost');
    await page.evaluate(() => setState({ ledgerTab: 'sold' }, { skipSave: true }));
    await page.locator('[data-toggle-ledger-menu]').click();
    page.once('dialog', dialog => { assert.match(dialog.message(), /3 只/); dialog.accept(); });
    await page.locator('[data-delete-ledger]').click();
    await page.waitForFunction(() => !state.ledgerRecords.some(r => r.type === 'sold'));
    assert.equal(await page.evaluate(() => state.ledgerRecords.filter(r => r.type === 'loss').length), 2, 'Deleting a sale does not touch losses');
    await page.evaluate(() => openLedgerForm('loss'));
    await assertFormPosition('#ledgerForm');
    await page.locator('#ledgerForm .archive-directory-trigger').click();
    await page.locator('.archive-directory-list button').filter({ hasText: '果核蛋龟' }).click();
    await page.locator('.archive-directory-list button').filter({ hasText: '小果' }).click();
    assert.equal(await page.locator('#ledgerForm [name="turtleId"]').inputValue(), 'single');
    assert.equal(await page.locator('#turtleBatchMovementForm').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Ledger picker passed: form navigation, collapsed batches and movements, grouped details/totals, separate operations after reload, whole-loss restore, whole-sale delete, drafts and singles.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
