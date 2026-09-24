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
      data: { ...user.data, turtlePools: [{ id: 'p1', name: '1号苗池', type: 'hatchling', count: 5 }] } })).user;
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
    await page.getByRole('button', { name: '保存养护记录', exact: true }).click();
    await page.waitForFunction(() => state.careRecords.length === 1);
    assert.match(await page.locator('.care-record').innerText(), /喂食[\s\S]*1号苗池[\s\S]*龟粮/);
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
    await page.getByRole('button', { name: '添加护理', exact: true }).click();
    assert.equal(await page.locator('.memo-row').count(), 1);
    await page.getByRole('tab', { name: '养护', exact: true }).click();
    await page.waitForFunction(() => !readPendingCloudData() && !cloudSyncInFlight);
    user = (await post('/api/account/load', auth)).user;
    assert.equal(user.data.careRecords.length, 4);
    assert.equal(user.data.careCustomItems.length, 0);
    assert.equal(user.data.memos.length, 1);
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
    const beforeSwitch = await page.evaluate(() => accountDataSnapshot());
    await page.locator('[data-new-care="manual"]').click();
    await page.locator('[name="manualTitle"]').fill('账号A的草稿');
    await page.evaluate(() => setState({ loggedInPhone: 'other-account', ...emptyAccountData() }, { skipSave: true }));
    assert.equal(await page.evaluate(() => state.careDraft), null);
    assert.equal(await page.locator('.care-record').count(), 0);
    assert.equal(beforeSwitch.careCustomItems.length, 1);
    const oldRecord = user.data.careRecords.find(row => row.poolId === 'p1');
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
