// Browser-only synthetic accounts; all network access is intercepted locally.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { engine, launchBrowser, artifactName } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'client-mutation.test') return route.abort();
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://client-mutation.test";' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, latestBuild: 0, posts: [], listings: [], notifications: [], items: [] } });
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
  });
  const outcomes = [];
  async function check(name, run) {
    const page = await context.newPage();
    try {
      await page.goto('https://client-mutation.test/?skipIntro=1');
      await page.evaluate(() => {
        window.dismissTradeIntro?.(); localStorage.clear(); window.confirm = () => true;
        state = { ...state, ...emptyAccountData(), loggedInPhone: 'audit-a', accountName: 'A', cloudToken: 'token-a', cloudAccountDataRevision: 'r1', registeredUsers: [], cloudSyncConflict: null, page: 'growth', policyConsentRequired: false,
          turtles: [{ id: 't1', code: 'T1', speciesCode: 'GHG', speciesName: '果核蛋龟', weight: 20, status: '正常饲养', measureHistory: [{ id: 'g1', updatedAt: '2026-09-27T10:00:00Z', oldSnapshot: { weight: 10 }, newSnapshot: { weight: 20 } }] }] };
        if (cloudSyncTimer) clearTimeout(cloudSyncTimer); cloudSyncTimer = null;
        cloudHydrationComplete = true; cloudSyncInFlight = false; cloudImageMigrationInFlight = false;
        window.auditNotes = []; toast = text => auditNotes.push(text);
        window.auditServer = structuredClone(accountDataSnapshot(state));
        window.auditUser = () => ({ phone: 'audit-a', token: 'token-a', accountName: 'A', accountAvatar: '', dataRevision: 'r2', updatedAt: '2026-09-28T00:00:00Z', termsVersion: POLICY_VERSION, data: structuredClone(auditServer) });
        window.auditDeleteCalls = 0;
        window.auditResolveDelete = null; window.auditRejectDelete = null;
        window.auditDeleteRequests = [];
        apiPost = async (route, payload) => {
          if (route === '/api/account/growth-record/delete') {
            auditDeleteCalls++;
            window.auditDeletePayload = structuredClone(payload);
            return new Promise((resolve, reject) => { window.auditResolveDelete = resolve; window.auditRejectDelete = reject; auditDeleteRequests.push({ resolve, reject }); });
          }
          if (route === '/api/account/save') { auditServer = structuredClone(payload.data); return { ok: true, user: auditUser() }; }
          if (route === '/api/account/load') return { ok: true, user: auditUser() };
          return { ok: true };
        };
        window.auditStartDelete = () => { window.auditDeleting = deleteGrowthUpdate('t1', 'g1'); };
        window.auditCompleteDelete = async () => {
          if (auditResolveDelete) {
            auditServer.turtles[0].measureHistory = []; auditServer.turtles[0].weight = 10;
            auditDeleteRequests.forEach(request => request.resolve({ ok: true, user: auditUser() }));
          }
          await auditDeleting;
        };
        window.auditHoldAccountLoad = () => {
          const original = apiPost;
          window.auditLoadRequests = []; window.auditSaveCalls = 0;
          apiPost = async (route, payload) => {
            if (route === '/api/account/load') return new Promise(resolve => auditLoadRequests.push({ resolve, payload }));
            if (route === '/api/account/save') auditSaveCalls++;
            return original(route, payload);
          };
        };
        window.auditFinishAccountLoads = user => auditLoadRequests.forEach(request => request.resolve({ ok: true, user: user || auditUser() }));
      });
      await run(page);
      outcomes.push({ name, pass: true });
    } catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
    finally { await page.close(); }
  }
  try {
    await check('normal confirmed growth deletion uses its reviewed revision and keeps other records', async page => {
      const result = await page.evaluate(async () => {
        state.careRecords = [{ id: 'cloud-care', itemId: 'feeding', title: '喂食', note: '', date: '2026-09-28' }];
        auditServer = structuredClone(accountDataSnapshot(state));
        auditStartDelete(); await auditCompleteDelete();
        return { count: auditDeleteCalls, revision: auditDeletePayload.baseDataRevision, history: state.turtles[0]?.measureHistory.length, care: state.careRecords.map(item => item.id) };
      });
      assert.deepEqual(result, { count: 1, revision: 'r1', history: 0, care: ['cloud-care'] });
    });
    await check('repeated deletion trigger issues at most one destructive request', async page => {
      const result = await page.evaluate(async () => {
        const first = deleteGrowthUpdate('t1', 'g1'), second = deleteGrowthUpdate('t1', 'g1');
        window.auditDeleting = Promise.all([first, second]);
        await auditCompleteDelete();
        return { calls: auditDeleteCalls, history: state.turtles[0]?.measureHistory.length };
      });
      assert.deepEqual(result, { calls: 1, history: 0 });
    });
    await check('late growth deletion response cannot switch the active account', async page => {
      const result = await page.evaluate(async () => {
        auditStartDelete();
        state = { ...state, ...emptyAccountData(), loggedInPhone: 'audit-b', cloudToken: 'token-b', accountName: 'B', page: 'home', turtles: [{ id: 'b-turtle', code: 'B' }] };
        await auditCompleteDelete();
        return { phone: state.loggedInPhone, token: currentCloudToken(), id: state.turtles[0]?.id, page: state.page };
      });
      assert.deepEqual(result, { phone: 'audit-b', token: 'token-b', id: 'b-turtle', page: 'home' });
    });
    await check('late growth deletion response cannot replace a renewed session', async page => {
      const result = await page.evaluate(async () => {
        auditStartDelete(); state.cloudToken = 'renewed-token'; state.turtles[0].weight = 99;
        await auditCompleteDelete();
        return { token: currentCloudToken(), weight: state.turtles[0].weight };
      });
      assert.deepEqual(result, { token: 'renewed-token', weight: 99 });
    });
    await check('pending care data survives a growth history deletion', async page => {
      const result = await page.evaluate(async () => {
        state.careRecords = [{ id: 'pending-care', itemId: 'feeding', title: '喂食', note: '未同步', date: '2026-09-28' }];
        persistPendingCloudData(); auditStartDelete();
        await Promise.resolve(); await Promise.resolve();
        await auditCompleteDelete();
        return { care: state.careRecords.map(record => record.id), calls: auditDeleteCalls,
          pending: readPendingCloudData()?.data.careRecords.map(record => record.id),
          history: state.turtles[0].measureHistory.map(record => record.id) };
      });
      assert.deepEqual(result, { care: ['pending-care'], calls: 0, pending: ['pending-care'], history: ['g1'] });
    });
    for (const blocked of ['inflight', 'unhydrated', 'paused']) await check(`growth deletion waits for ${blocked} sync without changing data`, async page => {
      const result = await page.evaluate(async blocked => {
        if (blocked === 'inflight') cloudSyncInFlight = true;
        if (blocked === 'unhydrated') cloudHydrationComplete = false;
        if (blocked === 'paused') state.cloudSyncConflict = { phone: 'audit-a', code: 'ACCOUNT_DATA_CONFLICT' };
        await deleteGrowthUpdate('t1', 'g1');
        return { calls: auditDeleteCalls, history: state.turtles[0].measureHistory.map(record => record.id) };
      }, blocked);
      assert.deepEqual(result, { calls: 0, history: ['g1'] });
    });
    await check('care edit while deletion request is pending is retained', async page => {
      const result = await page.evaluate(async () => {
        auditStartDelete();
        state.careRecords = [{ id: 'new-care', itemId: 'feeding', title: '喂食', note: '请求过程中填写', date: '2026-09-28' }];
        persistPendingCloudData();
        await auditCompleteDelete();
        return state.careRecords.map(record => record.id);
      });
      assert.deepEqual(result, ['new-care']);
    });
    await check('same turtle edited during deletion is retained in a paused journal for explicit review', async page => {
      const result = await page.evaluate(async () => {
        auditStartDelete();
        state.turtles[0].weight = 35;
        state.turtles[0].measureHistory.unshift({ id: 'g2', updatedAt: '2026-09-28T12:00:00Z', oldSnapshot: { weight: 20 }, newSnapshot: { weight: 35 } });
        persistPendingCloudData();
        await auditCompleteDelete();
        return { weight: state.turtles[0].weight, history: state.turtles[0].measureHistory.map(record => record.id),
          pending: readPendingCloudData()?.data.turtles[0].measureHistory.map(record => record.id),
          paused: cloudSyncIsPaused(), success: auditNotes.some(note => note.includes('已删除这一次')) };
      });
      assert.deepEqual(result, { weight: 35, history: ['g2', 'g1'], pending: ['g2', 'g1'], paused: true, success: false });
    });
    await check('late deletion response does not reopen growth after user navigates away', async page => {
      const result = await page.evaluate(async () => {
        auditStartDelete(); state.page = 'memos'; await auditCompleteDelete(); return state.page;
      });
      assert.equal(result, 'memos');
    });
    await check('an unsupported deletion endpoint cannot report an unsynced history deletion as complete', async page => {
      const result = await page.evaluate(async () => {
        auditStartDelete(); auditRejectDelete(Object.assign(new Error('方法不支持'), { status: 405 }));
        await auditDeleting;
        return { history: state.turtles[0].measureHistory.map(record => record.id), success: auditNotes.some(note => note.includes('已删除这一次')) };
      });
      assert.deepEqual(result, { history: ['g1'], success: false });
    });
    for (const malformed of ['missing-data', 'unchanged-history']) await check(`deletion receipt ${malformed} cannot replace local archives`, async page => {
      const result = await page.evaluate(async malformed => {
        auditStartDelete();
        const user = auditUser(); if (malformed === 'missing-data') user.data = {};
        auditResolveDelete({ ok: true, user }); await auditDeleting;
        return { history: state.turtles[0]?.measureHistory.map(item => item.id), success: auditNotes.some(note => note.includes('已删除这一次')) };
      }, malformed);
      assert.deepEqual(result, { history: ['g1'], success: false });
    });
    await check('server revision conflict keeps current archives and does not claim deletion success', async page => {
      const result = await page.evaluate(async () => {
        auditStartDelete(); auditRejectDelete(Object.assign(new Error('云端记录发生变化'), { status: 409, code: 'ACCOUNT_DATA_CONFLICT' }));
        await auditDeleting;
        return { history: state.turtles[0].measureHistory.map(item => item.id), success: auditNotes.some(note => note.includes('已删除这一次')) };
      });
      assert.deepEqual(result, { history: ['g1'], success: false });
    });
    await check('manual sync from an old session cannot acknowledge a renewed session journal', async page => {
      const result = await page.evaluate(async () => {
        persistPendingCloudData(); auditHoldAccountLoad();
        const running = syncCloudAccountManually(); state.cloudToken = 'renewed-token';
        auditFinishAccountLoads(); await running;
        return { revision: state.cloudAccountDataRevision, pending: Boolean(readPendingCloudData()) };
      });
      assert.deepEqual(result, { revision: 'r1', pending: true });
    });
    await check('late conflict review from an old session cannot replace the current review', async page => {
      const result = await page.evaluate(async () => {
        state.turtles[0].weight = 35; persistPendingCloudData(); auditHoldAccountLoad();
        const running = openCloudConflictReview(); state.cloudToken = 'renewed-token';
        auditFinishAccountLoads(); await running;
        return { review: Boolean(cloudConflictReview), page: state.page, revision: state.cloudAccountDataRevision };
      });
      assert.deepEqual(result, { review: false, page: 'growth', revision: 'r1' });
    });
    for (const invalid of ['renewed-token', 'wrong-account']) await check(`conflict confirmation rejects ${invalid} before staging data`, async page => {
      const result = await page.evaluate(async invalid => {
        const snapshot = { accountName: 'A', accountAvatar: '', data: structuredClone(accountDataSnapshot(state)) };
        cloudConflictReview = { phone: 'audit-a', token: 'token-a', user: auditUser(), localSignature: accountSyncSignature(state),
          plan: TurtleAccountMerge.merge(snapshot, snapshot, snapshot), choices: {} };
        persistPendingCloudData(); auditHoldAccountLoad();
        const running = applyCloudConflictChoices();
        if (invalid === 'renewed-token') state.cloudToken = 'renewed-token';
        const user = auditUser(); if (invalid === 'wrong-account') user.phone = 'audit-b';
        auditFinishAccountLoads(user); await running;
        return { revision: state.cloudAccountDataRevision, saveCalls: auditSaveCalls, pending: Boolean(readPendingCloudData()) };
      }, invalid);
      assert.deepEqual(result, { revision: 'r1', saveCalls: 0, pending: true });
    });
    await check('a current session can confirm its reviewed choice and finish synchronization', async page => {
      const result = await page.evaluate(async () => {
        const baseline = { accountName: 'A', accountAvatar: '', data: structuredClone(accountDataSnapshot(state)) };
        state.turtles[0].weight = 35; auditServer.turtles[0].weight = 30;
        const local = { ...baseline, data: structuredClone(accountDataSnapshot(state)) };
        const remote = { ...baseline, data: structuredClone(auditServer) };
        const initial = TurtleAccountMerge.merge(baseline, local, remote);
        const choices = { [initial.conflicts[0].key]: 'local' };
        cloudConflictReview = { phone: 'audit-a', token: 'token-a', user: auditUser(), localSignature: accountSyncSignature(state),
          plan: TurtleAccountMerge.merge(baseline, local, remote, choices), choices };
        persistPendingCloudData(); auditHoldAccountLoad();
        const running = applyCloudConflictChoices(); auditFinishAccountLoads(); await running;
        return { revision: state.cloudAccountDataRevision, weight: state.turtles[0].weight, saveCalls: auditSaveCalls, pending: Boolean(readPendingCloudData()) };
      });
      assert.deepEqual(result, { revision: 'r2', weight: 35, saveCalls: 1, pending: false });
    });
    await check('recovery file read cannot continue into a renewed session', async page => {
      const result = await page.evaluate(async () => {
        const snapshot = { accountName: 'A', accountAvatar: '', data: structuredClone(accountDataSnapshot(state)) };
        const backup = { ...snapshot, backupFormat: 'turtlekeeper-account-v1', recovery: { format: 'turtlekeeper-reviewed-recovery-v1', sources: [snapshot, snapshot] } };
        let finishFile, requests = 0;
        apiPost = async () => { requests++; return { ok: true, user: auditUser() }; };
        const running = importReviewedAccountRecovery({ size: 4096, text: () => new Promise(resolve => { finishFile = resolve; }) });
        state.cloudToken = 'renewed-token'; finishFile(JSON.stringify(backup)); await running;
        return { requests, token: currentCloudToken(), revision: state.cloudAccountDataRevision, notes: auditNotes.length };
      });
      assert.deepEqual(result, { requests: 0, token: 'renewed-token', revision: 'r1', notes: 0 });
    });
    for (const change of ['other-account', 'same-account-edit']) await check(`queued ${change} save resumes after a recovery request releases its lock`, async page => {
      const result = await page.evaluate(async change => {
        const source = { accountName: 'A', accountAvatar: '', data: structuredClone(accountDataSnapshot(state)) };
        const target = { ...source, data: { ...structuredClone(source.data), memos: [{ id: 'recovered-note', text: '已核对的提醒' }] } };
        const backup = { ...target, backupFormat: 'turtlekeeper-account-v1', recovery: { format: 'turtlekeeper-reviewed-recovery-v1', sources: [source, source] } };
        let finishRecovery, signalQueuedRequest;
        const savedPayloads = [];
        const resumed = new Promise(resolve => { signalQueuedRequest = resolve; });
        apiPost = async (route, payload) => {
          if (route === '/api/account/load') return { ok: true, user: auditUser() };
          if (route === '/api/account/save') {
            savedPayloads.push(structuredClone(payload));
            if (savedPayloads.length === 1) return new Promise(resolve => { finishRecovery = resolve; });
            signalQueuedRequest(true);
            // The resumed request reaches the mocked transport while offline;
            // its new edits must remain safely queued on the active account.
            throw new Error('synthetic offline');
          }
          return { ok: true };
        };
        const running = importReviewedAccountRecovery({ size: 4096, text: async () => JSON.stringify(backup) });
        for (let i = 0; i < 8 && !finishRecovery; i++) await Promise.resolve();
        if (!finishRecovery) throw new Error('recovery did not reach the held save');
        if (change === 'other-account') state = { ...state, ...emptyAccountData(), loggedInPhone: 'audit-b', cloudToken: 'token-b', accountName: 'B', cloudAccountDataRevision: 'b1', page: 'home' };
        state.careRecords = [{ id: 'queued-care', itemId: 'feeding', title: '喂食', note: '恢复请求期间的新记录', date: '2026-09-28' }];
        persistPendingCloudData(); await pushCloudDataNow();
        const wasQueued = cloudSyncQueued;
        finishRecovery({ ok: true, user: { ...auditUser(), data: target.data, dataRevision: 'recovered-r2' } });
        await running;
        const didResume = await Promise.race([resumed, new Promise(resolve => setTimeout(() => resolve(false), 1500))]);
        return { wasQueued, didResume, calls: savedPayloads.length, phone: savedPayloads[1]?.phone || '',
          queuedCare: savedPayloads[1]?.data.careRecords.map(item => item.id) || [],
          activePhone: state.loggedInPhone, journalPhone: readPendingCloudData()?.phone,
          journalCare: readPendingCloudData()?.data.careRecords.map(item => item.id), lock: cloudSyncInFlight };
      }, change);
      const phone = change === 'other-account' ? 'audit-b' : 'audit-a';
      assert.deepEqual(result, { wasQueued: true, didResume: true, calls: 2, phone, queuedCare: ['queued-care'], activePhone: phone, journalPhone: phone, journalCare: ['queued-care'], lock: false });
    });
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    fs.writeFileSync(path.join(root, 'output', artifactName('client-mutation-races.json')), JSON.stringify(outcomes, null, 2));
    console.log(`Browser engine: ${engine}; desktop simulation, not a native iPhone`);
    console.log(JSON.stringify(outcomes, null, 2));
    assert.ok(outcomes.every(item => item.pass), 'client mutation guards must pass');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
