// Real API + two independent browser stores. Never touches production accounts.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
async function freePort() {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}
(async () => {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'turtle-sync-devices-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let browser;
  const server = spawn(process.execPath, ['server/server.js'], { cwd: root, windowsHide: true,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TURTLE_RUNTIME_DIR: runtime,
      MYSQL_URL: '', MYSQL_HOST: '', SMS_PROVIDER: 'mock', SMS_MOCK: 'true',
      APNS_KEY_PATH: '', APNS_KEY_ID: '', APNS_TEAM_ID: '', MIN_SUPPORTED_APP_BUILD: '95', LATEST_APP_BUILD: '99' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  let serverOutput = '';
  server.stdout.on('data', chunk => { serverOutput += chunk; });
  server.stderr.on('data', chunk => { serverOutput += chunk; });
  const post = async (route, data) => {
    const response = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    assert.ok(response.ok && result.ok, `${route}: ${JSON.stringify(result)}`);
    return result;
  };
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/api/app/version')).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
      if (i === 99) throw new Error(serverOutput);
    }
    const phone = '13900000009';
    const sms = await post('/api/sms/send', { phone, purpose: 'register' });
    let user = (await post('/api/account/register', { phone, code: sms.code, password: 'IsolatedPass123', accountName: '双端测试', termsAccepted: true, termsVersion: '2026-09-01' })).user;
    const auth = { phone, token: user.token, termsVersion: '2026-09-01' };
    const turtles = ['sold-one', 'lost-one'].map((id, i) => ({ id, code: id, speciesCode: 'GHG', speciesName: '果核蛋龟', price: i ? 450 : 100,
      acquiredDate: '2026-09-01', gender: '未知', status: '正常饲养', health: '健康', photo: '/assets/species/GHG.jpg', measureHistory: [] }));
    user = (await post('/api/account/save', { ...auth, accountName: user.accountName, accountAvatar: '', data: {
      turtles, keptSpecies: ['GHG'], ledgerRecords: turtles.map(t => ({ id: `purchase-${t.id}`, type: 'purchase', turtleId: t.id,
        title: t.code, amount: t.price, recordDate: t.acquiredDate, turtleSnapshot: t })) } })).user;
    browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
    const errors = [];
    let dropPhoneSaveAcknowledgment = false;
    let blockPhoneAccountLoad = false;
    const contexts = [];
    const pages = [];
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      contexts.push(context);
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        if (width === 390 && blockPhoneAccountLoad && url.pathname === '/api/account/load') return route.abort('internetdisconnected');
        if (width === 390 && dropPhoneSaveAcknowledgment && url.pathname === '/api/account/save') {
          dropPhoneSaveAcknowledgment = false;
          const response = await route.fetch();
          assert.equal(response.status(), 200, 'server commits before acknowledgment is lost');
          return route.abort('connectionreset');
        }
        if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: `window.TURTLE_API_BASE_URL = ${JSON.stringify(base)}; window.TURTLE_APP_BUILD = 104;` });
        return route.continue();
      });
      await context.addInitScript(fixture => {
        if (localStorage.getItem('turtlekeeper-state-v1')) return;
        localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ ...fixture.data, loggedInPhone: fixture.phone,
          cloudToken: fixture.token, accountName: fixture.accountName, policyConsentRequired: false,
          registeredUsers: [{ ...fixture, cloudToken: fixture.token }] }));
      }, user);
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForFunction(() => cloudHydrationComplete && state.cloudAccountDataRevision);
      pages.push(page);
    }
    const [computer, phonePage] = pages;
    async function record(page, type, turtleId, amount) {
      await page.evaluate(({ type, turtleId }) => openLedgerForm(type, turtleId), { type, turtleId });
      if (type !== 'loss') await page.locator('#ledgerForm [name="amount"]').fill(String(amount));
      if (type === 'other') await page.locator('#ledgerForm [name="otherTitle"]').fill('断网时记录的支出');
      await page.locator('#ledgerForm [name="recordDate"]').fill('2026-09-11');
      await page.locator('#ledgerForm').evaluate(form => form.requestSubmit());
    }
    await record(computer, 'sold', 'sold-one', 300);
    await computer.waitForFunction(() => !readPendingCloudData() && state.ledgerRecords.some(item => item.type === 'sold'));
    await phonePage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await phonePage.waitForFunction(() => state.ledgerRecords.some(item => item.type === 'sold'));
    await record(phonePage, 'loss', 'lost-one', 450);
    await phonePage.waitForFunction(() => !readPendingCloudData() && state.ledgerRecords.some(item => item.type === 'loss'));
    await computer.evaluate(() => window.dispatchEvent(new Event('focus')));
    await computer.waitForFunction(() => state.ledgerRecords.some(item => item.type === 'loss'));
    for (const page of pages) {
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => cloudHydrationComplete && state.ledgerRecords.some(item => item.type === 'loss'));
      assert.equal(await page.evaluate(() => cloudSyncIsPaused()), false);
      assert.equal(await page.evaluate(() => state.ledgerRecords.filter(item => ['sold', 'loss'].includes(item.type)).length), 2);
    }
    await contexts[1].setOffline(true);
    const offlineFailure = phonePage.waitForEvent('requestfailed', { predicate: request => request.url().endsWith('/api/account/save') });
    await record(phonePage, 'other', '', 50);
    await phonePage.waitForFunction(() => Boolean(readPendingCloudData()));
    // Let one save attempt fail while offline, then restore network without a tap.
    await offlineFailure;
    await phonePage.waitForFunction(() => !cloudSyncInFlight);
    await contexts[1].setOffline(false);
    await phonePage.waitForFunction(() => !readPendingCloudData(), null, { timeout: 12000 });
    const final = (await post('/api/account/load', auth)).user.data;
    assert.equal(final.ledgerRecords.filter(item => item.type === 'sold').length, 1);
    assert.equal(final.ledgerRecords.filter(item => item.type === 'loss').length, 1);
    assert.equal(final.ledgerRecords.filter(item => item.type === 'other' && item.amount === 50).length, 1);

    dropPhoneSaveAcknowledgment = true;
    const lostAcknowledgment = phonePage.waitForEvent('requestfailed', { predicate: request => request.url().endsWith('/api/account/save') });
    await record(phonePage, 'other', '', 75);
    await lostAcknowledgment;
    await phonePage.waitForFunction(() => !cloudSyncInFlight);
    assert.equal((await post('/api/account/load', auth)).user.data.ledgerRecords.filter(item => item.type === 'other' && item.amount === 75).length, 1);
    await phonePage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await phonePage.waitForFunction(() => !readPendingCloudData());
    assert.equal(await phonePage.evaluate(() => cloudSyncIsPaused()), false, 'a lost save acknowledgment is not a conflict');
    assert.equal((await post('/api/account/load', auth)).user.data.ledgerRecords.filter(item => item.type === 'other' && item.amount === 75).length, 1, 'retry never duplicates a ledger entry');

    blockPhoneAccountLoad = true;
    await phonePage.reload({ waitUntil: 'load' });
    await phonePage.waitForFunction(() => !cloudHydrationStarted && !cloudHydrationComplete);
    blockPhoneAccountLoad = false;
    await phonePage.evaluate(() => window.dispatchEvent(new Event('online')));
    await phonePage.waitForFunction(() => cloudHydrationComplete);
    assert.equal(await phonePage.evaluate(() => state.ledgerRecords.filter(item => ['sold', 'loss'].includes(item.type)).length), 2, 'startup failure can recover automatically without discarding business records');
    assert.deepEqual(errors, []);
    console.log('Two-device real API passed: computer sale, phone loss, cross-device refresh, reload preservation, automatic offline recovery, lost save acknowledgment without duplication and startup load recovery.');
  } finally {
    if (browser) await browser.close();
    if (server.exitCode === null) {
      server.kill();
      await new Promise(resolve => server.once('exit', resolve));
    }
    // Only the mkdtemp directory owned by this run can be removed.
    const resolved = path.resolve(runtime);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('turtle-sync-devices-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
