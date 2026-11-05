const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
async function main() {
  const browser = await launchBrowser({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'navigation.test') return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, latestBuild: 0, posts: [], listings: [], notifications: [], items: [] } });
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('https://navigation.test/');
    await page.evaluate(() => { window.dismissTradeIntro?.(); });
    const cases = [
      { parent: 'breeding', key: 'breedingRecords', field: 'motherName', record: { id: 'nest', motherName: '旧种母', eggCount: 4, fertileCount: 4, hatchCount: 0, date: '2026-09-01' }, before: '旧种母', after: '新种母' },
      { parent: 'pools', key: 'turtlePools', field: 'name', record: { id: 'pool', name: '旧苗池', type: 'hatchling', count: 4 }, before: '旧苗池', after: '新苗池' },
      { parent: 'home', key: 'turtles', field: 'code', record: { id: 'turtle', code: 'OLD-123', speciesCode: 'GHG', speciesName: '果核蛋龟', stage: 'adult', gender: '母', status: '正常饲养', health: '健康' }, before: 'OLD-123', after: 'NEW-456' },
      { parent: 'memos', key: 'memos', field: 'title', record: { id: 'memo', title: '旧护理任务', content: '护理事项', date: '2026-09-01' }, before: '旧护理任务', after: '新护理任务' }
    ];
    for (const mode of ['button', 'gesture', 'html']) for (const item of cases) {
      await page.evaluate(item => {
        state = { ...state, ...emptyAccountData(), loggedInPhone: 'preview', accountName: '测试', cloudToken: '', policyConsentRequired: false,
          page: item.parent, careTab: 'reminders', keptSpecies: ['GHG'], turtleFilter: 'all', turtlePoolFilter: 'all', [item.key]: [item.record] };
        edgeBackSnapshots = []; restoredSnapshotRenderHoldUntil = 0; render();
      }, item);
      assert.ok((await page.locator('#app').innerText()).includes(item.before), item.parent + ' displays source data');
      const result = await page.evaluate(({ item, mode }) => {
        const originalNode = $app.firstElementChild;
        setState({ page: 'about' }, { skipSave: true });
        const unchanged = navigationSnapshotIsCurrent(edgeBackSnapshots.at(-1));
        // Exercise in-place mutation as well as array replacement: comparison
        // against references alone would miss this saved edit.
        state[item.key][0][item.field] = item.after;
        setState({ [item.key]: [...state[item.key]] }, { skipCloud: true });
        const changed = !navigationSnapshotIsCurrent(edgeBackSnapshots.at(-1));
        if (mode === 'html') edgeBackSnapshots.at(-1).liveDom = null;
        if (mode === 'gesture') showEdgeBackPreview(edgeBackSnapshots.at(-1));
        navigateBack({ fromEdgeGesture: mode === 'gesture' });
        return { unchanged, changed, parent: state.page, html: $app.innerText, oldNode: originalNode === $app.firstElementChild };
      }, { item, mode });
      assert.equal(result.unchanged, true);
      assert.equal(result.changed, true);
      assert.equal(result.parent, item.parent);
      assert.ok(result.html.includes(item.after), `${item.parent}/${mode} shows new data immediately`);
      assert.ok(!result.html.includes(item.before), `${item.parent}/${mode} removes old data immediately`);
      // An immediate second edit must not be swallowed by the return animation hold.
      await page.evaluate(item => { restoredSnapshotRenderHoldUntil = Date.now() + 500; setState({ [item.key]: state[item.key].map(r => ({ ...r, [item.field]: item.after + '再次修改' })) }); }, item);
      assert.ok((await page.locator('#app').innerText()).includes(item.after + '再次修改'));
    }
    const navigation = await page.evaluate(() => {
      state = { ...state, page: 'home', loggedInPhone: 'preview' };
      edgeBackSnapshots = []; render();
      const originalSave = saveState;
      const originalBuildPreview = buildEdgeBackPreviewHtml;
      let writes = 0, previewParses = 0;
      saveState = () => { writes++; return true; };
      buildEdgeBackPreviewHtml = (...args) => { previewParses++; return originalBuildPreview(...args); };
      try {
        $app.querySelector('[data-page="pools"]').click();
        const opened = state.page;
        const eagerPreviewParses = previewParses;
        const parent = edgeBackSnapshots.at(-1);
        parent.liveDom = null;
        showEdgeBackPreview(parent);
        navigateBack();
        return { writes, eagerPreviewParses, previewParses, opened, returned: state.page };
      } finally { saveState = originalSave; buildEdgeBackPreviewHtml = originalBuildPreview; }
    });
    assert.deepEqual(navigation, { writes: 0, eagerPreviewParses: 0, previewParses: 1, opened: 'pools', returned: 'home' });

    const lookups = await page.evaluate(() => {
      const n = 850, reads = { turtles: 0, ledger: 0 };
      const countReads = (values, key) => new Proxy(values, { get(array, prop) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) reads[key]++;
        return Reflect.get(array, prop);
      } });
      const turtles = Array.from({ length: n }, (_, i) => ({ id: 'archive-' + i, code: '龟-' + i, status: '正常饲养', poolId: 'pool-' + (i % 60) }));
      const records = turtles.flatMap(turtle => [
        { id: 'purchase-' + turtle.id, turtleId: turtle.id, type: 'purchase', amount: 30, recordDate: '2026-11-01' },
        { id: 'sold-' + turtle.id, turtleId: turtle.id, type: 'sold', amount: 50, recordDate: '2026-10-01' }
      ]);
      state = { ...state, ledgerDatePreset: 'all', ledgerTab: 'purchase', turtles: countReads(turtles, 'turtles'), ledgerRecords: countReads(records, 'ledger'),
        turtlePools: Array.from({ length: 60 }, (_, i) => ({ id: 'pool-' + i, name: '龟池-' + i, count: 2, countMode: i === 0 ? 'additional' : '' })) };
      const ledger = pageLedger();
      const ledgerReads = { ...reads };
      reads.turtles = 0;
      const pools = pageTurtlePools();
      return { n, ledgerReads, poolReads: reads.turtles, linkedRows: (ledger.match(/ledger-linked-status sold/g) || []).length,
        poolTotal: /<strong>852<\/strong>/.test(pools), legacyReview: /历史手填 2 只，尚未核对/.test(pools) };
    });
    assert.deepEqual(lookups, { n: 850, ledgerReads: { turtles: 850, ledger: 3400 }, poolReads: 850, linkedRows: 850, poolTotal: true, legacyReview: true });
    assert.deepEqual(errors, []);
    recordResult(root, 'navigation-freshness.json', { pass: true, scenarios: 14, navigation, lookups, externalTraffic: false });
    console.log('PASS: breeding, pools, dashboard and care show saved edits immediately on button, gesture and HTML fallback returns; in-place mutations and immediate second edits covered.');
    console.log('PASS read-only navigation and 850-record association work:', JSON.stringify({ navigation, lookups }));
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
