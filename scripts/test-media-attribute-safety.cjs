// Browser-only synthetic media; no API, external network or real account access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const fixture = require('./ui-audit-fixture.cjs');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'media-safety.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('https://media-safety.test/?skipIntro=1');
    await page.evaluate(seed => { state = { ...initialState, ...emptyAccountData(), ...seed }; }, fixture());
    const probes = await page.evaluate(async () => {
      const payload = '/missing-image" onerror="window.__mediaProbe=(window.__mediaProbe||0)+1" data-injected="yes';
      const photo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>');
      const post = { id: 'safe-post', mediaItems: [{ type: 'image', url: payload }] };
      const textPayload = '<img src="/missing-name" onerror="window.__mediaProbe=(window.__mediaProbe||0)+1">';
      const turtle = { id: 'synthetic-safe', code: textPayload, speciesName: payload, photo, acquiredDate: '2026-09-28' };
      const sources = [
        ['community cover', () => communityMedia(post)],
        ['community feed', () => communityFeedMedia(post)],
        ['growth snapshot', () => renderTurtleGrowthSnapshot({}, payload, '上次')],
        ['breeding snapshot', () => renderBreedingHistorySnapshot({}, payload, '上次')],
        ['growth list', () => growthUpdateCard({ type: 'measure', turtle: { id: 'synthetic', code: '合成档案', photo: payload }, previous: {}, current: {}, record: { id: 'm', updatedAt: '2026-09-28', oldSnapshot: {}, newSnapshot: {} }, timestamp: Date.now() })],
        ['valid URL preserves ampersands', () => communityMedia({ ...post, mediaItems: [{ type: 'image', url: '/image?a=1&b=2' }] })],
        ['valid local image', () => communityMedia({ ...post, mediaItems: [{ type: 'image', url: photo }] })],
        ['archive card labels', () => turtleCard(turtle)],
        ['archive row labels', () => turtleListRow(turtle)],
        ['account nickname', () => { state.loggedInPhone = '13900000001'; state.accountName = payload; return pageAccount(); }],
        ['account login drafts', () => { state.loggedInPhone = ''; state.accountMode = 'register'; state.accountDraftPhone = payload; state.accountDraftPassword = payload; state.accountDraftConfirmPassword = payload; return pageAccount(); }],
        ['kept species labels', () => { state.keptSpecies = [textPayload]; return pageBreeds(); }],
        ['ledger linked archive labels', () => { state.turtles = [{ ...turtle, code: payload, speciesCode: payload }]; state.ledgerDraftType = 'sold'; state.ledgerDraftTurtleId = turtle.id; state.ledgerDraftForm = {}; return ledgerForm(); }],
        ['archive filter species labels', () => { state.turtles = [{ ...turtle, speciesCode: payload }]; return archiveDashboardSection(); }]
      ];
      const results = [];
      for (const [name, markup] of sources) {
        window.__mediaProbe = 0;
        const holder = document.createElement('div');
        holder.innerHTML = markup();
        document.body.append(holder);
        // Trigger the same DOM event synchronously; do not depend on image timing.
        holder.querySelectorAll('*').forEach(el => el.dispatchEvent(new Event('error')));
        const badAttributes = [...holder.querySelectorAll('*')].flatMap(el => [...el.attributes].filter(attr => /^on/i.test(attr.name) || attr.name === 'data-injected').map(attr => attr.name));
        results.push({ name, executed: window.__mediaProbe, badAttributes, firstSource: holder.querySelector('img,video')?.getAttribute('src') });
        holder.remove();
      }
      return results;
    });
    results.push(...probes);
    const dir = path.join(root, 'output/postlaunch-audit'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'media-attribute-safety.json'), JSON.stringify({ scope: 'local synthetic browser only', results }, null, 2));
    for (const result of results) {
      assert.equal(result.executed, 0, `${result.name}: media must never execute injected event code`);
      assert.deepEqual(result.badAttributes, [], `${result.name}: media must stay in its own attribute`);
    }
    assert.equal(results.find(r => r.name === 'valid URL preserves ampersands').firstSource, '/image?a=1&b=2');
    const uploads = await page.evaluate(async () => {
      const originalFetch = window.fetch;
      const rows = [];
      try {
        for (const [kind, megabytes] of [['image', 10], ['video', 128]]) {
          for (const excess of [0, 1]) {
            let requests = 0;
            window.fetch = async () => { requests++; return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
            let status = 200;
            try { await apiUploadMediaFile({ name: kind === 'image' ? 'test.jpg' : 'test.mp4', type: kind === 'image' ? 'image/jpeg' : 'video/mp4', size: megabytes * 1024 * 1024 + excess }); }
            catch (error) { status = error.status; }
            rows.push({ kind, excess, requests, status });
          }
        }
      } finally { window.fetch = originalFetch; }
      return rows;
    });
    for (const row of uploads) {
      assert.equal(row.requests, row.excess ? 0 : 1, 'oversized media must stop before upload or retry');
      assert.equal(row.status, row.excess ? 413 : 200);
    }
    fs.writeFileSync(path.join(dir, 'media-upload-preflight.json'), JSON.stringify({ scope: 'local synthetic files and intercepted fetch', results: uploads }, null, 2));
    console.log(`PASS ${results.length} media/text attribute and ${uploads.length} upload preflight scenarios`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
