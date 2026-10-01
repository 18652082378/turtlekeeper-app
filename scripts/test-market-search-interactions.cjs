'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { engine, launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await launchBrowser();
  const outcomes = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'market-search.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
    });
    async function test(name, run) {
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto('https://market-search.test/?skipIntro=1');
        await page.evaluate(() => {
          window.dismissTradeIntro?.();
          state = { ...state, ...emptyAccountData(), loggedInPhone: 'preview', cloudToken: '', policyConsentRequired: false, page: 'market', marketSearch: '', marketFeedInitialized: true, marketFeedHasMore: false,
            marketListings: [{ id: 'search-fixture', title: '搜索回归商品', speciesCode: 'GHG', speciesName: '果核蛋龟', price: 100, status: 'active' }] };
          edgeBackSnapshots = []; render();
          window.searchPointer = (type, target, id = 77, x = 80, y = 135) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
        });
        await run(page); assert.deepEqual(errors, []);
        outcomes.push({ name, pass: true });
      } catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
      finally { await page.close(); }
    }
    await test('typing a species and keyboard viewport changes keep the market route', async page => {
      await page.locator('[data-market-search]').fill('果核');
      await page.setViewportSize({ width: 390, height: 500 });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => state.page), 'market');
      assert.equal(await page.locator('[data-market-search]').inputValue(), '果核');
    });
    for (const targetPage of ['home', 'messages']) await test(`a retargeted search touch click cannot open ${targetPage}`, async page => {
      await page.locator('[data-market-search]').fill('果核');
      const actual = await page.evaluate(targetPage => {
        const input = document.querySelector('[data-market-search]');
        searchPointer('pointerdown', input); searchPointer('pointerup', input);
        input.blur(); window.dispatchEvent(new Event('resize'));
        // Model the trailing WebKit click being delivered to a fixed tab after
        // the keyboard/layout changes. This is not a native iPhone capture.
        document.querySelector(`.bottom-nav [data-page="${targetPage}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
        return state.page;
      }, targetPage);
      assert.equal(actual, 'market', 'a touch that began in the search field must not activate an unrelated tab');
    });
    await test('a deliberate new tab tap remains available after searching', async page => {
      await page.locator('[data-market-search]').fill('果核');
      await page.evaluate(() => {
        const input = document.querySelector('[data-market-search]'); searchPointer('pointerdown', input); searchPointer('pointerup', input);
        const tab = document.querySelector('.bottom-nav [data-page="home"]'); searchPointer('pointerdown', tab, 78); searchPointer('pointerup', tab, 78);
        tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      });
      assert.equal(await page.evaluate(() => state.page), 'home');
    });
    await test('keyboard and accessibility tab activation remains available', async page => {
      await page.locator('[data-market-search]').fill('果核');
      await page.evaluate(() => document.querySelector('.bottom-nav [data-page="home"]').click());
      assert.equal(await page.evaluate(() => state.page), 'home');
    });
    await test('background data acknowledgements preserve the live input and composing draft', async page => {
      await page.locator('[data-market-search]').fill('guo');
      const result = await page.evaluate(() => {
        const input = document.querySelector('[data-market-search]');
        input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'guo' }));
        setState({ marketFeedInitialized: true, marketListings: [...state.marketListings] }, { skipCloud: true, preserveInputValues: true, renderPages: ['market'] });
        return { sameNode: input === document.querySelector('[data-market-search]'), connected: input.isConnected, value: document.activeElement.value, page: state.page };
      });
      assert.deepEqual(result, { sameNode: true, connected: true, value: 'guo', page: 'market' });
    });
    await test('touching a suggestion does not blur the input before its click', async page => {
      await page.locator('[data-market-search]').fill('果核');
      const result = await page.evaluate(() => {
        const input = document.querySelector('[data-market-search]');
        const button = document.querySelector('[data-market-search-species]');
        return { canceled: !searchPointer('pointerdown', button), focused: document.activeElement === input };
      });
      assert.deepEqual(result, { canceled: true, focused: true });
    });
    await test('selecting a species performs one search and remains on market', async page => {
      await page.locator('[data-market-search]').fill('果核');
      await page.locator('[data-market-search-species="GHG"]').click();
      assert.equal(await page.evaluate(() => state.page), 'market');
      assert.equal(await page.evaluate(() => state.marketSearch), '果核蛋龟');
      assert.equal(await page.evaluate(() => state.marketFeedGeneration), 1);
    });
    await test('submitting during Chinese composition does not search the unfinished spelling', async page => {
      await page.locator('[data-market-search]').fill('guo');
      await page.evaluate(() => {
        const input = document.querySelector('[data-market-search]');
        input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'guo' }));
        input.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      assert.equal(await page.evaluate(() => state.marketSearch), '');
      assert.equal(await page.locator('[data-market-search]').inputValue(), 'guo');
    });
    await test('keyboard search submits the completed term without changing route', async page => {
      await page.locator('[data-market-search]').fill('果核蛋龟');
      await page.locator('[data-market-search]').press('Enter');
      assert.equal(await page.evaluate(() => state.marketSearch), '果核蛋龟');
      assert.equal(await page.evaluate(() => state.page), 'market');
    });
    await test('a deferred feed refresh appears after leaving the search editor', async page => {
      await page.locator('[data-market-search]').fill('果核');
      await page.evaluate(() => {
        setState({ marketListings: [{ ...state.marketListings[0], title: '后台更新后的商品' }] }, { skipCloud: true, preserveInputValues: true, renderPages: ['market'] });
        document.querySelector('[data-market-search]').blur();
      });
      await page.waitForFunction(() => !marketSearchRenderDeferred);
      assert.equal(await page.locator('[data-market-search]').inputValue(), '果核');
      assert.equal(await page.locator('.market-card-body > strong').textContent(), '后台更新后的商品');
      assert.equal(await page.evaluate(() => state.page), 'market');
    });
    await test('a pending refresh cannot replace controls in the middle of a deliberate tab touch', async page => {
      await page.locator('[data-market-search]').fill('果核');
      await page.evaluate(() => {
        window.originalSearchEditor = document.querySelector('[data-market-search]');
        setState({ marketListings: [...state.marketListings] }, { skipCloud: true, preserveInputValues: true, renderPages: ['market'] });
        const tab = document.querySelector('.bottom-nav [data-page="home"]');
        searchPointer('pointerdown', tab, 79); originalSearchEditor.blur();
      });
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => originalSearchEditor.isConnected), true);
      await page.evaluate(() => {
        const tab = document.querySelector('.bottom-nav [data-page="home"]'); searchPointer('pointerup', tab, 79);
        tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      });
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => state.page), 'home');
    });
    await test('rebinding a preserved market form does not submit the same search twice', async page => {
      await page.locator('[data-market-search]').fill('果核蛋龟');
      await page.evaluate(() => { bindMarketSearchSuggestions(); bindMarketSearchSuggestions(); });
      await page.locator('[data-market-search]').press('Enter');
      assert.equal(await page.evaluate(() => state.marketFeedGeneration), 1);
    });
    await test('a detached old search form cannot mutate the next page', async page => {
      await page.locator('[data-market-search]').fill('旧页面输入');
      await page.evaluate(() => {
        const oldForm = document.querySelector('[data-market-search-form]');
        setState({ page: 'home' }, { skipSave: true });
        oldForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      assert.equal(await page.evaluate(() => state.page), 'home');
      assert.equal(await page.evaluate(() => state.marketSearch), '');
    });
    const name = process.argv.includes('--before') ? 'market-search-before.json' : 'market-search-regression.json';
    recordResult(root, name, { scope: 'Isolated desktop browser with synthetic touch/IME/viewport sequences; no production requests or native iPhone keyboard.', outcomes });
    console.log(JSON.stringify({ engine, outcomes }, null, 2));
    if (outcomes.some(item => !item.pass)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
