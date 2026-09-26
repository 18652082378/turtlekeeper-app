const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'breeding.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.addInitScript(() => {
      const turtles = [{ id: 'mother', code: '小刺头', speciesCode: 'GHG', speciesName: '果核蛋龟', gender: '母', status: '正常饲养', photo: '/assets/species/GHG.jpg' },
        ...Array.from({ length: 5 }, (_, i) => ({ id: 'h' + i, code: '幼龟' + i, speciesCode: 'GHG', speciesName: '果核蛋龟', status: '正常饲养', sourceBreedingId: 'nest', hatchEventId: 'event1', batchId: 'hatch:nest:event1', acquiredDate: '2026-09-20' }))];
      const data = { turtles, keptSpecies: ['GHG'], turtlePools: [{ id: 'p1', name: '阳台种龟池', type: 'adult' }], breedingRecords: [{ id: 'nest', motherId: 'mother', motherName: '小刺头 · 果核蛋龟', speciesCode: 'GHG', date: '2026-09-08', eggCount: 6, fertileCount: 5, hatchCount: 5, hatchArchiveIds: turtles.slice(1).map(t => t.id), hatchEvents: [{ id: 'event1', count: 5, date: '2026-09-20' }], incubationClosed: true, photo: '/assets/species/GHG.jpg', note: '一号孵化盒，定期观察。' }] };
      localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ loggedInPhone: 'preview', registeredUsers: [{ phone: 'preview', data }], policyConsentRequired: false }));
    });
    await page.goto('https://breeding.test/?skipIntro=1');
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(theme => setState({ page: 'breedingDetail', selectedBreedingId: 'nest', themeColor: theme }, { pageMotion: 'none', forceRender: true }), theme);
      await page.waitForFunction(() => !$app.classList.contains('page-enter-motion'));
      assert.equal(await page.locator('.breeding-manual-mother').isVisible(), false);
      assert.equal(await page.locator('[name="successfulHatchCount"]').isVisible(), false);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width} detail width`);
      const labelsFit = await page.locator('#breedingDetailForm .breeding-fields > label:visible').evaluateAll(labels => labels.every(label => {
        const input = label.querySelector('input, button.archive-directory-trigger, select:not([hidden])');
        return !input || input.getBoundingClientRect().right <= label.getBoundingClientRect().right + 1;
      }));
      assert.equal(labelsFit, true);
      if (width === 390) await page.screenshot({ path: path.join(root, `output/breeding-detail-${theme}.png`), fullPage: true, animations: 'disabled' });
      await page.evaluate(() => setState({ page: 'breedingAdd' }, { pageMotion: 'none' }));
      assert.equal(await page.locator('h3').filter({ hasText: '记录一窝蛋' }).count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 390) await page.screenshot({ path: path.join(root, `output/breeding-add-${theme}.png`), fullPage: true, animations: 'disabled' });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => setState({ page: 'breedingDetail', selectedBreedingId: 'nest' }, { pageMotion: 'none' }));
    await page.locator('#breedingDetailForm .archive-directory-trigger').click();
    await page.locator('.directory-special-actions button').filter({ hasText: '手动备注' }).click();
    assert.equal(await page.locator('.breeding-manual-mother').isVisible(), true);
    await page.locator('[name="manualMother"]').fill('观察窝');
    await page.locator('[name="note"]').fill('已核对基本资料');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    assert.equal(await page.evaluate(() => state.breedingRecords[0].motherName), '观察窝');
    assert.equal(await page.evaluate(() => state.breedingRecords[0].note), '已核对基本资料');
    await page.locator('[data-complete-breeding-hatch]').click();
    assert.equal(await page.locator('[name="successfulHatchCount"]').isVisible(), true);
    await page.screenshot({ path: path.join(root, 'output/breeding-detail-active-dark.png'), fullPage: true, animations: 'disabled' });
    await page.locator('[name="successfulHatchCount"]').fill('1');
    await page.locator('[name="hatchSpeciesCode"]').selectOption('GHG');
    await page.locator('[data-confirm-breeding-hatch]').click();
    assert.equal(await page.evaluate(() => state.breedingRecords[0].hatchCount), 6);
    assert.equal(await page.evaluate(() => state.turtles.filter(t => t.sourceBreedingId === 'nest').length), 6);
    await page.evaluate(() => setState({ page: 'breedingDetail', selectedBreedingId: 'nest' }, { pageMotion: 'none' }));
    await page.locator('[data-complete-breeding-hatch]').click();
    assert.equal(await page.evaluate(() => state.breedingRecords[0].incubationClosed), true);
    await page.locator('.breeding-history > summary').click();
    assert.ok(await page.locator('.growth-history-entry').count() > 0);
    assert.deepEqual(errors, []);
    console.log('PASS: breeding workspace light/dark at 320/390/430/1280px, manual/archive fields, edit/save, reopen, hatch batch, completion and history.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
