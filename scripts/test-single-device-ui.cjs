const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let replaced = false, offline = false, checks = 0;
    const user = { phone: '13900000008', token: 'original-token', accountName: '单设备测试', termsVersion: '2026-09-01', dataRevision: 'revision-1', updatedAt: '2026-09-17T00:00:00Z', data: { turtles: [], ledgerRecords: [], memos: [], breedingRecords: [] } };
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'session.test') return route.abort();
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/account/session') {
          checks++;
          if (offline) return route.abort();
          if (replaced) return route.fulfill({ status: 401, json: { ok: false, code: 'ACCOUNT_SESSION_REPLACED', message: '账号已在其他设备登录，请重新登录' } });
        }
        if (url.pathname === '/api/account/load') return route.fulfill({ json: { ok: true, user } });
        return route.fulfill({ json: { ok: true, minimumBuild: 95, latestBuild: 99, posts: [], listings: [], friends: [], notifications: [], items: [] } });
      }
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://session.test"; window.TURTLE_APP_BUILD=111;' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    await page.addInitScript(user => {
      if (localStorage.getItem('turtlekeeper-state-v1')) return;
      localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ ...user.data, loggedInPhone: user.phone, cloudToken: user.token, accountName: user.accountName, registeredUsers: [{ ...user, cloudToken: user.token }] }));
    }, user);
    await page.goto('https://session.test/');
    await page.waitForFunction(() => cloudHydrationComplete);
    await page.evaluate(() => { window.dismissTradeIntro?.(); setState({ page: 'account' }, { skipCloud: true }); });
    offline = true;
    const before = checks;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.ok(checks > before);
    assert.equal(await page.evaluate(() => state.loggedInPhone), user.phone, 'network failure must not log out');
    await page.evaluate(() => { state.memos = [{ id: 'unsynced', title: '尚未同步的护理记录', date: '2026-09-17' }]; });
    offline = false; replaced = true;
    // Do not trigger a request manually: the foreground heartbeat must detect eviction.
    await page.waitForFunction(() => state.page === 'account' && !state.loggedInPhone, { timeout: 10000 });
    await page.locator('#accountForm').waitFor();
    assert.match(await page.locator('[role="alert"]').innerText(), /账号已在其他设备登录，请重新登录/);
    assert.equal(await page.evaluate(() => currentCloudToken()), '');
    assert.equal(await page.evaluate(() => readSavedCloudToken('13900000008')), '');
    assert.equal(await page.evaluate(() => readPendingCloudData()?.data.memos[0]?.id), 'unsynced');
    assert.equal(await page.evaluate(() => state.memos.length), 0, 'private records disappear from the signed-out view');
    fs.mkdirSync(path.join(root, 'output/session-qa'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'output/session-qa/relogin.png'), fullPage: true });
    await page.reload();
    await page.waitForFunction(() => typeof setState === 'function');
    await page.evaluate(() => { window.dismissTradeIntro?.(); setState({ page: 'account' }, { skipCloud: true }); });
    assert.equal(await page.evaluate(() => state.loggedInPhone), '');
    assert.match(await page.locator('[role="alert"]').innerText(), /其他设备登录/);
    assert.equal(await page.evaluate(() => readPendingCloudData()?.data.memos[0]?.id), 'unsynced');
    replaced = false;
    await page.evaluate(user => applyCloudUser({ ...user, token: 'new-token' }, '', { skipCloud: true, skipMigration: true }), user);
    assert.equal(await page.evaluate(() => state.accountSessionNotice), '');
    assert.equal(await page.evaluate(() => currentCloudToken()), 'new-token');
    assert.deepEqual(errors, []);
    console.log('PASS: foreground eviction, login notice, private-view cleanup, credential cleanup, offline preservation, recovery journal, restart and re-login.');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
