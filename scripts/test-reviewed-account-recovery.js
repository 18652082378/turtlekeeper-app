// Isolated browser fixtures. All requests outside recovery.test are blocked.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const codec = require('../assets/local-data-codec');
const clone = x => JSON.parse(JSON.stringify(x));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let cloud = { phone: '13900000008', accountName: '恢复测试', accountAvatar: '', token: 'fixture-token',
      updatedAt: '2026-09-11T12:00:00.000Z', dataRevision: 'cloud-1', termsVersion: '2026-09-01',
      data: { turtles: [{ id: 't1', code: '测试龟', speciesCode: 'GHG', speciesName: '果核蛋龟', status: '正常饲养' }],
        memos: [{ id: 'cloud-note', text: 'remote' }], ledgerRecords: [], activityLogs: [], breedingRecords: [], turtlePools: [] } };
    const local = { ...clone(cloud), data: { ...clone(cloud.data), memos: [{ id: 'local-note', text: 'local' }] } };
    let saves = 0, revision = 1, beforeSave = null, loseResponse = false;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'recovery.test') return route.abort();
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/account/load') return route.fulfill({ json: { ok: true, user: cloud } });
        if (url.pathname === '/api/account/save') {
          saves++;
          if (beforeSave) await beforeSave();
          const payload = route.request().postDataJSON();
          if (payload.baseDataRevision !== cloud.dataRevision) return route.fulfill({ status: 409, json: { ok: false, code: 'ACCOUNT_DATA_CONFLICT', message: 'stale' } });
          cloud = { ...cloud, data: payload.data, accountName: payload.accountName, accountAvatar: payload.accountAvatar, dataRevision: `saved-${++revision}` };
          if (loseResponse) return route.abort();
          return route.fulfill({ json: { ok: true, user: cloud } });
        }
        return route.fulfill({ json: { ok: true, minimumBuild: 95, latestBuild: 99, posts: [], listings: [], messages: [], notifications: [], friends: [], items: [], unreadCount: 0 } });
      }
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://recovery.test"; window.TURTLE_APP_BUILD=105;' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.addInitScript(fixture => {
      const conflict = { phone: fixture.phone, code: 'ACCOUNT_DATA_CONFLICT' };
      localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ ...fixture.data, accountName: fixture.accountName,
        loggedInPhone: fixture.phone, cloudToken: fixture.token, cloudSyncConflict: conflict, policyConsentRequired: false,
        registeredUsers: [{ ...fixture, cloudToken: fixture.token }] }));
      localStorage.setItem('turtlekeeper-pending-cloud-data-v1', JSON.stringify({ phone: fixture.phone,
        accountName: fixture.accountName, accountAvatar: '', data: fixture.data, conflict, baseDataRevision: 'old' }));
    }, local);
    await page.goto('https://recovery.test/?skipIntro=1');
    await page.waitForFunction(() => cloudHydrationComplete && cloudSyncIsPaused());
    let recovery = await page.evaluate(remote => {
      const local = { accountName: state.accountName, accountAvatar: state.accountAvatar || '', data: accountDataSnapshot(state) };
      const other = { accountName: remote.accountName, accountAvatar: '', data: normalizeAccountData(remote.data) };
      return { backupFormat: 'turtlekeeper-account-v1', ...local,
        data: { ...local.data, memos: [...local.data.memos, ...other.data.memos] },
        recovery: { format: 'turtlekeeper-reviewed-recovery-v1', sources: [local, other] } };
    }, cloud);
    const reset = async (source = recovery.recovery.sources[0]) => {
      await page.evaluate(source => {
        state = { ...state, ...normalizeAccountData(source.data), accountName: source.accountName, accountAvatar: source.accountAvatar,
          page: 'sync', cloudAccountDataRevision: 'old', cloudSyncConflict: { phone: state.loggedInPhone, code: 'ACCOUNT_DATA_CONFLICT' } };
        persistPendingCloudData(); saveState({ skipCloud: true }); render();
        window.recoveryMessages = []; toast = text => window.recoveryMessages.push(text); window.confirm = () => true;
      }, source);
    };
    const upload = async (file = recovery) => page.evaluate(async text => {
      await importReviewedAccountRecovery({ size: text.length, text: async () => text });
      return { messages: window.recoveryMessages, data: accountDataSnapshot(state), pending: Boolean(readPendingCloudData()), paused: cloudSyncIsPaused() };
    }, codec.stringify(file));

    await reset();
    await page.evaluate(() => { window.confirm = () => false; });
    assert.equal((await upload()).pending, true); assert.equal(saves, 0, 'cancel writes nothing');
    await reset();
    await page.locator('[data-reviewed-recovery-file]').setInputFiles({ name: 'reviewed.json', mimeType: 'application/json', buffer: Buffer.from(codec.stringify(recovery)) });
    await page.waitForFunction(() => !cloudSyncInFlight && !readPendingCloudData());
    assert.equal(saves, 1, 'confirmed file picker performs one conditional write');
    assert.deepEqual(cloud.data, recovery.data);
    assert.ok(await page.evaluate(() => localStorage.getItem('turtlekeeper-account-recovery-rollback-v1')));
    await reset(recovery.recovery.sources[1]);
    let result = await upload();
    assert.equal(saves, 1, 'second device adopts an already restored cloud without uploading again');
    assert.deepEqual(result.data, recovery.data); assert.equal(result.pending, false); assert.equal(result.paused, false);
    await reset();
    await page.evaluate(() => setState({ memos: [...state.memos, { id: 'new-local', text: 'after export' }] }));
    result = await upload();
    assert.ok(result.messages.some(m => m.includes('本机已有备份之外'))); assert.equal(saves, 1);
    await reset(); cloud.data.memos.push({ id: 'new-cloud', text: 'after export' });
    result = await upload();
    assert.ok(result.messages.some(m => m.includes('云端已有备份之外'))); assert.equal(saves, 1);
    cloud = { ...cloud, ...clone(recovery.recovery.sources[1]) };
    beforeSave = async () => { cloud.dataRevision = 'concurrent-cloud'; };
    result = await upload();
    assert.ok(result.messages.some(m => m.includes('恢复期间云端'))); assert.equal(result.pending, true);
    assert.deepEqual(result.data, recovery.recovery.sources[0].data);
    beforeSave = null; loseResponse = true;
    await upload();
    const afterLostResponse = saves;
    loseResponse = false;
    result = await upload();
    assert.equal(saves, afterLostResponse, 'lost acknowledgment retries do not duplicate writes');
    assert.deepEqual(result.data, recovery.data); assert.equal(result.pending, false);
    await reset(); cloud = { ...cloud, ...clone(recovery.recovery.sources[1]) };
    beforeSave = async () => { await page.evaluate(() => setState({ memos: [...state.memos, { id: 'during-save', text: 'must survive' }] })); };
    result = await upload();
    assert.ok(result.data.memos.some(m => m.id === 'during-save')); assert.equal(result.pending, true);
    assert.equal(await page.evaluate(() => state.cloudAccountDataRevision), 'old', 'concurrent edit retains its original base');
    beforeSave = null;
    await reset();
    const malformed = clone(recovery); malformed.data.turtles.push(clone(malformed.data.turtles[0]));
    const previousSaves = saves;
    assert.ok((await upload(malformed)).messages.some(m => m.includes('重复记录')));
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
    assert.equal((await upload()).pending, true); assert.equal(saves, previousSaves, 'backup storage failure prevents cloud writes');
    assert.deepEqual(errors, []);
    console.log('Reviewed recovery passed: confirmation, file picker, both devices, local/cloud new edits, CAS race, lost response, concurrent local edit, invalid IDs and rollback storage failure.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
