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
      const dateAgo = days => { const d = new Date(); d.setDate(d.getDate() - days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
      window.hatchDates = [dateAgo(3), dateAgo(2)];
      const data = { turtles: [{ id: 'mother', code: 'GHG-10', speciesCode: 'GHG', speciesName: '果核蛋龟', gender: '母', status: '正常饲养', acquiredDate: dateAgo(30) }], keptSpecies: ['GHG'], ledgerRecords: [], memos: [], turtlePools: [{ id: 'p1', name: '苗池', type: 'hatchling', count: 0 }],
        breedingRecords: [{ id: 'nest', date: dateAgo(5), motherId: 'mother', motherName: 'GHG-10', poolId: 'p1', eggCount: 5, fertileCount: 5, hatchCount: 0, editHistory: [] }] };
      localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ page: 'home', loggedInPhone: 'preview', registeredUsers: [{ phone: 'preview', accountName: '预览', data }], policyConsentRequired: false }));
    });
    await page.goto('https://archive.test/', { waitUntil: 'load' });
    const skip = page.getByRole('button', { name: '跳过', exact: true });
    if (await skip.isVisible()) await skip.click();
    const dates = await page.evaluate(() => hatchDates);
    for (const [index, count] of [3, 2].entries()) {
      await page.evaluate(() => setState({ page: 'breedingDetail', selectedBreedingId: 'nest' }, { skipSave: true }));
      assert.equal(await page.locator('[name="hatchCount"]').count(), 0);
      assert.equal(await page.locator('[name="successfulHatchCount"]').inputValue(), '');
      await page.locator('[name="successfulHatchCount"]').fill(String(count));
      await page.locator('[name="hatchDate"]').fill(dates[index]);
      await page.getByRole('button', { name: '确认孵化并关联看板', exact: true }).click();
      assert.equal(await page.locator('.turtle-batch-row').count(), index + 1);
    }
    assert.deepEqual(await page.evaluate(() => state.breedingRecords[0].hatchEvents.map(e => e.count)), [3, 2]);
    assert.equal(await page.evaluate(() => state.breedingRecords[0].hatchCount), 5);
    assert.equal(await page.evaluate(() => TurtleBatches.poolCount(state.turtlePools[0], state.turtles)), 5);
    for (const [index, count] of [3, 2].entries()) {
      const row = page.locator('.turtle-batch-row').filter({ hasText: dates[index] });
      assert.match(await row.innerText(), new RegExp(`在养 ${count} 只`));
      assert.equal(await row.locator('.turtle-keeping-days').innerText(), `已饲养 ${3-index} 天`);
    }
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.locator('.turtle-batch-row').first().screenshot({ path: path.join(root, 'output', 'hatch-event-row.png') });
    await page.evaluate(() => setState({ page: 'breedingDetail', selectedBreedingId: 'nest' }, { skipSave: true }));
    await page.locator('[name="successfulHatchCount"]').fill('1');
    await page.getByRole('button', { name: '确认孵化并关联看板', exact: true }).click();
    assert.equal(await page.evaluate(() => state.breedingRecords[0].hatchCount), 5);
    assert.match(await page.locator('.toast').innerText(), /合计不能超过/);
    await page.locator('#breedingHatchPanel').screenshot({ path: path.join(root, 'output', 'hatch-event-form.png') });
    await page.locator('[name="successfulHatchCount"]').fill('');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    assert.equal(await page.evaluate(() => state.breedingRecords[0].hatchCount), 5);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('.turtle-batch-row').count(), 2);
    assert.equal(await page.evaluate(() => state.breedingRecords[0].hatchEvents.length), 2);
    assert.deepEqual(errors, []);
    console.log('Hatch event UI passed: backdated 3+2 creates two rows, correct ages, egg cap, save and reload.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
