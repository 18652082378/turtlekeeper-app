'use strict';
// Check the actual preview iframe as well as the native Android bridge path.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const platform = process.env.MOBILE_UI_PLATFORM || 'android';
assert(['android', 'ios'].includes(platform));
process.env.BROWSER_ENGINE ||= platform === 'ios' ? 'webkit' : 'chromium';
const { launchBrowser } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..'), publicRoot = path.join(root, platform === 'ios' ? 'ios/App/App/public' : 'android/app/src/main/assets/public');
const output = path.join(root, 'output', platform, 'ledger-toolbar');
const sizes = [280, 300, 320, 360, 390, 399, 400, 414, 600, 720, 1100];
const records = [{ id: 'toolbar-buy', type: 'purchase', amount: 100 }, { id: 'toolbar-sale', type: 'sold', amount: 120 }, { id: 'toolbar-loss', type: 'loss', amount: 30 }, { id: 'toolbar-other', type: 'other', amount: 5 }].map(item => ({ ...item, title: '本地布局测试', recordDate: '2026-10-15' }));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png' };
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await launchBrowser();
  const checks = [], errors = [];
  try {
    for (const native of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1250, height: 1000 }, reducedMotion: 'reduce', timezoneId: 'Asia/Shanghai' });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'ledger.test' || url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, items: [], listings: [], posts: [] } });
        const file = url.pathname === '/' ? path.join(root, 'scripts/android/preview.html') : path.resolve(publicRoot, '.' + decodeURIComponent(url.pathname.replace(/^\/app/, '')));
        if (url.pathname !== '/' && !file.startsWith(publicRoot + path.sep)) return route.abort();
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
      });
      if (native) await context.addInitScript(platform => {
        const plugin = { addListener: async () => ({ remove() {} }), getLaunchUrl: async () => ({}), setTheme: async () => {}, getDisplayMetrics: async () => ({}) };
        window.Capacitor = { getPlatform: () => platform, isNativePlatform: () => true, Plugins: { App: plugin, TurtleAndroidWindow: plugin }, registerPlugin: () => plugin };
      }, platform);
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto('http://ledger.test/');
      const frame = page.frames().find(f => f.url().includes('/app/index.html'));
      assert(frame, 'Preview must contain the packaged Android iframe');
      await frame.waitForFunction(() => typeof render === 'function');
      await frame.evaluate(async () => { await document.fonts.ready; window.dismissTradeIntro?.(); window.TurtleReleaseNotes?.cancel(); });
      for (const width of sizes) for (const theme of ['teal', 'dark']) for (const populated of [false, true]) {
        await page.locator('#width').fill(String(width)); await page.locator('#apply').click();
        await frame.evaluate(({ theme, populated, records }) => {
          state = { ...initialState, ...emptyAccountData(), page: 'ledger', themeColor: theme, policyConsentRequired: false, loggedInPhone: '13000000000', ledgerDatePreset: 'all', ledgerTab: 'all', ledgerRecords: populated ? records : [] };
          forceUpdateState = { required: false }; pendingPageEnterMotion = false; render(); scrollTo(0, 0);
        }, { theme, populated, records });
        const geometry = await frame.evaluate(() => {
          const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
          return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, groups: ['.ledger-workspace > .memo-tabs [data-ledger-tab]', '.ledger-command-grid [data-ledger-date-preset]', '.ledger-command-grid [data-new-ledger]'].map(selector => [...document.querySelectorAll(selector)].map(e => {
            const range = document.createRange(); range.selectNodeContents(e);
            const text = range.getBoundingClientRect(); const r = rect(e);
            return { ...r, label: e.textContent, clipped: text.left < r.left - 1 || text.right > r.right + 1 || text.height > r.height + 1 };
          })) };
        });
        checks.push({ native, width, theme, populated, geometry });
        try {
          assert.equal(geometry.width, width);
          assert(geometry.documentWidth <= width + 1, 'No horizontal document overflow');
          assert.deepEqual(geometry.groups.map(g => g.length), [5, 3, 4]);
          assert.equal(await frame.locator('.visual-empty [data-new-ledger="other"]').count(), populated ? 0 : 1, 'The separate empty-state action is not a toolbar button');
          for (const group of geometry.groups) {
            assert(group.every(r => Math.abs(r.top - group[0].top) < 1), 'Ledger toolbar buttons must stay on one aligned row');
            assert(group.every(r => !r.clipped && r.height >= 44), 'Full labels and at least 44px button height');
            assert(group.every((r, i) => !i || r.left >= group[i - 1].right - 1), 'Buttons must not overlap');
          }
          if (width === 320 || width === 360) {
            await frame.locator('[data-ledger-tab="all"]').scrollIntoViewIfNeeded();
            await page.locator('#preview').screenshot({ path: path.join(output, `${native ? 'native' : 'preview'}-${width}-${theme}-${populated ? 'records' : 'empty'}.png`) });
          }
        } catch (error) { await page.locator('#preview').screenshot({ path: path.join(output, 'failure.png') }); throw error; }
      }
      // All categories must still select the right real records.
      for (const key of ['purchase', 'sold', 'loss', 'other', 'all']) {
        await frame.locator(`[data-ledger-tab="${key}"]`).click();
        assert.equal(await frame.evaluate(() => state.ledgerTab), key);
        assert.equal(await frame.locator('.ledger-row').count(), key === 'all' ? 4 : 1);
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log('PASS: ' + checks.length + ' ' + platform + ' ledger toolbar layouts in preview iframe/native paths, empty/populated states, both themes, category filtering.');
  } catch (error) { errors.push(error.message); throw error; }
  finally { fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ status: errors.length ? 'failed' : 'passed', checkedAt: new Date().toISOString(), nativeDevice: false, checks: checks.length, sizes, errors, results: checks }, null, 2)); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
