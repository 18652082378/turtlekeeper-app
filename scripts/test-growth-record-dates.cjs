'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
const platform = process.env.MOBILE_UI_PLATFORM || 'web';
const assetRoot = platform === 'ios' ? path.join(root, 'ios/App/App/public')
  : platform === 'android' ? path.join(root, 'android/app/src/main/assets/public') : root;
const origin = 'https://growth-dates.test';
const now = '2026-11-18T04:00:00.000Z';
const photo = '/assets/species/GHG.jpg';
const snapshot = (weight, length, poolId = 'current-pool', health = '健康') => ({
  code: '补录测试龟', weight, carapaceLength: length, poolId, poolName: poolId, health, status: '正常饲养'
});
const fixture = {
  id: 'dated-turtle', code: '补录测试龟', speciesCode: 'GHG', speciesName: '果核蛋龟',
  status: '正常饲养', gender: '母', health: '健康', weight: 100, carapaceLength: 7,
  poolId: 'current-pool', photo, price: 50, acquiredDate: '2026-09-01',
  createdAt: '2026-09-01T04:00:00.000Z', nextGrowthAt: '2026-12-10',
  measureHistory: [
    { id: 'november', oldLength: 6, newLength: 7, oldSnapshot: snapshot(70, 6), newSnapshot: snapshot(100, 7), oldPhoto: photo, newPhoto: photo, updatedAt: '2026-11-10T04:00:00.000Z' },
    { id: 'october', oldLength: 4, newLength: 6, oldSnapshot: snapshot(40, 4), newSnapshot: snapshot(70, 6), oldPhoto: photo, newPhoto: photo, updatedAt: '2026-10-20T04:00:00.000Z' }
  ]
};

(async () => {
  const browser = await launchBrowser();
  const results = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { ok: false, message: 'Synthetic offline test' } });
      const file = path.resolve(assetRoot, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(assetRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date(now));
    await page.goto(origin + '/?skipIntro=1');
    await page.evaluate(({ fixture, now }) => {
      dismissTradeIntro?.(); TurtleReleaseNotes?.cancel();
      state = { ...initialState, ...emptyAccountData(), page: 'turtleDetail', selectedTurtleId: fixture.id,
        loggedInPhone: 'growth-date-test', cloudToken: '', policyConsentRequired: false,
        registeredUsers: [{ phone: 'growth-date-test', accountName: '成长日期测试', data: { ...emptyAccountData(), turtles: [fixture], keptSpecies: ['GHG'] } }],
        turtles: [fixture], keptSpecies: ['GHG'],
        turtlePools: [{ id: 'current-pool', name: '当前龟池', type: 'adult' }, { id: 'old-pool', name: '旧龟池', type: 'adult' }],
        memos: [{ id: 'growth-reminder', turtleId: fixture.id, growthReminder: true, reminderEnabled: true,
          dueDate: '2026-12-10', remindTime: '09:00', title: '已有提醒', updatedAt: now }]
      };
      forceUpdateState = { required: false };
      window.growthDateMessages = [];
      toast = message => growthDateMessages.push(message);
      saveState({ skipCloud: true });
      render();
    }, { fixture, now });
    const form = page.locator('#turtleDetailForm');
    const openEditor = async () => {
      await page.evaluate(() => {
        setState({ page: 'turtleDetail', selectedTurtleId: 'dated-turtle', updatingTurtleId: 'dated-turtle',
          turtleDetailDraftId: '', turtleDetailDraft: null, updateDraftPhoto: '', growthTaskMemoId: '' }, { skipSave: true });
      });
      await form.waitFor();
    };
    const save = async (date, weight, length) => {
      await openEditor();
      await form.locator('[name="recordDate"]').fill(date);
      await form.locator('[name="weight"]').fill(String(weight));
      await form.locator('[name="carapaceLength"]').fill(String(length));
      await form.locator('[type="submit"]').click();
      await page.waitForFunction(() => !document.querySelector('#turtleDetailForm'));
    };
    const turtle = () => page.evaluate(() => JSON.parse(JSON.stringify(state.turtles[0])));
    const check = async (name, run) => { await run(); results.push(name); console.log('PASS ' + name); };
    await check('Record date defaults to today and survives choice and photo rerenders', async () => {
      await openEditor();
      assert.equal(await form.locator('[name="recordDate"]').inputValue(), '2026-11-18');
      for (const width of [280, 320, 390, 720]) {
        await page.setViewportSize({ width, height: 844 });
        const bounds = await form.locator('[name="recordDate"]').boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, JSON.stringify({ width, bounds }));
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await form.locator('[name="recordDate"]').fill('2026-11-05');
      await form.locator('[name="weight"]').fill('80');
      await form.locator('[name="carapaceLength"]').fill('6.5');
      await form.locator('[data-detail-choice="gender"][data-choice-value="公"]').click();
      assert.equal(await form.locator('[name="recordDate"]').inputValue(), '2026-11-05');
      await form.locator('[data-update-photo-input]').setInputFiles({
        name: 'historical.png', mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=', 'base64')
      });
      await page.waitForFunction(() => Boolean(state.updateDraftPhoto));
      assert.equal(await form.locator('[name="recordDate"]').inputValue(), '2026-11-05');
      assert.equal(await form.locator('[name="weight"]').inputValue(), '80');
    });
    await check('Backdated measurement preserves latest measurements, photo, pool, health and reminder', async () => {
      const priorMemo = await page.evaluate(() => JSON.stringify(state.memos));
      await form.locator('[name="poolId"]').selectOption('old-pool');
      await form.locator('[data-detail-choice="health"][data-choice-value="生病"]').click();
      await form.locator('[type="submit"]').click();
      await page.waitForFunction(() => !document.querySelector('#turtleDetailForm'));
      const saved = await turtle();
      assert.equal(saved.weight, 100); assert.equal(saved.carapaceLength, 7);
      assert.equal(saved.photo, photo); assert.equal(saved.poolId, 'current-pool'); assert.equal(saved.health, '健康');
      assert.equal(saved.nextGrowthAt, '2026-12-10');
      assert.equal(await page.evaluate(() => JSON.stringify(state.memos)), priorMemo);
      assert.equal(saved.measureHistory.length, 3);
      assert.deepEqual(saved.measureHistory.map(item => String(item.updatedAt).slice(0, 10)), ['2026-11-10', '2026-11-05', '2026-10-20']);
      assert.equal(saved.measureHistory[0].oldSnapshot.weight, 80);
      assert.equal(saved.measureHistory[1].oldSnapshot.weight, 70);
      assert.equal(saved.measureHistory[1].newSnapshot.weight, 80);
      assert.equal(saved.measureHistory[1].newSnapshot.poolId, 'old-pool');
      assert.equal(saved.measureHistory[1].newSnapshot.health, '生病');
      assert.equal(String(saved.measureHistory[1].savedAt).slice(0, 10), '2026-11-18');
    });
    await check('Growth curve uses chronological dates and actual spacing between them', async () => {
      await page.evaluate(() => setState({ page: 'turtleDetail', updatingTurtleId: '' }, { skipSave: true }));
      const points = await page.locator('.detail-growth-chart .detail-chart-point.weight').evaluateAll(nodes => nodes.map(node => ({
        x: Number(node.getAttribute('cx')), text: node.parentElement.querySelector('title').textContent
      })));
      assert.deepEqual(points.map(point => point.text.match(/\d{4}-\d{2}-\d{2}/)?.[0]), ['2026-09-01', '2026-10-20', '2026-11-05', '2026-11-10']);
      assert.deepEqual(points.map(point => Number(point.text.match(/·\s*(\d+(?:\.\d+)?)g/)?.[1])), [40, 70, 80, 100]);
      const longGap = points[2].x - points[1].x, shortGap = points[3].x - points[2].x;
      assert.ok(longGap > shortGap * 2.9 && longGap < shortGap * 3.5, JSON.stringify(points));
    });
    await check('Backdated observation with the same measurements is kept as its own date', async () => {
      await save('2026-11-06', 100, 7);
      const saved = await turtle();
      assert.equal(saved.measureHistory.length, 4);
      assert.equal(saved.measureHistory.find(item => String(item.updatedAt).startsWith('2026-11-06')).newSnapshot.weight, 100);
      assert.equal(saved.weight, 100);
    });
    await check('Today and repeated same-day observations keep the newest observation current', async () => {
      await save('2026-11-18', 120, 8);
      await save('2026-11-18', 130, 8.5);
      const saved = await turtle();
      assert.equal(saved.weight, 130);
      assert.equal(saved.measureHistory[0].newSnapshot.weight, 130);
      assert.equal(saved.measureHistory[1].newSnapshot.weight, 120);
      assert.equal(saved.measureHistory[0].oldSnapshot.weight, 120);
      assert.equal(saved.measureHistory[0].updatedAt.slice(0, 10), '2026-11-18');
    });
    await check('Invalid and future dates cannot modify the archive', async () => {
      for (const invalid of ['2026-02-30', 'wrong-date', '2026-11-19']) {
        await openEditor();
        const before = await page.evaluate(() => JSON.stringify({ turtles: state.turtles, ledgerRecords: state.ledgerRecords, memos: state.memos }));
        await page.evaluate(invalid => {
          const form = document.querySelector('#turtleDetailForm');
          const field = form.elements.namedItem('recordDate');
          field.type = 'text'; field.value = invalid;
          form.elements.namedItem('weight').value = '999';
          submitTurtleDetail({ preventDefault() {}, currentTarget: form });
        }, invalid);
        assert.equal(await page.evaluate(() => JSON.stringify({ turtles: state.turtles, ledgerRecords: state.ledgerRecords, memos: state.memos })), before);
        assert.equal(await form.count(), 1);
      }
    });
    await check('Selected historical dates, measurements and latest state survive a restart', async () => {
      const before = await turtle();
      await page.reload();
      assert.deepEqual(await turtle(), before);
      assert.equal((await turtle()).measureHistory.length, 6);
    });
    await check('A record before initial measurement keeps that measurement and remains compatible with cloud deletion', async () => {
      await page.evaluate(({ fixture, now }) => {
        state.turtles = [{ ...fixture, weight: 200, carapaceLength: 10, createdAt: '2026-11-10T04:00:00.000Z', measureHistory: [] }];
        state.memos = [{ id: 'growth-reminder', turtleId: fixture.id, growthReminder: true, reminderEnabled: true,
          dueDate: '2026-12-10', remindTime: '09:00', title: '已有提醒', updatedAt: now }];
        saveState({ skipCloud: true });
      }, { fixture, now });
      await save('2026-09-20', 30, 3);
      const saved = await turtle();
      assert.equal(saved.weight, 200); assert.equal(saved.carapaceLength, 10);
      assert.equal(saved.historyIncludesInitial, true);
      assert.equal(saved.measureHistory.length, 2);
      assert.equal(saved.measureHistory[0].initialMeasurement, true);
      assert.equal(saved.measureHistory[0].newSnapshot.weight, 200);
      assert.equal(saved.measureHistory[1].newSnapshot.weight, 30);
      const historicalId = saved.measureHistory[1].id;
      const localRebuild = await page.evaluate(id => deleteGrowthRecordAndRebuild(state.turtles[0], id), historicalId);
      assert.equal(localRebuild.turtle.weight, 200);
      const serverSource = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
      const helpers = serverSource.slice(serverSource.indexOf('function applyGrowthSnapshotToTurtle('), serverSource.indexOf('function isSuspiciousAccountDataLoss('));
      const server = { turtle: saved, historyId: historicalId };
      vm.runInNewContext(helpers + '\nresult = deleteGrowthRecordAndRebuild(turtle, historyId);', server);
      assert.deepEqual(JSON.parse(JSON.stringify(server.result)), JSON.parse(JSON.stringify(localRebuild)));
      await page.evaluate(() => setState({ page: 'turtleDetail', updatingTurtleId: '' }, { skipSave: true }));
      const dates = await page.locator('.detail-growth-chart .detail-chart-point.weight').evaluateAll(nodes => nodes.map(node =>
        node.parentElement.querySelector('title').textContent.match(/\d{4}-\d{2}-\d{2}/)?.[0]));
      assert.deepEqual(dates, ['2026-09-20', '2026-11-10']);
    });
    const resetArchive = changes => page.evaluate(({ fixture, changes }) => {
      state.turtles = [{ ...fixture, ...changes }];
      state.selectedTurtleId = fixture.id;
      saveState({ skipCloud: true });
    }, { fixture, changes });
    await check('A past measurement cannot undo newer metadata-only changes', async () => {
      const currentPhoto = photo + '?current-photo';
      await resetArchive({ code: '后来修改的昵称', poolId: 'old-pool', health: '生病', photo: currentPhoto,
        carapaceWidth: '3.5', shellHeight: '2.5', plastronLength: '4.5' });
      await save('2026-11-05', 80, 6.5);
      const saved = await turtle();
      assert.equal(saved.weight, 100); assert.equal(saved.carapaceLength, 7);
      assert.equal(saved.code, '后来修改的昵称'); assert.equal(saved.poolId, 'old-pool');
      assert.equal(saved.health, '生病'); assert.equal(saved.photo, currentPhoto);
      assert.equal(saved.carapaceWidth, '3.5'); assert.equal(saved.shellHeight, '2.5'); assert.equal(saved.plastronLength, '4.5');
    });
    await check('A historical observation after the last measurement preserves the existing reminder schedule', async () => {
      await resetArchive({});
      const priorMemo = await page.evaluate(() => JSON.stringify(state.memos));
      await save('2026-11-15', 110, 7.5);
      const saved = await turtle();
      assert.equal(saved.weight, 110); assert.equal(saved.carapaceLength, 7.5);
      assert.equal(saved.nextGrowthAt, '2026-12-10');
      assert.equal(await page.evaluate(() => JSON.stringify(state.memos)), priorMemo);
      assert.equal(saved.measureHistory[0].recordDate, '2026-11-15');
    });
    await check('Legacy date-only measurements and an invalid creation date remain usable when backfilling', async () => {
      await resetArchive({ createdAt: 'invalid-created-date', weight: 90, carapaceLength: 7,
        measureHistory: [{ id: 'legacy-date', date: '2026-11-01', weight: 90, carapaceLength: 7 }] });
      await save('2026-10-25', 80, 6.5);
      const saved = await turtle();
      assert.equal(saved.weight, 90); assert.equal(saved.carapaceLength, 7);
      assert.equal(saved.measureHistory[0].id, 'legacy-date');
      assert.equal(String(saved.measureHistory[0].updatedAt).slice(0, 10), '2026-11-01');
      assert.equal(saved.measureHistory[0].newSnapshot.weight, 90);
      assert.equal(saved.measureHistory[1].recordDate, '2026-10-25');
      await page.evaluate(() => setState({ page: 'turtleDetail', updatingTurtleId: '' }, { skipSave: true }));
      assert.ok(!/NaN|Invalid Date/.test(await page.locator('.detail-growth-chart').innerText()));
    });
    await check('Existing measurements before archive creation keep chronological chart dates after backfill', async () => {
      await resetArchive({ createdAt: '2026-11-10T04:00:00.000Z' });
      await save('2026-10-01', 60, 5.5);
      const saved = await turtle();
      assert.equal(saved.weight, 100);
      assert.ok(saved.measureHistory.some(item => item.id === 'october'));
      assert.ok(saved.measureHistory.some(item => item.id === 'november'));
      await page.evaluate(() => setState({ page: 'turtleDetail', updatingTurtleId: '' }, { skipSave: true }));
      const dates = await page.locator('.detail-growth-chart .detail-chart-point.weight').evaluateAll(nodes => nodes.map(node =>
        node.parentElement.querySelector('title').textContent.match(/\d{4}-\d{2}-\d{2}/)?.[0]));
      assert.equal(dates[0], '2026-10-01');
      assert.equal(dates.at(-1), '2026-11-10');
      assert.deepEqual(dates, [...dates].sort());
    });
    assert.deepEqual(errors, []);
    recordResult(root, 'growth-record-dates-' + platform + '.json', { results });
    console.log(`PASS ${platform}: ${results.length} dated growth workflows with local-only test records.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
