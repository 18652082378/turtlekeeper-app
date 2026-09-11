const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let saves = 0;
    let revision = 1;
    const user = { phone: '13900000008', token: 'fixture-token', accountName: '同步测试', accountAvatar: '',
      updatedAt: '2026-09-11T10:00:00.000Z', dataRevision: 'data-1', termsVersion: '2026-09-01',
      data: { turtles: [{ id: 'turtle-1', code: '测试龟', speciesCode: 'GHG', speciesName: '果核蛋龟', status: '正常饲养', acquiredDate: '2026-09-01', price: 450 }],
        ledgerRecords: [{ id: 'sale', type: 'sold', recordDate: '2026-09-11', amount: 3800 }], memos: [], keptSpecies: ['GHG'] } };
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'sync.test') return route.abort();
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/account/load') return route.fulfill({ json: { ok: true, user } });
        if (url.pathname === '/api/account/save') {
          saves++;
          const payload = route.request().postDataJSON();
          if (payload.baseDataRevision !== user.dataRevision) return route.fulfill({ status: 409, json: { ok: false, code: 'ACCOUNT_DATA_CONFLICT', message: 'stale' } });
          user.data = payload.data;
          user.accountName = payload.accountName;
          user.accountAvatar = payload.accountAvatar;
          user.dataRevision = `data-${++revision}`;
          user.updatedAt = `2026-09-11T10:00:0${revision}.000Z`;
          return route.fulfill({ json: { ok: true, user } });
        }
        return route.fulfill({ json: { ok: true, minimumBuild: 95, latestBuild: 99, posts: [], listings: [], messages: [], notifications: [], friends: [], items: [], unreadCount: 0 } });
      }
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL = "https://sync.test"; window.TURTLE_APP_BUILD = 104;' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    await page.addInitScript(fixture => {
      if (localStorage.getItem('turtlekeeper-state-v1')) return;
      localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ ...fixture.data, loggedInPhone: fixture.phone, cloudToken: fixture.token,
        accountName: fixture.accountName, accountAvatar: '', cloudAccountUpdatedAt: '', policyConsentRequired: false,
        registeredUsers: [{ ...fixture, cloudToken: fixture.token }] }));
      localStorage.setItem('turtlekeeper-pending-cloud-data-v1', JSON.stringify({ phone: fixture.phone,
        accountName: fixture.accountName, accountAvatar: '', data: fixture.data, baseUpdatedAt: '', updatedAt: '2026-09-11T09:00:00.000Z' }));
    }, clone(user));
    await page.goto('https://sync.test/', { waitUntil: 'load' });
    await page.waitForFunction(() => cloudHydrationComplete && !readPendingCloudData());
    assert.equal(saves, 0, 'identical old journal is acknowledged without a write');
    await page.evaluate(() => {
      for (const page of ['ledger', 'mine', 'home', 'sync']) setState({ page });
    });
    assert.equal(await page.evaluate(() => Boolean(readPendingCloudData())), false, 'navigation does not create pending account edits');
    await page.evaluate(() => setState({ memos: [{ id: 'local-care', text: 'local note' }] }));
    await page.waitForFunction(() => !readPendingCloudData() && state.cloudAccountDataRevision === 'data-2');
    assert.equal(saves, 1, 'real edits still upload automatically');

    user.data.memos.push({ id: 'remote-care', text: 'remote note' });
    user.dataRevision = `data-${++revision}`;
    await page.evaluate(() => {
      window.syncWarnings = [];
      const original = toast;
      toast = message => { window.syncWarnings.push(message); original(message); };
      setState({ memos: [...state.memos, { id: 'unsent-care', text: 'keep this' }] });
    });
    await page.waitForFunction(() => cloudSyncIsPaused());
    assert.equal(saves, 2);
    await page.evaluate(async () => {
      for (const page of ['home', 'ledger', 'mine', 'home']) {
        setState({ page });
        await pushCloudDataNow();
      }
    });
    assert.equal(saves, 2, 'paused navigation never retries rejected saves');
    assert.equal(await page.evaluate(() => window.syncWarnings.filter(text => text.includes('同步已暂停')).length), 1);
    assert.ok(await page.evaluate(() => readPendingCloudData().data.memos.some(item => item.id === 'unsent-care')));
    assert.equal(await page.locator('[data-cloud-sync-notice]').count(), 1);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => cloudHydrationComplete && cloudSyncIsPaused());
    assert.ok(await page.evaluate(() => state.memos.some(item => item.id === 'unsent-care')));
    assert.equal(saves, 2, 'pause persists across reload');
    await page.locator('[data-cloud-sync-notice] button').click();
    assert.equal(await page.evaluate(() => state.page), 'sync', JSON.stringify(errors));
    await page.locator('.settings-card').screenshot({ path: path.join(root, 'output', 'sync-recovery-settings.png') });
    assert.equal(await page.locator('[data-export-local-backup]').count(), 1);
    // Independent reconciliation makes the server identical; explicit recheck resumes.
    user.data = await page.evaluate(() => accountDataSnapshot(state));
    user.dataRevision = `data-${++revision}`;
    await page.locator('[data-toggle-sync]').click();
    await page.waitForFunction(() => !readPendingCloudData() && !cloudSyncIsPaused());
    assert.equal(saves, 2, 'recovery never overwrites either side');
    assert.deepEqual(errors, []);
    console.log('Sync recovery UI passed: old journal repair, navigation without writes, genuine edits, one conflict toast, persistent pause, backup access and safe resume.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
