const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const Care = require('../assets/care-records');
const Merge = require('../assets/account-merge');
const root = path.resolve(__dirname, '..');
(async () => {
  const today = '2026-09-26';
  assert.deepEqual(Care.dueMemos([{ id: 'done', completedAt: today }, { id: 'future', dueDate: '2026-09-27' }, { id: 'disabled', reminderEnabled: false }, { id: 'wrong-day', repeat: true, weekdays: ['1'] }, { id: 'done-today', repeat: true, lastCompletedDate: today }, { id: 'due', repeat: true, weekdays: ['6'] }], today).map(m => m.id), ['due']);
  const server = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
  const due = vm.runInNewContext('(' + server.slice(server.indexOf('function careReminderDue('), server.indexOf('\nasync function notifyCareReminder')) + ')');
  assert.equal(due({ remindTime: '09:00', completedAt: today }, { date: today, time: '09:00', weekday: '6' }), false);
  assert.equal(due({ remindTime: '09:00', repeat: true, lastCompletedDate: today }, { date: today, time: '09:00', weekday: '6' }), false);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let accept = true, dialogs = 0;
    page.on('dialog', dialog => { dialogs++; return accept ? dialog.accept() : dialog.dismiss(); });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'workspace.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('https://workspace.test/?skipIntro=1');
    await page.evaluate(() => {
      const today = formatDate(new Date());
      state = { ...state, ...emptyAccountData(), loggedInPhone: 'preview', policyConsentRequired: false,
        turtles: [{ id: 'a', code: '小果', speciesCode: 'GHG', speciesName: '果核蛋龟', health: '健康', status: '正常饲养', poolId: 'p' }, { id: 'b', code: '苗一', speciesCode: 'GHG', speciesName: '果核蛋龟', batchId: 'batch', status: '正常饲养' }, { id: 'c', code: '苗二', speciesCode: 'GHG', speciesName: '果核蛋龟', batchId: 'batch', status: '正常饲养' }],
        turtlePools: [{ id: 'p', name: '一号池' }], keptSpecies: ['GHG'],
        careRecords: Array.from({ length: 55 }, (_, i) => ({ id: `r${i}`, title: i % 2 ? '换水' : '喂食', itemId: i % 2 ? 'water' : 'feeding', date: today, createdAt: `${today}T08:00:00Z`, poolId: 'p', poolName: '一号池', turtleRefs: i % 2 ? [] : [{ id: i === 0 ? 'b' : 'a', code: i === 0 ? '苗一' : '小果', speciesName: '果核蛋龟' }], note: `记录${i}` })),
        memos: [{ id: 'task', title: '换水', content: '换三分之一', remindTime: '09:00', repeat: true }, { id: 'growth', title: '记录小果成长', turtleId: 'a', dueDate: today, growthReminder: true }],
        breedingRecords: [{ id: 'nest', motherId: 'a', motherName: '小果', eggCount: 6, fertileCount: 5, date: today }]
      }; edgeBackSnapshots = []; render();
    });
    assert.equal(await page.locator('[data-start-task]').count(), 2);
    assert.equal(await page.locator('[data-start-task="task"]').textContent(), '已完成');
    await page.locator('[data-start-task="task"]').click();
    assert.equal(await page.evaluate(() => state.page), 'home');
    assert.equal(await page.evaluate(() => state.careRecords[0].note), '换三分之一');
    assert.equal(await page.evaluate(() => state.memos[0].lastCompletedDate), await page.evaluate(() => formatDate(new Date())));
    assert.equal(await page.evaluate(() => state.careRecords[0].sourceMemoId), 'task');
    await page.evaluate(() => setState({ page: 'memos', careTab: 'care' }, { pageMotion: 'none' }));
    assert.equal(await page.locator('.care-record').count(), 40);
    await page.locator('[data-more-care]').click();
    assert.equal(await page.locator('.care-record').count(), 56);
    await page.locator('.work-filters > summary').click();
    await page.locator('#careFilterForm [name="item"]').selectOption('feeding');
    await page.locator('#careFilterForm [name="query"]').fill('记录0');
    await page.locator('#careFilterForm [type="submit"]').click();
    assert.equal(await page.locator('.care-record').count(), 1);
    await page.locator('#careFilterForm [name="from"]').fill('2026-09-27');
    await page.locator('#careFilterForm [name="to"]').fill('2026-09-01');
    await page.locator('#careFilterForm [type="submit"]').click();
    assert.match(await page.locator('.toast').textContent(), /开始日期/);
    await page.locator('[data-reset-care-filter]').click();
    await page.locator('.work-filters > summary').click();
    await page.locator('#careFilterForm .archive-directory-trigger').click();
    assert.equal(await page.locator('.archive-directory-dialog').count(), 1);
    await page.locator('[data-directory-close]').click();
    await page.locator('[data-new-care="feeding"]').click();
    await page.evaluate(() => setState({ careDraft: { ...state.careDraft, turtleRefs: [{ id: 'a', code: '小果', speciesName: '果核蛋龟' }] } }));
    await page.locator('#careForm [name="poolId"]').selectOption('p');
    await page.locator('#careForm [name="note"]').fill('晚餐，少量龟粮');
    await page.locator('.care-plan-save > summary').click();
    await page.locator('[name="planName"]').fill('种龟晚餐');
    await page.locator('[data-save-care-plan]').click();
    assert.equal(await page.evaluate(() => state.carePlans.length), 1);
    assert.equal(await page.evaluate(() => state.careRecords.length), 56);
    assert.equal(await page.locator('#careForm [name="note"]').inputValue(), '晚餐，少量龟粮');
    await page.locator('[data-cancel-care]').click();
    await page.locator('.work-plans > summary').click();
    await page.locator('[data-use-care-plan]').click();
    assert.equal(await page.locator('#careForm [name="note"]').inputValue(), '晚餐，少量龟粮');
    await page.locator('#careForm [type="submit"]').click();
    await page.locator('.work-plans > summary').click();
    await page.locator('[data-delete-care-plan]').click();
    assert.equal(await page.evaluate(() => state.carePlans.length), 0);
    assert.equal(await page.evaluate(() => state.careRecords.length), 57);
    await page.evaluate(() => setState({ carePlans: TurtleCare.normalizePlans([{ id: 'old-plan', name: '旧方案', poolId: 'removed-pool', poolName: '旧池', turtleRefs: [{ id: 'a', code: '旧昵称' }, { id: 'removed', code: '已售出的龟' }] }]) }));
    await page.locator('.work-plans > summary').click();
    await page.locator('[data-use-care-plan]').click();
    assert.equal(await page.evaluate(() => state.careDraft.turtleRefs.length), 1);
    assert.equal(await page.evaluate(() => state.careDraft.turtleRefs[0].code), '小果');
    assert.equal(await page.locator('#careForm [name="poolId"]').inputValue(), '');
    assert.match(await page.locator('#careForm .work-hint').textContent(), /已移除 1 只/);
    await page.locator('[data-cancel-care]').click();
    await page.evaluate(() => setState({ page: 'turtleDetail', selectedTurtleId: 'a' }, { pageMotion: 'none' }));
    assert.match(await page.locator('.work-timeline').textContent(), /产蛋/);
    assert.match(await page.locator('.work-timeline').textContent(), /晚餐，少量龟粮/);
    await page.evaluate(() => setState({ selectedTurtleId: 'b' }));
    assert.match(await page.locator('.work-timeline').textContent(), /涉及本批次 1 只/);
    assert.doesNotMatch(await page.locator('.work-timeline').textContent(), /晚餐，少量龟粮/);
    await page.evaluate(() => setState({ page: 'home' }, { pageMotion: 'none' }));
    assert.equal(await page.locator('[data-start-task="task"]').count(), 0);
    // Cancel a real edge gesture on a dirty form; then complete it exactly once.
    await page.evaluate(() => setState({ page: 'memos', careTab: 'care', careDraft: { itemId: 'feeding', date: formatDate(new Date()), note: '' } }, { pageMotion: 'none' }));
    await page.locator('#careForm [name="note"]').fill('不能丢失的草稿');
    await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); });
    accept = false;
    await page.mouse.move(5, 220); await page.mouse.down(); await page.mouse.move(220, 221, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => state.page), 'memos');
    assert.equal(await page.locator('#careForm [name="note"]').inputValue(), '不能丢失的草稿');
    assert.equal(await page.locator('.edge-back-preview').count(), 0);
    assert.ok(dialogs >= 2);
    accept = true;
    await page.mouse.move(5, 220); await page.mouse.down(); await page.mouse.move(220, 221, { steps: 6 }); await page.mouse.up();
    await page.waitForFunction(() => state.page === 'home');
    await page.waitForTimeout(550);
    assert.equal(await page.locator('.edge-back-preview').count(), 0);
    // Status updates never replace the page or discard input.
    await page.evaluate(() => { window.statusMain = $app.querySelector('main'); localBackupFailed = true; updateAccountSaveStatus(); });
    assert.match(await page.locator('[data-account-save-status]').textContent(), /保存失败/);
    assert.equal(await page.evaluate(() => statusMain === $app.querySelector('main')), true);
    await page.evaluate(() => { localBackupFailed = false; updateAccountSaveStatus(); });
    // Representative shared forms at phone widths and desktop, in both themes.
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of ['home', 'add', 'turtleDetail', 'ledger', 'memos', 'poolAdd']) {
        await page.evaluate(({ route, theme }) => setState({ page: route, themeColor: theme, selectedTurtleId: 'a', updatingTurtleId: route === 'turtleDetail' ? 'a' : '', careDraft: route === 'memos' ? { itemId: 'feeding', date: formatDate(new Date()), note: '' } : null, ledgerDraftType: route === 'ledger' ? 'sold' : '' }, { pageMotion: 'none' }), { route, theme });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width}/${route} horizontal overflow`);
        if (width === 390 && ['home', 'memos', 'turtleDetail'].includes(route)) {
          await page.evaluate(() => { scrollTo(0, 0); document.querySelector('.toast')?.remove(); });
          await page.screenshot({ path: path.join(root, `output/workspace-${route}-${theme}.png`), animations: 'disabled' });
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS: filters/paging, plans, tasks, archive timelines, save status, guarded edge return, shared forms at 320/390/430/1280px in light/dark.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
