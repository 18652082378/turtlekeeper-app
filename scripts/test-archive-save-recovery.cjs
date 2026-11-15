'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
const account = '13900000002', other = '13900000003';
const origin = 'https://archive-save.test';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.endsWith('/config.js')) return route.fulfill({ contentType: types['.js'], body: 'window.TURTLE_API_BASE_URL="https://archive-save.test";' });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { ok: false } });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404 });
      return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await page.goto(origin + '/?skipIntro=1');
    const beforeReload = await page.evaluate(({ account }) => {
      dismissTradeIntro?.();
      TurtleReleaseNotes?.cancel();
      window.confirm = () => true;
      window.testUser = (phone, turtles, dataRevision = 'base') => ({
        phone, token: 'token-' + phone, accountName: '测试用户', termsVersion: POLICY_VERSION, dataRevision,
        data: { ...emptyAccountData(), turtles, keptSpecies: ['GHG'] }
      });
      window.previous = { id: 'previous', speciesCode: 'GHG', code: '旧档案', status: '正常饲养' };
      window.next = { id: 'new', speciesCode: 'GHG', code: '新档案', status: '正常饲养' };
      apiPost = async () => { throw new Error('离线模拟'); };
      window.messages = [];
      toast = text => messages.push(text);
      applyCloudUser(testUser(account, [previous]), '', { skipCloud: true, skipMigration: true });
      localStorage.setItem(PENDING_CLOUD_DATA_STORAGE, TurtleLocalData.stringify({
        phone: account, data: testUser(account, [previous]).data, baseDataRevision: 'base'
      }));
      const original = Storage.prototype.setItem;
      window.failWrites = keys => {
        Storage.prototype.setItem = function (key, value) {
          if (keys.includes(key)) throw new DOMException('模拟存储空间不足', 'QuotaExceededError');
          return original.call(this, key, value);
        };
      };
      const journal = PENDING_CLOUD_DATA_STORAGE + ':' + account;
      failWrites([journal]);
      setState({ turtles: [next, previous], ledgerRecords: [{ id: 'receipt', turtleId: 'new', type: 'purchase', amount: 24 }],
        memos: [{ id: 'care-reminder', turtleId: 'new', title: '成长提醒' }] });
      failWrites([]);
      const disk = TurtleLocalData.parse(localStorage.getItem(STORAGE));
      return { ids: disk.turtles.map(turtle => turtle.id), phone: disk.loggedInPhone, pending: disk.pendingCloudChange,
        tokenPresent: Boolean(disk.cloudToken) };
    }, { account });
    assert.deepEqual(beforeReload, { ids: ['new', 'previous'], phone: account, pending: true, tokenPresent: true });
    await page.reload();
    assert.deepEqual(await page.evaluate(() => state.turtles.map(turtle => turtle.id)), ['new', 'previous']);
    const result = await page.evaluate(async ({ account, other }) => {
      const localData = accountDataSnapshot(state);
      const newIds = () => state.turtles.map(turtle => turtle.id);
      window.confirm = () => true;
      apiPost = async () => { throw new Error('offline'); };
      const savedOriginal = Storage.prototype.setItem;
      const blocked = keys => { Storage.prototype.setItem = function (key, value) {
        if (keys.includes(key)) throw new DOMException('quota', 'QuotaExceededError');
        return savedOriginal.call(this, key, value);
      }; };
      const user = (phone, data, revision, token = 'token-' + phone) => ({
        phone, token, accountName: '测试用户', termsVersion: POLICY_VERSION, data, dataRevision: revision
      });
      const cloud = { ...emptyAccountData(), turtles: localData.turtles.filter(turtle => turtle.id === 'previous'), keptSpecies: ['GHG'] };
      const initial = { archives: newIds(), ledger: state.ledgerRecords[0]?.turtleId, reminder: state.memos[0]?.turtleId };
      blocked([PENDING_CLOUD_DATA_STORAGE + ':' + account]);
      logoutAccount();
      const blockedLogout = state.loggedInPhone;
      blocked([]);
      logoutAccount();
      const signedOut = !state.loggedInPhone && !currentCloudToken();
      applyCloudUser(user(other, emptyAccountData(), 'other'), '', { skipCloud: true, skipMigration: true });
      const otherIds = newIds();
      setState({ turtles: [{ id: 'other-only', code: '另一账号', speciesCode: 'GHG' }] });
      logoutAccount();
      applyCloudUser(user(account, cloud, 'base'), '', { skipCloud: true, skipMigration: true });
      const afterLogin = newIds();
      const otherPending = readPendingCloudData(other)?.data.turtles.map(turtle => turtle.id);

      let finishSave;
      apiPost = () => new Promise(resolve => { finishSave = resolve; });
      const saving = pushCloudDataNow(true);
      blocked([STORAGE]);
      setState({ turtles: [{ id: 'during-save', code: '同步中新增', speciesCode: 'GHG' }, ...state.turtles] });
      blocked([]);
      finishSave({ user: user(account, localData, 'saved-base') });
      await saving;
      const afterAck = readPendingCloudData()?.data.turtles.map(turtle => turtle.id);
      const stillPending = readPendingCloudData()?.baseDataRevision;
      apiPost = async () => { throw new Error('offline'); };
      // Recreate old independent writes: the mirror is newer than the v1
      // pending record, with a shared, known cloud baseline.
      const modern = TurtleLocalData.parse(localStorage.getItem(STORAGE));
      const { pendingCloudChange, localWrite, ...legacy } = modern;
      const baseline = { phone: account, revision: 'saved-base', accountName: modern.accountName, accountAvatar: modern.accountAvatar, data: localData };
      localStorage.setItem(STORAGE, TurtleLocalData.stringify(legacy));
      localStorage.removeItem(PENDING_CLOUD_DATA_STORAGE + ':' + account);
      localStorage.setItem(PENDING_CLOUD_DATA_STORAGE, TurtleLocalData.stringify({
        phone: account, data: localData, accountName: modern.accountName, accountAvatar: modern.accountAvatar,
        baseDataRevision: 'saved-base', baseSnapshot: baseline
      }));
      return { initial, blockedLogout, signedOut, otherIds, otherPending, afterLogin, afterAck, stillPending };
    }, { account, other });
    assert.deepEqual(result, {
      initial: { archives: ['new', 'previous'], ledger: 'new', reminder: 'new' },
      blockedLogout: account, signedOut: true, otherIds: [], otherPending: ['other-only'],
      afterLogin: ['new', 'previous'], afterAck: ['during-save', 'new', 'previous'], stillPending: 'saved-base'
    });
    await page.reload();
    assert.deepEqual(await page.evaluate(() => state.turtles.map(turtle => turtle.id)), ['during-save', 'new', 'previous']);
    await page.evaluate(() => {
      dismissTradeIntro?.();
      TurtleReleaseNotes?.cancel();
      const write = Storage.prototype.setItem;
      window.testMessages = [];
      toast = message => testMessages.push(message);
      Storage.prototype.setItem = function (key, value) {
        if (key === STORAGE || key.startsWith(PENDING_CLOUD_DATA_STORAGE)) throw new DOMException('quota', 'QuotaExceededError');
        return write.call(this, key, value);
      };
      setState({ page: 'add', archivePurchaseMode: 'single', formDraft: {} }, { skipSave: true });
    });
    const form = page.locator('#turtleForm');
    await form.locator('[name="speciesCode"]').selectOption('GHG');
    await form.locator('[name="code"]').fill('真实表单档案');
    await form.locator('[name="weight"]').fill('30');
    await form.locator('[name="carapaceLength"]').fill('4');
    await form.locator('[name="price"]').fill('24');
    await form.locator('[type="submit"]').click();
    assert.deepEqual(await page.evaluate(() => ({
      failed: localBackupFailed, success: testMessages.some(message => message.includes('已保存到本机')),
      draftVisible: state.turtles[0]?.code === '真实表单档案'
    })), { failed: true, success: false, draftVisible: true });
    assert.equal(await page.locator('.reward-celebration').count(), 0, 'a failed save must not show a success screen');
    assert.equal(await page.evaluate(() => deviceRecoveryWrite), true, 'IndexedDB commits even when localStorage is full');
    await page.reload();
    await page.waitForFunction(() => state.turtles.some(turtle => turtle.code === '真实表单档案'));
    assert.ok(await page.evaluate(() => readPendingCloudData()?.data.turtles.some(turtle => turtle.code === '真实表单档案')));
    await page.reload();
    assert.deepEqual(await page.evaluate(() => {
      const turtle = state.turtles.find(t => t.code === '真实表单档案');
      return {
        hasArchive: Boolean(turtle),
        ledger: state.ledgerRecords.some(record => record.turtleId === turtle?.id && Number(record.amount) === 24),
        reminder: state.memos.some(memo => memo.turtleId === turtle?.id && memo.growthReminder)
      };
    }), { hasArchive: true, ledger: true, reminder: true });
    const marketRace = await page.evaluate(async () => {
      const current = state.turtles.map(turtle => turtle.id);
      let release;
      apiPost = route => route === '/api/market/list'
        ? new Promise(resolve => { release = resolve; }) : Promise.reject(new Error('offline'));
      marketLoading = false;
      const refresh = refreshMarket(true);
      setState({ turtles: [{ id: 'market-race', code: '刷新中建档', speciesCode: 'GHG' }, ...state.turtles] });
      release({ listings: [], myListings: [], accountData: { ...emptyAccountData(), turtles: [] } });
      await refresh;
      return { current, after: state.turtles.map(turtle => turtle.id) };
    });
    assert.deepEqual(marketRace.after, ['market-race', ...marketRace.current]);
    await page.evaluate(async account => {
      await deviceRecoveryWrite;
      localStorage.setItem(AUTH_TOKEN_STORAGE, JSON.stringify({ [account]: currentCloudToken() }));
      localStorage.setItem(STORAGE, '{invalid json');
    }, account);
    await page.reload();
    await page.waitForFunction(() => state.turtles.some(turtle => turtle.id === 'market-race'));
    assert.deepEqual(await page.evaluate(() => state.turtles.map(turtle => turtle.id)), marketRace.after);
    assert.deepEqual(errors, []);
    console.log('PASS: archive, ledger and reminders survive quota failure, corrupt storage, restart, login, account switch and stale cloud/market responses.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
