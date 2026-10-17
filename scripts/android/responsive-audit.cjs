const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

module.exports = async function audit(page, output) {
  const routes = fs.readFileSync(path.join(__dirname, '../../app.js'), 'utf8')
    .split('const pages = {')[1].split('};')[0].match(/\w+(?=: page)/g);
  const sizes = [[280,653],[320,568],[360,800],[412,915],[600,800],[720,960],[840,720],[1024,768],[1280,900],[1600,1000],[800,360],[600,280]];
  const failures = [], checked = [];
  await page.evaluate(() => {
    Object.assign(state, {
      selectedTurtleId: '1', selectedLedgerId: 'ledger-test', selectedBreedingId: 'breeding-test',
      selectedMarketListingId: 'market-test', selectedCommunityPostId: 'post-test',
      ledgerRecords: [{ id: 'ledger-test', turtleId: '1', type: 'purchase', amount: 1234, recordDate: '2026-09-14', title: '测试账本记录' }],
      breedingRecords: [{ id: 'breeding-test', motherId: '1', eggCount: 6, fertileCount: 4, date: '2026-09-01', hatchEvents: [] }],
      marketListings: [{ id: 'market-test', title: '测试商品与较长名称', speciesName: '果核蛋龟', status: 'available', price: 1234, description: '布局检查用商品内容', authorName: '测试用户', photos: [defaultPhoto], images: [defaultPhoto] }],
      communityPosts: [{ id: 'post-test', title: '检查展开屏帖子排版', content: '长文本和图片都应该在可用屏幕内展示。'.repeat(5), authorName: '测试用户', authorId: 'test-user', comments: [], images: [defaultPhoto], likes: 0 }]
    });
    state.turtles.forEach(t => { t.status = '正常饲养'; t.health = '健康'; });
  });
  for (const [width, height] of (process.env.ANDROID_TEXT_ONLY === '1' ? [] : sizes)) {
    await page.setViewportSize({ width, height });
    for (const name of routes) {
      await page.evaluate(name => { state.page = name; state.themeColor = 'dark'; render(); window.scrollTo(0, 0); }, name);
      const problems = await page.evaluate(() => {
        const problems = [];
        const width = innerWidth;
        const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
        const label = el => `${el.tagName}.${String(el.className).trim().replace(/\s+/g, '.')}`;
        if (document.documentElement.scrollWidth > width + 1) problems.push('document too wide');
        for (const el of document.querySelectorAll('#app main *, .topbar, .bottom-nav, .forum-publish-nav, .community-chat-form, .market-detail-actions')) {
          if (!visible(el) || el.closest('.sr-only, .edge-back-preview')) continue;
          const r = el.getBoundingClientRect();
          if (r.width <= 0) continue;
          let clippedByContainer = false;
          for (let p = el.parentElement; p && p !== document.querySelector('#app'); p = p.parentElement) {
            if (['scroll', 'auto', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) { clippedByContainer = true; break; }
          }
          if (!clippedByContainer && (r.right > width + 2 || r.left < -2)) problems.push('offscreen ' + label(el));
          if (el.matches('input:not([type="checkbox"]):not([type="radio"]), select, textarea, button') && r.width > width + 2) problems.push('control too wide ' + label(el));
        }
        const bar = document.querySelector('.topbar');
        const h = bar?.querySelector('h1');
        if (bar && h) {
          const title = h.getBoundingClientRect();
          for (const b of bar.querySelectorAll('button')) {
            const r = b.getBoundingClientRect();
            if (r.width && r.right > title.left + 2 && r.left < title.right - 2) problems.push('title/button overlap');
          }
        }
        return [...new Set(problems)].slice(0, 10);
      });
      checked.push({ name, width, height });
      if (problems.length) {
        failures.push({ name, width, height, problems });
        if (failures.length <= 8) await page.screenshot({ path: path.join(output, `failure-${name}-${width}x${height}.png`) });
      }
    }
  }
  if (checked.length) fs.writeFileSync(path.join(output, 'responsive-audit.json'), JSON.stringify({ checked: checked.length, routes, sizes, failures }, null, 2));
  console.log(JSON.stringify({ checks: checked.length, failures: failures.slice(0, 30) }));
  assert.equal(failures.length, 0, `${failures.length} page/viewport combinations failed; see responsive-audit.json`);
  const textFailures = [], textCases = [];
  for (const width of [320, 720, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const scale of [1.3, 2]) for (const name of ['home', 'add', 'marketAdd', 'communityAdd', 'poolAdd']) {
      await page.evaluate(({ name, scale }) => {
        for (const [el, value, priority] of (androidTest.restoreFonts || [])) {
          if (value) el.style.setProperty('font-size', value, priority); else el.style.removeProperty('font-size');
        }
        state.page = name; render(); window.scrollTo(0, 0);
        // Text expansion stress test, not a claim of emulating OEM font scaling.
        const fonts = [...document.querySelectorAll('#app *')].map(el => [el, parseFloat(getComputedStyle(el).fontSize)]);
        androidTest.restoreFonts = fonts.map(([el]) => [el, el.style.getPropertyValue('font-size'), el.style.getPropertyPriority('font-size')]);
        for (const [el, font] of fonts) el.style.setProperty('font-size', (font * scale) + 'px', 'important');
      }, { name, scale });
      await page.waitForTimeout(50);
      const problems = await page.evaluate(() => {
        const problems = [];
        for (const el of document.querySelectorAll('.topbar h1, .topbar button, .bottom-nav button, #app form button, #app form select')) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          let scrollable = false;
          for (let p = el.parentElement; p && p !== document.querySelector('#app'); p = p.parentElement) {
            if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX)) { scrollable = true; break; }
          }
          if (scrollable) continue;
          if (r.right > innerWidth + 2 || r.left < -2) problems.push('offscreen: ' + el.className);
          if (el.scrollHeight > el.clientHeight + 3 && getComputedStyle(el).overflowY === 'hidden') problems.push('clipped text: ' + el.className);
        }
        return [...new Set(problems)];
      });
      textCases.push({ name, width, scale });
      if (name === 'home') await page.screenshot({ path: path.join(output, `text-home-${width}-${scale}.png`) });
      if (problems.length) { textFailures.push({ name, width, scale, problems }); await page.screenshot({ path: path.join(output, `text-${name}-${width}-${scale}.png`) }); }
    }
  }
  fs.writeFileSync(path.join(output, 'text-stress-audit.json'), JSON.stringify({ checked: textCases.length, failures: textFailures }, null, 2));
  console.log(JSON.stringify({ textChecks: textCases.length, textFailures }));
  assert.equal(textFailures.length, 0, 'Text expansion stress tests failed');
  await page.evaluate(() => {
    for (const [el, value, priority] of androidTest.restoreFonts || []) {
      if (value) el.style.setProperty('font-size', value, priority); else el.style.removeProperty('font-size');
    }
    state.page = 'home'; render();
  });
  const dialogFailures = [], dialogCases = [];
  for (const [width, height] of [[280,653],[320,280],[800,360],[1280,800]]) {
    await page.setViewportSize({ width, height });
    for (const name of ['guide', 'service', 'share', 'delete']) {
      await page.evaluate(name => {
        if (name === 'guide') openTradeGuide();
        if (name === 'service') openMarketTopService();
        if (name === 'share') openMarketDetailMore('market-test');
        if (name === 'delete') openAccountDeleteDialog();
      }, name);
      await page.waitForTimeout(400); // Measure the final position after the sheet's entrance animation.
      const result = await page.evaluate(() => {
        const dialog = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].at(-1);
        if (!dialog) return { problem: 'dialog missing' };
        const r = dialog.getBoundingClientRect();
        return { problem: r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1 ? 'dialog outside viewport' : '', bounds: { x:r.x, y:r.y, width:r.width, height:r.height } };
      });
      dialogCases.push({ name, width, height });
      if (result.problem) { dialogFailures.push({ name, width, height, ...result }); await page.screenshot({ path: path.join(output, `dialog-${name}-${width}x${height}.png`) }); }
      const close = page.locator('[data-close], [data-market-service-close], [data-market-more-close], [data-delete-dialog-close]').last();
      // Use the real dismissal path; never confirm a destructive dialog.
      if (await close.count()) await close.click();
      else { await page.waitForTimeout(280); await page.evaluate(() => androidTest.listeners.backButton({ canGoBack: false })); }
      assert.equal(await page.locator('[role="dialog"][aria-modal="true"]').count(), 0, name + ': dialog did not close');
    }
  }
  fs.writeFileSync(path.join(output, 'dialog-audit.json'), JSON.stringify({ checked: dialogCases.length, failures: dialogFailures }, null, 2));
  console.log(JSON.stringify({ dialogChecks: dialogCases.length, dialogFailures }));
  assert.equal(dialogFailures.length, 0, 'Dialog geometry tests failed');
};
