'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const platform = process.env.MOBILE_UI_PLATFORM || 'android';
process.env.BROWSER_ENGINE ||= platform === 'ios' ? 'webkit' : 'chromium';
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
const assetRoot = path.join(root, platform === 'ios' ? 'ios/App/App/public' : 'android/app/src/main/assets/public');
const fixture = require('./ui-audit-fixture.cjs')();
const cases = ['pools', 'breeding', 'growth', 'ledger', 'market', 'search-results'];
(async () => {
  const browser = await launchBrowser(); let checks = 0; const errors = [];
  const output = path.join(root, 'output/visual-placeholders'); fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url()); if (url.hostname !== 'artwork.test') return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, items: [], notices: [], listings: [] } });
      const file = path.resolve(assetRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(assetRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('https://artwork.test/');
    await page.evaluate(() => { dismissTradeIntro?.(); TurtleReleaseNotes?.cancel(); });
    for (const theme of ['teal', 'dark']) for (const width of [280, 390, 720, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of cases) {
        await page.evaluate(({ route, theme }) => {
          state = { ...initialState, ...emptyAccountData(), loggedInPhone: '13000000000', cloudToken: 'synthetic-ui-only',
            policyConsentRequired: false, themeColor: theme, page: route === 'search-results' ? 'market' : route,
            marketSearch: route === 'search-results' ? '测试不存在的品种' : '', marketFeedInitialized: true };
          forceUpdateState = { required: false }; render();
        }, { route, theme });
        const empty = page.locator('main .visual-empty'); assert.equal(await empty.count(), 1, route);
        assert.equal(await empty.locator('.visual-empty-art').count(), 1);
        assert((await empty.locator('strong').innerText()).length > 0);
        assert((await empty.locator('p').innerText()).length > 0);
        for (const img of await empty.locator('img').all()) await img.evaluate(el => el.decode());
        if (route === 'search-results') assert.equal(await empty.locator('[data-market-search-reset]').count(), 1);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route + ' does not overflow');
        const art = await empty.locator('.visual-empty-art').boundingBox(); assert(art.width === art.height && art.width > 0);
        assert.deepEqual(await page.evaluate(() => [state.turtles, state.turtlePools, state.ledgerRecords, state.breedingRecords]), [[], [], [], []]);
        if (width === 390) await page.screenshot({ path: path.join(output, `${platform}-${route}-${theme}.png`) });
        checks++;
      }
      await page.evaluate(({ fixture, theme }) => {
        const categories = ['龟粮', '耗材', '设备', '药品', '看病', '检测', '水电', '运输', '其他'];
        state = { ...initialState, ...emptyAccountData(), ...fixture, page: 'ledger', themeColor: theme, ledgerTab: 'all', ledgerDatePreset: 'all',
          cloudToken: '', policyConsentRequired: false, ledgerRecords: [...fixture.ledgerRecords.slice(0, 1).map(item => ({ ...item, photo: fixture.__image })),
            ...categories.map((category, i) => ({ id: 'expense-' + i, type: 'other', category, title: category + '支出', amount: 20, recordDate: '2026-10-01', createdAt: '2026-10-01T08:00:00Z' }))] };
        forceUpdateState = { required: false }; window.artworkLedgerSnapshot = JSON.stringify(state.ledgerRecords); render();
      }, { fixture, theme });
      const expected = ['feed', 'equipment', 'equipment', 'medicine', 'medicine', 'medicine', 'water', 'transport', 'receipt'];
      for (let i = 0; i < expected.length; i++) assert.equal(await page.locator(`[data-view-ledger="expense-${i}"] [data-placeholder-art]`).getAttribute('data-placeholder-art'), expected[i]);
      assert.equal(await page.locator('[data-view-ledger="ui-ledger"] .ledger-thumb').getAttribute('src'), fixture.__image, 'Uploaded photo stays first');
      assert(await page.evaluate(() => JSON.stringify(state.ledgerRecords) === window.artworkLedgerSnapshot), 'Drawing cannot rewrite ledger data');
      if (width === 390) await page.screenshot({ path: path.join(output, `${platform}-ledger-categories-${theme}.png`), fullPage: true });
      await page.evaluate(() => { state.ledgerDatePreset = 'week'; state.ledgerRecords = [{ id: 'old-expense', type: 'other', category: '龟粮', amount: 20, recordDate: '2020-01-01' }]; render(); });
      assert.equal(await page.locator('.visual-empty > strong').innerText(), '没有符合筛选的账目', 'A filtered account is not described as a new empty account');
      assert.equal(await page.locator('.visual-empty [data-new-ledger]').count(), 0);
      assert.equal(await page.evaluate(() => state.ledgerRecords.length), 1);
      await page.evaluate(() => {
        state.page = 'pools'; state.turtlePools = ['hatchling', 'juvenile', 'breeder', 'legacy'].map(type => ({ id: type, type, name: type, count: 0 })); render();
      });
      for (const type of ['hatchling', 'juvenile', 'breeder', 'legacy']) assert.equal(await page.locator(`[data-edit-turtle-pool="${type}"] [data-placeholder-art]`).getAttribute('data-placeholder-art'), type === 'legacy' ? 'pool' : type);
      await page.evaluate(() => {
        state.accountAvatar = ''; document.querySelector('main').insertAdjacentHTML('beforeend', '<section id="avatar-check">' + accountAvatarMarkup() + marketSellerAvatar({}, 'market-seller-avatar') + '<img id="default-cover-check" width="64" height="64" src="' + defaultPhoto + '"></section>');
      });
      assert.equal(await page.locator('#avatar-check .visual-avatar [data-placeholder-art="turtle"]').count(), 2);
      for (const avatar of await page.locator('#avatar-check .visual-avatar').all()) {
        const dims = await avatar.boundingBox(); assert(dims.width > 0 && dims.width === dims.height);
      }
      await page.locator('#default-cover-check').evaluate(img => img.decode());
      assert(await page.locator('#default-cover-check').evaluate(img => img.naturalWidth > 0));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Cards and avatars stay in viewport');
      if (width === 390) await page.screenshot({ path: path.join(output, `${platform}-pools-avatars-${theme}.png`) });
      await page.evaluate(photo => {
        state.accountAvatar = photo;
        document.querySelector('#avatar-check').innerHTML = accountAvatarMarkup() + marketSellerAvatar({ sellerAvatar: photo }, 'market-seller-avatar');
      }, fixture.__image);
      assert.equal(await page.locator('#avatar-check .visual-avatar').count(), 0, 'Custom avatars keep priority');
      for (const avatar of await page.locator('#avatar-check img').all()) assert.equal(await avatar.getAttribute('src'), fixture.__image);
      checks++;
    }
    // Empty-state actions navigate or open a draft; none create a record by themselves.
    for (const [route, selector, target] of [['pools', '[data-page="poolAdd"]', 'poolAdd'], ['breeding', '[data-page="breedingAdd"]', 'breedingAdd'], ['growth', '[data-page="home"]', 'home'], ['ledger', '[data-new-ledger="other"]', 'ledger']]) {
      await page.evaluate(route => { state = { ...initialState, ...emptyAccountData(), page: route, loggedInPhone: '13000000000', policyConsentRequired: false }; forceUpdateState = { required: false }; render(); }, route);
      await page.locator('.visual-empty ' + selector).click();
      assert.equal(await page.evaluate(() => state.page), target);
      if (route === 'ledger') assert.equal(await page.locator('#ledgerForm .visual-photo-placeholder [data-placeholder-art="receipt"]').count(), 1);
      assert.deepEqual(await page.evaluate(() => [state.turtles, state.turtlePools, state.ledgerRecords, state.breedingRecords]), [[], [], [], []]); checks++;
    }
    assert.deepEqual(errors, []);
    recordResult(root, 'visual-placeholders-' + platform + '.json', { checks, errors });
    console.log(`PASS ${platform}: ${checks} visual placeholder scenarios; categories, photo priority, empty actions, avatars, local artwork and responsive themes.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
