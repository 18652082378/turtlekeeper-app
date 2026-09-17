const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
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
          page: item.parent, keptSpecies: ['GHG'], turtleFilter: 'all', turtlePoolFilter: 'all', [item.key]: [item.record] };
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
    assert.deepEqual(errors, []);
    console.log('PASS: breeding, pools, dashboard and care show saved edits immediately on button, gesture and HTML fallback returns; in-place mutations and immediate second edits covered.');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
