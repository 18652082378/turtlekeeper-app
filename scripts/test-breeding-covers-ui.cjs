'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const platform = process.env.MOBILE_UI_PLATFORM || 'android';
process.env.BROWSER_ENGINE ||= platform === 'ios' ? 'webkit' : 'chromium';
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..'), assetRoot = path.join(root, platform === 'ios' ? 'ios/App/App/public' : 'android/app/src/main/assets/public');
const seed = require('./ui-audit-fixture.cjs')();
const motherPhoto = seed.turtles[0].photo;
const nestPhoto = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#ced7bc"/><ellipse cx="33" cy="55" rx="17" ry="23" fill="#fff9e9"/><ellipse cx="70" cy="42" rx="17" ry="23" fill="#fff9e9"/></svg>');
const record = { date: '2026-10-01', eggCount: 6, fertileCount: 5, hatchCount: 2, motherId: 'ui-turtle', motherName: '果核一号 · 果核蛋龟', poolId: 'ui-pool', photo: '', editHistory: [] };
const records = [
  { ...record, id: 'own', photo: nestPhoto }, { ...record, id: 'mother' },
  { ...record, id: 'manual', motherId: 'manual', motherName: '一号蛋盒', incubationClosed: true },
  { ...record, id: 'deleted', motherId: 'deleted' },
  { ...record, id: 'batch', batchId: 'ui-batch', motherName: '九月孵化批次' },
  { ...record, id: 'own-broken', photo: 'https://covers.test/broken-record.png' },
  { ...record, id: 'both-broken', motherId: 'broken-mother', photo: 'https://covers.test/broken-record.png' },
  { ...record, id: 'mother-empty', motherId: 'empty-mother' }
];
(async () => {
  const browser = await launchBrowser(); let checks = 0; const errors = [];
  const output = path.join(root, 'output/breeding-covers'); fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url()); if (url.hostname !== 'covers.test') return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, items: [], notices: [] } });
      const file = path.resolve(assetRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(assetRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('https://covers.test/');
    await page.evaluate(() => { dismissTradeIntro?.(); TurtleReleaseNotes?.cancel(); });
    for (const theme of ['teal', 'dark']) for (const width of [280, 390, 720, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(({ seed, records, theme }) => {
        state = { ...initialState, ...emptyAccountData(), ...seed, page: 'breeding', themeColor: theme,
          turtles: [...seed.turtles, { ...seed.turtles[0], id: 'broken-mother', photo: 'https://covers.test/broken-mother.png' }, { ...seed.turtles[0], id: 'empty-mother', photo: '' }],
          breedingRecords: records, cloudToken: '', policyConsentRequired: false };
        forceUpdateState = { required: false }; render();
      }, { seed, records, theme });
      for (const id of ['own-broken', 'both-broken']) {
        await page.locator(`[data-view-breeding="${id}"]`).scrollIntoViewIfNeeded();
        await page.waitForFunction(id => {
          const cover = document.querySelector(`[data-view-breeding="${id}"] [data-breeding-cover]`);
          return id === 'own-broken' ? cover.querySelector('.breeding-cover-source') && cover.querySelector('[data-breeding-cover-image]')?.naturalWidth > 0 : !cover.querySelector('[data-breeding-cover-image]');
        }, id);
      }
      for (const id of ['own', 'mother', 'manual', 'deleted', 'batch', 'own-broken', 'both-broken', 'mother-empty']) {
        const cover = page.locator(`[data-view-breeding="${id}"] [data-breeding-cover]`);
        const box = await cover.boundingBox(); assert.equal(box.width, 54); assert.equal(box.height, 54);
        const artwork = cover.locator('img.breeding-cover-art');
        assert.equal(await artwork.count(), 1);
        assert.equal(await artwork.getAttribute('src'), './assets/breeding-hatchling-rounded-v1.png');
        await artwork.evaluate(img => img.decode());
        assert(await artwork.evaluate(img => img.naturalWidth > 0 && img.naturalWidth === img.naturalHeight), 'Bundled approved square illustration loads');
        const artBox = await artwork.boundingBox(); assert.equal(artBox.width, 54); assert.equal(artBox.height, 54); assert(!/^繁$/.test((await cover.innerText()).trim()));
        const hasPhoto = ['own', 'mother', 'own-broken'].includes(id);
        assert.equal(await cover.locator('[data-breeding-cover-image]').count(), Number(hasPhoto));
        assert.equal(await cover.locator('.breeding-cover-source').count(), Number(['mother', 'own-broken'].includes(id)));
        if (hasPhoto) {
          assert.equal(await cover.locator('[data-breeding-cover-image]').getAttribute('src'), id === 'own' ? nestPhoto : motherPhoto);
          const photoBox = await cover.locator('[data-breeding-cover-image]').boundingBox(); assert.equal(photoBox.width, 54); assert.equal(photoBox.height, 54);
        } else assert.equal(await cover.getAttribute('aria-label'), '龟蛋与破壳小龟插画');
        checks++;
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${platform}/${theme}/${width} stays within viewport`);
      assert.deepEqual(await page.evaluate(() => state.breedingRecords), records, 'Covers and failed image loads must not change business data');
      await page.evaluate(() => scrollTo(0, 0));
      if ([390, 1024].includes(width)) await page.screenshot({ path: path.join(output, `${platform}-${theme}-${width}.png`), fullPage: true });
      if (width === 390 && theme === 'teal') {
        await page.locator('[data-view-breeding="manual"]').screenshot({ path: path.join(output, `${platform}-placeholder-card.png`) });
      }
    }
    await page.evaluate(() => { state.page = 'breedingAdd'; render(); });
    assert.equal(await page.locator('#breedingForm .breeding-cover img.breeding-cover-art').count(), 1);
    const formArtBox = await page.locator('#breedingForm .breeding-cover-art').boundingBox();
    assert.equal(formArtBox.width, 64); assert.equal(formArtBox.height, 64); checks++;
    await page.evaluate(() => { state.page = 'breedingDetail'; state.selectedBreedingId = 'own'; state.breedingEditPhoto = ''; render(); });
    assert.equal(await page.locator('.breeding-photo-box > img').getAttribute('src'), nestPhoto);
    await page.locator('[data-clear-breeding-edit-photo]').click();
    assert.equal(await page.locator('.breeding-photo-box .breeding-cover img.breeding-cover-art').count(), 1);
    assert.equal(await page.evaluate(() => state.breedingRecords.find(r => r.id === 'own').photo), nestPhoto, 'Clearing an unsaved draft never silently changes stored photos'); checks++;
    await page.evaluate(() => {
      document.querySelector('main').insertAdjacentHTML('beforeend', '<div id="history-cover-check">' + renderBreedingHistorySnapshot({ motherId: 'ui-turtle' }, '', '上次') + '</div>');
    });
    assert.equal(await page.locator('#history-cover-check .breeding-cover [data-breeding-cover-image]').count(), 0, 'Historical absence is not replaced with a current mother photo');
    assert.equal(await page.locator('#history-cover-check .breeding-cover img.breeding-cover-art').count(), 1);
    const historyArtBox = await page.locator('#history-cover-check .breeding-cover-art').boundingBox();
    assert.equal(historyArtBox.width, 44); assert.equal(historyArtBox.height, 44); checks++;
    assert.deepEqual(errors, []); recordResult(root, 'breeding-covers-' + platform + '.json', { checks, errors });
    console.log(`PASS ${platform}: ${checks} breeding cover checks, image priority/failure, mother attribution, batch/manual/deleted associations, forms, history and responsive themes.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
