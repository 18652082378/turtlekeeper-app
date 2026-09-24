const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync('app.js', 'utf8');
const picker = source.slice(source.indexOf('function breedingTargetOptions('), source.indexOf('function breedingRow('));
const draft = source.slice(source.indexOf('function readBreedingDraft()'), source.indexOf('\nfunction ', source.indexOf('function readBreedingDraft()') + 1));
const motherBinding = source.slice(source.indexOf('  document.querySelector("[data-breeding-mother]")'), source.indexOf('  document.querySelectorAll("#breedingForm [name=\'date\']'));
const directory = source.slice(source.indexOf('function bindArchiveDirectoryPickers()'), source.indexOf('function updateSyncPageActionUI()'));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent('<div class="phone-shell" id="app"></div>');
    for (const path of ['styles.css', 'chat-tools.css', 'dark-surface-audit.css']) await page.addStyleTag({ path });
    await page.addScriptTag({ path: 'assets/turtle-batches.js' });
    await page.addScriptTag({ content: `
      const state = { turtles: [
        {id:'g1',code:'果核一号',speciesName:'果核蛋龟',gender:'母',poolId:'p1'},
        ...Array.from({length:100}, (_,i) => ({id:'g'+(i+2),code:'果核-'+i,speciesName:'果核蛋龟',gender:'未知',batchId:'b1',batchName:'九月果核批次'})),
        {id:'r1',code:'剃刀一号',speciesName:'剃刀麝香龟',gender:'母'},
        {id:'male',code:'公龟',speciesName:'果核蛋龟',gender:'公',batchId:'b1'},
        {id:'lost',code:'已死亡',speciesName:'果核蛋龟',gender:'母',batchId:'b1',status:'已死亡'}
      ], turtlePools:[{id:'p1',name:'种龟池'}] };
      const escapeHtml = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
      const formatDate = () => '2026-09-10';
      const suggestedManualBreedingMother = () => '手动种母';
      const topbar = () => ''; const bottomNav = () => '';
      const turtlePoolTypeLabel = () => ''; const requireLogin = () => true;
      const defaultPhoto = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#2fa77f"/></svg>');
      const speciesByCode = () => null; const speciesPhoto = () => defaultPhoto;
      const turtleBatchLabel = turtle => turtle.batchName;
      const turtleLabel = turtle => turtle.code;
      ${picker}
      ${draft}
      ${directory}
      function render() {
        document.querySelector('#app').innerHTML = pageBreedingAdd();
        bindArchiveDirectoryPickers();
        ${motherBinding}
      }
      function setState(patch) { Object.assign(state, patch); render(); }
      render();
    ` });
    const mother = page.locator('[name="mother"]');
    const open = () => page.locator('.archive-directory-trigger').click();
    assert.equal(await page.locator('[data-breeding-species]').count(), 0);
    assert.equal(await mother.isVisible(), false);
    assert.equal(await mother.locator('option[value="male"], option[value="lost"]').count(), 0);
    await page.locator('[name="eggCount"]').fill('8');
    await open();
    await page.locator('.directory-species-card').filter({ hasText: '果核蛋龟' }).click();
    assert.equal(await page.locator('.directory-archive-card').count(), 2, '100 eligible batch members stay folded');
    await page.locator('.directory-archive-card').filter({ hasText: '果核一号' }).click();
    assert.equal(await page.locator('[name="poolId"]').inputValue(), 'p1');
    assert.equal(await page.locator('[name="eggCount"]').inputValue(), '8');
    await open();
    await page.locator('[data-directory-search]').fill('果核-87');
    assert.equal(await page.locator('.directory-archive-card').count(), 1);
    await page.locator('.directory-archive-card').click();
    assert.equal(await page.locator('.archive-directory-overlay').count(), 0, 'batch is chosen directly');
    assert.equal(await mother.inputValue(), 'batch:b1');
    assert.equal(await page.locator('[name="eggCount"]').inputValue(), '8');
    await open();
    await page.locator('.directory-species-card').filter({ hasText: '剃刀麝香龟' }).click();
    await page.locator('.directory-archive-card').click();
    assert.equal(await page.evaluate(() => new FormData(document.querySelector('#breedingForm')).get('mother')), 'r1');
    await open();
    await page.getByRole('button', { name: '手动备注（不关联档案）', exact: true }).click();
    assert.equal(await mother.inputValue(), 'manual');
    assert.equal(await page.locator('[name="manualMother"]').inputValue(), '手动种母');
    await open();
    await page.locator('.directory-species-card').filter({ hasText: '果核蛋龟' }).click();
    await page.locator('.directory-archive-card').filter({ hasText: '果核一号' }).click();
    assert.equal(await mother.inputValue(), 'g1');
    for (const width of [320,390,440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const theme of ['light','dark']) {
        await page.evaluate(theme => document.documentElement.dataset.themeColor = theme, theme);
        for (const node of [page.locator('.archive-directory-trigger')]) {
          const box = await node.boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width);
        }
      }
    }
    await open();
    await page.locator('.directory-species-card').filter({ hasText: '果核蛋龟' }).click();
    await page.locator('.archive-directory-dialog').screenshot({ path: 'output/breeding-picture-picker.png' });
    console.log('Breeding picture picker passed: direct batch selection, single mothers, search, drafts, pool association, manual entry and mobile layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
