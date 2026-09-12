// Touch the shipped page controls, not their internal handlers. No production traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const clone = x => JSON.parse(JSON.stringify(x));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let loads = 0, saves = 0, loadMode = 'ok';
    let cloud = { phone: '13900000008', token: 'isolated', accountName: '触屏测试', accountAvatar: '',
      dataRevision: 'v1', updatedAt: '2026-09-12T01:00:00Z', termsVersion: '2026-09-01',
      data: { turtles: [{ id: 't1', code: '小龟', speciesCode: 'GHG', speciesName: '果核蛋龟', price: 450, weight: 20,
        carapaceLength: 3, status: '正常饲养', photo: '/assets/species/GHG.jpg', measureHistory: [] }],
        ledgerRecords: [], memos: [], activityLogs: [], breedingRecords: [], turtlePools: [], keptSpecies: ['GHG'] } };
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'sync-actions.test') return route.abort();
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/account/load') {
          loads++;
          if (loadMode === 'offline') return route.abort('internetdisconnected');
          if (loadMode === 'slow') { await new Promise(r => setTimeout(r, 22000)); return route.fulfill({ json: { ok: true, user: cloud } }).catch(() => {}); }
          return route.fulfill({ json: { ok: true, user: cloud } });
        }
        if (url.pathname === '/api/account/save') {
          saves++;
          const payload = route.request().postDataJSON();
          if (payload.baseDataRevision !== cloud.dataRevision) return route.fulfill({ status: 409, json: { ok: false, code: 'ACCOUNT_DATA_CONFLICT', message: 'stale' } });
          cloud = { ...cloud, data: payload.data, dataRevision: `save-${saves}` };
          return route.fulfill({ json: { ok: true, user: cloud } });
        }
        return route.fulfill({ json: { ok: true, minimumBuild: 95, latestBuild: 99, posts: [], listings: [], items: [], friends: [], notifications: [], unreadCount: 0 } });
      }
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://sync-actions.test";window.TURTLE_APP_BUILD=107;' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.addInitScript(user => {
      localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ ...user.data, loggedInPhone: user.phone, cloudToken: user.token,
        accountName: user.accountName, policyConsentRequired: false, registeredUsers: [{ ...user, cloudToken: user.token }] }));
    }, clone(cloud));
    await page.goto('https://sync-actions.test/?skipIntro=1');
    await page.waitForFunction(() => cloudHydrationComplete && !readPendingCloudData());
    console.log('Hydrated');
    await page.locator('#app .bottom-nav [data-page="messages"]').tap();
    await page.locator('#app .space-entry-button[data-page="mine"]').tap();
    await page.locator('#app [data-page="sync"]').tap();
    console.log('Entered sync by touch');
    const oldLoads = loads;
    await page.locator('#app [data-toggle-sync]').tap();
    await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('最新数据'));
    assert.ok(loads > oldLoads);
    // Same phone conflict, entered directly through Space (not dashboard notice).
    await page.evaluate(() => {
      state.turtles[0].price = 460;
      state.cloudMergeBase = null;
      pauseCloudSync('ACCOUNT_DATA_CONFLICT');
      render();
    });
    cloud.dataRevision = 'v2';
    await page.evaluate(() => { restoredSnapshotRenderHoldUntil = Date.now() + 5000; });
    await page.locator('#app [data-review-cloud-conflict]').tap();
    await page.locator('#app .sync-conflict-review').waitFor();
    await page.locator('#app [data-back]').tap();
    await page.locator('#app [data-page="sync"]').tap();
    await page.locator('#app [data-review-cloud-conflict]').tap();
    await page.waitForFunction(() => !syncPageActionBusy);
    console.log('Touch sync and review buttons respond.');
    // Restore a rendered snapshot with no per-node listeners (WebView/HTML
    // fallback), then tap again. Delegation must survive the DOM replacement.
    await page.evaluate(() => {
      const fragment = document.createDocumentFragment();
      for (const child of [...$app.childNodes]) fragment.appendChild(child.cloneNode(true));
      $app.replaceChildren(fragment);
    });
    await page.locator('#app [data-review-cloud-conflict]').tap();
    await page.waitForFunction(() => !syncPageActionBusy);
    await page.locator('#app .sync-conflict-review').waitFor();
    await page.locator('#app details summary').tap();
    // Both the quota-warning export and the regular settings export must work.
    await page.evaluate(() => { localBackupFailed = true; render(); document.querySelector('#app details').open = true; });
    const exports = page.locator('#app [data-export-local-backup]');
    assert.equal(await exports.count(), 2);
    for (let i = 0; i < 2; i++) {
      const download = page.waitForEvent('download', { timeout: 5000 });
      await exports.nth(i).tap();
      assert.ok((await download).suggestedFilename().endsWith('.json'));
    }
    console.log('Both backup export buttons respond, including storage-warning layout.');
    await page.evaluate(() => { localBackupFailed = false; render(); document.querySelector('#app details').open = true; });
    const chooserEvent = page.waitForEvent('filechooser');
    await page.locator('#app [data-import-reviewed-recovery]').tap();
    await (await chooserEvent).setFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('已核对'));
    assert.equal(saves, 0, 'invalid import never uploads or clears records');
    // Native export boundary: trigger actual click -> registered plugin method.
    await page.evaluate(() => {
      window.exportedBackups = [];
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { TurtleMediaPicker: {
        exportText: async payload => { window.exportedBackups.push(payload); return { cancelled: true }; }
      } } };
    });
    await page.locator('#app [data-export-local-backup]').tap();
    await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('已取消导出'));
    assert.equal(await page.evaluate(() => exportedBackups.length), 1);
    assert.equal(await page.evaluate(() => TurtleLocalData.parse(exportedBackups[0].content.replace(/^\ufeff/, '')).data.turtles[0].price), 460);
    await page.evaluate(() => { Capacitor.Plugins.TurtleMediaPicker.exportText = async payload => ({ saved: true, filename: payload.filename }); });
    await page.locator('#app [data-export-local-backup]').tap();
    await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('已保存'));
    // Network stalls must show activity immediately and release for a retry.
    loadMode = 'slow';
    await page.locator('#app [data-review-cloud-conflict]').tap();
    await page.locator('#app [data-sync-action-status]').filter({ hasText: '正在' }).waitFor({ timeout: 1500 });
    await page.waitForFunction(() => document.querySelector('#app [data-sync-action-status]')?.textContent.includes('超时'), null, { timeout: 21000 });
    assert.equal(await page.evaluate(() => readPendingCloudData().data.turtles[0].price), 460);
    loadMode = 'offline';
    await page.locator('#app [data-review-cloud-conflict]').tap();
    await page.waitForFunction(() => !document.querySelector('#app [data-review-cloud-conflict]').disabled);
    loadMode = 'ok';
    await page.locator('#app [data-toggle-sync]').tap();
    await page.locator('#app .sync-conflict-review').waitFor();
    const choice = page.locator('#app [data-cloud-conflict-choice][value="remote"]');
    await choice.first().waitFor();
    for (let i = 0; i < await choice.count(); i++) await choice.nth(i).tap();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#app [data-apply-cloud-conflict]').tap();
    await page.waitForFunction(() => !readPendingCloudData() && !cloudSyncIsPaused());
    assert.equal(await page.evaluate(() => state.turtles[0].price), 450);
    assert.deepEqual(errors, []);
    console.log('Touch controls passed: sync, conflict review, choices/confirm, both exports, file chooser, invalid import, native export cancellation, timeout/offline retry and original-data preservation.');
  } catch (error) {
    if (page) console.log(await page.evaluate(() => ({ page: state.page, paused: cloudSyncIsPaused(), pending: Boolean(readPendingCloudData()), body: document.body.innerText.slice(-2000) })));
    throw error;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
