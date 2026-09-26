const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const Care = require('../assets/care-records');
const Merge = require('../assets/account-merge');
const root = path.resolve(__dirname, '..');

async function main() {
  assert.equal(Care.validDate('2026-02-30'), false);
  assert.equal(Care.validDate('2024-02-29'), true);
  assert.deepEqual(Care.normalizeItems([{ id: 'x', title: '喂食' }, { id: 'feeding', title: '自定义' }]), []);
  assert.deepEqual(Care.normalizeTurtleRefs([null, { id: 'a', code: 'A' }, { id: 'a', code: 'duplicate' }]), [{ id: 'a', code: 'A', speciesName: '' }]);
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'turtle-care-test-'));
  const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const base = `http://127.0.0.1:${port}`;
  let logs = '', browser;
  const child = spawn(process.execPath, ['server/server.js'], { cwd: root, windowsHide: true,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TURTLE_RUNTIME_DIR: runtime,
      MYSQL_URL: '', MYSQL_HOST: '', MYSQL_STORAGE_MODE: 'legacy', SMS_PROVIDER: 'mock', SMS_MOCK: 'true',
      APNS_KEY_PATH: '', APNS_KEY_ID: '', APNS_TEAM_ID: '', ALIPAY_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  const post = async (route, body) => {
    const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ termsVersion: '2026-09-01', ...body }) });
    const data = await response.json();
    assert.equal(response.ok, true, `${route}: ${JSON.stringify(data)}`);
    return data;
  };
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(base + '/api/app/version?build=999')).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    const phone = '13900000007';
    const sms = await post('/api/sms/send', { phone, purpose: 'register' });
    let { user } = await post('/api/account/register', { phone, password: 'CareTestPass123', code: sms.code, termsAccepted: true, termsVersion: '2026-09-01', accountName: '养护测试' });
    const auth = { phone, token: user.token };
    user = (await post('/api/account/save', { ...auth, baseDataRevision: user.dataRevision, accountName: user.accountName,
      data: { ...user.data, turtles: [
        { id: 'g1', code: '小果', speciesCode: 'GHG', speciesName: '果核蛋龟', health: '健康', poolId: 'p1' },
        { id: 'r1', code: '小红', speciesCode: 'HMG', speciesName: '红面泥龟', health: '生病', poolId: 'p1' },
        { id: 'b1', code: '批次1号', speciesCode: 'GHG', speciesName: '果核蛋龟', batchId: 'batch1', batchName: '九月苗', poolId: 'p1' },
        { id: 'b2', code: '批次2号', speciesCode: 'GHG', speciesName: '果核蛋龟', batchId: 'batch1', batchName: '九月苗', poolId: 'p1' },
        ...Array.from({ length: 61 }, (_, i) => ({ id: `extra-${i}`, code: `多页龟-${i}`, speciesCode: 'GHG', speciesName: '果核蛋龟' })),
        { id: 'gone', code: '已售出', speciesCode: 'GHG', speciesName: '果核蛋龟', status: '已转让' }
      ], turtlePools: [{ id: 'p1', name: '1号苗池', type: 'hatchling', count: 5 }] } })).user;
    browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: `window.TURTLE_API_BASE_URL=${JSON.stringify(base)}; window.TURTLE_APP_BUILD=999;` });
      return route.continue();
    });
    await page.addInitScript(user => {
      if (localStorage.getItem('turtlekeeper-state-v1')) return;
      localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ ...user.data, page: 'home', loggedInPhone: user.phone,
        cloudToken: user.token, accountName: user.accountName, policyConsentRequired: false, registeredUsers: [{ ...user, cloudToken: user.token }] }));
    }, user);
    await page.goto(base + '/?skipIntro=1');
    await page.waitForFunction(() => cloudHydrationComplete);
    await page.locator('.home-module-panel [data-page="memos"]').click();
    assert.equal(await page.getByRole('tab', { name: '养护', exact: true }).getAttribute('aria-selected'), 'true');
    await page.locator('[data-new-care="feeding"]').click();
    await page.locator('[name="date"]').fill('2026-09-20');
    await page.locator('[name="poolId"]').selectOption('p1');
    await page.locator('[name="note"]').fill('龟粮，食欲正常');
    await page.locator('#careForm .archive-directory-trigger').click();
    assert.equal(await page.locator('[data-directory-select-all]').isVisible(), false);
    await page.locator('[data-directory-search]').fill('小红');
    await page.locator('.directory-archive-card').click();
    await page.locator('[data-directory-clear]').click();
    await page.locator('.directory-species-card').filter({ hasText: '果核蛋龟' }).click();
    await page.locator('[data-directory-select-all]').click();
    assert.match(await page.locator('[data-directory-confirm]').innerText(), /65 只/, 'select all includes collapsed batch members and all pages, retaining other species');
    assert.equal(await page.locator('[data-directory-select-all]').innerText(), '取消全选');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await page.locator('[data-directory-select-all]').isVisible());
    }
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'output/care-species-select-all.png'), animations: 'disabled' });
    await page.locator('[data-directory-select-all]').click();
    assert.match(await page.locator('[data-directory-confirm]').innerText(), /1 只/, 'deselect all preserves other species');
    await page.locator('[data-directory-kind="batch"]').click();
    await page.locator('[data-directory-select-all]').click();
    assert.match(await page.locator('[data-directory-confirm]').innerText(), /3 只/, 'batch filter selects individual members');
    await page.locator('[data-directory-select-all]').click();
    await page.locator('[data-directory-kind="all"]').click();
    await page.locator('[data-directory-health]').selectOption('健康');
    await page.locator('[data-directory-select-all]').click();
    assert.match(await page.locator('[data-directory-confirm]').innerText(), /2 只/, 'health filter limits bulk scope');
    await page.locator('[data-directory-select-all]').click();
    await page.locator('[data-directory-search]').fill('无匹配');
    assert.equal(await page.locator('[data-directory-select-all]').isDisabled(), true);
    await page.locator('[data-directory-close]').click();
    assert.equal(await page.locator('[data-care-remove-turtle]').count(), 0, 'closing discards unconfirmed bulk selections');
    await page.locator('#careForm .archive-directory-trigger').click();
    await page.locator('[data-directory-search]').fill('小果');
    await page.locator('.directory-archive-card').click();
    assert.match(await page.locator('[data-directory-confirm]').innerText(), /1 只/);
    await page.locator('[data-directory-search]').fill('小红');
    await page.locator('.directory-archive-card').click();
    await page.locator('[data-directory-health]').selectOption('健康');
    assert.equal(await page.locator('.directory-archive-card').count(), 0);
    assert.match(await page.locator('[data-directory-confirm]').innerText(), /2 只/);
    await page.locator('[data-directory-health]').selectOption('');
    await page.locator('[data-directory-search]').fill('九月苗');
    await page.locator('.directory-archive-card').click();
    await page.locator('[data-directory-search]').fill('批次2号');
    await page.locator('.directory-archive-card').click();
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'output/care-turtle-multiselect.png'), animations: 'disabled' });
    await page.locator('[data-directory-confirm]').click();
    assert.equal(await page.locator('[name="note"]').inputValue(), '龟粮，食欲正常');
    assert.equal(await page.locator('[data-care-remove-turtle]').count(), 3);
    // Dismissing the dialog rolls back unconfirmed changes.
    await page.locator('#careForm .archive-directory-trigger').click();
    await page.locator('[data-directory-search]').fill('小果');
    await page.locator('.directory-archive-card').click();
    await page.locator('[data-directory-close]').click();
    assert.equal(await page.locator('[data-care-remove-turtle]').count(), 3);
    await page.locator('[data-care-remove-turtle="b2"]').click();
    await page.getByRole('button', { name: '保存养护记录', exact: true }).click();
    await page.waitForFunction(() => state.careRecords.length === 1);
    assert.match(await page.locator('.care-record').innerText(), /喂食[\s\S]*1号苗池[\s\S]*龟粮/);
    assert.match(await page.locator('.care-record-turtles').innerText(), /关联 2 只.*小果.*小红/);
    await page.locator('[data-edit-care]').click();
    assert.equal(await page.locator('[data-care-remove-turtle]').count(), 2);
    await page.locator('#careForm .archive-directory-trigger').click();
    await page.locator('[data-directory-search]').fill('已售出');
    assert.equal(await page.locator('.directory-archive-card').count(), 0);
    await page.locator('[data-directory-search]').fill('小果');
    assert.equal(await page.locator('.directory-archive-card').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-directory-close]').click();
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.locator('[data-new-care="water"]').click();
    await page.getByRole('button', { name: '保存养护记录', exact: true }).click();
    await page.locator('[data-new-care="manual"]').click();
    await page.locator('[name="manualTitle"]').fill('清洗过滤器');
    await page.locator('[name="note"]').fill('冲洗滤棉');
    await page.getByRole('button', { name: '保存养护记录', exact: true }).click();
    const customId = await page.evaluate(() => state.careCustomItems[0].id);
    await page.waitForFunction(() => !readPendingCloudData() && !cloudSyncInFlight);
    assert.equal((await post('/api/account/load', auth)).user.data.careCustomItems[0].title, '清洗过滤器');
    await page.locator('[data-new-care="feeding"]').click();
    await page.locator('[name="note"]').fill('第二次记录');
    await page.locator('[data-care-picker]').click();
    assert.equal(await page.locator('[data-care-delete-choice="feeding"], [data-care-delete-choice="water"]').count(), 0);
    await page.locator(`[data-care-choice="${customId}"]`).click();
    assert.equal(await page.locator('[name="note"]').inputValue(), '第二次记录');
    await page.getByRole('button', { name: '保存养护记录', exact: true }).click();
    assert.equal(await page.evaluate(() => state.careCustomItems.length), 1);
    await page.locator('[data-new-care="feeding"]').click();
    await page.locator('[data-care-picker]').click();
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.toast')?.remove(); });
    await page.screenshot({ path: path.join(root, 'output/care-picker.png'), animations: 'disabled' });
    await page.locator(`[data-care-delete-choice="${customId}"]`).click();
    assert.equal(await page.evaluate(() => state.careRecords.filter(r => r.title === '清洗过滤器').length), 2);
    assert.equal(await page.locator(`[data-care-choice="${customId}"]`).count(), 0);
    assert.equal(await page.locator('[data-care-choice="feeding"], [data-care-choice="water"]').count(), 2);
    await page.locator('[data-care-picker]').click();
    await page.locator('[data-cancel-care]').click();
    // Editing a historical record must not recreate a deleted suggestion.
    await page.locator('.care-record').filter({ hasText: '第二次记录' }).locator('[data-edit-care]').click();
    await page.locator('[name="note"]').fill('修改后的说明');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    assert.equal(await page.evaluate(() => state.careCustomItems.length), 0);
    await page.getByRole('tab', { name: '提醒', exact: true }).click();
    await page.locator('[data-new-memo]').click();
    await page.locator('[name="title"]').fill('每周换水');
    await page.locator('[name="remindTime"]').fill('09:00');
    await page.getByRole('button', { name: '添加提醒', exact: true }).click();
    assert.equal(await page.locator('.memo-row').count(), 1);
    await page.getByRole('tab', { name: '养护', exact: true }).click();
    await page.waitForFunction(() => !readPendingCloudData() && !cloudSyncInFlight);
    user = (await post('/api/account/load', auth)).user;
    assert.equal(user.data.careRecords.length, 4);
    assert.equal(user.data.careCustomItems.length, 0);
    assert.equal(user.data.memos.length, 1);
    assert.deepEqual(user.data.careRecords.find(row => row.itemId === 'feeding').turtleRefs.map(ref => ref.id), ['g1', 'r1']);
    // An old care client strips the new field when saving other changes.
    const legacyCareData = { ...user.data, turtles: user.data.turtles.filter(turtle => turtle.id !== 'g1'), careRecords: user.data.careRecords.map(({ turtleRefs, ...record }) => record) };
    user = (await post('/api/account/save', { ...auth, baseDataRevision: user.dataRevision, accountName: user.accountName, data: legacyCareData })).user;
    assert.equal(user.data.careRecords.find(row => row.itemId === 'feeding').turtleRefs.length, 2);
    // Older clients cannot erase the newly introduced collections by omission.
    const oldData = { ...user.data };
    delete oldData.careRecords; delete oldData.careCustomItems;
    user = (await post('/api/account/save', { ...auth, baseDataRevision: user.dataRevision, accountName: user.accountName, data: oldData })).user;
    assert.equal(user.data.careRecords.length, 4);
    await page.reload();
    await page.waitForFunction(() => cloudHydrationComplete);
    await page.evaluate(() => setState({ page: 'memos', careTab: 'care' }));
    assert.equal(await page.locator('.care-record').count(), 4);
    assert.equal(await page.evaluate(() => state.careCustomItems.length), 0);
    assert.match(await page.locator('.care-record-turtles').innerText(), /小果/);
    await page.locator('.care-record').filter({ hasText: '龟粮，食欲正常' }).locator('[data-edit-care]').click();
    assert.equal(await page.locator('[data-care-remove-turtle]').count(), 2, 'deleted archives keep their historical links');
    await page.locator('#careForm .archive-directory-trigger').click();
    await page.locator('[data-directory-confirm]').click();
    assert.equal(await page.locator('[data-care-remove-turtle]').count(), 2, 'confirm preserves missing archive snapshots');
    await page.locator('[data-care-remove-turtle="g1"]').click();
    await page.locator('[data-care-remove-turtle="r1"]').click();
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.waitForFunction(() => !readPendingCloudData() && !cloudSyncInFlight);
    assert.deepEqual((await post('/api/account/load', auth)).user.data.careRecords.find(row => row.itemId === 'feeding').turtleRefs, [], 'explicit clearing syncs to cloud');
    await page.waitForFunction(() => !document.querySelector('#app.page-enter-motion'));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(root, 'output/care-records.png'), animations: 'disabled' });
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('[data-new-care="manual"]').click();
      await page.locator('[name="manualTitle"]').fill('<img src=x onerror=alert(1)>');
      await page.locator('[data-care-picker]').click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
      await page.locator('[data-care-picker]').press('Escape');
      await page.getByRole('button', { name: '保存养护记录', exact: true }).click();
      assert.equal(await page.locator('.care-record img').count(), 0);
    }
    // Deleting the fixed options is blocked at the handler as well as the UI.
    await page.evaluate(() => { deleteCareChoice('feeding'); deleteCareChoice('water'); });
    assert.equal(await page.evaluate(() => TurtleCare.builtins.length), 2);
    await page.locator('.care-record').filter({ hasText: '龟粮，食欲正常' }).locator('[data-delete-care]').click();
    assert.equal(await page.evaluate(() => state.careRecords.some(r => r.note === '龟粮，食欲正常')), false);
    // Repeat a bulk feeding without changing its original content or timestamp.
    await page.locator('[data-new-care="feeding"]').click();
    await page.locator('[name="note"]').fill('批量再次喂食');
    await page.locator('#careForm .archive-directory-trigger').click();
    await page.locator('.directory-species-card').filter({ hasText: '果核蛋龟' }).click();
    await page.locator('[data-directory-select-all]').click();
    await page.locator('[data-directory-confirm]').click();
    await page.getByRole('button', { name: '保存养护记录', exact: true }).click();
    const original = await page.evaluate(() => state.careRecords.find(r => r.note === '批量再次喂食'));
    await page.locator(`[data-repeat-care="${original.id}"]`).click();
    const repeated = await page.evaluate(id => state.careRecords.find(r => r.note === '批量再次喂食' && r.id !== id), original.id);
    assert.deepEqual(repeated.turtleRefs, original.turtleRefs);
    assert.equal(repeated.poolId, original.poolId);
    assert.equal(repeated.note, original.note);
    assert.notEqual(repeated.createdAt, original.createdAt);
    assert.equal(repeated.date, await page.evaluate(() => formatDate(new Date())));
    assert.deepEqual(await page.evaluate(id => state.careRecords.find(r => r.id === id), original.id), original);
    const repeatedCard = page.locator('.care-record').filter({ has: page.locator(`[data-repeat-care="${repeated.id}"]`) });
    assert.match(await repeatedCard.locator('time').innerText(), /记录于 \d{2}:\d{2}/);
    assert.equal(await repeatedCard.locator('li').count(), 0, 'full history list loads only when requested');
    await repeatedCard.locator('[data-care-view]').click();
    assert.equal(await repeatedCard.locator('li').count(), original.turtleRefs.length);
    assert.ok((await repeatedCard.locator('.care-turtle-scroll').boundingBox()).height <= 270);
    await repeatedCard.locator('[data-care-view]').click();
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const buttons = repeatedCard.locator('footer button');
      const boxes = await Promise.all([0, 1, 2].map(i => buttons.nth(i).boundingBox()));
      assert.ok(boxes.every(box => Math.abs(box.y - boxes[0].y) < 2), `actions share one row at ${width}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await repeatedCard.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, 'output/care-repeat-record.png'), animations: 'disabled' });
    await repeatedCard.locator('[data-edit-care]').click();
    await page.locator('[name="note"]').fill('修改新记录');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    assert.equal(await page.evaluate(id => state.careRecords.find(r => r.id === id).createdAt, repeated.id), repeated.createdAt);
    await page.waitForFunction(() => !readPendingCloudData() && !cloudSyncInFlight);
    const savedRepeat = (await post('/api/account/load', auth)).user.data.careRecords.find(r => r.id === repeated.id);
    assert.equal(savedRepeat.createdAt, repeated.createdAt);
    assert.deepEqual(savedRepeat.turtleRefs, original.turtleRefs);
    await page.locator(`[data-delete-care="${repeated.id}"]`).click();
    await page.locator(`[data-delete-care="${original.id}"]`).click();
    assert.match(await page.evaluate(() => careRecordTime({ createdAt: '' })), /记录时间未保存/);
    // Plans are account data, and survive old clients which omit the collection.
    await page.evaluate(() => setState({ carePlans: TurtleCare.normalizePlans([{ id: 'plan-cloud', name: '一号池晚餐', poolId: 'p1', poolName: '1号苗池', turtleRefs: [{ id: 'r1', code: '小红', speciesName: '红面泥龟' }], note: '少量龟粮' }]) }));
    await page.waitForFunction(() => !readPendingCloudData() && !cloudSyncInFlight);
    user = (await post('/api/account/load', auth)).user;
    assert.equal(user.data.carePlans[0].name, '一号池晚餐');
    assert.match(await page.locator('[data-account-save-status]').textContent(), /已同步/);
    const legacyPlans = { ...user.data }; delete legacyPlans.carePlans;
    user = (await post('/api/account/save', { ...auth, baseDataRevision: user.dataRevision, data: legacyPlans })).user;
    assert.equal(user.data.carePlans.length, 1);
    user = (await post('/api/account/save', { ...auth, baseDataRevision: user.dataRevision, data: { ...user.data, carePlans: [] } })).user;
    assert.equal(user.data.carePlans.length, 0);
    await page.evaluate(user => applyCloudUser(user), user);
    await page.evaluate(() => setState({ page: 'memos', careTab: 'care' }, { pageMotion: 'none' }));
    const beforeSwitch = await page.evaluate(() => accountDataSnapshot());
    await page.locator('[data-new-care="manual"]').click();
    await page.locator('[name="manualTitle"]').fill('账号A的草稿');
    await page.evaluate(() => setState({ loggedInPhone: 'other-account', ...emptyAccountData() }, { skipSave: true }));
    assert.equal(await page.evaluate(() => state.careDraft), null);
    assert.equal(await page.locator('.care-record').count(), 0);
    assert.equal(beforeSwitch.careCustomItems.length, 1);
    const oldRecord = { id: 'pool-history-base', itemId: 'water', title: '换水', date: '2026-09-26', poolId: 'p1', poolName: '1号苗池', turtleRefs: [] };
    const snapshot = data => ({ accountName: '', accountAvatar: '', data });
    const data = { turtlePools: user.data.turtlePools, careRecords: [oldRecord], careCustomItems: [{ id: 'c1', title: '清洗过滤器' }] };
    const merged = Merge.merge(snapshot(data), snapshot({ ...data, careCustomItems: [], careRecords: [...data.careRecords, { ...oldRecord, id: 'new1' }] }),
      snapshot({ ...data, careRecords: [...data.careRecords, { ...oldRecord, id: 'new2' }] }));
    assert.equal(merged.ready, true);
    assert.equal(merged.snapshot.data.careRecords.length, 3);
    assert.equal(merged.snapshot.data.careCustomItems.length, 0);
    const removedPool = Merge.merge(snapshot(data), snapshot({ ...data, turtlePools: [] }),
      snapshot({ ...data, careRecords: [...data.careRecords, { ...oldRecord, id: 'pool-history' }] }));
    assert.equal(removedPool.ready, true, 'historical pool snapshots do not depend on the live pool');
    assert.equal(removedPool.snapshot.data.careRecords[1].poolName, '1号苗池');
    const planBase = snapshot({ carePlans: [{ id: 'p', name: '原方案' }] });
    const planMerge = Merge.merge(planBase, snapshot({ carePlans: [] }), snapshot({ carePlans: [{ id: 'p', name: '原方案' }, { id: 'p2', name: '新方案' }] }));
    assert.equal(planMerge.ready, true);
    assert.deepEqual(planMerge.snapshot.data.carePlans.map(plan => plan.id), ['p2']);
    assert.deepEqual(errors, []);
    console.log('PASS: care UI, reusable/deletable options, immutable history, reminders, cloud save/load, legacy client compatibility, merge, 320/390/430px, escaped text.');
  } catch (error) { console.error(logs.slice(-1800)); throw error; }
  finally {
    if (browser) await browser.close();
    child.kill();
    await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    // Confine cleanup to the exact temporary test root created above.
    const resolved = path.resolve(runtime);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('turtle-care-test-')) fs.rmSync(resolved, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
