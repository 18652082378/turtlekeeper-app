'use strict';
// Real app interactions with synthetic browser data and no production traffic.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, engine } = require('./browser-test-engine.cjs');
const fixture = require('./ui-audit-fixture.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output/ui-upgrade-132');
(async () => {
  const browser = await launchBrowser(), results = [], dimensions = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'daily.test') return route.abort();
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, friends: [], messages: [], items: [], minimumBuild: 0 } });
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let accept = true;
  page.on('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
  const tick = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function seed(patch = {}) {
    await page.evaluate(({ base, patch }) => {
      window.dismissTradeIntro?.();
      state = { ...initialState, ...emptyAccountData(), ...base, page: 'memos', careTab: 'care', themeColor: 'teal', ...patch };
      careHistoryFilter = {}; careHistoryLimit = 40; pendingPageEnterMotion = false; forceUpdateState = { required: false };
      render(); scrollTo(0, 0);
    }, { base: fixture(), patch });
    await tick();
  }
  async function check(name, run) {
    const startErrors = errors.length;
    try { await run(); assert.deepEqual(errors.slice(startErrors), []); results.push({ name, pass: true }); console.log('PASS ' + name); }
    catch (error) { results.push({ name, pass: false, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message); }
  }
  fs.mkdirSync(output, { recursive: true });
  try {
    await page.goto('https://daily.test/?skipIntro=1');
    await page.clock.setFixedTime(new Date('2026-10-08T10:00:00Z'));
    const bare = Array.from({ length: 7 }, (_, i) => ({ id: 'bare-' + i, title: '喂食', itemId: 'feeding', date: `2026-10-${String(8 - i).padStart(2, '0')}`, createdAt: `2026-10-${String(8 - i).padStart(2, '0')}T02:13:00Z`, note: '', turtleRefs: [] }));
    await check('seven plain records have no empty body or destructive actions crowding the list', async () => {
      for (const theme of ['teal', 'dark']) for (const width of [320, 390, 430, 1280]) {
        await page.setViewportSize({ width, height: 844 }); await seed({ careRecords: bare, carePlans: [], themeColor: theme });
        assert.equal(await page.locator('.care-record').count(), 7);
        assert.equal(await page.locator('.care-record-body').count(), 0);
        assert.equal(await page.locator('[data-delete-care]:visible').count(), 0);
        const first = await page.locator('.care-record').first().boundingBox();
        assert.ok(first.height <= 125, `plain record height ${first.height}`);
        if (width <= 430) assert.ok(first.y < 535, `first history record starts at ${first.y}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const targets = await page.locator('.care-quick-actions button, .record-menu > summary').evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; }));
        assert.ok(targets.every(r => r.width >= 44 && r.height >= 44));
        dimensions.push({ width, theme, firstRecordHeight: first.height, firstRecordTop: first.y });
        if ([390, 1280].includes(width)) await page.screenshot({ path: path.join(output, `care-${theme}-${width}-${engine}.png`), animations: 'disabled' });
      }
    });
    await check('record menus close on outside focus, another menu and Escape; actions stay above navigation', async () => {
      await page.setViewportSize({ width: 390, height: 844 }); await seed({ careRecords: bare });
      const summaries = page.locator('.record-menu > summary');
      await summaries.first().click(); await tick(); assert.equal(await page.locator('.record-menu[open]').count(), 1);
      await summaries.nth(1).click(); await tick(); assert.equal(await page.locator('.record-menu[open]').count(), 1);
      await page.keyboard.press('Escape'); assert.equal(await page.locator('.record-menu[open]').count(), 0);
      assert.equal(await summaries.nth(1).evaluate(el => el === document.activeElement), true);
      await summaries.first().click(); await page.locator('[data-new-care="water"]').focus(); assert.equal(await page.locator('.record-menu[open]').count(), 0);
      await summaries.first().evaluate(el => { el.scrollIntoView({ block: 'end' }); scrollBy(0, 88); });
      await summaries.first().click(); await tick();
      const menu = await page.locator('.record-menu[open] .record-menu-panel').boundingBox();
      const nav = await page.locator('.bottom-nav').boundingBox();
      assert.ok(menu.y >= 0 && menu.y + menu.height <= nav.y + 1, 'menu is reachable above fixed navigation');
      await page.screenshot({ path: path.join(output, `care-menu-${engine}.png`), animations: 'disabled' });
      await page.locator('.care-tabs').click(); assert.equal(await page.locator('.record-menu[open]').count(), 0);
    });
    await check('edit retains the record; deletion requires confirmation and removes only that record', async () => {
      await seed({ careRecords: bare });
      await page.locator('.record-menu > summary').first().click();
      await page.locator('[data-edit-care="bare-0"]').click();
      await page.locator('#careForm [name="note"]').fill('晚餐少量龟粮');
      await page.getByRole('button', { name: '保存修改', exact: true }).click();
      assert.equal(await page.evaluate(() => state.careRecords.length), 7);
      assert.equal(await page.evaluate(() => state.careRecords.find(row => row.id === 'bare-0').note), '晚餐少量龟粮');
      accept = false;
      await page.locator('.record-menu > summary').first().click(); await page.locator('[data-delete-care="bare-0"]').click();
      assert.equal(await page.evaluate(() => state.careRecords.length), 7);
      accept = true; await page.locator('[data-delete-care="bare-0"]').click();
      assert.equal(await page.evaluate(() => state.careRecords.length), 6);
      assert.equal(await page.evaluate(() => state.careRecords.some(row => row.id === 'bare-0')), false);
    });
    await check('repeat feeding preserves details and a stale double tap creates only one record', async () => {
      await seed({ careRecords: [{ ...bare[0], note: '少量龟粮', poolId: 'ui-pool', poolName: '青禾种龟池', turtleRefs: fixture().careRecords[0].turtleRefs }] });
      await page.locator('[data-repeat-care]').evaluate(button => { button.click(); button.click(); });
      const rows = await page.evaluate(() => state.careRecords);
      assert.equal(rows.length, 2); assert.notEqual(rows[0].id, rows[1].id); assert.equal(rows[0].note, rows[1].note); assert.deepEqual(rows[0].turtleRefs, rows[1].turtleRefs);
    });
    await check('empty filter results reset correctly without erasing history', async () => {
      await seed({ careRecords: bare });
      await page.locator('.work-filters > summary').click(); await page.locator('#careFilterForm [name="query"]').fill('不匹配');
      await page.locator('#careFilterForm [type="submit"]').click();
      assert.equal(await page.locator('.care-record').count(), 0);
      await page.locator('.workspace-empty [data-reset-care-filter]').click();
      assert.equal(await page.locator('.care-record').count(), 7);
      assert.equal(await page.evaluate(() => state.careRecords.length), 7);
    });
    await check('date grouping and pagination preserve every record exactly once', async () => {
      const many = Array.from({ length: 45 }, (_, i) => ({ ...bare[0], id: 'many-' + i, title: i % 2 ? '喂食' : '换水', itemId: i % 2 ? 'feeding' : 'water' }));
      await seed({ careRecords: many });
      assert.equal(await page.locator('.care-day-group').count(), 1); assert.equal(await page.locator('.care-record').count(), 40);
      await page.locator('[data-more-care]').click(); assert.equal(await page.locator('.care-record').count(), 45); assert.equal(await page.locator('[data-more-care]').count(), 0);
      assert.equal(await page.evaluate(() => new Set([...document.querySelectorAll('[data-edit-care]')].map(el => el.dataset.editCare)).size), 45);
    });
    await check('care tab keyboard navigation follows the visual order', async () => {
      await seed(); await page.getByRole('tab', { name: '养护', exact: true }).focus();
      await page.keyboard.press('End'); await tick(); assert.equal(await page.evaluate(() => state.careTab), 'reminders');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.careTab), 'reminders');
      await page.keyboard.press('ArrowLeft'); await tick(); assert.equal(await page.evaluate(() => state.careTab), 'weather');
      await page.keyboard.press('Home'); await tick(); assert.equal(await page.evaluate(() => state.careTab), 'care');
      assert.equal(await page.locator('.care-tabs [tabindex="0"]').count(), 1);
    });
    await check('reminder timing, weekdays, disabled notices and edits remain understandable', async () => {
      await seed({ careTab: 'reminders', memos: [{ id: 'daily', title: '每天喂食', remindTime: '18:00', repeat: true }, { id: 'week', title: '每周换水', remindTime: '09:00', repeat: true, weekdays: ['5', '1'], reminderEnabled: false }] });
      assert.match(await page.locator('.memo-row').first().innerText(), /18:00[\s\S]*每天/);
      assert.match(await page.locator('.memo-row').nth(1).innerText(), /每周一、五[\s\S]*通知已关闭/);
      await page.locator('.memo-row').nth(1).locator('.record-menu > summary').click();
      await page.locator('[data-edit-memo="week"]').click();
      assert.equal(await page.locator('#memoForm [name="title"]').inputValue(), '每周换水');
      await page.locator('#memoForm [name="title"]').fill('每周检查滤材'); await page.getByRole('button', { name: '保存调整', exact: true }).click();
      assert.equal(await page.evaluate(() => state.memos.find(row => row.id === 'week').title), '每周检查滤材');
    });
    await check('large amounts and long record text fit small screens without clipping controls', async () => {
      await page.setViewportSize({ width: 320, height: 844 });
      await seed({ page: 'ledger', ledgerRecords: [{ id: 'big', type: 'purchase', amount: 99999999.99, title: '批次购入'.repeat(18), createdAt: bare[0].createdAt, recordDate: bare[0].date }] });
      assert.ok(await page.locator('.ledger-summary-value').evaluateAll(nodes => nodes.every(el => el.scrollWidth <= el.clientWidth + 1 && [...el.children].every(child => child.scrollWidth <= child.clientWidth + 1))));
      const tabs = await page.locator('.ledger-workspace .memo-tabs button').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().y));
      assert.ok(tabs.every(y => Math.abs(y - tabs[0]) < 1));
      await seed({ careRecords: [{ ...bare[0], title: '喂食说明'.repeat(15), note: '观察情况'.repeat(200), poolName: '养龟地点'.repeat(30), turtleRefs: Array.from({ length: 100 }, (_, i) => ({ id: 'ref-' + i, code: '乌龟昵称'.repeat(12), speciesName: '果核蛋龟' })) }] });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('[data-care-view]').click(); assert.equal(await page.locator('.care-turtle-scroll li').count(), 100);
      assert.ok((await page.locator('.care-turtle-scroll').boundingBox()).height <= 270);
    });
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, `interaction-${engine}.json`), JSON.stringify({ engine, nativeDevice: false, results, dimensions }, null, 2));
  }
  assert.equal(results.filter(row => !row.pass).length, 0, 'Daily workspace failures; see output/ui-upgrade-132');
})().catch(error => { console.error(error); process.exitCode = 1; });
