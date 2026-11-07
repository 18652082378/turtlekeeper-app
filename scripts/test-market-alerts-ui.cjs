'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, engine } = require('./browser-test-engine.cjs'), fixture = require('./ui-audit-fixture.cjs');
const { runtime } = require('./mediation-test-runtime.cjs');
const { CONSENT_VERSION } = require('../server/market-alerts');
const root = path.resolve(__dirname, '..');
const platform = process.env.MOBILE_UI_PLATFORM || (engine === 'webkit' ? 'ios' : 'android');
const assets = path.join(root, platform === 'ios' ? 'ios/App/App/public' : 'android/app/src/main/assets/public');
(async () => {
  const r = await runtime(), browser = await launchBrowser(), errors = [], checks = [];
  const output = path.join(root, 'output/market-alerts-' + engine); fs.mkdirSync(output, { recursive: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    let fail = false, malformed = false, hold = false, large = false, release, heldBody, updates = 0;
    await ctx.route('**/*', async route => {
      const url = new URL(route.request().url()); if (url.origin !== r.base) return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: `window.TURTLE_API_BASE_URL=${JSON.stringify(r.base)};` });
      if (url.pathname.startsWith('/api/market/alerts/')) {
        const body = route.request().postDataJSON(); if (typeof body.enabled === 'boolean') updates++;
        if (hold) { hold = false; heldBody = body; await new Promise(resolve => release = resolve); }
        if (fail) { fail = false; return route.fulfill({ status: 503, json: { ok: false, message: '测试读取失败' } }); }
        if (malformed) { malformed = false; return route.fulfill({ json: { ok: true, listings: [null], speciesName: '错误' } }); }
        if (large && url.pathname.endsWith('/open')) { const response = await route.fetch(), data = await response.json(); data.listings = Array.from({ length: 61 }, (_, i) => ({ ...data.listings[0], id: 'synthetic-more-' + i })); return route.fulfill({ json: data }); }
        return route.continue();
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, posts: [], listings: [], friends: [], messages: [], minimumBuild: 0 } });
      const file = path.resolve(assets, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(assets + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    await ctx.addInitScript(({ platform }) => {
      const app = { getInfo: async () => ({ build: '142' }), getLaunchUrl: async () => ({}), addListener: async () => ({ remove() {} }) };
      const push = { checkPermissions: async () => ({ receive: 'denied' }), requestPermissions: async () => ({ receive: 'denied' }), addListener: async () => ({ remove() {} }), register: async () => {}, unregister: async () => {} };
      const bars = { setTheme: async () => {}, getDisplayMetrics: async () => ({}), addListener: async (_name, callback) => { callback({ visible: false }); return { remove() {} }; } };
      const plugins = { App: app, TurtleAndroidWindow: bars, PushNotifications: push, TurtleAndroidPush: push };
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform, Plugins: plugins, registerPlugin: name => plugins[name] || {} };
    }, { platform });
    const page = await ctx.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
    await page.goto(r.base + '/?skipIntro=1');
    async function seed(name, target = 'mine') {
      await page.evaluate(({ base, phone, token, target }) => {
        dismissTradeIntro?.(); TurtleReleaseNotes.cancel();
        state = { ...initialState, ...emptyAccountData(), ...base, page: target, loggedInPhone: phone, cloudToken: token, marketFeedInitialized: true };
        marketLoading = communityLoading = messageUnreadLoading = true; forceUpdateState = { required: false }; edgeBackSnapshots = []; cloudHydrationComplete = true; render();
      }, { base: fixture(), phone: r.accounts[name], token: r.token(name), target });
    }
    await seed('alice'); await page.locator('[data-page="marketAlerts"]').first().click(); await page.waitForSelector('[data-market-alert-form]');
    assert.equal(await page.locator('[name="enabled"]').isChecked(), false); assert.match(await page.locator('.market-alert-enable').innerText(), /商品推广通知/);
    await page.locator('[name="search"]').fill('果核蛋龟'); await page.locator('[name="species"][value="GHG"]').check(); await page.locator('[name="enabled"]').check();
    hold = true; await page.locator('[data-market-alert-form] [type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('[data-market-alert-form] [type="submit"]')?.disabled);
    for (let i = 0; i < 100 && !release; i++) await new Promise(resolve => setTimeout(resolve, 20)); assert.ok(release); assert.equal(heldBody.confirmed, true); assert.equal(heldBody.consentVersion, CONSENT_VERSION);
    await page.evaluate(() => { document.querySelector('[data-market-alert-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); release();
    await page.waitForFunction(() => !document.querySelector('[data-market-alert-form] [type="submit"]')?.disabled); assert.equal(updates, 1); assert.equal(r.disk().users[r.accounts.alice].marketAlertSettings.enabled, true);
    checks.push('Opt-in defaults off; selected real species and explicit consent save once through real HTTP API');
    for (const theme of ['teal', 'dark']) for (const width of [280, 320, 390, 720, 1280]) {
      await page.setViewportSize({ width, height: 844 }); await page.evaluate(theme => { state.themeColor = theme; render(); }, theme);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${theme}/${width}`);
      assert.equal(await page.locator('[name="enabled"]').isChecked(), true);
      if (width === 390) await page.screenshot({ path: path.join(output, 'settings-' + theme + '.png'), fullPage: true });
    }
    await page.locator('[name="enabled"]').uncheck(); fail = true; await page.locator('[data-market-alert-form] [type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('[data-market-alert-error]')?.textContent.includes('读取失败')); assert.equal(await page.locator('[name="enabled"]').isChecked(), false);
    await page.locator('[data-market-alert-form] [type="submit"]').click(); await page.waitForFunction(() => !document.querySelector('[data-market-alert-form] [type="submit"]')?.disabled); assert.equal(r.disk().users[r.accounts.alice].marketAlertSettings.enabled, false);
    checks.push('Ten layouts retain selections, retry preserves choices and turning off persists');
    await seed('bob', 'marketAlerts'); await page.waitForSelector('[data-market-alert-form]'); assert.equal(await page.locator('[name="enabled"]').isChecked(), false);
    hold = true; release = undefined; await page.locator('[data-market-alert-retry]').click();
    for (let i = 0; i < 100 && !release; i++) await new Promise(resolve => setTimeout(resolve, 20)); assert.ok(release);
    await seed('alice', 'marketAlerts'); await page.waitForSelector('[data-market-alert-form]'); release(); await page.waitForTimeout(60); assert.equal(await page.locator('[name="enabled"]').isChecked(), false);
    checks.push('Late response after switching accounts cannot replace current settings');
    await r.stop(); const db = r.disk(); db.users[r.accounts.alice].marketAlertReceipts = [{ id: 'synthetic-receipt', speciesCode: 'GHG', listingIds: [r.listing.id], createdAt: new Date().toISOString() }];
    const file = path.join(r.directory, 'data/app-data.json'); fs.writeFileSync(file, JSON.stringify(db)); await r.start();
    await page.evaluate(() => { queueNativePushAction({ data: { route: 'marketAlerts', receiptId: 'synthetic-receipt' } }); });
    await page.waitForSelector('[data-view-market]'); assert.match(await page.locator('.market-alert-page').innerText(), /当前可查看 1 条/); assert.equal(await page.locator('[data-view-market]').count(), 1);
    await page.locator('[data-view-market]').first().click(); await page.waitForFunction(() => state.page === 'marketDetail'); assert.equal(await page.evaluate(() => state.selectedMarketListingId), r.listing.id);
    await page.evaluate(() => TurtleMarketAlerts.openReceipt(marketAlertsContext(), 'synthetic-receipt')); await page.waitForSelector('[data-view-market]');
    await page.screenshot({ path: path.join(output, 'results.png'), fullPage: true });
    await seed('bob', 'mine'); await page.evaluate(() => TurtleMarketAlerts.openReceipt(marketAlertsContext(), 'synthetic-receipt')); await page.waitForSelector('[data-market-alert-retry]'); assert.match(await page.locator('.market-alert-page').innerText(), /不属于/); assert.equal(await page.locator('[data-view-market]').count(), 0);
    await seed('alice', 'mine'); malformed = true; await page.evaluate(() => TurtleMarketAlerts.openReceipt(marketAlertsContext(), 'synthetic-receipt')); await page.waitForSelector('[data-market-alert-retry]'); assert.match(await page.locator('.market-alert-page').innerText(), /信息不完整/);
    await page.locator('[data-market-alert-retry]').click(); await page.waitForSelector('[data-view-market]');
    checks.push('Native push tap opens owned receipt, real listing detail works, other owner and malformed responses are rejected with retry');
    await seed('alice', 'marketAlerts'); await page.waitForSelector('[data-market-alert-form]'); await page.locator('[name="enabled"]').check(); hold = true; release = undefined;
    await page.locator('[data-market-alert-form] [type="submit"]').click();
    for (let i = 0; i < 100 && !release; i++) await new Promise(resolve => setTimeout(resolve, 20)); assert.ok(release);
    await page.evaluate(() => TurtleMarketAlerts.openReceipt(marketAlertsContext(), 'synthetic-receipt')); await page.waitForSelector('[data-view-market]'); fail = true; release();
    await page.waitForTimeout(100); assert.equal(await page.locator('[data-market-alert-retry]').count(), 0);
    await page.evaluate(() => setState({ page: 'marketAlerts' }, { skipSave: true, skipCloud: true })); await page.waitForSelector('[data-market-alert-form]');
    await page.waitForFunction(() => !document.querySelector('[data-market-alert-form] [type="submit"]')?.disabled); assert.equal(await page.locator('[name="enabled"]').isChecked(), true);
    large = true; await page.evaluate(() => TurtleMarketAlerts.openReceipt(marketAlertsContext(), 'synthetic-receipt')); await page.waitForFunction(() => document.querySelectorAll('[data-view-market]').length === 30);
    await page.locator('[data-market-alert-more]').click(); assert.equal(await page.locator('[data-view-market]').count(), 60); await page.locator('[data-market-alert-more]').click(); assert.equal(await page.locator('[data-view-market]').count(), 61);
    for (const theme of ['teal', 'dark']) for (const width of [280, 320, 390, 720]) {
      await page.setViewportSize({ width, height: 844 }); await page.evaluate(theme => { state.themeColor = theme; render(); }, theme);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Receipt products ${theme}/${width}`);
      if (width === 390) await page.screenshot({ path: path.join(output, 'results-' + theme + '.png'), fullPage: false });
    }
    checks.push('Pending save failure cannot contaminate another page or lock controls; 61 receipt products render in 30-card windows without loss');
    assert.deepEqual(errors, []); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(`PASS ${engine}: market alert consent, save/retry, account isolation, owned receipt tap/detail, pagination and 18 responsive layouts. No real pushes.`);
  } finally { await browser.close(); await r.stop(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
