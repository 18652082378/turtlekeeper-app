const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync('app.js', 'utf8');
const picker = source.slice(source.indexOf('function breedingMotherGroups('), source.indexOf('function breedingRow('));
const draft = source.slice(source.indexOf('function readBreedingDraft()'), source.indexOf('\nfunction ', source.indexOf('function readBreedingDraft()') + 1));
const motherBinding = source.slice(source.indexOf('  document.querySelector("[data-breeding-mother]")'), source.indexOf('  document.querySelectorAll("#breedingForm [name=\'date\']'));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent('<div class="phone-shell" id="app"></div>');
    for (const path of ['styles.css', 'chat-tools.css', 'dark-surface-audit.css']) await page.addStyleTag({ path });
    await page.addScriptTag({ content: `
      const state = { turtles: [
        {id:'g1',code:'果核一号',speciesName:'果核蛋龟',gender:'母',poolId:'p1'},
        {id:'g2',code:'果核二号',speciesName:'果核蛋龟',gender:'未知'},
        {id:'r1',code:'剃刀一号',speciesName:'剃刀麝香龟',gender:'母'},
        {id:'male',code:'公龟',speciesName:'果核蛋龟',gender:'公'}
      ], turtlePools:[{id:'p1',name:'种龟池'}] };
      const escapeHtml = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
      const formatDate = () => '2026-09-10';
      const suggestedManualBreedingMother = () => '手动种母';
      const topbar = () => ''; const bottomNav = () => '';
      const turtlePoolTypeLabel = () => ''; const requireLogin = () => true;
      ${picker}
      ${draft}
      function render() {
        document.querySelector('#app').innerHTML = pageBreedingAdd();
        bindBreedingSpeciesPicker();
        ${motherBinding}
      }
      function setState(patch) { Object.assign(state, patch); render(); }
      render();
    ` });
    const species = page.locator('[data-breeding-species]');
    const mother = page.locator('[name="mother"]');
    assert.equal(await species.locator('option').count(), 4);
    assert.equal(await mother.isDisabled(), true);
    await page.locator('[name="eggCount"]').fill('8');
    await species.selectOption('果核蛋龟');
    assert.deepEqual(await mother.locator('option').evaluateAll(nodes => nodes.map(n => n.value)), ['', 'g1', 'g2']);
    await mother.selectOption('g1');
    assert.equal(await page.locator('[name="poolId"]').inputValue(), 'p1');
    assert.equal(await page.locator('[name="eggCount"]').inputValue(), '8');
    await species.selectOption('剃刀麝香龟');
    assert.equal(await mother.inputValue(), '');
    assert.deepEqual(await mother.locator('option').evaluateAll(nodes => nodes.map(n => n.value)), ['', 'r1']);
    await mother.selectOption('r1');
    assert.equal(await page.evaluate(() => new FormData(document.querySelector('#breedingForm')).get('mother')), 'r1');
    await species.selectOption('__manual__');
    assert.equal(await mother.inputValue(), 'manual');
    assert.equal(await page.locator('[name="manualMother"]').inputValue(), '手动种母');
    await species.selectOption('果核蛋龟');
    assert.equal(await mother.inputValue(), '');
    for (const width of [320,390,440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const theme of ['light','dark']) {
        await page.evaluate(theme => document.documentElement.dataset.themeColor = theme, theme);
        for (const node of [species, mother]) {
          const box = await node.boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width);
        }
      }
    }
    console.log('Breeding species picker passed: grouping, filtering, reset, drafts, pool association, manual entry and mobile layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
