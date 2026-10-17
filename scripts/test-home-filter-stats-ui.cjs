'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const platform = process.env.MOBILE_UI_PLATFORM || 'android';
process.env.BROWSER_ENGINE ||= platform === 'ios' ? 'webkit' : 'chromium';
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..'), assetRoot = path.join(root, platform === 'ios' ? 'ios/App/App/public' : 'android/app/src/main/assets/public');
const basic = { speciesCode: 'GHG', speciesName: '果核蛋龟', status: '正常饲养', health: '健康', poolId: 'one', acquiredDate: '2026-10-01', createdAt: '2026-10-01T00:00:00Z' };
const turtles = [
  ...Array.from({ length: 31 }, (_, i) => ({ ...basic, id: 'one-' + i, code: '个体' + i, gender: ['公', '母', '未知'][i % 3] })),
  ...[{ id: 'batch-one', gender: '母' }, { id: 'batch-two', poolId: 'two', health: '生病', gender: '公' }, { id: 'batch-dead', poolId: 'two', status: '已死亡', gender: '母' }, { id: 'batch-orphan', poolId: 'deleted', gender: '待判断' }].map(t => ({ ...basic, batchId: 'mixed', batchName: '跨池批次', code: t.id, ...t })),
  { ...basic, id: 'other', code: '虎泥', speciesCode: 'HNG', speciesName: '虎泥蛋龟', health: '生病', gender: '公' },
  { ...basic, id: 'sold', code: '已转让', status: '已转让', gender: '公' },
  { ...basic, id: 'none', code: '无龟池', speciesCode: 'HNG', speciesName: '虎泥蛋龟', poolId: '' }
];
const ledgerRecords = [
  ...['loss-one', 'loss-copy'].map(id => ({ id, type: 'loss', turtleId: 'removed-one', turtleSnapshot: { id: 'removed-one', speciesCode: 'GHG', poolId: 'one' } })),
  { id: 'loss-dead', type: 'loss', turtleId: 'batch-dead', turtleSnapshot: turtles.find(t => t.id === 'batch-dead') },
  { id: 'loss-other', type: 'loss', turtleId: 'removed-two', turtleSnapshot: { id: 'removed-two', speciesCode: 'HNG', poolId: 'two' } },
  { id: 'legacy', type: 'loss', turtleId: 'unknown' }
];
(async () => {
  const browser = await launchBrowser(); let checks = 0; const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url()); if (url.hostname !== 'filters.test') return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, items: [], notices: [] } });
      const file = path.resolve(assetRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(assetRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('https://filters.test/');
    await page.evaluate(() => { dismissTradeIntro?.(); TurtleReleaseNotes?.cancel(); });
    for (const width of [280, 390, 720]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(({ turtles, ledgerRecords }) => {
        state = { ...initialState, ...emptyAccountData(), loggedInPhone: '13000000000', accountName: '本地筛选测试', cloudToken: '', policyConsentRequired: false, page: 'home',
          turtles, ledgerRecords, turtleFilter: 'all', turtlePoolFilter: 'all', turtleSort: 'default',
          turtlePools: [{ id: 'one', name: '一号池' }, { id: 'two', name: '二号池' }, { id: 'empty', name: '空池' }], keptSpecies: ['GHG', 'HNG'] };
        forceUpdateState = { required: false }; render();
      }, { turtles, ledgerRecords });
      async function expectMetrics(total, species, healthy, sick, loss, active) {
        assert.deepEqual(await page.locator('.home-overview-metrics strong').allTextContents(), [total, species, healthy, sick, loss].map(String));
        assert.equal(await page.locator('.home-hero h2').innerText(), active + ' 只正在饲养');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${platform}/${width} fits`); checks++;
      }
      async function expectSex(total, name, male, female, unknown) {
        assert.equal((await page.locator('.archive-species-count').innerText()).replace(/\s+/g, ''), `共${total}只${name}·公${male}只母${female}只未知${unknown}只`);
        assert.equal(male + female + unknown, total);
        assert(await page.locator('.archive-species-count').evaluate(el => el.scrollWidth <= el.clientWidth), 'Species and sex summary wraps within the page');
        checks++;
      }
      await expectMetrics(38, 2, 34, 2, 4, 36);
      assert.equal(await page.locator('.archive-species-count').count(), 0, 'All-species view retains the archive row count');
      await page.locator('[data-archive-page="1"]').click(); await expectMetrics(38, 2, 34, 2, 4, 36);
      await page.locator('[data-filter-species]').selectOption('GHG'); await expectMetrics(36, 1, 33, 1, 2, 34);
      await expectSex(36, '果核蛋龟', 13, 12, 11);
      await page.locator('[data-archive-page="1"]').click(); await expectSex(36, '果核蛋龟', 13, 12, 11);
      await page.locator('[data-archive-page="0"]').click();
      assert.match(await page.locator('.archive-page-count').innerText(), /当前显示 1–30/);
      await page.locator('[data-filter-pool]').selectOption('one'); await expectMetrics(33, 1, 32, 0, 1, 32);
      await expectSex(33, '果核蛋龟', 12, 11, 10);
      await page.locator('[data-filter-pool]').selectOption('two'); await expectMetrics(2, 1, 0, 1, 1, 1);
      await expectSex(2, '果核蛋龟', 1, 1, 0);
      assert.equal(await page.locator('.turtle-batch-row').count(), 1);
      assert.match(await page.locator('.turtle-batch-row').innerText(), /在养 1 只/, 'Batch card excludes members of other pools');
      await page.locator('[data-filter-species]').selectOption('all'); await expectMetrics(2, 1, 0, 1, 2, 1);
      await page.locator('[data-filter-pool]').selectOption('unassigned'); await expectMetrics(2, 2, 2, 0, 0, 2);
      await page.locator('[data-filter-species]').selectOption('HNG');
      await page.locator('[data-filter-pool]').selectOption('empty'); await expectMetrics(0, 0, 0, 0, 0, 0);
      await expectSex(0, '虎泥蛋龟', 0, 0, 0);
      await page.locator('[data-filter-pool]').selectOption('one'); await expectMetrics(1, 1, 0, 1, 0, 1);
      await expectSex(1, '虎泥蛋龟', 1, 0, 0);
      await page.locator('[data-filter-species]').selectOption('all'); await expectMetrics(34, 2, 32, 1, 1, 33);
      await page.locator('[data-filter-pool]').selectOption('all'); await expectMetrics(38, 2, 34, 2, 4, 36);
      await page.locator('[data-sort-turtles]').selectOption('weight'); await expectMetrics(38, 2, 34, 2, 4, 36);
      assert.equal(await page.evaluate(() => state.turtles.length), 38, 'Filtering must not delete or persist grouped archives');
      await page.evaluate(() => {
        const name = '本地自定义品种名称很长也必须完整显示';
        state.turtles = [{ ...state.turtles[0], speciesCode: 'CUSTOM-TEST', speciesName: name, gender: '' }];
        state.turtleFilter = 'CUSTOM-TEST'; render();
      });
      await expectSex(1, '本地自定义品种名称很长也必须完整显示', 0, 0, 1);
      if (width === 390) {
        await page.locator('.home-archive-section').screenshot({ path: path.join(root, 'output/home-species-summary-' + platform + '.png') });
      }
    }
    assert.deepEqual(errors, []); recordResult(root, 'home-filter-stats-' + platform + '.json', { checks, errors });
    console.log(`PASS ${platform}: ${checks} home metrics and species/sex summaries through real filters, mixed batches, losses, pagination, reset and long names at 280/390/720px.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
