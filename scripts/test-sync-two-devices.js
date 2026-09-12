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
    const turtles = ['sold-one', 'lost-one', 'price-one'].map((id, i) => ({ id, code: id, speciesCode: 'GHG', speciesName: '果核蛋龟', price: i ? 450 : 100,
      acquiredDate: '2026-09-01', weight: 20, carapaceLength: 3, gender: '未知', status: '正常饲养', health: '健康', photo: '/assets/species/GHG.jpg', measureHistory: [] }));
    user = (await post('/api/account/save', { ...auth, accountName: user.accountName, accountAvatar: '', data: {
      turtles, keptSpecies: ['GHG'], ledgerRecords: turtles.map(t => ({ id: `purchase-${t.id}`, type: 'purchase', turtleId: t.id,
        title: t.code, amount: t.price, recordDate: t.acquiredDate, turtleSnapshot: t })) } })).user;
    browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
    const errors = [];
    let dropPhoneSaveAcknowledgment = false;
    let blockPhoneAccountLoad = false;
    let offlineRelaunchAssets = false;
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
        if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: `window.TURTLE_API_BASE_URL = ${JSON.stringify(base)}; window.TURTLE_APP_BUILD = 106;` });
        if (width === 390 && offlineRelaunchAssets && !url.pathname.startsWith('/api/')) {
          // Native app assets are bundled even without internet. Keep only
          // those assets available while real API requests remain offline.
          const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
          if (!file.startsWith(root + path.sep)) return route.abort();
          try {
            return route.fulfill({ body: await fs.readFile(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
          } catch { return route.fulfill({ status: 404, body: '' }); }
        }
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
    async function editPrice(page, price) {
      await page.evaluate(() => setState({ page: 'turtleDetail', selectedTurtleId: 'price-one', updatingTurtleId: 'price-one' }, { skipCloud: true }));
      await page.locator('#turtleDetailForm [name="price"]').fill(String(price));
      await page.locator('#turtleDetailForm').evaluate(form => form.requestSubmit());
      await page.waitForFunction(price => Number(state.turtles.find(t => t.id === 'price-one').price) === price, price);
      await page.evaluate(() => setState({ page: 'home', updatingTurtleId: '' }, { skipCloud: true }));
    }
    await editPrice(computer, 520);
    await computer.waitForFunction(() => !readPendingCloudData() && !cloudSyncInFlight);
    assert.equal(Number((await post('/api/account/load', auth)).user.data.turtles.find(t => t.id === 'price-one').price), 520);
    await phonePage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await phonePage.waitForFunction(() => Number(state.turtles.find(t => t.id === 'price-one').price) === 520);
    assert.equal(await phonePage.evaluate(() => state.ledgerRecords.find(r => r.turtleId === 'price-one' && r.type === 'purchase').amount), 520);
    assert.equal(await phonePage.evaluate(() => {
      const before = TurtleLocalData.stringify(state.cloudMergeBase);
      state.turtles[0].measureHistory.push({ id: 'temporary-alias-check' });
      const unchanged = TurtleLocalData.stringify(state.cloudMergeBase) === before;
      state.turtles[0].measureHistory.pop();
      return unchanged;
    }), true, 'the common baseline must not share mutable arrays with live data');
    async function record(page, type, turtleId, amount) {
      await page.evaluate(({ type, turtleId }) => openLedgerForm(type, turtleId), { type, turtleId });
      if (type !== 'loss') await page.locator('#ledgerForm [name="amount"]').fill(String(amount));
      if (type === 'other') await page.locator('#ledgerForm [name="otherTitle"]').fill('断网时记录的支出');
      await page.locator('#ledgerForm [name="recordDate"]').fill('2026-09-11');
      await page.locator('#ledgerForm').evaluate(form => form.requestSubmit());
    }
    for (const context of contexts) await context.setOffline(true);
    await record(computer, 'sold', 'sold-one', 300);
    await record(phonePage, 'loss', 'lost-one', 450);
    for (const page of pages) await page.waitForFunction(() => !cloudSyncInFlight && Boolean(readPendingCloudData()));
    offlineRelaunchAssets = true;
    await phonePage.reload({ waitUntil: 'load' });
    await phonePage.waitForFunction(() => !cloudHydrationStarted && !cloudHydrationComplete);
    assert.ok(await phonePage.evaluate(() => readPendingCloudData()?.baseSnapshot?.data), 'offline relaunch preserves the exact common baseline');
    offlineRelaunchAssets = false;
    await contexts[0].setOffline(false);
    await computer.waitForFunction(() => !readPendingCloudData() && state.ledgerRecords.some(item => item.type === 'sold'));
    await contexts[1].setOffline(false);
    await phonePage.waitForFunction(() => !readPendingCloudData() && state.ledgerRecords.some(item => item.type === 'loss'));
    assert.ok(await phonePage.evaluate(() => state.ledgerRecords.some(item => item.type === 'sold')), 'offline sale and loss from different devices merge without user intervention');
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
    // Ordinary customers can edit both devices offline: disjoint records merge
    // automatically, without exporting files or asking an operator to repair.
    for (const page of pages) await page.evaluate(() => refreshCloudAccountFromServer({ background: true }));
    for (const context of contexts) await context.setOffline(true);
    await record(computer, 'other', '', 111);
    await record(phonePage, 'other', '', 222);
    for (const page of pages) await page.waitForFunction(() => !cloudSyncInFlight && Boolean(readPendingCloudData()));
    await contexts[0].setOffline(false);
    await computer.waitForFunction(() => !readPendingCloudData());
    await contexts[1].setOffline(false);
    await phonePage.waitForFunction(() => !readPendingCloudData(), null, { timeout: 15000 });
    let combined = (await post('/api/account/load', auth)).user.data;
    assert.equal(combined.ledgerRecords.filter(r => r.type === 'other' && r.amount === 111).length, 1);
    assert.equal(combined.ledgerRecords.filter(r => r.type === 'other' && r.amount === 222).length, 1);
    assert.equal(await phonePage.evaluate(() => cloudSyncIsPaused()), false);
    await computer.evaluate(() => refreshCloudAccountFromServer({ background: true }));
    await computer.evaluate(() => setState({ memos: [...state.memos, { id: 'shared-care', text: 'original care' }] }));
    await computer.waitForFunction(() => !readPendingCloudData());
    await phonePage.evaluate(() => refreshCloudAccountFromServer({ background: true }));
    for (const context of contexts) await context.setOffline(true);
    for (const [index, page] of pages.entries()) await page.evaluate(index => setState({ memos: state.memos.map(m => m.id === 'shared-care' ? { ...m, text: index ? 'phone care' : 'computer care' } : m) }), index);
    for (const page of pages) await page.waitForFunction(() => !cloudSyncInFlight && Boolean(readPendingCloudData()));
    await contexts[0].setOffline(false); await computer.waitForFunction(() => !readPendingCloudData());
    await contexts[1].setOffline(false); await phonePage.waitForFunction(() => cloudSyncIsPaused());
    await phonePage.locator('[data-cloud-sync-notice] button').click();
    await phonePage.locator('[data-cloud-conflict-choice][value="local"]').check();
    await phonePage.locator('.sync-conflict-review').screenshot({ path: path.join(root, 'output', 'sync-conflict-self-service.png') });
    assert.equal(await phonePage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'conflict review fits a phone');
    phonePage.once('dialog', dialog => dialog.accept());
    await phonePage.locator('[data-apply-cloud-conflict]').click();
    await phonePage.waitForFunction(() => !cloudSyncIsPaused() && !readPendingCloudData());
    combined = (await post('/api/account/load', auth)).user.data;
    assert.equal(combined.memos.find(m => m.id === 'shared-care').text, 'phone care');
    assert.ok(combined.ledgerRecords.some(r => r.amount === 111));
    assert.ok(combined.ledgerRecords.some(r => r.amount === 222));
    console.log('Customer self-service passed: independent offline edits auto-merge; a true conflict is resolved entirely in the phone UI without files.');
    // Upgrade fixture: build 105 can have a paused journal with no shared
    // baseline. Keep it through reload; resolve in-app before resuming reads.
    for (const page of pages) await page.evaluate(() => refreshCloudAccountFromServer({ background: true }));
    await contexts[1].setOffline(true);
    await editPrice(phonePage, 530);
    await phonePage.waitForFunction(() => !cloudSyncInFlight && Boolean(readPendingCloudData()));
    await phonePage.evaluate(() => { state.cloudMergeBase = null; pauseCloudSync('ACCOUNT_DATA_CONFLICT'); });
    assert.equal(await phonePage.evaluate(() => Boolean(readPendingCloudData()?.baseSnapshot)), false);
    await editPrice(computer, 540);
    await computer.waitForFunction(() => !cloudSyncInFlight && !readPendingCloudData());
    await contexts[1].setOffline(false);
    await phonePage.reload({ waitUntil: 'load' });
    await phonePage.waitForFunction(() => cloudHydrationComplete && cloudSyncIsPaused());
    assert.equal(await phonePage.evaluate(() => Number(state.turtles.find(t => t.id === 'price-one').price)), 530, 'paused upgrade does not discard the phone edit');
    await phonePage.locator('[data-cloud-sync-notice] button').click();
    const cloudChoices = phonePage.locator('[data-cloud-conflict-choice][value="remote"]');
    await cloudChoices.first().waitFor();
    for (let i = 0; i < await cloudChoices.count(); i++) await cloudChoices.nth(i).check();
    phonePage.once('dialog', dialog => dialog.accept());
    await phonePage.locator('[data-apply-cloud-conflict]').click();
    await phonePage.waitForFunction(() => !cloudSyncIsPaused() && !readPendingCloudData());
    assert.equal(await phonePage.evaluate(() => Number(state.turtles.find(t => t.id === 'price-one').price)), 540);
    const alternatives = await phonePage.evaluate(() => TurtleLocalData.parse(localStorage.getItem('turtlekeeper-account-recovery-rollback-v1')));
    assert.equal(Number(alternatives.local.data.turtles.find(t => t.id === 'price-one').price), 530);
    assert.equal(Number(alternatives.cloud.data.turtles.find(t => t.id === 'price-one').price), 540);
    await phonePage.reload({ waitUntil: 'load' });
    await phonePage.waitForFunction(() => cloudHydrationComplete && !cloudSyncIsPaused() && !readPendingCloudData());
    await editPrice(computer, 550);
    await computer.waitForFunction(() => !cloudSyncInFlight && !readPendingCloudData());
    await phonePage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await phonePage.waitForFunction(() => Number(state.turtles.find(t => t.id === 'price-one').price) === 550);
    console.log('Price sync passed: edit form, cloud commit, phone refresh, legacy paused journal recovery with both originals preserved, reload and subsequent automatic refresh.');
    if (process.env.REVIEWED_RECOVERY_FIXTURE) {
      // Optional private fixture stays outside source control and is sent ONLY
      // to this run's temporary localhost account, never to production.
      const codec = require('../assets/local-data-codec');
      const text = await fs.readFile(process.env.REVIEWED_RECOVERY_FIXTURE, 'utf8');
      const recovery = codec.parse(text);
      for (const page of pages) await page.evaluate(() => pauseCloudSync());
      const source = recovery.recovery.sources[1];
      const baseUser = (await post('/api/account/load', auth)).user;
      await post('/api/account/save', { ...auth, accountName: source.accountName, accountAvatar: source.accountAvatar,
        data: source.data, baseDataRevision: baseUser.dataRevision });
      for (const [index, page] of pages.entries()) {
        const result = await page.evaluate(async ({ source, text }) => {
          state = { ...state, ...normalizeAccountData(source.data), accountName: source.accountName, accountAvatar: source.accountAvatar,
            page: 'sync', cloudAccountDataRevision: 'before-recovery', cloudSyncConflict: { phone: state.loggedInPhone, code: 'ACCOUNT_DATA_CONFLICT' } };
          persistPendingCloudData(); saveState({ skipCloud: true });
          window.confirm = () => true;
          const messages = []; toast = text => messages.push(text);
          await importReviewedAccountRecovery({ size: text.length, text: async () => text });
          return { pending: Boolean(readPendingCloudData()), paused: cloudSyncIsPaused(),
            matches: accountSyncSignature(state) === reviewedRecoverySignature(TurtleLocalData.parse(text)), messages };
        }, { source: recovery.recovery.sources[index], text });
        assert.equal(result.pending, false, JSON.stringify(result));
        assert.equal(result.paused, false, JSON.stringify(result));
        assert.equal(result.matches, true, JSON.stringify(result));
      }
      const restored = (await post('/api/account/load', auth)).user;
      assert.deepEqual(restored.data.ledgerRecords, recovery.data.ledgerRecords, 'real API preserves every recovered loss and cost snapshot');
      assert.equal(restored.data.turtles.length, recovery.data.turtles.length);
      for (const page of pages) {
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => cloudHydrationComplete && !readPendingCloudData());
        assert.equal(await page.evaluate(() => cloudSyncIsPaused()), false);
      }
      console.log('Private reviewed fixture passed: both devices, real API, all ledger snapshots, archive counts and relaunch without a conflict.');
    }
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
