// Isolated HTTP + two browser stores. No production accounts, SMS or databases.
// --release serves every web asset from the exact build-119 Git commit.
// --compat substitutes ONLY the five reviewed, care-patched production functions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const release = process.argv.includes('--release'), compat = process.argv.includes('--compat');
const hotfix = process.argv.includes('--hotfix');
const revision = '7d97d55';
if (process.argv.includes('--server')) {
  assert.equal(process.env.HOST, '127.0.0.1');
  assert.ok(path.basename(process.env.TURTLE_RUNTIME_DIR || '').startsWith('tk-reliability-'));
  let source = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
  if (compat) {
    const { patch } = require('./deploy-care-inline.cjs');
    const { extract } = require('./deploy-care-persistence.cjs');
    const old = patch(fs.readFileSync(path.join(root, 'scripts/fixtures/reviewed-account-functions-20260927.js'), 'utf8'));
    source = source.replace(/\r\n/g, '\n');
    for (const name of ['emptyAccountData', 'normalizeAccountData', 'accountDataHasContent', 'accountRecordCounts', 'handleSaveAccount']) {
      source = source.replace(extract(source, name), () => extract(old, name));
    }
  }
  if (hotfix) source = require('./deploy-reliability-hotfix.cjs').patch(source);
  // Prevent loading any real service credentials from a developer's .env.
  source = source.replace('loadEnvFile(path.resolve(__dirname, ".env"));', '');
  const Module = require('node:module');
  const entry = path.join(root, 'server/server.js'), mod = new Module(entry, module);
  mod.filename = entry; mod.paths = Module._nodeModulePaths(path.dirname(entry));
  mod._compile(source, entry);
} else {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
async function main() {
  const { engine, launchBrowser, artifactName } = require('./browser-test-engine.cjs');
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-reliability-'));
  const listener = net.createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r));
  const port = listener.address().port; await new Promise(r => listener.close(r));
  const base = `http://127.0.0.1:${port}`;
  const offlineContexts = new WeakSet();
  async function setOffline(context, offline) {
    if (engine !== 'webkit') return context.setOffline(offline);
    // Windows WebKit rejects reload of even an intercepted static document
    // when its entire context is offline. Native iOS loads bundled web assets;
    // model that separately: keep static files available, fail every API call,
    // and persist the navigator.onLine fixture through an actual reload.
    if (offline) offlineContexts.add(context); else offlineContexts.delete(context);
    for (const page of context.pages()) await page.evaluate(offline => {
      if (offline) localStorage.setItem('__reliability_api_offline', '1');
      else localStorage.removeItem('__reliability_api_offline');
      if (offline) window.dispatchEvent(new Event('offline'));
    }, offline);
  }
  let child, browser, output = '';
  async function start() {
    child = spawn(process.execPath, [__filename, '--server', ...(compat ? ['--compat'] : []), ...(hotfix ? ['--hotfix'] : [])], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
        HOST: '127.0.0.1', PORT: String(port), TURTLE_RUNTIME_DIR: runtime,
        MYSQL_HOST: '', MYSQL_URL: '', MYSQL_STORAGE_MODE: 'legacy', SMS_PROVIDER: 'mock', SMS_MOCK: 'true',
        MIN_SUPPORTED_APP_BUILD: '117', LATEST_APP_BUILD: '119', ADMIN_PHONE: '13900000889' }
    });
    child.stdout.on('data', x => { output += x; }); child.stderr.on('data', x => { output += x; });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/api/app/version')).ok) return; } catch {}
      await new Promise(r => setTimeout(r, 60));
    }
    throw Error(output);
  }
  async function stop() { if (child && child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } }
  async function post(url, data) {
    const r = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const json = await r.json(); assert.ok(r.ok && json.ok, url + JSON.stringify(json)); return json;
  }
  const fields = ['turtles', 'careRecords', 'memos', 'breedingRecords', 'turtlePools', 'ledgerRecords', 'careCustomItems', 'carePlans'];
  const fixtures = {
    turtles: { code: '专项档案', speciesCode: 'GHG', speciesName: '果核蛋龟', status: '正常饲养', health: '健康', price: 0, measureHistory: [{ id: 'measurement', date: '2026-09-28', weight: 22 }] },
    careRecords: { title: '喂食', date: '2026-09-28', itemId: 'feeding', turtleRefs: [{ id: 'anchor', code: '留存档案', speciesName: '果核蛋龟' }], sourceMemoId: 'history-memo' },
    memos: { title: '喂食提醒', remindTime: '10:00', repeat: true, weekdays: ['1'], reminderEnabled: true, lastCompletedDate: '2026-09-28' },
    breedingRecords: { motherId: 'anchor', motherName: '留存档案', speciesCode: 'GHG', date: '2026-09-28', eggCount: 5, fertileCount: 4, hatchCount: 0, hatchEvents: [] },
    turtlePools: { name: '专项龟池', type: 'breeder', length: '60', width: '40', height: '30', count: 0, createdAt: '2026-09-28T01:00:00Z', updatedAt: '' },
    ledgerRecords: { type: 'other', title: '饲料', amount: 25.5, recordDate: '2026-09-28' },
    careCustomItems: { title: '清洗过滤器', createdAt: '2026-09-28T01:00:00Z' },
    carePlans: { name: '专项喂食计划', turtleRefs: [{ id: 'anchor' }] }
  };
  const results = [];
  try {
    await start();
    const phone = '13900000889';
    const sms = await post('/api/sms/send', { phone, purpose: 'register' });
    assert.equal(sms.mode, 'mock');
    let user = (await post('/api/account/register', { phone, code: sms.code, password: 'IsolatedPass123', accountName: '数据专项隔离账号', termsAccepted: true,
      deviceId: 'reliability-test-device-a', devicePlatform: 'ios' })).user;
    const auth = { phone, token: user.token, termsVersion: '2026-09-01' };
    user = (await post('/api/account/save', { ...auth, accountName: user.accountName, baseDataRevision: user.dataRevision,
      data: { ...user.data, turtles: [{ ...fixtures.turtles, id: 'anchor', code: '留存档案', measureHistory: [] }], keptSpecies: ['GHG'] } })).user;
    browser = await launchBrowser();
    const contexts = [], pages = [], errors = [], assets = new Map();
    for (const width of [390, 1280]) {
      if (width === 1280) user = (await post('/api/account/login', { phone, password: 'IsolatedPass123', termsAccepted: true,
        deviceId: 'reliability-test-device-b', devicePlatform: 'web' })).user;
      const context = await browser.newContext({ viewport: { width, height: 844 } }); contexts.push(context);
      if (engine === 'webkit') await context.addInitScript(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true,
          get: () => localStorage.getItem('__reliability_api_offline') !== '1' });
      });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) return route.abort();
        if (url.pathname.startsWith('/api/')) return offlineContexts.has(context) ? route.abort('internetdisconnected') : route.continue();
        if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: `window.TURTLE_API_BASE_URL=${JSON.stringify(base)};window.TURTLE_APP_BUILD=119;` });
        const relative = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
        const file = path.resolve(root, relative);
        if (!file.startsWith(root + path.sep)) return route.abort();
        try {
          if (!assets.has(relative)) assets.set(relative, release
            ? execFileSync('git', ['show', `${revision}:${relative}`], { cwd: root, maxBuffer: 16000000, stdio: ['ignore', 'pipe', 'ignore'] })
            : fs.readFileSync(file));
          return route.fulfill({ body: assets.get(relative), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
        } catch { return route.fulfill({ status: 404, body: '' }); }
      });
      await context.addInitScript(fixture => {
        if (localStorage.getItem('turtlekeeper-state-v1')) return;
        localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ ...fixture.data, loggedInPhone: fixture.phone,
          cloudToken: fixture.token, accountName: fixture.accountName, policyConsentRequired: false,
          registeredUsers: [{ ...fixture, cloudToken: fixture.token }] }));
      }, user);
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base); await page.waitForFunction(() => cloudHydrationComplete && state.cloudAccountDataRevision);
      pages.push(page);
    }
    const [a, b] = pages;
    assert.notEqual(await a.evaluate(() => currentCloudToken()), await b.evaluate(() => currentCloudToken()), 'two independent authenticated sessions');
    const refresh = page => page.evaluate(() => refreshCloudAccountFromServer());
    const settled = page => page.waitForFunction(() => !cloudSyncInFlight && !readPendingCloudData());
    async function snapshot(page, field) { return page.evaluate(field => accountDataSnapshot(state)[field], field); }
    async function checkEverywhere(field, expected) {
      for (const page of pages) { await refresh(page); assert.deepEqual(await snapshot(page, field), expected, field + ' cross-device full contents'); }
      assert.deepEqual((await post('/api/account/load', auth)).user.data[field], expected, field + ' API contents');
    }
    for (const field of fields) {
      const record = { ...fixtures[field], id: `audit-${field}`, note: '新增后离线重进' };
      if (field === 'careCustomItems') delete record.note;
      await setOffline(contexts[0], true);
      await a.evaluate(({ field, record }) => setState({ [field]: [...state[field], record] }), { field, record });
      await a.waitForFunction(() => !cloudSyncInFlight && !!readPendingCloudData());
      const expected = await snapshot(a, field);
      await a.reload(); await a.waitForFunction(() => !!state.loggedInPhone);
      assert.equal(await a.evaluate(() => navigator.onLine), false, field + ' remains offline after cold reload');
      assert.deepEqual(await snapshot(a, field), expected, field + ' offline cold reload');
      await setOffline(contexts[0], false); await a.evaluate(() => window.dispatchEvent(new Event('online'))); await settled(a);
      await checkEverywhere(field, expected);
      await a.reload(); await a.waitForFunction(() => cloudHydrationComplete); assert.deepEqual(await snapshot(a, field), expected);
      await b.evaluate(({ field, id }) => setState({ [field]: state[field].map(r => r.id === id ? { ...r, ...(field === 'careCustomItems' ? { title: '过滤清洁修改' } : { note: '另一设备编辑' }) } : r) }), { field, id: record.id });
      await settled(b); const edited = await snapshot(b, field); await checkEverywhere(field, edited);
      // A real same-record conflict must pause, survive reload, and require a choice.
      for (const context of contexts) await setOffline(context, true);
      for (const [i, page] of pages.entries()) await page.evaluate(({ field, id, i }) => {
        const change = field === 'careCustomItems' ? { title: `冲突选择${i}` } : { note: `冲突选择${i}` };
        setState({ [field]: state[field].map(r => r.id === id ? { ...r, ...change } : r) });
      }, { field, id: record.id, i });
      await setOffline(contexts[0], false); await a.evaluate(() => window.dispatchEvent(new Event('online'))); await settled(a);
      await setOffline(contexts[1], false); await b.evaluate(() => window.dispatchEvent(new Event('online')));
      await b.waitForFunction(() => cloudSyncIsPaused());
      await b.reload(); await b.waitForFunction(() => cloudHydrationComplete && cloudSyncIsPaused());
      const unsent = (await snapshot(b, field)).find(r => r.id === record.id);
      assert.equal(field === 'careCustomItems' ? unsent.title : unsent.note, '冲突选择1');
      await b.locator('[data-cloud-sync-notice] button').click();
      const choices = b.locator('[data-cloud-conflict-choice][value="local"]'); await choices.first().waitFor();
      for (let i = 0; i < await choices.count(); i++) await choices.nth(i).check();
      b.once('dialog', dialog => dialog.accept()); await b.locator('[data-apply-cloud-conflict]').click();
      await settled(b); assert.equal(await b.evaluate(() => cloudSyncIsPaused()), false);
      await checkEverywhere(field, await snapshot(b, field));
      // One device deletes offline while the other creates a different record.
      await setOffline(contexts[0], true);
      await a.evaluate(({ field, id }) => setState({ [field]: state[field].filter(r => r.id !== id) }), { field, id: record.id });
      const other = { ...record, id: record.id + '-other', title: '另一条', name: '另一条' };
      await b.evaluate(({ field, other }) => setState({ [field]: [...state[field], other] }), { field, other }); await settled(b);
      await a.reload(); await setOffline(contexts[0], false); await a.evaluate(() => window.dispatchEvent(new Event('online'))); await settled(a);
      const merged = await snapshot(a, field);
      assert.ok(!merged.some(r => r.id === record.id), field + ' deleted record must not resurrect');
      assert.ok(merged.some(r => r.id === other.id), field + ' concurrent addition must survive');
      await checkEverywhere(field, merged);
      results.push({ field, saveReload: 'pass', offlineRelaunch: 'pass', crossDeviceEdit: 'pass', conflictReloadAndUiResolution: 'pass', deleteConcurrentAdd: 'pass' });
      console.log('PASS', field, 'save/reload/offline/edit/delete/concurrent merge');
    }
    if (!compat || hotfix) {
      const pools = Array.from({ length: 201 }, (_, i) => ({ ...fixtures.turtlePools, id: `volume-${i}`, name: `龟池${i}` }));
      await a.evaluate(pools => setState({ turtlePools: pools }), pools); await settled(a);
      assert.equal((await post('/api/account/load', auth)).user.data.turtlePools.length, 201);
      await b.reload(); await b.waitForFunction(() => cloudHydrationComplete);
      assert.equal((await snapshot(b, 'turtlePools')).length, 201, '201 pools survive cloud load on second device');
    }
    const beforeRestart = (await post('/api/account/load', auth)).user.data;
    await stop(); await start();
    const afterRestart = (await post('/api/account/load', auth)).user.data;
    for (const field of fields) assert.deepEqual(afterRestart[field], beforeRestart[field], field + ' server restart');
    // Ordinary accounts permit one session: switching devices must retain cloud data.
    const otherPhone = '13900000888';
    const code = (await post('/api/sms/send', { phone: otherPhone, purpose: 'register' })).code;
    const ordinary = (await post('/api/account/register', { phone: otherPhone, code, password: 'IsolatedPass123',
      accountName: '普通验收账号', termsAccepted: true, data: beforeRestart, deviceId: 'ordinary-test-device-a', devicePlatform: 'ios' })).user;
    const switched = (await post('/api/account/login', { phone: otherPhone, password: 'IsolatedPass123', termsAccepted: true,
      deviceId: 'ordinary-test-device-b', devicePlatform: 'web' })).user;
    const expired = await fetch(base + '/api/account/load', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: otherPhone, token: ordinary.token }) });
    assert.equal(expired.status, 401);
    assert.equal((await expired.json()).code, 'ACCOUNT_SESSION_REPLACED');
    const switchedData = (await post('/api/account/load', { phone: otherPhone, token: switched.token })).user.data;
    for (const field of fields) assert.deepEqual(switchedData[field], beforeRestart[field], field + ' ordinary account device handoff');
    assert.deepEqual(errors, []);
    fs.mkdirSync(path.join(root, 'output/reliability-audit'), { recursive: true });
    fs.writeFileSync(path.join(root, 'output/reliability-audit', artifactName(`${release ? 'release119' : 'working'}-${compat ? 'compat-functions' : 'current-server'}${hotfix ? '-hotfix' : ''}.json`)), JSON.stringify({
      engine, platform: process.platform, nativeDevice: false,
      at: new Date().toISOString(), client: release ? revision : 'working tree', server: compat ? 'local server with five reviewed production hotfix functions' : 'local current server',
      environment: `localhost HTTP, synthetic account, JSON store, desktop ${engine}; not production or native iOS`,
      offlineMode: engine === 'webkit' ? 'bundled static fixture remains available; all API requests aborted; navigator.onLine and online/offline events simulated through reload' : 'browser context offline with routed static fixtures',
      results, serverRestart: 'pass',
      pool201: !compat || hotfix ? 'pass' : 'known truncation in old normalization, covered in guard reproduction', hotfix,
      auth: 'distinct tokens on synthetic admin account; ordinary single-session handoff checked by HTTP' }, null, 2));
    console.log('PASS server restart; LOCAL ONLY', { release, compat });
  } finally {
    if (browser) await browser.close(); await stop();
    assert.equal(path.dirname(runtime), os.tmpdir()); assert.ok(path.basename(runtime).startsWith('tk-reliability-'));
    fs.rmSync(runtime, { recursive: true, force: true });
  }
}
