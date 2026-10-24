// Synthetic accounts only. All browser requests are intercepted; no production login or writes.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'availability.test') return route.abort();
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://availability.test";' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, latestBuild: 0, listings: [], posts: [], notifications: [] } });
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
  });
  const outcomes = [];
  async function check(name, run) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto('https://availability.test/?skipIntro=1');
      await page.evaluate(() => {
        dismissTradeIntro?.(); localStorage.clear();
        window.fixtureListing = { id: 'sale-1', status: 'active', title: '果核蛋龟幼体', speciesName: '果核蛋龟', speciesCode: 'GHG', stage: 'juvenile', price: 100, isOwn: true,
          availabilityPolicy: 'confirmation-30d-v1', refreshedAt: new Date(Date.now() - 8 * 86400000).toISOString(), confirmedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
          confirmationDueAt: new Date(Date.now() - 86400000).toISOString(), expiresAt: new Date(Date.now() + 22 * 86400000).toISOString(), needsConfirmation: true };
        state = { ...state, ...emptyAccountData(), page: 'marketMy', loggedInPhone: 'audit-a', cloudToken: 'token-a', policyConsentRequired: false, marketMyTab: 'active', myMarketListings: [structuredClone(fixtureListing)] };
        if (cloudSyncTimer) clearTimeout(cloudSyncTimer); cloudSyncTimer = null; cloudHydrationComplete = true;
        window.auditNotes = []; window.auditCalls = [];
        toast = text => auditNotes.push(text);
        canUseCommunity = () => true;
        refreshMarket = async () => {};
        apiPost = async (url, payload) => {
          if (!['/api/market/confirm', '/api/market/refresh'].includes(url)) return { ok: true, listings: [], posts: [], notifications: [] };
          auditCalls.push({ url, payload });
          return { ok: true, listings: [fixtureListing], myListings: [{ ...fixtureListing, needsConfirmation: false, confirmedAt: new Date().toISOString(), confirmationDueAt: new Date(Date.now() + 7 * 86400000).toISOString(), expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() }] };
        };
        render();
      });
      await run(page);
      assert.deepEqual(errors, []);
      outcomes.push({ name, pass: true });
    } catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
    finally { await page.close(); }
  }
  try {
    for (const platform of ['web', 'ios', 'android']) await check(`${platform}: reminder and separate confirmation/refresh actions`, async page => {
      await page.evaluate(platform => { window.Capacitor = { getPlatform: () => platform, isNativePlatform: () => platform !== 'web' }; }, platform);
      assert.match(await page.locator('.my-market-notice').innerText(), /7 天.*30 天/);
      assert.match(await page.locator('.my-market-listing-main').innerText(), /待确认在售/);
      assert.equal(await page.locator('.my-market-listing-actions button').count(), 4);
      await page.getByRole('button', { name: '确认仍在售', exact: true }).click();
      assert.equal(await page.evaluate(() => auditCalls.filter(x => x.url === '/api/market/confirm').length), 1);
      assert.equal(await page.evaluate(() => auditCalls.some(x => x.url === '/api/market/refresh')), false);
      assert.equal(await page.evaluate(() => state.myMarketListings[0].refreshedAt === fixtureListing.refreshedAt), true);
      assert.match(await page.evaluate(() => auditNotes.at(-1)), /排序不变/);
      await page.getByRole('button', { name: '刷新曝光', exact: true }).click();
      assert.equal(await page.evaluate(() => auditCalls.filter(x => x.url === '/api/market/refresh').length), 1);
    });
    await check('old server/cached data never advertises unsupported confirmation or 30-day guarantee', async page => {
      await page.evaluate(() => { delete state.myMarketListings[0].availabilityPolicy; render(); });
      assert.equal(await page.locator('[data-confirm-market-listing]').count(), 0);
      assert.doesNotMatch(await page.locator('.my-market-page').innerText(), /30 天/);
    });
    await check('unsupported or malformed confirmation response preserves listings and has no refresh fallback', async page => {
      const result = await page.evaluate(async () => {
        apiPost = async url => { auditCalls.push({ url }); return { ok: true }; };
        await confirmOwnMarketListing('sale-1');
        return { calls: auditCalls, rows: state.myMarketListings, notes: auditNotes };
      });
      assert.equal(result.calls.length, 1); assert.equal(result.calls[0].url, '/api/market/confirm');
      assert.equal(result.rows[0].id, 'sale-1'); assert.match(result.notes.at(-1), /服务器尚未确认/);
    });
    await check('network rejection keeps data and allows a retry', async page => {
      const result = await page.evaluate(async () => {
        const normal = apiPost; apiPost = async () => { throw Error('网络连接失败'); };
        await confirmOwnMarketListing('sale-1');
        const kept = state.myMarketListings[0].id;
        apiPost = normal; await confirmOwnMarketListing('sale-1');
        return { kept, notes: auditNotes, calls: auditCalls.length };
      });
      assert.equal(result.kept, 'sale-1'); assert.match(result.notes[0], /网络连接失败/); assert.equal(result.calls, 1);
    });
    await check('duplicate click submits once and a late response cannot overwrite another account', async page => {
      const result = await page.evaluate(async () => {
        let finish;
        apiPost = async () => { auditCalls.push('confirm'); return new Promise(resolve => { finish = resolve; }); };
        const first = confirmOwnMarketListing('sale-1');
        await confirmOwnMarketListing('sale-1');
        state = { ...state, loggedInPhone: 'audit-b', cloudToken: 'token-b', myMarketListings: [{ id: 'b-sale' }] };
        finish({ ok: true, listings: [], myListings: [fixtureListing] }); await first;
        return { calls: auditCalls.length, rows: state.myMarketListings, notes: auditNotes };
      });
      assert.equal(result.calls, 1); assert.equal(result.rows[0].id, 'b-sale'); assert.equal(result.notes.length, 0);
    });
    await check('inactive reasons and explicit relisting preserve review restrictions', async page => {
      await page.evaluate(() => {
        state.marketMyTab = 'inactive';
        state.myMarketListings = ['manual', 'stale', 'restricted_species', 'report'].map((reason, i) => ({ ...fixtureListing, id: String(i), status: 'inactive', offlineReason: reason })); render();
      });
      assert.equal(await page.locator('[data-confirm-market-listing]').count(), 2);
      assert.equal(await page.locator('[data-refresh-market-listing]').count(), 0);
      assert.match(await page.locator('.my-market-list').innerText(), /你已手动下架/);
      assert.match(await page.locator('.my-market-list').innerText(), /该品种暂不支持出售/);
    });
    for (const width of [320, 390, 768]) await check(`readable layout at ${width}px`, async page => {
      await page.setViewportSize({ width, height: 844 });
      const layout = await page.locator('.my-market-listing').evaluate(el => ({
        right: el.getBoundingClientRect().right, width: document.documentElement.clientWidth,
        buttons: [...el.querySelectorAll('button')].map(b => ({ width: b.clientWidth, scroll: b.scrollWidth, height: b.getBoundingClientRect().height }))
      }));
      assert.ok(layout.right <= layout.width);
      for (const b of layout.buttons) { assert.ok(b.scroll <= b.width); assert.ok(b.height >= 35); }
      if (width === 390) {
        fs.mkdirSync(path.join(root, 'output/market-availability'), { recursive: true });
        await page.screenshot({ path: path.join(root, 'output/market-availability/my-listings-390.png'), fullPage: true });
      }
    });
  } finally { await browser.close(); }
  recordResult(root, 'market-availability-ui.json', { outcomes, nativeDevice: false });
  outcomes.forEach(result => console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ': ' + result.error : ''}`));
  if (outcomes.some(x => !x.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
