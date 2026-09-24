const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync('app.js', 'utf8');
const picker = source.slice(source.indexOf('function bindArchiveDirectoryPickers()'), source.indexOf('function bindEvents()'));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    for (const context of ['ledger', 'market', 'breedingDetail', 'community']) {
      await page.setContent(`<form><textarea name="note">保留备注</textarea><select class="select" name="${context === 'breedingDetail' ? 'mother' : 'turtleId'}" data-archive-directory>
        <option value="">不关联档案</option><option value="__dashboard__">去看板查找</option><option value="manual">手动备注</option>
        <option value="g1" selected>果核一号 · 果核蛋龟</option><option value="g2">果核二号 · 果核蛋龟</option><option value="r1">剃刀一号 · 剃刀麝香龟</option>
      </select></form>`);
      for (const path of ['styles.css', 'chat-tools.css', 'dark-surface-audit.css']) await page.addStyleTag({ path });
      await page.addScriptTag({ path: 'assets/turtle-batches.js' });
      await page.addScriptTag({ content: `{
        const defaultPhoto = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#2fa77f"/></svg>');
        const speciesByCode = () => null;
        const speciesList = [];
        const speciesPhoto = () => defaultPhoto;
        const turtleBatchLabel = turtle => turtle.batchName;
        const state = { turtles: [
          {id:'g1',code:'果核一号',speciesName:'果核蛋龟',health:'健康',poolId:'p1'}, {id:'g2',code:'果核二号',speciesName:'果核蛋龟',health:'生病'},
          {id:'r1',code:'剃刀一号',speciesName:'剃刀麝香龟'}, {id:'excluded',code:'不在原选项里',speciesName:'另一品种'}
        ], turtlePools: [{id:'p1',name:'阳台池'}] };
        ${picker}
        window.changes = [];
        document.querySelector('select').addEventListener('change', e => changes.push(e.target.value));
        bindArchiveDirectoryPickers(); bindArchiveDirectoryPickers();
      }` });
      const trigger = page.locator('.archive-directory-trigger');
      assert.equal(await trigger.count(), 1);
      await trigger.click();
      assert.equal(await page.locator('.directory-species-card').count(), 2);
      assert.equal(await page.locator('.directory-species-card img').count(), 2);
      assert.equal(await page.locator('.directory-special-actions > button').count(), 3);
      await page.locator('.directory-species-card').filter({ hasText: '果核蛋龟' }).click();
      assert.equal(await page.locator('.archive-directory-list > button').count(), 2);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('select').inputValue(), 'g1');
      assert.deepEqual(await page.evaluate(() => changes), []);
      await trigger.click();
      await page.locator('.directory-species-card').filter({ hasText: '剃刀麝香龟' }).click();
      await page.locator('.directory-archive-card').filter({ hasText: '剃刀一号' }).click();
      assert.equal(await page.locator('select').inputValue(), 'r1');
      assert.deepEqual(await page.evaluate(() => changes), ['r1']);
      assert.equal(await page.locator('textarea').inputValue(), '保留备注');
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      assert.equal(await page.evaluate(() => [...new FormData(document.querySelector('form')).values()].includes('r1')), true);
      for (const [name, value] of [['不关联档案',''], ['手动备注','manual'], ['去看板查找','__dashboard__']]) {
        await trigger.click();
        await page.getByRole('button', { name, exact: true }).click();
        assert.equal(await page.locator('select').inputValue(), value);
      }
      await trigger.click();
      await page.locator('[data-directory-search]').fill('果核二号');
      assert.equal(await page.locator('.directory-archive-card').count(), 1);
      await page.locator('[data-directory-health]').selectOption('健康');
      assert.equal(await page.locator('.directory-archive-card').count(), 0);
      await page.getByRole('button', { name: '清除搜索与筛选' }).click();
      await page.locator('[data-directory-pool]').selectOption('p1');
      await page.locator('.directory-species-card').click();
      assert.equal(await page.locator('.directory-archive-card').count(), 1);
      assert.match(await page.locator('.directory-archive-card').innerText(), /果核一号/);
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      for (const width of [320,390,440]) {
        await page.setViewportSize({ width, height: 844 });
        for (const theme of ['light','dark']) {
          await page.evaluate(theme => document.documentElement.dataset.themeColor = theme, theme);
          await trigger.click();
          const box = await page.locator('.archive-directory-dialog').boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width);
          if (context === 'ledger' && width === 390 && theme === 'dark') await page.locator('.archive-directory-dialog').screenshot({ path: 'build/archive-directory-preview.png' });
          await page.locator('.directory-species-card').filter({ hasText: '果核蛋龟' }).click();
          await page.getByRole('button', { name: '返回品种目录' }).click();
          assert.equal(await page.locator('.directory-species-card').count(), 2);
          await page.getByRole('button', { name: '关闭', exact: true }).click();
        }
      }
    }
    // A team selector must use its explicitly scoped catalogue, never the
    // signed-in user's unrelated personal turtles (even with overlapping IDs).
    await page.evaluate(() => {
      const select = document.querySelector('select[data-archive-directory]');
      select.replaceChildren(new Option('团队甲', 'g1'), new Option('团队乙', 'team2'));
      select.__directorySource = { turtles: [
        { id: 'g1', code: '团队甲', speciesName: '团队品种', batchId: 'team-batch', batchName: '团队批次' },
        { id: 'team2', code: '团队乙', speciesName: '团队品种', batchId: 'team-batch', batchName: '团队批次' }
      ], pools: [] };
    });
    await page.locator('.archive-directory-trigger').click();
    assert.equal(await page.locator('.directory-species-card').count(), 1);
    assert.match(await page.locator('.directory-species-card').innerText(), /团队品种/);
    await page.locator('.directory-species-card').click();
    assert.equal(await page.locator('.directory-archive-card').count(), 1);
    await page.locator('.directory-archive-card').click();
    assert.equal(await page.locator('.directory-archive-card').count(), 2);
    await page.locator('.directory-archive-card').filter({ hasText: '团队乙' }).click();
    assert.equal(await page.locator('select[data-archive-directory]').inputValue(), 'team2');
    console.log('Archive directory passed: scoped team sources, allowed options, folding/member selection, grouping, change events, form values, special options, cancel, focus/scroll cleanup, responsive layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
