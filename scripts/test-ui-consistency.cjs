'use strict';

// Broad local rendering/geometry audit, not a production or native-device test.
// All resources are fulfilled from the checkout; every API request is mocked.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const fixture = require('./ui-audit-fixture.cjs');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'output', 'ui-consistency');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const renderMap = app.slice(app.indexOf('  const pages = {', app.indexOf('function render()')), app.indexOf('\n  };', app.indexOf('  const pages = {', app.indexOf('function render()'))));
const routes = [...renderMap.matchAll(/^    (\w+):/gm)].map(match => match[1]);
assert(routes.length >= 45, 'Route discovery must not silently miss the application');
const filter = process.env.UI_AUDIT_ROUTES?.split(',');
const widths = (process.env.UI_AUDIT_WIDTHS || '320,390,430,1280').split(',').map(Number);
const themes = (process.env.UI_AUDIT_THEMES || 'teal,dark').split(',');
const states = routes.map(route => ({ id: route, route, patch: {} }));
states.push(
  { id: 'turtleDetail-batch', route: 'turtleDetail', patch: { selectedTurtleId: 'ui-batch-0' } },
  { id: 'turtleDetail-edit', route: 'turtleDetail', patch: { updatingTurtleId: 'ui-turtle' } },
  { id: 'add-batch', route: 'add', patch: { archivePurchaseMode: 'batch' } },
  { id: 'memos-reminders', route: 'memos', patch: { careTab: 'reminders' } },
  { id: 'memos-reminder-form', route: 'memos', patch: { careTab: 'reminders', memoDraftOpen: true } },
  { id: 'memos-care-form', route: 'memos', patch: { careDraft: { itemId: 'feeding', title: '喂食', date: '2026-09-28', turtleRefs: [], note: '' } } },
  { id: 'memos-care-type-picker', route: 'memos', patch: { carePickerOpen: true, careDraft: { itemId: 'feeding', title: '喂食', date: '2026-09-28', turtleRefs: [], note: '' } } },
  ...['purchase', 'sold', 'loss', 'other'].map(type => ({ id: `ledger-${type}-form`, route: 'ledger', expectedSelector: '#ledgerForm', screenshotFocus: '#ledgerForm', patch: { ledgerDraftType: type, ledgerDraftTurtleId: 'ui-turtle' } })),
  { id: 'poolAdd-edit', route: 'poolAdd', patch: { editingTurtlePoolId: 'ui-pool' } },
  { id: 'account-login', route: 'account', patch: { loggedInPhone: '' } },
  { id: 'account-register', route: 'account', patch: { loggedInPhone: '', accountMode: 'register' } },
  { id: 'app-force-update', route: 'home', forceUpdate: true, patch: {} },
  ...['market', 'community', 'messages', 'breeding', 'home', 'pools', 'ledger', 'growth', 'feedback'].map(route => ({ id: `${route}-empty`, route, empty: true, ...(route === 'messages' ? { expectedText: '暂无消息' } : {}), patch: {} })),
  ...['market', 'community'].map(route => ({ id: `${route}-error`, route, empty: true, cloud: true, expectedSelector: `[data-feed-retry="${route}"]`, patch: { [`${route}FeedError`]: 'UI fixture connection failure' } })),
  { id: 'messages-error', route: 'messages', empty: true, cloud: true, expectedText: '消息加载失败', patch: { communityFriendsInitialized: false, communityFriendsError: true } },
  { id: 'communityActivity-loading', route: 'communityActivity', empty: true, patch: { communityActivityLoading: true } },
  { id: 'communityActivity-error', route: 'communityActivity', empty: true, patch: { communityActivityError: true } },
  ...['market', 'feedback', 'safety', 'health', 'chats'].map(tab => ({ id: `operations-${tab}`, route: 'operations', patch: { operationsTab: tab } })),
  ...['overview', 'ledger', 'reports', 'hatching', 'care', 'tasks', 'members', 'logs', 'approvals', 'settings'].map(tab => ({ id: `team-preview-${tab}`, route: 'team', patch: {}, teamTab: tab }))
);
const cases = filter ? states.filter(state => filter.includes(state.id)) : states;
const emptyKeys = ['turtles', 'memos', 'careRecords', 'carePlans', 'breedingRecords', 'turtlePools', 'ledgerRecords', 'activityLogs', 'marketListings', 'myMarketListings', 'communityPosts', 'communityFriends', 'communityChatMessages', 'communityActivityItems', 'publicFeedbackItems'];

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  fs.mkdirSync(output, { recursive: true });
  const results = [], failed = [], outbound = new Set();
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'ui-audit.test') { outbound.add(url.origin); return route.abort(); }
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL=""; window.TURTLE_APP_BUILD=999;' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, teams: [], invitations: [], posts: [], messages: [], listings: [], reviews: [], feedback: [], announcements: [] }) });
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
  });
  const localPage = await context.newPage();
  let page = localPage;
  const cloudPage = cases.some(item => item.cloud) ? await context.newPage() : null;
  if (cloudPage) await cloudPage.route('**/config.js*', route => route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://ui-audit.test"; window.TURTLE_APP_BUILD=999;' }));
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.dismiss());
  cloudPage?.setDefaultTimeout(6000);
  cloudPage?.on('pageerror', error => errors.push(error.message));
  cloudPage?.on('dialog', dialog => dialog.dismiss());
  try {
    await page.goto('https://ui-audit.test/?skipIntro=1');
    await page.waitForFunction(() => typeof render === 'function');
    if (cloudPage) {
      await cloudPage.goto('https://ui-audit.test/?skipIntro=1');
      await cloudPage.waitForFunction(() => typeof render === 'function');
    }
    // Team is tested here in its guest preview. Its populated permission-aware
    // workspace has a separate real local API harness: test-team-ui.cjs.
    for (const theme of themes) {
      for (const width of widths) {
        await localPage.setViewportSize({ width, height: width > 800 ? 960 : 844 });
        if (cloudPage) await cloudPage.setViewportSize({ width, height: width > 800 ? 960 : 844 });
        for (const item of cases) {
          page = item.cloud ? cloudPage : localPage;
          // Chrome throttles animation frames in the inactive tab. Keep the
          // currently measured surface active when switching fixture modes.
          await page.bringToFront();
          const startErrors = errors.length;
          try {
            await page.evaluate(({ seed, item, theme, emptyKeys }) => {
              window.dismissTradeIntro?.();
              $app.cancelEdgeBackGesture?.();
              document.querySelectorAll('body > .modal-overlay,body > [role="dialog"],.archive-directory-overlay').forEach(el => el.remove());
              const base = { ...initialState, ...emptyAccountData(), ...seed };
              if (item.empty) for (const key of emptyKeys) base[key] = [];
              state = { ...base, ...item.patch, page: item.route, themeColor: theme };
              if (item.cloud) {
                state.cloudToken = 'synthetic-ui-token';
                // These are static presentation states, not a network test.
                // Keep refreshes parked so a mock success cannot erase the
                // injected error; actual failure/retry is exercised below.
                marketLoading = true; communityLoading = true; messageUnreadLoading = true;
              }
              if (item.route === 'team') state.loggedInPhone = '';
              forceUpdateState = { required: Boolean(item.forceUpdate), checking: false, message: '此为本地界面测试的更新提示。', appStoreUrl: 'https://apps.apple.com/app/id6783481335' };
              pendingPageEnterMotion = false;
              pendingCommunityChatEnterMotion = false;
              edgeBackSnapshots = [];
              render();
              if (item.teamTab) document.querySelector(`[data-ts="preview.tab"][data-tab="${item.teamTab}"]`)?.click();
              scrollTo(0, 0);
            }, { seed: fixture(), item, theme, emptyKeys });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const sample = await measure(page);
            sample.errors = errors.slice(startErrors);
            sample.id = item.id; sample.theme = theme; sample.width = width;
            sample.checks = {
              rendered: sample.mainCount === 1 && sample.mainTextLength > 0,
              noHorizontalOverflow: sample.documentWidth <= width + 1,
              navigationBounds: sample.navs.every(nav => nav.left >= -1 && nav.right <= width + 1 && Math.abs(nav.bottom - sample.height) <= 2),
              noRuntimeErrors: sample.errors.length === 0
            };
            if (process.env.UI_AUDIT_STRICT_NAMES !== '0') sample.checks.accessibleFieldNames = sample.unlabeledFields.length === 0;
            if (item.expectedSelector) sample.checks.requestedStateRendered = await page.locator(item.expectedSelector).count() > 0;
            if (item.expectedText) sample.checks.requestedStateRendered = (await page.locator('#app main').textContent()).includes(item.expectedText);
            sample.passed = Object.values(sample.checks).every(Boolean);
            if (!sample.passed) failed.push(`${item.id}/${theme}/${width}: ${JSON.stringify(sample.checks)}`);
            if (width === 390 || !sample.passed || process.env.UI_AUDIT_SCREENSHOTS === 'all') {
              sample.screenshot = `${item.id}-${theme}-${width}.png`;
              if (item.screenshotFocus) await page.locator(item.screenshotFocus).evaluate(el => el.scrollIntoView({ block: 'start' }));
              await page.screenshot({ path: path.join(output, sample.screenshot), animations: 'disabled' });
            }
            results.push(sample);
          } catch (error) {
            results.push({ id: item.id, theme, width, passed: false, error: error.message });
            failed.push(`${item.id}/${theme}/${width}: ${error.message}`);
          }
        }
        console.log(`UI audit ${theme}/${width}: ${cases.length} route states checked`);
      }
    }
    if (!filter) {
      page = localPage;
      await auditOverlays(page, results, failed);
      await auditModalFamily(page, results, failed);
      await auditNetworkStates(context, results, failed);
    }
  } finally {
    await browser.close();
    const report = { generatedAt: new Date().toISOString(), scope: 'Synthetic local Chromium render/geometry checks only. No production traffic. Does not prove physical iOS keyboard/safe-area/native gesture behavior.', routes, states: states.map(({ id, route, empty }) => ({ id, route, empty: Boolean(empty) })), widths, themes, blockedExternalOrigins: [...outbound], total: results.length, failures: failed, results };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(output, 'report.md'), markdown(report));
    fs.writeFileSync(path.join(output, 'index.html'), gallery(report));
  }
  assert.equal(failed.length, 0, `${failed.length} UI checks failed; see output/ui-consistency/report.md\n${failed.slice(0, 15).join('\n')}`);
  console.log(`PASS: ${results.length} local UI scenarios; ${routes.length} routes. Report: ${path.join(output, 'report.md')}`);
}

async function measure(page) {
  return page.evaluate(() => {
    const visible = el => Boolean(el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
    const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const name = el => el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() || [...(el.labels || [])].map(label => label.textContent).join(' ').trim() || el.getAttribute('title') || el.getAttribute('alt') || (el.matches('button,a[href],[role="button"]') ? el.textContent.trim() || el.querySelector('img')?.alt : '');
    const fields = [...document.querySelectorAll('input:not([type="hidden"]):not([type="file"]),textarea,select')].filter(visible);
    const controls = [...document.querySelectorAll('button,a[href],[role="button"]')].filter(visible);
    return {
      height: innerHeight, documentWidth: document.documentElement.scrollWidth,
      mainCount: document.querySelectorAll('#app main').length,
      mainTextLength: document.querySelector('#app main')?.textContent.trim().length || 0,
      title: document.querySelector('.topbar h1,.topbar-title')?.textContent.trim() || document.querySelector('h1')?.textContent.trim() || '',
      navs: [...document.querySelectorAll('.bottom-nav')].filter(visible).map(box),
      unlabeledFields: fields.filter(el => !name(el)).map(el => ({ tag: el.tagName, id: el.id, name: el.name, attributes: [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name).join(' '), placeholder: el.getAttribute('placeholder') || '' })),
      unnamedControls: controls.filter(el => !name(el)).map(el => ({ tag: el.tagName, class: el.className })),
      compactTargets: controls.filter(el => { const r = box(el); return r.width < 40 || r.height < 40; }).slice(0, 25).map(el => ({ text: (name(el) || '').slice(0, 40), ...box(el) })),
      formCount: document.querySelectorAll('form').length,
      focusables: fields.length + controls.length
    };
  });
}

async function auditModalFamily(page, results, failed) {
  const definitions = [
    { id: 'service', call: 'openGeneralServiceDialog', selector: '.general-service-dialog', close: '[data-market-service-close]' },
    { id: 'market-service', call: 'openMarketTopService', selector: '.market-top-service-dialog', close: '[data-market-service-close]' },
    { id: 'market-more', call: 'openMarketDetailMore', args: ['ui-listing'], selector: '.market-detail-more-sheet', close: '[data-market-detail-more-close]' },
    { id: 'chat-more', call: 'openCommunityChatMore', args: ['ui-friend', '测试龟友'], selector: '.community-chat-more-sheet', close: '[data-chat-more-close]' },
    { id: 'account-delete', call: 'openAccountDeleteDialog', selector: '.account-delete-dialog', close: '[data-delete-dialog-close]' },
    { id: 'sale-confirm', call: 'requestMarketSaleDetails', listingArg: true, selector: '.market-sale-dialog', close: '[data-market-sale-cancel]' },
    { id: 'image-preview', call: 'openImagePreview', imageArg: true, selector: '.image-preview-overlay', close: '.image-preview-close' },
    { id: 'post-visibility', visibility: true, selector: '.community-visibility-sheet', close: '[data-close-community-visibility]' },
    { id: 'policy-consent', patch: { policyConsentRequired: true }, selector: '.policy-consent-overlay', mandatory: true },
    ...['buyer', 'seller', 'terms'].map(tab => ({ id: `trade-guide-${tab}`, call: 'openTradeGuide', args: [tab], selector: '.trade-guide', close: '[data-close]' })),
    { id: 'review-invite', patch: { appReviewInviteOpen: true }, selector: '.app-review-invite-overlay', close: '[data-app-review-later]' },
    { id: 'announcement', patch: { systemAnnouncements: [{ id: 'ui-dialog-announcement', status: 'active', title: '界面测试通知', content: '本通知完全由本地虚构数据生成。', createdAt: '2026-09-28T02:00:00Z' }] }, selector: '.system-announcement-overlay', close: '[data-dismiss-system-announcement]' }
  ];
  for (const theme of themes) for (const width of widths) for (const item of definitions) {
    let semantics;
    await page.setViewportSize({ width, height: width > 800 ? 960 : 844 });
    try {
      await page.evaluate(({ seed, theme, item }) => {
        localStorage.removeItem('turtlekeeper-announcements-dismissed-v1:13000000000');
        state = { ...initialState, ...emptyAccountData(), ...seed, themeColor: theme, page: 'home', ...item.patch };
        forceUpdateState = { required: false };
        if (item.visibility) { state.page = 'communityAdd'; communityVisibilitySheetOpen = true; }
        render(); scrollTo(0, 0);
        document.querySelector('.topbar button')?.focus();
        if (item.call) window[item.call](...(item.listingArg ? [state.marketListings[0]] : item.imageArg ? [seed.__image, '本地图片测试'] : item.args || []));
      }, { seed: fixture(), theme, item });
      const modal = page.locator(item.selector).first();
      await modal.waitFor();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const result = await modal.evaluate(el => {
        const r = el.getBoundingClientRect();
        return { role: el.getAttribute('role'), modal: el.getAttribute('aria-modal'), named: Boolean(el.getAttribute('aria-label') || document.getElementById(el.getAttribute('aria-labelledby'))?.textContent.trim()), focusInside: el.contains(document.activeElement), left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: innerHeight };
      });
      semantics = result;
      assert.equal(result.role, 'dialog'); assert.equal(result.modal, 'true'); assert.ok(result.named);
      assert.ok(result.left >= -1 && result.right <= width + 1 && result.top >= -1 && result.bottom <= result.height + 1, 'Dialog visible without page overflow');
      await modal.locator('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]').last().focus();
      await page.keyboard.press('Tab');
      result.tabContained = await modal.evaluate(el => el.contains(document.activeElement));
      await modal.locator('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]').first().focus();
      await page.keyboard.press('Shift+Tab');
      result.reverseTabContained = await modal.evaluate(el => el.contains(document.activeElement));
      assert.ok(result.focusInside, 'Opening a dialog moves focus inside');
      assert.ok(result.tabContained && result.reverseTabContained, 'Dialog contains Tab and Shift+Tab navigation');
      if (width === 390) await page.screenshot({ path: path.join(output, `modal-${item.id}-${theme}-${width}.png`), animations: 'disabled' });
      if (item.mandatory) {
        await page.keyboard.press('Escape');
        assert.equal(await modal.count(), 1, 'Mandatory policy consent cannot disappear via Escape');
        await page.evaluate(() => { state.policyConsentRequired = false; render(); });
      } else await modal.locator(item.close).first().click();
      await modal.waitFor({ state: 'detached', timeout: 4000 });
      assert.equal(await modal.count(), 0, 'Dialog dismisses without invoking its primary action');
      results.push({ id: `modal-${item.id}`, width, theme, passed: true, semantics: result });
    } catch (error) {
      failed.push(`modal-${item.id}/${theme}/${width}: ${error.message}`);
      results.push({ id: `modal-${item.id}`, width, theme, passed: false, error: error.message, semantics });
      await page.screenshot({ path: path.join(output, `modal-${item.id}-${theme}-${width}-failure.png`), animations: 'disabled' });
      await page.evaluate(() => { document.querySelectorAll('body > [class*="overlay"]').forEach(el => el.remove()); document.body.className = ''; });
    }
  }
}

async function auditNetworkStates(context, results, failed) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const seed = fixture();
  let pending = [], currentFeed = '';
  await page.route('**/config.js*', route => route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://ui-audit.test"; window.TURTLE_APP_BUILD=999;' }));
  await page.route('**/api/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === `/api/${currentFeed}/list`) { pending.push(route); return; }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, minimumBuild: 0, latestBuild: 999, posts: [], friends: [], messages: [], listings: [], announcements: [], reviews: [], notifications: [] }) });
  });
  try {
    await page.goto('https://ui-audit.test/?skipIntro=1');
    await page.waitForFunction(() => typeof render === 'function');
    for (const theme of themes) for (const width of widths) for (const feed of ['market', 'community']) {
      const startErrors = errors.length;
      currentFeed = feed;
      await page.setViewportSize({ width, height: width > 800 ? 960 : 844 });
      try {
        await page.evaluate(({ seed, theme, feed }) => {
          state = { ...initialState, ...emptyAccountData(), ...seed, cloudToken: 'synthetic-ui-token', themeColor: theme, page: feed, marketListings: [], communityPosts: [], marketFeedInitialized: false, communityFeedInitialized: false };
          marketLastLoadedAt = 0; communityLastLoadedAt = 0; marketLoading = false; communityLoading = false;
          render(); scrollTo(0, 0);
        }, { seed, theme, feed });
        await page.locator(`.${feed}-feed-initial-loading`).waitFor();
        const loading = await measure(page);
        assert.ok(loading.documentWidth <= width + 1);
        assert.ok(await page.locator(`.${feed}-feed-initial-loading`).evaluate(el => el.matches('[role="status"]') || Boolean(el.querySelector('[role="status"]'))), 'Loading feedback has a status announcement');
        if (width === 390) await page.screenshot({ path: path.join(output, `${feed}-network-loading-${theme}-${width}.png`), animations: 'disabled' });
        for (let i = 0; i < 100 && !pending.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
        assert.ok(pending.length, 'A mocked feed request actually started');
        for (const route of pending.splice(0)) await route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"message":"本地测试：网络暂不可用"}' });
        await page.locator(`[data-feed-retry="${feed}"]`).waitFor();
        if (width === 390) await page.screenshot({ path: path.join(output, `${feed}-network-error-${theme}-${width}.png`), animations: 'disabled' });
        await page.locator(`[data-feed-retry="${feed}"]`).click();
        for (let i = 0; i < 100 && !pending.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
        assert.ok(pending.length, 'Retry starts a fresh mocked feed request');
        for (const route of pending.splice(0)) await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, listings: seed.marketListings, posts: seed.communityPosts, hasMore: false }) });
        await page.locator(`[data-feed-retry="${feed}"]`).waitFor({ state: 'detached' });
        await page.waitForFunction(feed => state[`${feed}FeedInitialized`] && state[feed === 'market' ? 'marketListings' : 'communityPosts'].length === 1, feed);
        assert.deepEqual(errors.slice(startErrors), [], 'Loading/error/retry has no browser runtime errors');
        results.push({ id: `${feed}-network-loading-error-retry`, width, theme, passed: true, evidence: 'Actual browser request delayed, returned mock 503, retried by clicking UI, then fulfilled with synthetic content.' });
      } catch (error) {
        failed.push(`${feed}-network/${theme}/${width}: ${error.message}`);
        results.push({ id: `${feed}-network-loading-error-retry`, width, theme, passed: false, error: error.message });
        for (const route of pending.splice(0)) await route.abort();
      }
    }
  } finally { for (const route of pending.splice(0)) await route.abort(); await page.close(); }
}

async function auditOverlays(page, results, failed) {
  for (const theme of themes) for (const width of widths) {
    await page.setViewportSize({ width, height: width > 800 ? 960 : 844 });
    await page.evaluate(({ seed, theme }) => {
      state = { ...initialState, ...emptyAccountData(), ...seed, themeColor: theme, page: 'memos', careDraft: { itemId: 'feeding', title: '喂食', date: '2026-09-28', turtleRefs: [], note: '' } };
      render(); scrollTo(0, 0);
    }, { seed: fixture(), theme });
    try {
      await page.locator('#careForm .archive-directory-trigger').click();
      const dialog = page.locator('.archive-directory-dialog');
      await dialog.waitFor();
      const semantics = await dialog.evaluate(el => ({ role: el.getAttribute('role'), modal: el.getAttribute('aria-modal'), title: document.getElementById(el.getAttribute('aria-labelledby'))?.textContent.trim(), focused: el.contains(document.activeElement), rect: { left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }, height: innerHeight }));
      assert.equal(semantics.role, 'dialog'); assert.equal(semantics.modal, 'true'); assert.ok(semantics.title);
      assert.ok(semantics.rect.left >= -1 && semantics.rect.right <= width + 1 && semantics.rect.top >= -1 && semantics.rect.bottom <= semantics.height + 1, 'Picker stays within the visible viewport');
      await page.locator('[data-directory-search]').fill('青禾');
      assert.equal(await page.locator('.directory-archive-card').count(), 1);
      await page.screenshot({ path: path.join(output, `archive-picker-${theme}-${width}.png`), animations: 'disabled' });
      await page.locator('[data-directory-close]').click();
      assert.equal(await page.locator('.archive-directory-dialog').count(), 0);
      results.push({ id: 'archive-picker-search-dismiss', theme, width, passed: true, semantics, screenshot: `archive-picker-${theme}-${width}.png` });
    } catch (error) {
      failed.push(`archive-picker/${theme}/${width}: ${error.message}`);
      results.push({ id: 'archive-picker-search-dismiss', theme, width, passed: false, error: error.message });
    }
  }
}

function markdown(report) {
  const lines = ['# Local UI consistency audit', '', report.scope, '', `- Routes discovered: ${report.routes.length}`, `- Scenarios run: ${report.total}`, `- Failed rendering/geometry checks: ${report.failures.length}`, '- Missing names and compact targets are audit observations, not automated accessibility certification.', '', '| Route/state | Theme | Width | Result | Unlabeled fields | Unnamed controls |', '|---|---|---:|---|---:|---:|'];
  for (const row of report.results) lines.push(`| ${row.id} | ${row.theme} | ${row.width} | ${row.passed ? 'PASS' : 'FAIL'} | ${row.unlabeledFields?.length ?? '—'} | ${row.unnamedControls?.length ?? '—'} |`);
  if (report.failures.length) lines.push('', '## Failures', '', ...report.failures.map(f => '- ' + f.replace(/\n/g, ' ')));
  return lines.join('\n') + '\n';
}

const routeNames = {
  home: '看板', messages: '消息', communityActivity: '互动消息', community: '龟友圈',
  communityPostDetail: '帖子详情', communityAdd: '发布帖子', communityFriends: '龟友列表',
  communityChat: '聊天', following: '我的关注', followingProfile: '关注详情', communityProfile: '龟友主页',
  market: '龟集市', marketAdd: '发布出售', marketDetail: '商品详情', marketSeller: '卖家主页',
  marketMy: '我的出售', marketFavorites: '我的收藏', marketHistory: '浏览历史',
  list: '龟档案列表', growth: '成长记录', turtleDetail: '档案详情', turtleReward: '成长成果',
  species: '品种图鉴', breeds: '常用品种', add: '新建档案', memos: '日常养护',
  ledger: '经营账本', ledgerDetail: '账本详情', calendar: '操作记录', mine: '我的空间',
  team: '团队空间', satisfaction: '体验评分', feedback: '用户反馈', feedbackAdd: '提交反馈',
  feedbackDetail: '反馈详情', account: '账号管理', sync: '账号同步', reports: '数据中心',
  about: '关于龟友手账', rules: '服务与社区规则', privacy: '隐私政策', moderation: '举报审核',
  announcements: '系统公告管理', operations: '运营中心', breeding: '繁殖记录',
  breedingAdd: '新增繁殖', breedingDetail: '繁殖详情', pools: '龟池管理', poolAdd: '新增龟池'
};
function friendlyName(id) {
  if (routeNames[id]) return routeNames[id];
  const names = {
    'turtleDetail-batch': '批次详情', 'turtleDetail-edit': '编辑龟档案', 'add-batch': '批量购入档案',
    'memos-reminders': '养护提醒', 'memos-reminder-form': '新增养护提醒', 'memos-care-form': '记录一次养护',
    'memos-care-type-picker': '选择养护事项', 'ledger-purchase-form': '账本 · 记录收购',
    'ledger-sold-form': '账本 · 记录售出', 'ledger-loss-form': '账本 · 记录损耗',
    'ledger-other-form': '账本 · 记录日常支出', 'poolAdd-edit': '编辑龟池',
    'account-login': '手机登录', 'account-register': '注册账号', 'app-force-update': '更新版本提示',
    'archive-picker-search-dismiss': '选择品种与龟档案',
    'modal-service': '人工客服', 'modal-market-service': '平台客服', 'modal-market-more': '商品更多操作',
    'modal-chat-more': '聊天设置', 'modal-account-delete': '注销账号确认', 'modal-sale-confirm': '确认成交信息',
    'modal-image-preview': '图片预览', 'modal-post-visibility': '帖子可见范围', 'modal-policy-consent': '服务协议确认',
    'modal-review-invite': '评分邀请', 'modal-announcement': '系统公告',
    'modal-trade-guide-buyer': '交易指南 · 买方流程', 'modal-trade-guide-seller': '交易指南 · 卖方流程',
    'modal-trade-guide-terms': '交易指南 · 完整条款'
  };
  if (names[id]) return names[id];
  const modules = { overview: '概览', ledger: '账本', reports: '报表', hatching: '孵化', care: '护理', tasks: '任务', members: '成员', logs: '记录', approvals: '审批', settings: '设置' };
  if (id.startsWith('team-preview-')) return `团队空间 · ${modules[id.slice(13)] || id.slice(13)}预览`;
  const operations = { market: '集市', feedback: '反馈', safety: '安全', health: '服务状态', chats: '聊天' };
  if (id.startsWith('operations-')) return `运营中心 · ${operations[id.slice(11)] || id.slice(11)}`;
  for (const [suffix, label] of [['-empty', '暂无数据'], ['-error', '加载失败'], ['-loading', '加载中'], ['-network-loading-error-retry', '加载与失败重试']]) {
    if (id.endsWith(suffix)) return `${routeNames[id.slice(0, -suffix.length)] || id.slice(0, -suffix.length)} · ${label}`;
  }
  return id;
}

function gallery(report) {
  const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const screenshots = report.results.filter(row => row.screenshot && row.width === 390);
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>龟友手账 UI 检查预览</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f1f4ef;color:#23362c;font:15px/1.6 system-ui,sans-serif}header{position:sticky;top:0;z-index:1;padding:20px 28px;background:#f8faf7eF;backdrop-filter:blur(12px);border-bottom:1px solid #dbe4da}h1{font-size:23px;margin:0 0 6px}p{margin:0;color:#657669}form{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}input,select{font:inherit;padding:9px 12px;border:1px solid #c8d5c7;border-radius:10px;background:#fff}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:25px;padding:28px}figure{margin:0;min-width:0}img{width:100%;border-radius:14px;box-shadow:0 8px 25px #26352a16}figcaption{padding:8px 2px;font-weight:600}small{font-weight:400;color:#637769}.route-id{display:block;font:12px/1.6 ui-monospace,monospace;overflow-wrap:anywhere}a{color:#20745b}[hidden]{display:none!important}</style>
  <header><h1>龟友手账 · 全页面 UI 检查</h1><p>${report.routes.length} 个路由 · ${report.total} 个本地场景 · ${report.failures.length} 个失败。虚构数据，桌面 Chromium；并非正式版或真机验收。</p><form onsubmit="return false"><input type="search" placeholder="搜索页面，如繁殖、养护、加载失败" aria-label="搜索页面或状态" id="query"><select aria-label="主题" id="theme"><option value="">全部主题</option><option value="teal">浅色</option><option value="dark">深色</option></select><a href="report.md">逐项报告</a></form></header><main>${screenshots.map(row => `<figure data-page="${escape(friendlyName(row.id) + ' ' + row.id)}" data-theme="${row.theme}"><img loading="lazy" src="${escape(row.screenshot)}" alt="${escape(friendlyName(row.id))} ${row.theme === 'dark' ? '深色' : '浅色'} 390像素截图"><figcaption>${escape(friendlyName(row.id))} <small>${row.theme === 'dark' ? '深色' : '浅色'} · ${row.passed ? '通过' : '失败'}</small><small class="route-id">${escape(row.id)}</small></figcaption></figure>`).join('')}</main><script>const query=document.getElementById('query'),theme=document.getElementById('theme');const apply=()=>document.querySelectorAll('figure').forEach(el=>el.hidden=!(el.dataset.page.toLowerCase().includes(query.value.toLowerCase())&&(!theme.value||el.dataset.theme===theme.value)));query.oninput=apply;theme.onchange=apply;</script></html>`;
}

module.exports = { gallery, friendlyName };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
