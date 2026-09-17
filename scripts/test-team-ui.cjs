// Real isolated API + packaged UI. No production traffic or real user data.
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net');
const { spawn } = require('child_process');
const assert = require('assert/strict');
const { fixture } = require('./team-test-fixture');
const { updateAccess } = require('./team-test-access.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.TEAM_TEST_ROOT ? path.resolve(process.env.TEAM_TEST_ROOT) : path.resolve(__dirname, '..');
const output = path.join(root, 'output/team-qa');
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'turtle-team-ui-'));
  const seed = fixture();
  seed.users['13900000001'].data.ledgerRecords.find(r => r.id === 'e1').category = '龟粮';
  seed.users['13900000001'].data.ledgerRecords.find(r => r.id === 'e1').turtleId = 't1';
  Object.assign(seed.users['13900000001'].data.breedingRecords.find(r => r.id === 'b2'), { incubationClosed: true, speciesCode: 'yellow', speciesName: '黄缘闭壳龟' });
  Object.assign(seed.users['13900000001'].data.ledgerRecords.find(r => r.id === 'e1'), { recordTime: '09:18:26', createdAt: '2026-09-06T02:30:45Z' });
  seed.users['13900000001'].data.ledgerRecords.push({ id: 'history-2025', type: 'purchase', title: '2025年历史购入', amount: 1000, recordDate: '2025-06-05' });
  seed.users['13900000001'].data.memos = [{ id: 'historical-care', title: '历史护理事项', content: '已有护理记录', date: '2025-06-05' }, { id: 'current-care', title: '六月十日护理', content: '换水并检查', date: '2025-06-10' }];
  seed.users['13900000001'].data.turtlePools = [{ id: 'test-pool', name: '原有种龟池', type: 'breeder', createdAt: '2025-06-10T00:00:00Z', note: '主账号原有养殖池' }];
  fs.mkdirSync(path.join(runtime, 'data')); fs.writeFileSync(path.join(runtime, 'data/app-data.json'), JSON.stringify(seed));
  const port = await new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/server.js'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), TURTLE_RUNTIME_DIR: runtime, MYSQL_HOST: '', MYSQL_URL: '', TURTLE_TEAM_TEST: '1', SMS_PROVIDER: 'mock', SMS_MOCK: 'true', APPLE_IAP_KEY_ID: '', APNS_KEY_PATH: '', APNS_KEY_BASE64: '' } });
  let browser, logs = ''; child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b);
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + '/api/app/version')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('response', async r => { if (r.url().endsWith('/api/team') && r.status() >= 400) console.log('Team request:', r.status(), await r.text()); });
    let failLedgerOnce = false, delayedGet = null;
    await page.route('**/*', async route => {
      const url = route.request().url();
      if (delayedGet && url.endsWith('/api/team') && route.request().postDataJSON()?.action === 'get') {
        const gate = delayedGet; delayedGet = null;
        const response = await route.fetch(); gate.started();
        await gate.release; await route.fulfill({ response }); gate.finished(); return;
      }
      if (failLedgerOnce && url.endsWith('/api/team') && route.request().postDataJSON()?.action === 'ledger') {
        failLedgerOnce = false; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"message":"测试：网络暂不可用"}' });
      }
      if (!url.startsWith(origin)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"posts":[],"messages":[],"listings":[]}' });
      if (url.includes('/config.js')) return route.fulfill({ contentType: 'text/javascript', body: `window.TURTLE_API_BASE_URL=${JSON.stringify(origin)}; window.TURTLE_APP_BUILD=110;` });
      return route.continue();
    });
    await page.goto(origin);
    await page.waitForFunction(() => typeof render === 'function');
    await page.evaluate(() => {
      window.dismissTradeIntro?.(); state.loggedInPhone = '13900000001'; state.cloudToken = 'team-test-token'; state.policyConsentRequired = false;
      state.page = 'team'; render();
    });
    await page.waitForSelector('.ts-workhead');
    assert.equal(await page.locator('.ts-workhead h1').textContent(), '青禾龟场');
    assert((await page.locator('.ts-sync-state').textContent()).includes('最近同步'));
    // Apply a second custom period before the first API response arrives.
    await page.locator('[data-tab="reports"]').first().click();
    await page.locator('[data-period-mode="report"]').selectOption('custom');
    await page.waitForFunction(() => !document.querySelector('[data-period-mode="report"]').disabled);
    let release, started, finished;
    const firstStarted = new Promise(r => started = r), firstFinished = new Promise(r => finished = r);
    delayedGet = { release: new Promise(r => release = r), started, finished };
    await page.locator('[data-period-start]').fill('2025-01-01');
    await page.locator('[data-period-end]').fill('2025-12-31');
    await page.locator('[data-ts="period.apply"]').click();
    await firstStarted;
    const fixtureMonth = seed.users['13900000001'].data.ledgerRecords[0].recordDate.slice(0, 7);
    await page.locator('[data-period-start]').fill(fixtureMonth + '-01');
    await page.locator('[data-period-end]').fill(fixtureMonth + '-28');
    await page.locator('[data-ts="period.apply"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-period-mode="report"]').disabled);
    release(); await firstFinished;
    await page.waitForTimeout(150);
    assert((await page.locator('[data-ts="finance.open"][data-kind="purchase"]').textContent()).includes('3,250.00'), 'late date response cannot replace the latest period totals');
    await page.locator('[data-period-mode="report"]').selectOption('month');
    await page.waitForFunction(() => !document.querySelector('[data-period-mode="report"]').disabled);
    await page.locator('[data-tab="members"]').first().click();
    await page.locator('[data-ts="invite"]').click();
    assert((await page.locator('[data-permission-preview]').textContent()).includes('不能新增、修改或删除'));
    await page.locator('[name="visibleFrom"]').fill('2025-06-09');
    await page.locator('[name="ledger"]').selectOption('edit');
    assert((await page.locator('[data-permission-preview]').textContent()).includes('2025-06-09'));
    assert((await page.locator('[data-permission-preview]').textContent()).includes('可新增或修改：账本与报表'));
    await page.screenshot({ path: path.join(output, 'permission-summary.png'), fullPage: true });
    await page.locator('[data-ts="close"]').click();
    await page.locator('[data-tab="overview"]').first().click();
    await page.locator('[data-ts="turtle-detail"][data-id="t1"]').click();
    await page.locator('[data-ts="ledger-links"]').click();
    assert((await page.locator('.ts-history-list').textContent()).includes('龟粮与水质试剂'));
    assert((await page.locator('.ts-history-list').textContent()).includes('金钱龟购入'));
    assert(!(await page.locator('.ts-history-list').textContent()).includes('黄缘成体售出'));
    await page.screenshot({ path: path.join(output, 'ledger-linked-history.png'), fullPage: true });
    await page.locator('[data-ts="close"]').click();
    await page.locator('[data-tab="hatching"]').first().click();
    assert.equal(await page.locator('[data-ts="tab"][data-tab="breeding"]').count(), 0);
    assert((await page.locator('.ts-breeding-analysis').textContent()).includes('最终孵化率'));
    await page.locator('[data-breed-filter="species"]').selectOption('黄缘闭壳龟');
    assert.equal(await page.locator('.ts-nest').count(), 1);
    assert((await page.locator('.ts-breeding-analysis').textContent()).includes('0%'));
    await page.locator('[data-breed-compare]').selectOption('year');
    assert.equal(await page.locator('.ts-compare-row').count(), 1);
    await page.locator('[data-breed-filter="species"]').selectOption('');
    // A second account submits an actual approval; the owner returns it with a reason.
    const teamCall = async (phone, action, extra = {}) => {
      const r = await fetch(origin + '/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, token: 'team-test-token', teamId: 'fixture-team', action, ...extra }) });
      const body = await r.json(); assert.equal(body.ok, true, JSON.stringify(body)); return body;
    };
    let latest = await teamCall('13900000001', 'get');
    await teamCall('13900000001', 'settings', { revision: latest.team.revision, approvalRequired: true });
    latest = await teamCall('13900000002', 'get');
    await teamCall('13900000002', 'ledger', { revision: latest.team.revision, kind: 'edit', id: 'e1', amount: 160, note: '等待核对', recordDate: seed.users['13900000001'].data.ledgerRecords.find(r => r.id === 'e1').recordDate });
    await page.locator('.ts-workhead [data-ts="refresh"]').click();
    await page.locator('.ts-sync-state').filter({ hasText: '发现团队更新' }).waitFor();
    await page.locator('[data-tab="approvals"]').first().click();
    await page.locator('[data-ts="reject"]').click();
    await page.locator('[name="reason"]').fill('请补充支出凭证');
    await page.locator('#ts-form button[type="submit"]').click();
    await page.waitForSelector('.ts-dialog', { state: 'detached' });
    assert((await page.locator('.ts-approval').textContent()).includes('请补充支出凭证'));
    const results = [];
    for (const width of [320, 390, 768, 1100]) {
      await page.setViewportSize({ width, height: 880 });
      for (const tab of ['overview', 'ledger', 'reports', 'hatching', 'care', 'tasks', 'members', 'logs', 'approvals', 'settings']) {
        await page.locator(`[data-ts="tab"][data-tab="${tab}"]`).first().click();
        const dimensions = await page.evaluate(() => ({ viewport: innerWidth, doc: document.documentElement.scrollWidth }));
        assert(dimensions.doc <= width + 1, `${tab} overflow at ${width}: ${dimensions.doc}`);
        results.push({ width, tab, ...dimensions });
        if (tab === 'reports' || tab === 'ledger') {
          assert.equal(await page.locator('.ts-finance-card').count(), 4);
          assert.equal(await page.locator('.ts-finance-detail').count(), 0, 'outer view contains only totals');
          const context = tab === 'reports' ? 'report' : 'ledger';
          for (const kind of ['purchase', 'sold', 'loss', 'other']) {
            await page.locator(`[data-ts="finance.open"][data-kind="${kind}"]`).click();
            assert.equal(await page.locator('.ts-finance-detail').count(), 1);
            if (kind === 'other') {
              assert(await page.locator('.ts-finance-detail').getByText('龟粮', { exact: true }).count());
              assert((await page.locator('.ts-finance-detail').textContent()).includes('09:18:26'));
              assert((await page.locator('.ts-finance-detail').textContent()).includes('10:30:45'));
            }
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${context}/${kind} details overflow`);
            if (width === 390 && kind === 'other') {
              await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
              await page.screenshot({ path: path.join(output, `${context}-expense-details.png`), fullPage: true });
            }
            await page.locator('[data-ts="finance.back"]').click();
          }
        }
        if (width === 390 && ['overview', 'reports', 'members', 'hatching'].includes(tab)) {
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({ path: path.join(output, `${tab}-mobile.png`), fullPage: true });
        }
      }
    }
    for (const width of [320, 390, 768, 1100]) {
      await page.setViewportSize({ width, height: 880 });
      for (const context of ['ledger', 'report']) {
        await page.locator(`[data-tab="${context === 'ledger' ? 'ledger' : 'reports'}"]`).first().click();
        const selector = page.locator(`[data-period-mode="${context}"]`);
        await selector.selectOption('custom');
        await page.waitForFunction(c => document.querySelector(`[data-period-mode="${c}"]`)?.disabled === false, context);
        await page.locator('[data-period-start]').fill('2025-06-05');
        await page.locator('[data-period-end]').fill('2025-06-05');
        await page.locator('[data-ts="period.apply"]').click();
        await page.waitForFunction(c => document.querySelector(`[data-period-mode="${c}"]`)?.disabled === false && document.querySelector('.ts-finance-card strong')?.textContent === '¥1,000.00', context);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `custom range overflow at ${width}`);
        if (width === 390 || width === 1100) {
          await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
          await page.screenshot({ path: path.join(output, `${context}-custom-range-${width}.png`), fullPage: true });
        }
        await selector.selectOption('year');
        await page.waitForFunction(c => document.querySelector(`[data-period-mode="${c}"]`)?.disabled === false && !document.querySelector('[data-period-start]'), context);
        assert.equal(await page.locator('[data-period-start]').count(), 0);
        await selector.selectOption(context === 'ledger' ? 'all' : 'month');
        await page.waitForFunction(c => document.querySelector(`[data-period-mode="${c}"]`)?.disabled === false, context);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-tab="ledger"]').first().click();
    await page.locator('[data-ts="finance.open"][data-kind="purchase"]').click();
    assert(await page.getByText('2025年历史购入', { exact: true }).count(), 'old personal history appears by default');
    await page.locator('[data-period-mode="ledger"]').selectOption('month');
    await page.locator('[data-ledger-month]').fill('2026-09');
    await page.locator('[data-ledger-month]').dispatchEvent('change');
    assert.equal(await page.getByText('2025年历史购入', { exact: true }).count(), 0);
    await page.locator('[data-period-mode="ledger"]').selectOption('all');
    assert(await page.getByText('2025年历史购入', { exact: true }).count());
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'all-history-ledger.png'), fullPage: true });
    await page.locator('[data-ts="ledger"]').first().click();
    await page.locator('[name="title"]').fill('明细测试：新过滤器');
    await page.locator('[name="amount"]').fill('129.50');
    await page.locator('[name="category"]').fill('器材');
    await page.locator('[name="recordTime"]').fill('14:25:36');
    await page.locator('[name="note"]').fill('二号池更换过滤设备');
    await page.evaluate(() => render());
    assert.equal(await page.locator('[name="recordTime"]').inputValue(), '14:25:36');
    assert.equal(await page.locator('[name="category"]').inputValue(), '器材');
    failLedgerOnce = true;
    await page.locator('#ts-form button[type="submit"]').click();
    await page.locator('.ts-sync-state').filter({ hasText: '保存失败' }).waitFor();
    assert.equal(await page.locator('[name="recordTime"]').inputValue(), '14:25:36');
    assert.equal(await page.locator('[name="category"]').inputValue(), '器材');
    await page.locator('#ts-form button[type="submit"]').click();
    await page.waitForSelector('.ts-dialog', { state: 'detached' });
    await page.locator('[data-ts="finance.open"][data-kind="other"]').click();
    const newExpense = page.locator('.ts-finance-record').filter({ hasText: '明细测试：新过滤器' });
    await newExpense.waitFor();
    assert((await newExpense.textContent()).includes('14:25:36'));
    assert((await newExpense.textContent()).includes('器材'));
    assert((await newExpense.textContent()).includes('129.50'));
    await newExpense.locator('[data-ts="ledger"]').click();
    assert.equal(await page.locator('[name="recordTime"]').inputValue(), '14:25:36');
    assert.equal(await page.locator('[name="category"]').inputValue(), '器材');
    await page.locator('[data-ts="close"]').click();
    await page.locator('[data-tab="care"]').first().click();
    assert(await page.getByText('历史护理事项', { exact: true }).count());
    await page.locator('.ts-care-row').filter({ hasText: '六月十日护理' }).locator('[data-ts="memo"]').click();
    await page.locator('[name="content"]').fill('团队已同步护理内容');
    await page.locator('#ts-form button[type="submit"]').click();
    await page.waitForSelector('.ts-dialog', { state: 'detached' });
    await page.getByText('团队已同步护理内容', { exact: true }).waitFor();
    await page.locator('[data-tab="overview"]').first().click();
    await page.locator('[data-ts="turtle-detail"]').first().click();
    assert(await page.getByText('成长记录', { exact: true }).count());
    await page.locator('[data-ts="close"]').click();
    await page.locator('[data-tab="hatching"]').first().click();
    await page.locator('[data-ts="breeding"]').first().click();
    await page.locator('[name="motherName"]').fill('页面测试种母');
    await page.locator('[name="eggCount"]').fill('10');
    await page.locator('[name="fertileCount"]').fill('8');
    await page.locator('#ts-form button[type="submit"]').click();
    await page.waitForSelector('.ts-dialog', { state: 'detached' });
    const nest = page.locator('.ts-nest').filter({ hasText: '页面测试种母' });
    await nest.locator('[data-ts="hatch"]').first().click();
    await page.locator('[name="count"]').fill('3');
    await page.locator('[name="speciesCode"]').selectOption('ZYG');
    await page.waitForSelector('.toast', { state: 'hidden' });
    await page.screenshot({ path: path.join(output, 'hatch-dialog-mobile.png') });
    await page.locator('#ts-form button[type="submit"]').click();
    await page.waitForSelector('.ts-dialog', { state: 'detached' });
    assert(await nest.getByText('37.5%', { exact: true }).count());
    await page.locator('[data-tab="hatching"]').first().click();
    assert(await page.locator('.ts-nest').filter({ hasText: '页面测试种母' }).getByText('3 只', { exact: true }).count());
    await page.evaluate(() => { state.themeColor = 'dark'; render(); });
    await page.waitForSelector('.toast', { state: 'hidden' });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'hatching-dark.png'), fullPage: true });
    await page.evaluate(() => { state.themeColor = 'forest'; render(); });
    await page.locator('[data-tab="tasks"]').first().click();
    await page.locator('[data-ts="task"]').click();
    await page.locator('[name="title"]').fill('接口测试：幼龟换水');
    await page.locator('#ts-form button[type="submit"]').click();
    await page.waitForSelector('.ts-dialog', { state: 'detached' });
    assert(await page.locator('.ts-task').filter({ hasText: '接口测试：幼龟换水' }).count());
    await page.locator('[data-tab="members"]').first().click();
    await page.locator('[data-ts="invite"]').click();
    await page.screenshot({ path: path.join(output, 'permissions-mobile.png'), fullPage: true });
    await page.locator('[name="memberPhone"]').fill('13900000004');
    await page.locator('#ts-form button[type="submit"]').click();
    await page.waitForSelector('.ts-dialog', { state: 'detached' });
    assert(await page.getByText('等待接受邀请', { exact: false }).count());
    // A rejected duplicate invitation must preserve all draft fields.
    await page.locator('[data-ts="invite"]').click();
    await page.locator('[name="memberPhone"]').fill('13900000004');
    await page.locator('[name="ledger"]').selectOption('none');
    await page.locator('[name="breeding"]').selectOption('read');
    await page.locator('#ts-form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#ts-form button[type="submit"]')?.disabled === false);
    assert.equal(await page.locator('[name="memberPhone"]').inputValue(), '13900000004');
    assert.equal(await page.locator('[name="ledger"]').inputValue(), 'none');
    assert.equal(await page.locator('[name="breeding"]').inputValue(), 'read');
    await page.locator('[data-ts="close"]').click();
    await page.locator('[data-tab="overview"]').first().click();
    await page.locator('[data-ts="card"]').first().click();
    await page.locator('[name="breeding"]').check();
    await page.locator('#ts-form button[type="submit"]').click();
    await page.waitForSelector('.ts-card-preview');
    const png = await page.locator('.ts-card-preview').getAttribute('src');
    assert(png.startsWith('data:image/png;base64,'));
    fs.writeFileSync(path.join(output, 'brand-card.png'), Buffer.from(png.split(',')[1], 'base64'));
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-ts="card-save"]').click();
    assert((await downloadPromise).suggestedFilename().endsWith('.png'));
    await page.locator('[data-ts="close"]').click();
    await page.locator('[data-tab="settings"]').first().click();
    await page.locator('[data-ts="membership"]').click();
    await page.locator('[data-ts="refresh"]').click();
    await page.waitForSelector('.ts-workhead');
    await page.evaluate(() => { state.themeColor = 'dark'; render(); });
    await page.locator('[data-tab="reports"]').first().click();
    await page.waitForSelector('.toast', { state: 'hidden' });
    await page.screenshot({ path: path.join(output, 'reports-dark.png'), fullPage: true });
    await page.evaluate(() => { state.themeColor = 'forest'; render(); });
    await page.locator('[data-tab="members"]').first().click();
    await page.locator('[data-ts="member"][data-id="member-2"]').click();
    await page.locator('[name="visibleFrom"]').fill('2025-06-09');
    await page.locator('[name="breeding"]').selectOption('read');
    await page.screenshot({ path: path.join(output, 'member-date-permissions.png') });
    await page.locator('#ts-form button[type="submit"]').click();
    await page.waitForSelector('.ts-dialog', { state: 'detached' });
    await page.evaluate(() => { state.loggedInPhone = '13900000002'; render(); });
    await page.locator('.ts-data-scope strong').filter({ hasText: '2025-06-09' }).waitFor();
    assert((await page.locator('.ts-permission-preview').textContent()).includes('2025-06-09'));
    await page.locator('[data-tab="overview"]').first().click();
    assert((await page.locator('.ts-attention').textContent()).includes('我的待办'));
    assert((await page.locator('.ts-attention').textContent()).includes('请补充支出凭证'));
    await page.locator('[data-tab="ledger"]').first().click();
    assert.equal(await page.getByText('2025年历史购入', { exact: true }).count(), 0);
    await page.locator('[data-period-mode="ledger"]').selectOption('all');
    assert.equal(await page.getByText('2025年历史购入', { exact: true }).count(), 0, 'all dates cannot bypass server scope');
    await page.locator('[data-tab="care"]').first().click();
    assert.equal(await page.getByText('历史护理事项', { exact: true }).count(), 0);
    assert(await page.getByText('六月十日护理', { exact: true }).count());
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'member-scoped-care.png'), fullPage: true });
    // Account switch must discard the owner's cached finance and permissions.
    await page.evaluate(() => { state.loggedInPhone = '13900000003'; render(); });
    await page.waitForSelector('.ts-workhead');
    await page.locator('[data-tab="ledger"]').first().click();
    await page.waitForSelector('.ts-empty');
    assert(await page.getByText('账本未开放').count());
    assert.equal(await page.locator('[data-ts="ledger"]').count(), 0);
    await page.locator('[data-tab="hatching"]').first().click();
    await page.getByText('繁殖与孵化未开放', { exact: true }).waitFor();
    assert.equal(await page.locator('.ts-nest').count(), 0);
    // New owners must see an explicit blocked state, then gain a real create path.
    await page.evaluate(() => { state.loggedInPhone = '13900000008'; state.themeColor = 'forest'; render(); });
    await page.getByText('团队会员未开通', { exact: true }).waitFor();
    assert(await page.locator('[data-ts="create"]').isDisabled());
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'member-setup-locked.png'), fullPage: true });
    updateAccess(path.join(runtime, 'data/team-test-access.json'), '--grant', '13900000008');
    await page.locator('.ts-setup [data-ts="refresh"]').click();
    await page.getByText('测试权限已开通', { exact: true }).waitFor();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'member-setup-ready.png'), fullPage: true });
    await page.locator('[data-ts="create"]').click();
    await page.locator('[data-ts="invite"]').waitFor();
    assert(await page.locator('.ts-test-status').count());
    await page.locator('[data-ts="invite"]').click();
    await page.locator('[name="memberPhone"]').fill('13900000009');
    await page.locator('[name="ledger"]').selectOption('none');
    await page.locator('#ts-form button[type="submit"]').click();
    await page.waitForSelector('.ts-dialog', { state: 'detached' });
    await page.waitForSelector('.toast', { state: 'hidden' });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'member-setup-invited.png'), fullPage: true });
    await page.evaluate(() => { state.loggedInPhone = '13900000009'; render(); });
    await page.locator('[data-ts="accept"]').click();
    await page.waitForSelector('.ts-workhead');
    await page.locator('[data-tab="ledger"]').first().click();
    await page.getByText('账本未开放', { exact: true }).waitFor();
    updateAccess(path.join(runtime, 'data/team-test-access.json'), '--revoke', '13900000008');
    await page.locator('.ts-workhead [data-ts="refresh"]').click();
    await page.getByText('团队会员已到期', { exact: true }).waitFor();
    await page.evaluate(() => { state.loggedInPhone = ''; state.cloudToken = ''; state.themeColor = 'forest'; render(); });
    await page.waitForSelector('.ts-hero');
    await page.screenshot({ path: path.join(output, 'membership-mobile.png'), fullPage: true });
    assert(!await page.locator('.ts-workhead').count());
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results, errors }, null, 2));
    console.log('PASS: 40 viewport/module combinations, all-history ledger, care/growth, per-member dates, scoped data, breeding/hatch rates, task/invitation flows, account isolation and dark mode. Screenshots: ' + output);
  } catch (e) {
    const failedPage = browser?.contexts()[0]?.pages()[0];
    if (failedPage) {
      await failedPage.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
      console.error(await failedPage.locator('.ts-dialog').textContent().catch(() => 'no dialog'));
      console.error(await failedPage.locator('#ts-form').evaluate(form => [...form.elements].filter(el => el.validity && !el.validity.valid).map(el => [el.name, el.value, el.validationMessage])).catch(() => []));
    }
    console.error(logs.slice(-2500)); throw e;
  }
  finally { await browser?.close(); child.kill(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
