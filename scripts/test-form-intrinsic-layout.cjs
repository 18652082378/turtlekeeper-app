'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const platform = process.env.MOBILE_UI_PLATFORM || 'ios';
process.env.BROWSER_ENGINE ||= platform === 'ios' ? 'webkit' : 'chromium';
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, platform === 'ios' ? 'ios/App/App/public' : 'android/app/src/main/assets/public');
const fixture = require('./ui-audit-fixture.cjs')();
const cases = [
  { page: 'add' }, { page: 'add', archivePurchaseMode: 'batch' },
  { page: 'turtleDetail', updatingTurtleId: 'ui-turtle' },
  ...['purchase', 'sold', 'loss', 'other'].map(type => ({ page: 'ledger', ledgerDraftType: type, ledgerDraftTurtleId: 'ui-turtle' })),
  ...['sold', 'loss'].map(type => ({ page: 'ledger', ledgerDraftType: type, ledgerDraftTurtleId: 'ui-batch-0' })),
  { page: 'poolAdd' }, { page: 'breedingAdd' }, { page: 'breedingDetail', selectedBreedingId: 'ui-nest' },
  { page: 'memos', careTab: 'care', careDraft: { itemId: 'feeding', title: '喂食', date: '2026-10-18', turtleRefs: [], note: '' } },
  { page: 'memos', careTab: 'reminders', memoDraftOpen: true },
  { page: 'feedbackAdd' }, { page: 'communityAdd' }, { page: 'account' },
  ...['login', 'register', 'reset'].map(mode => ({ page: 'account', accountMode: mode, loggedInPhone: '' }))
];
(async () => {
  const browser = await launchBrowser(), results = [], errors = [];
  const output = path.join(root, 'output/form-intrinsic-layout', platform); fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url()); if (url.hostname !== 'forms.test') return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, settings: {}, items: [], notices: [] } });
      const file = path.resolve(publicRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('https://forms.test/');
    await page.evaluate(() => { dismissTradeIntro?.(); TurtleReleaseNotes?.cancel(); });
    for (const width of [280, 320, 390, 430, 440, 441, 720]) for (const theme of ['teal', 'dark']) for (let index = 0; index < cases.length; index++) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(({ fixture, test, theme }) => {
        state = { ...initialState, ...emptyAccountData(), ...fixture, ...test, cloudToken: '', policyConsentRequired: false, themeColor: theme };
        forceUpdateState = { required: false }; pendingPageEnterMotion = false; render(); scrollTo(0, 0);
        document.querySelectorAll('main details').forEach(el => { el.open = true; });
        document.querySelectorAll('main textarea').forEach(el => { el.cols = 60; });
        document.querySelectorAll('main input:not([type]),main input[type="text"],main input[type="password"]').forEach(el => { el.size = 40; });
      }, { fixture, test: cases[index], theme });
      const problems = await page.evaluate(() => {
        const problems = [];
        const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && !el.closest('[hidden],.sr-only'); };
        const forms = [...document.querySelectorAll('main form')].filter(visible);
        if (!forms.length) problems.push('No form rendered');
        const rect = el => { const r = el.getBoundingClientRect(); return `${Math.round(r.left)}..${Math.round(r.right)}`; };
        for (const form of forms) for (const el of [form, ...form.querySelectorAll('*')]) {
          if (!visible(el)) continue;
          const r = el.getBoundingClientRect(), s = getComputedStyle(el);
          if (['absolute', 'fixed'].includes(s.position)) continue;
          let insideScroller = false;
          for (let p = el.parentElement; p && p !== form; p = p.parentElement) {
            if (['auto', 'scroll'].includes(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth + 1) { insideScroller = true; break; }
          }
          // The community topic rail intentionally scrolls horizontally; its
          // container is still audited, while off-canvas choices remain usable.
          if (!insideScroller && (r.left < -1 || r.right > innerWidth + 1)) problems.push(`Offscreen ${el.tagName}.${el.className} ${el.name || ''}: ${rect(el)}`);
          const parent = el.parentElement, ps = getComputedStyle(parent), pr = parent.getBoundingClientRect();
          if (ps.display === 'grid' && r.right > pr.right + 1) problems.push(`Grid child exceeds ${parent.id || parent.className}: ${el.tagName} ${rect(el)} > ${rect(parent)}`);
        }
        const chips = [...document.querySelectorAll('.weekday-chip')].filter(visible).map(el => el.getBoundingClientRect());
        for (let i = 0; i < chips.length; i++) {
          if (chips[i].width < 44 || chips[i].height < 44) problems.push('Weekday touch target is smaller than 44px');
          for (let j = i + 1; j < chips.length; j++) {
            if (Math.min(chips[i].right, chips[j].right) > Math.max(chips[i].left, chips[j].left) + 1 && Math.min(chips[i].bottom, chips[j].bottom) > Math.max(chips[i].top, chips[j].top) + 1) problems.push('Overlapping weekday choices');
          }
        }
        const cancel = document.querySelector('[data-cancel-memo]');
        if (cancel) { const range = document.createRange(); range.selectNodeContents(cancel); if (new Set([...range.getClientRects()].map(r => Math.round(r.top))).size > 1) problems.push('Reminder cancel text wraps'); }
        return [...new Set(problems)].slice(0, 12);
      });
      const result = { width, theme, scenario: cases[index], problems }; results.push(result);
      if (cases[index].memoDraftOpen) {
        const before = await page.evaluate(() => JSON.stringify(state.memos));
        await page.locator('.weekday-picker').evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
        for (const chip of await page.locator('.weekday-chip').all()) {
          const checked = await chip.locator('input').isChecked();
          await chip.click(); assert.equal(await chip.locator('input').isChecked(), !checked);
          await chip.click(); assert.equal(await chip.locator('input').isChecked(), checked);
        }
        assert.equal(await page.evaluate(() => JSON.stringify(state.memos)), before, 'Selecting weekdays only edits the unsaved form');
        if ([280, 390, 430].includes(width)) await page.locator('.weekday-picker').screenshot({ path: path.join(output, `weekdays-${width}-${theme}.png`) });
      }
      if (problems.length) {
        console.error(JSON.stringify(result));
        if (results.filter(r => r.problems.length).length <= 8) await page.screenshot({ path: path.join(output, `failure-${index}-${width}-${theme}.png`), fullPage: true });
      }
    }
    recordResult(root, 'form-intrinsic-layout-' + platform + '.json', { checks: results.length, failures: results.filter(r => r.problems.length), errors, results });
    assert.deepEqual(errors, []);
    assert.equal(results.filter(r => r.problems.length).length, 0, 'Form intrinsic sizing regressions; see output/form-intrinsic-layout');
    console.log(`PASS ${platform}: ${results.length} form intrinsic-width checks, optional sections expanded, 280–720px including weekday-grid breakpoints and both themes.`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
