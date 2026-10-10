const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { launchBrowser, artifactName, engine } = require('./browser-test-engine.cjs');
const Care = require('../assets/care-records');
const Merge = require('../assets/account-merge');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'workspace.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('https://workspace.test/?skipIntro=1');
    const baseline = await page.evaluate(() => {
      const today = formatDate(new Date());
      state = { ...state, ...emptyAccountData(), loggedInPhone: 'preview', policyConsentRequired: false,
        turtles: [
          { id: 'a', code: '光头', speciesCode: 'GHG', speciesName: '果核蛋龟', status: '正常饲养', health: '健康', weight: 123, carapaceLength: 8.1, photo: '/assets/guohe.jpg', nextGrowthAt: today, measureHistory: [{ id: 'history', oldLength: 7, newLength: 8.1 }] },
          { id: 'b', code: '苗一', batchId: 'batch', speciesCode: 'GHG', speciesName: '果核蛋龟', status: '正常饲养', nextGrowthAt: today },
          { id: 'c', code: '苗二', batchId: 'batch', speciesCode: 'GHG', speciesName: '果核蛋龟', status: '正常饲养', nextGrowthAt: today },
          { id: 'sold', code: '已售出', batchId: 'batch', status: '已转让', nextGrowthAt: today }
        ], keptSpecies: ['GHG'],
        memos: [
          { id: 'growth', title: '该给光头记录成长啦', turtleId: 'a', growthReminder: true, reminderEnabled: true, dueDate: today, remindTime: '09:00', repeat: false },
          { id: 'care', title: '喂食', remindTime: '10:00', repeat: true },
          { id: 'other', title: '换水', remindTime: '11:00', repeat: true },
          { id: 'batch-growth', title: '批次成长', turtleId: 'b', batchId: 'batch', growthReminder: true, reminderEnabled: true, dueDate: '2026-01-01', remindTime: '09:00', repeat: false }
        ]
      };
      state.registeredUsers = [{ phone: 'preview', accountName: '测试', data: accountDataSnapshot(state) }];
      edgeBackSnapshots = []; render();
      const next = new Date(); next.setDate(next.getDate() + 30);
      return { data: accountDataSnapshot(state), today, next: formatDate(next) };
    });
    assert.equal(await page.locator('[data-skip-growth-task]').count(), 2);
    assert.equal(await page.locator('[data-start-task="growth"]').textContent(), '记录成长');
    assert.equal(await page.locator('[data-skip-growth-task="growth"]').textContent(), '取消');
    assert.equal(await page.locator('[data-start-task="care"]').textContent(), '已完成');
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(theme => setState({ themeColor: theme }, { pageMotion: 'none' }), theme);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width}: overflow`);
      for (const selector of ['[data-start-task="growth"]', '[data-skip-growth-task="growth"]']) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, `${theme}/${width}: touch target`);
      }
      if (width === 390) await page.locator('.work-tasks').screenshot({ path: path.join(root, 'output', artifactName(`growth-reminder-actions-${theme}.png`)) });
    }
    await page.evaluate(() => {
      window.staleGrowthRecord = document.querySelector('[data-start-task="growth"]');
      window.staleGrowthCancel = document.querySelector('[data-skip-growth-task="growth"]');
    });
    await page.locator('[data-skip-growth-task="growth"]').click();
    assert.equal(await page.evaluate(() => state.page), 'home');
    assert.equal(await page.locator('[data-start-task="growth"]').count(), 0);
    assert.equal(await page.locator('[data-start-task="care"]').count(), 1);
    assert.match(await page.locator('.toast').textContent(), /已取消本次成长提醒/);
    const after = await page.evaluate(() => accountDataSnapshot(state));
    assert.equal(after.memos[0].dueDate, baseline.next);
    assert.equal(after.memos[0].reminderEnabled, true);
    assert.equal(after.memos[0].lastCompletedDate, undefined, 'skip must not claim completion');
    assert.equal(after.turtles[0].nextGrowthAt, baseline.next);
    const { updatedAt, nextGrowthAt, ...unchanged } = after.turtles[0];
    const { nextGrowthAt: previousDate, ...before } = baseline.data.turtles[0];
    assert.deepEqual(unchanged, before, 'skip must not create measurements or edit archive fields');
    for (const field of ['careRecords', 'ledgerRecords', 'activityLogs']) assert.deepEqual(after[field], baseline.data[field]);
    await page.evaluate(() => { staleGrowthCancel.click(); staleGrowthRecord.click(); });
    assert.equal(await page.evaluate(() => state.page), 'home', 'detached controls cannot reopen cancelled task');
    assert.equal(await page.evaluate(() => state.memos[0].dueDate), baseline.next, 'double click must not skip two cycles');
    const saved = await page.evaluate(() => loadState());
    assert.equal(saved.memos[0].dueDate, baseline.next, 'persisted across app restart');
    assert.equal(Care.dueMemos(saved.memos, baseline.today, saved.turtles).some(m => m.id === 'growth'), false);
    assert.equal(Care.dueMemos(saved.memos, baseline.next, saved.turtles).some(m => m.id === 'growth'), true);
    const source = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
    const serverDue = vm.runInNewContext('(' + source.slice(source.indexOf('function careReminderDue('), source.indexOf('\nasync function notifyCareReminder')) + ')');
    assert.equal(serverDue(saved.memos[0], { date: baseline.today, time: '09:00' }, saved.turtles), false);
    assert.equal(serverDue(saved.memos[0], { date: baseline.next, time: '09:00' }, saved.turtles), true, 'existing server schedules next cycle');
    const merged = Merge.merge({ data: baseline.data }, { data: after }, { data: baseline.data });
    assert.equal(merged.conflicts.length, 0);
    assert.equal(merged.snapshot.data.memos[0].dueDate, baseline.next, 'stale other-device snapshot cannot resurrect skipped occurrence');
    await page.locator('[data-skip-growth-task="batch-growth"]').click();
    const batch = await page.evaluate(() => state.turtles);
    assert.equal(batch[1].nextGrowthAt, baseline.next);
    assert.equal(batch[2].nextGrowthAt, baseline.next);
    assert.equal(batch[3].nextGrowthAt, baseline.today, 'sold archive unaffected');
    await page.evaluate(today => setState({ memos: state.memos.map(m => m.id === 'growth' ? { ...m, dueDate: today } : m) }), baseline.today);
    await page.locator('[data-start-task="growth"]').click();
    assert.equal(await page.evaluate(() => state.page), 'turtleDetail');
    assert.equal(await page.evaluate(() => state.growthTaskMemoId), 'growth');
    assert.equal(await page.evaluate(() => state.updatingTurtleId), 'a');
    await page.evaluate(today => {
      const liveGrowth = { id: 'live', title: '有效成长提醒', growthReminder: true, turtleId: 'a', dueDate: today, remindTime: '09:00' };
      const ghost = { ...liveGrowth, id: 'ghost', title: '不存在档案的成长提醒', turtleId: 'removed' };
      setState({ page: 'home', growthTaskMemoId: '', memos: [liveGrowth, ghost,
        { id: 'care', title: '喂食', remindTime: '10:00', repeat: true },
        { id: 'orphan-linked', title: '不存在档案的关联提醒', turtleId: 'removed', remindTime: '10:00' }] });
      window.liveRecordBeforeDeletion = document.querySelector('[data-start-task="live"]');
      window.liveCancelBeforeDeletion = document.querySelector('[data-skip-growth-task="live"]');
    }, baseline.today);
    assert.equal(await page.locator('[data-start-task="ghost"]').count(), 0);
    assert.equal(await page.locator('[data-start-task="orphan-linked"]').count(), 0);
    assert.equal(await page.locator('.work-tasks .work-heading span').textContent(), '2 项');
    await page.evaluate(() => {
      // Keep the old DOM to exercise a click that races with an archive refresh.
      state.turtles = state.turtles.filter(turtle => turtle.id !== 'a');
      liveRecordBeforeDeletion.click();
      liveCancelBeforeDeletion.click();
      render();
    });
    assert.equal(await page.evaluate(() => state.page), 'home');
    assert.equal(await page.evaluate(() => state.growthTaskMemoId), '');
    assert.equal(await page.locator('[data-start-task="live"]').count(), 0);
    assert.equal(await page.locator('[data-start-task="care"]').count(), 1);
    assert.equal(await page.locator('.work-tasks .work-heading span').textContent(), '1 项');
    assert.doesNotMatch(await page.locator('body').textContent(), /关联档案已不存在/);
    await page.evaluate(() => setState({ page: 'memos', careTab: 'reminders', memoTab: 'all' }));
    assert.equal(await page.locator('.memo-row').count(), 1);
    assert.equal(await page.locator('.memo-row .memo-main strong').textContent(), '喂食');
    const persistedOrphans = await page.evaluate(() => {
      state = { ...state, ...loadState(), page: 'home' };
      render();
      return { memos: state.memos, records: state.careRecords };
    });
    assert.equal(await page.locator('[data-start-task="live"]').count(), 0, 'restart still suppresses orphan reminder');
    assert.equal(persistedOrphans.memos.length, 4, 'filtering does not silently delete synced reminder records');
    assert.equal(persistedOrphans.memos.find(m => m.id === 'live').dueDate, baseline.today, 'missing archive cannot be postponed by stale cancel');
    assert.deepEqual(errors, []);
    console.log(`PASS (${engine}): skip, no fake growth records, persistence, sync merge, server next cycle, batch, stale clicks, record entry and mobile layouts.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
