'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, engine } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await launchBrowser(), results = [];
  async function check(name, run) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai' });
    await ctx.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<div id="app" class="phone-shell"><button id="previous">首页</button></div>' }));
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    async function setup({ seen = '', query = '' } = {}) {
      await page.goto('https://release.test/' + query);
      await page.clock.setFixedTime(new Date('2026-10-08T10:00:00Z'));
      await page.evaluate(value => { window.copyText = () => {}; window.releaseBlocked = false; if (value) localStorage.setItem('turtlekeeper-release-notes-seen-version', value); }, seen);
      for (const file of ['styles.css', 'assets/ui-system.css', 'assets/trade-guide.css', 'assets/release-notes.css']) await page.addStyleTag({ path: path.join(root, file) });
      for (const file of ['assets/trade-guide/terms.js', 'assets/trade-guide.js', 'assets/release-notes.js']) await page.addScriptTag({ path: path.join(root, file) });
    }
    try { await run(page, setup); assert.deepEqual(errors, []); results.push({ name, pass: true }); console.log('PASS ' + name); }
    catch (error) { results.push({ name, pass: false, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message); }
    finally { await ctx.close(); }
  }
  try {
    await check('upgrading from 1.1.7 shows only 1.1.8 fixes after the ad, once only', async (page, setup) => {
      await setup({ seen: '1.1.7' });
      await page.evaluate(() => { showTradeIntro(); TurtleReleaseNotes.start({ version: '1.1.8' }); });
      assert.equal(await page.locator('.release-notes-dialog').count(), 0);
      await page.locator('.trade-intro-skip').click(); await page.waitForSelector('.release-notes-dialog');
      const content = await page.locator('.release-notes-dialog').innerText();
      assert.match(content, /龟友手账 1\.1\.8/);
      assert.match(content, /品种旁显示公母/); assert.match(content, /关联档案已删除/);
      assert.doesNotMatch(content, /新增忘记密码|新增独立搜索页|启动广告每天一次/);
      assert.equal(await page.locator('.release-notes-dialog li').count(), 2);
      await page.getByRole('button', { name: '我知道了' }).click();
      assert.equal(await page.evaluate(() => localStorage.getItem('turtlekeeper-release-notes-seen-version')), '1.1.8');
      await setup(); await page.evaluate(() => TurtleReleaseNotes.start({ version: '1.1.8' }));
      assert.equal(await page.locator('.release-notes-dialog').count(), 0);
    });
    await check('upgrading from 1.1.6 shows 1.1.7 notes after the ad, once only', async (page, setup) => {
      await setup({ seen: '1.1.6' });
      await page.evaluate(() => { showTradeIntro(); TurtleReleaseNotes.start({ version: '1.1.7' }); });
      assert.equal(await page.locator('.release-notes-dialog').count(), 0);
      await page.locator('.trade-intro-skip').click(); await page.waitForSelector('.release-notes-dialog');
      const content = await page.locator('.release-notes-dialog').innerText();
      assert.match(content, /龟友手账 1\.1\.7/); assert.match(content, /养护记录更清晰/); assert.match(content, /•••/);
      assert.doesNotMatch(content, /启动广告每天一次/);
      await page.getByRole('button', { name: '我知道了' }).click();
      assert.equal(await page.evaluate(() => localStorage.getItem('turtlekeeper-release-notes-seen-version')), '1.1.7');
      await setup(); await page.evaluate(() => TurtleReleaseNotes.start({ version: '1.1.7' }));
      assert.equal(await page.locator('.release-notes-dialog').count(), 0);
    });
    await check('startup advertisement finishes before release notes, acknowledgment persists across restart', async (page, setup) => {
      await setup({ seen: '1.1.5' });
      await page.evaluate(() => { showTradeIntro(); TurtleReleaseNotes.start({ version: '1.1.6' }); });
      assert.equal(await page.locator('.trade-intro').count(), 1); assert.equal(await page.locator('.release-notes-dialog').count(), 0);
      await page.waitForSelector('.release-notes-dialog');
      assert.equal(await page.locator('.trade-intro').count(), 0);
      assert.match(await page.locator('.release-notes-dialog').innerText(), /当天或提前1～7天/);
      await page.getByRole('button', { name: '我知道了' }).click();
      assert.equal(await page.locator('.release-notes-dialog').count(), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('turtlekeeper-release-notes-seen-version')), '1.1.6');
      await setup(); await page.evaluate(() => { showTradeIntro(); TurtleReleaseNotes.start({ version: '1.1.6' }); });
      assert.equal(await page.locator('.release-notes-dialog').count(), 0); assert.equal(await page.locator('.trade-intro').count(), 0);
    });
    await check('skip leads to notes; same version build changes do not repeat; layout fits phones', async (page, setup) => {
      await setup(); await page.evaluate(() => { showTradeIntro(); TurtleReleaseNotes.start({ version: '1.1.6' }); });
      await page.locator('.trade-intro-skip').click(); await page.waitForSelector('.release-notes-dialog');
      for (const [width, height] of [[320, 568], [390, 844], [768, 844]]) {
        await page.setViewportSize({ width, height });
        const box = await page.locator('.release-notes-dialog').boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height);
        assert.equal(await page.evaluate(() => document.querySelector('.release-notes-dialog').scrollWidth <= document.querySelector('.release-notes-dialog').clientWidth), true);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      fs.mkdirSync(path.join(root, 'output/release-notes'), { recursive: true });
      await page.screenshot({ path: path.join(root, 'output/release-notes', 'update-' + engine + '.png') });
      await page.getByRole('button', { name: '关闭更新说明' }).click();
      await page.evaluate(() => { window.TURTLE_APP_BUILD = 999; TurtleReleaseNotes.start({ version: '1.1.6' }); });
      assert.equal(await page.locator('.release-notes-dialog').count(), 0);
    });
    await check('ad opens trade guide; release notes wait until guide closes', async (page, setup) => {
      await setup(); await page.evaluate(() => { showTradeIntro(); TurtleReleaseNotes.start({ version: '1.1.6' }); });
      await page.locator('.trade-intro-content').click();
      assert.equal(await page.locator('.trade-guide').count(), 1); assert.equal(await page.locator('.release-notes-dialog').count(), 0);
      await page.getByRole('button', { name: '关闭交易指南' }).click(); await page.waitForSelector('.release-notes-dialog');
    });
    await check('policy/forced-update modal defers notes without consuming acknowledgment', async (page, setup) => {
      await setup();
      await page.evaluate(() => { releaseBlocked = true; const other = document.createElement('div'); other.id = 'policy'; other.setAttribute('aria-modal', 'true'); other.textContent = 'policy'; document.body.append(other); TurtleReleaseNotes.start({ version: '1.1.6', blocked: () => releaseBlocked }); });
      assert.equal(await page.locator('.release-notes-dialog').count(), 0);
      await page.evaluate(() => { releaseBlocked = false; document.querySelector('#policy').remove(); }); await page.waitForSelector('.release-notes-dialog');
      await page.evaluate(() => { releaseBlocked = true; const force = document.createElement('div'); force.id = 'forced'; force.setAttribute('aria-modal', 'true'); force.textContent = 'update'; document.body.append(force); });
      await page.waitForSelector('.release-notes-dialog', { state: 'detached' });
      assert.equal(await page.evaluate(() => localStorage.getItem('turtlekeeper-release-notes-seen-version')), null);
      await page.evaluate(() => { releaseBlocked = false; document.querySelector('#forced').remove(); }); await page.waitForSelector('.release-notes-dialog');
    });
    await check('push cancellation and direct shared links do not consume release notes', async (page, setup) => {
      await setup(); await page.evaluate(() => { showTradeIntro(); TurtleReleaseNotes.start({ version: '1.1.6' }); dismissTradeIntro(); TurtleReleaseNotes.cancel(); });
      assert.equal(await page.locator('.release-notes-dialog').count(), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('turtlekeeper-release-notes-seen-version')), null);
      await setup({ query: '?market=shared' }); await page.evaluate(() => { showTradeIntro(); TurtleReleaseNotes.start({ version: '1.1.6' }); });
      assert.equal(await page.locator('.release-notes-dialog').count(), 0); assert.equal(await page.locator('.trade-intro').count(), 0);
    });
    await check('storage failure acknowledgment still suppresses repeats in this runtime; Escape closes', async (page, setup) => {
      await setup();
      await page.evaluate(() => { Storage.prototype.setItem = () => { throw Error('full'); }; TurtleReleaseNotes.start({ version: '1.1.6' }); });
      await page.waitForSelector('.release-notes-dialog'); await page.keyboard.press('Escape');
      await page.evaluate(() => TurtleReleaseNotes.start({ version: '1.1.6' })); assert.equal(await page.locator('.release-notes-dialog').count(), 0);
    });
  } finally { await browser.close(); }
  fs.mkdirSync(path.join(root, 'output/release-notes'), { recursive: true }); fs.writeFileSync(path.join(root, 'output/release-notes', 'tests-' + engine + '.json'), JSON.stringify(results, null, 2));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
