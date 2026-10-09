'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, engine } = require('./browser-test-engine.cjs');
const fixture = require('./ui-audit-fixture.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output/search-workspace');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await launchBrowser(), outcomes = [];
  async function check(name, run, cloud = false) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai', hasTouch: true });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'search.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: `window.TURTLE_API_BASE_URL=${JSON.stringify(cloud ? 'https://search.test' : '')};` });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, posts: [], messages: [], listings: [], minimumBuild: 0 } });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
    });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(6000); page.on('pageerror', error => errors.push(error.message));
    const seed = async (route = 'market', patch = {}) => {
      await page.evaluate(({ base, route, patch, cloud }) => {
        dismissTradeIntro?.();
        state = { ...initialState, ...emptyAccountData(), ...base, page: route, ...patch, cloudToken: cloud ? 'synthetic-token' : '' };
        marketLoading = communityLoading = messageUnreadLoading = cloud;
        forceUpdateState = { required: false }; edgeBackSnapshots = []; TurtleSearch.reset(); render();
      }, { base: fixture(), route, patch, cloud });
    };
    try {
      await page.goto('https://search.test/?skipIntro=1'); await seed();
      await run(page, seed); assert.deepEqual(errors, []);
      outcomes.push({ name, pass: true }); console.log('PASS ' + name);
    } catch (error) { outcomes.push({ name, pass: false, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message); }
    finally { await context.close(); }
  }
  await check('both entries open a secondary search page with owned species, history and automatic input focus', async (page, seed) => {
    for (const source of ['market', 'community']) {
      await seed(source); await page.locator(`[data-open-search="${source}"]`).click();
      assert.equal(await page.evaluate(() => state.page), 'search');
      assert.equal(await page.locator('.bottom-nav').count(), 0);
      assert.equal(await page.locator('[data-workspace-search]').evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator('.search-species-card').count(), 8);
      assert.equal(await page.locator('.search-species-card').first().getAttribute('data-search-species'), 'GHG');
      assert.match(await page.locator('.search-species-card').first().innerText(), /你在饲养/);
      assert.match(await page.locator('.search-history').innerText(), /关键词会出现在这里/);
      const bar = await page.locator('[data-workspace-search-form]').boundingBox(), history = await page.locator('.search-history').boundingBox();
      assert.ok(history.y >= bar.y + bar.height, 'the fixed search bar must not cover the first content section');
      await page.locator('[data-back]').click(); assert.equal(await page.evaluate(() => state.page), source);
    }
  });
  await check('market and community home search entries stay attached to their titles while feeds scroll', async (page, seed) => {
    for (const source of ['market', 'community']) for (const theme of ['teal', 'dark']) for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const base = fixture();
      await seed(source, {
        themeColor: theme,
        marketListings: Array.from({ length: 32 }, (_, i) => ({ ...base.marketListings[0], id: 'scroll-listing-' + i })),
        communityPosts: Array.from({ length: 24 }, (_, i) => ({ ...base.communityPosts[0], id: 'scroll-post-' + i }))
      });
      await page.waitForTimeout(350);
      const dock = page.locator('.feed-search-dock'), entry = page.locator(`[data-open-search="${source}"]`);
      const original = await dock.boundingBox(), main = await page.locator('.content').boundingBox();
      const header = await page.locator('.topbar').boundingBox();
      assert.ok(Math.abs(original.y - header.y - header.height) < 1, 'feed search must touch the bottom of its title bar');
      assert.ok(Math.abs(original.x - main.x) < 1 && Math.abs(original.width - main.width) < 1, 'feed search uses the same centered content width');
      const first = await page.locator(source === 'market' ? '.market-promise-strip' : '.community-invite').boundingBox();
      assert.ok(first.y >= original.y + original.height, 'feed search must not cover the first content block');
      await page.evaluate(() => scrollTo(0, 500)); await page.waitForTimeout(50);
      assert.ok(await page.evaluate(() => scrollY > 400), 'the real feed must actually scroll');
      assert.ok(Math.abs((await dock.boundingBox()).y - original.y) < 1, 'feed search must stay fixed while its list moves');
      assert.equal(await entry.evaluate(el => { const b = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(b.x + 25, b.y + b.height / 2)); }), true, 'scrolled feed cannot cover the search entry');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 390 && theme === 'teal') await page.screenshot({ path: path.join(output, `${source}-pinned-search-${engine}.png`), animations: 'disabled' });
      const scroll = await page.evaluate(() => scrollY);
      await entry.click(); assert.equal(await page.evaluate(() => state.page), 'search');
      await page.evaluate(() => navigateBack({ fromEdgeGesture: true }));
      assert.equal(await page.evaluate(() => state.page), source);
      assert.ok(Math.abs(await page.evaluate(() => scrollY) - scroll) < 2, 'returning from search must retain feed position');
      assert.ok(Math.abs((await dock.boundingBox()).y - original.y) < 1, 'restored search entry stays attached to title');
      await page.evaluate(() => scrollTo(0, 0));
    }
  });
  await check('typing stays in the editor and records history only after completed submission', async page => {
    await page.locator('[data-open-search="market"]').click();
    await page.locator('[data-workspace-search]').fill('果核');
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('turtlekeeper-search-history-v1:'))), false);
    await page.locator('[data-search-species="GHG"]').click();
    assert.equal(await page.evaluate(() => state.page), 'market');
    assert.equal(await page.evaluate(() => state.marketSearch), '果核蛋龟');
    assert.equal(await page.evaluate(() => state.marketFeedGeneration), 1);
    assert.equal(await page.locator('[data-view-market="ui-listing"]').count(), 1, 'local search retains local listings');
    await page.locator('[data-open-search="market"]').click();
    assert.match(await page.locator('.search-history-chips').innerText(), /果核蛋龟/);
    await page.locator('[data-search-history="0"]').click();
    assert.equal(await page.evaluate(() => state.marketFeedGeneration), 2);
  });
  await check('IME composition cannot submit unfinished spelling; keyboard submit uses the completed term', async page => {
    await page.locator('[data-open-search="market"]').click();
    await page.locator('[data-workspace-search]').fill('guo');
    await page.evaluate(() => { const input = document.querySelector('[data-workspace-search]'); input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); input.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    assert.equal(await page.evaluate(() => state.page), 'search');
    assert.equal(await page.evaluate(() => state.marketSearch), '');
    await page.locator('[data-workspace-search]').fill('果核蛋龟');
    await page.evaluate(() => document.querySelector('[data-workspace-search]').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    await page.locator('[data-workspace-search]').press('Enter');
    assert.equal(await page.evaluate(() => state.marketSearch), '果核蛋龟');
  });
  await check('product results omit the market title and keep safe-area search, filters and a way back', async (page, seed) => {
    for (const theme of ['teal', 'dark']) for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const base = fixture();
      await seed('market', { themeColor: theme, marketPriceOrder: 'asc', marketListings: Array.from({ length: 32 }, (_, i) => ({ ...base.marketListings[0], id: i ? 'result-' + i : 'ui-listing' })) });
      await page.locator('[data-open-search="market"]').click();
      await page.locator('[data-workspace-search]').fill('果核'); await page.locator('.search-workspace-submit').click();
      await page.waitForTimeout(350);
      assert.equal(await page.locator('.topbar').count(), 0, 'results must not retain the market title row');
      const dock = page.locator('.market-results-search-dock'), original = await dock.boundingBox();
      assert.equal(original.y, 0, 'search row must occupy the top after removing the title');
      const entry = await page.locator('[data-open-search="market"]').boundingBox();
      assert.ok(entry.y >= 16, 'search entry must retain top safe-area padding');
      const first = await page.locator('.market-promise-strip').boundingBox();
      assert.ok(first.y >= original.height && first.y - original.height < 32, 'no old title-sized gap or content overlap');
      assert.equal(await page.locator('[data-market-price-order]').count(), 1);
      assert.equal(await page.evaluate(() => state.marketPriceOrder), 'asc');
      await page.evaluate(() => scrollTo(0, 300)); await page.waitForTimeout(50);
      assert.ok(await page.evaluate(() => scrollY > 250));
      assert.equal((await dock.boundingBox()).y, 0);
      assert.equal(await page.locator('[data-market-search-exit]').evaluate(el => { const b = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)); }), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 390 && theme === 'teal') {
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(output, `market-search-results-${engine}.png`), animations: 'disabled' });
        await page.locator('[data-view-market="ui-listing"]').click();
        assert.equal(await page.evaluate(() => state.page), 'marketDetail');
        await page.evaluate(() => navigateBack({ fromEdgeGesture: true }));
        assert.equal(await page.locator('.topbar').count(), 0, 'detail return must retain the search results layout');
        assert.equal(await page.evaluate(() => state.marketSearch), '果核');
      }
      await page.locator('[data-market-search-exit]').click();
      assert.equal(await page.evaluate(() => state.marketSearch), '');
      assert.equal(await page.evaluate(() => state.marketPriceOrder), 'asc', 'leaving keyword search must retain selected filters');
      assert.equal(await page.locator('.topbar h1').innerText(), '龟集市');
      assert.equal(await page.locator('[data-view-market="ui-listing"]').count(), 1, 'local exit retains listing data');
      assert.equal(await page.evaluate(() => scrollY), 0);
    }
  });
  await check('recommendation refresh, clearing an unsubmitted query and detached controls cannot change another page', async page => {
    await page.locator('[data-open-search="market"]').click();
    const first = await page.locator('.search-species-card').first().getAttribute('data-search-species');
    await page.locator('[data-refresh-search-recommendations]').click();
    assert.notEqual(await page.locator('.search-species-card').first().getAttribute('data-search-species'), first);
    await page.locator('[data-workspace-search]').fill('不提交');
    await page.locator('[data-clear-workspace-search]').click();
    assert.equal(await page.locator('.search-species-card').count(), 8);
    await page.evaluate(() => { window.oldSearch = document.querySelector('[data-workspace-search-form]'); navigateBack(); oldSearch.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    assert.equal(await page.evaluate(() => state.page), 'market'); assert.equal(await page.evaluate(() => state.marketSearch), '');
  });
  await check('history deduplicates, caps at 12, survives restart and clears only the current account and source', async (page, seed) => {
    await page.evaluate(() => {
      localStorage.setItem('turtlekeeper-search-history-v1:13000000000:market', JSON.stringify(Array.from({ length: 18 }, (_, i) => ({ query: '历史关键词' + i }))));
      localStorage.setItem('turtlekeeper-search-history-v1:13000000000:community', JSON.stringify([{ query: '圈子关键词' }]));
    });
    await page.reload(); await seed(); await page.locator('[data-open-search="market"]').click();
    assert.equal(await page.locator('[data-search-history]').count(), 12);
    await page.locator('[data-search-history="2"]').click(); await page.locator('[data-open-search="market"]').click();
    assert.equal(await page.locator('[data-search-history]').count(), 12);
    assert.equal(await page.locator('[data-search-history="0"]').innerText(), '历史关键词2');
    page.once('dialog', dialog => dialog.dismiss()); await page.locator('[data-clear-search-history]').click();
    assert.equal(await page.locator('[data-search-history]').count(), 12);
    page.once('dialog', dialog => dialog.accept()); await page.locator('[data-clear-search-history]').click();
    assert.equal(await page.locator('[data-search-history]').count(), 0);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('turtlekeeper-search-history-v1:13000000000:community'))[0].query), '圈子关键词');
    await seed('market', { loggedInPhone: '13000000001' }); await page.locator('[data-open-search="market"]').click();
    assert.equal(await page.locator('[data-search-history]').count(), 0);
  });
  await check('favorites and owned species influence rankings; prohibited species are excluded from market recommendations', async (page, seed) => {
    await seed('market', { turtles: [], keptSpecies: [], marketFavoriteIds: ['favorite'], marketHistoryIds: [], marketListings: [{ ...fixture().marketListings[0], id: 'favorite', speciesCode: 'HMG', speciesName: '红面蛋龟' }] });
    await page.locator('[data-open-search="market"]').click();
    assert.equal(await page.locator('.search-species-card').first().getAttribute('data-search-species'), 'HMG');
    assert.match(await page.locator('.search-species-card').first().innerText(), /你曾收藏/);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('[data-search-species]')].every(button => !isMarketProhibitedSpecies(button.dataset.searchSpecies))), true);
  });
  await check('community results open the original post detail and return to the same search results', async (page, seed) => {
    await seed('community'); await page.locator('[data-open-search="community"]').click();
    await page.locator('[data-workspace-search]').fill('小成长'); await page.locator('.search-workspace-submit').click();
    await page.waitForSelector('[data-search-post="ui-post"]');
    await page.locator('[data-search-post="ui-post"]').click(); assert.equal(await page.evaluate(() => state.page), 'communityPostDetail');
    await page.locator('[data-back]').click(); assert.equal(await page.evaluate(() => state.page), 'search');
    assert.equal(await page.locator('[data-workspace-search]').inputValue(), '小成长');
    assert.equal(await page.locator('[data-search-post="ui-post"]').count(), 1);
    await page.evaluate(() => navigateBack({ fromEdgeGesture: true })); assert.equal(await page.evaluate(() => state.page), 'community');
  });
  await check('late requests cannot leak across queries, back navigation, accounts or changed tokens', async (page, seed) => {
    await seed('community');
    await page.evaluate(() => {
      window.searchResolvers = [];
      window.savedSearchApi = apiPost;
      apiPost = (url, payload) => url === '/api/community/search' ? new Promise(resolve => searchResolvers.push(resolve)) : savedSearchApi(url, payload);
    });
    await page.locator('[data-open-search="community"]').click(); await page.locator('[data-workspace-search]').fill('旧查询'); await page.locator('.search-workspace-submit').click();
    await page.locator('[data-workspace-search]').fill('新查询');
    await page.evaluate(() => searchResolvers.shift()({ posts: [{ id: 'old', title: '过期结果' }] }));
    assert.equal(await page.locator('[data-search-post="old"]').count(), 0);
    await page.locator('.search-workspace-submit').click(); await page.evaluate(() => navigateBack());
    await page.evaluate(() => searchResolvers.shift()({ posts: [{ id: 'back', title: '离开后的结果' }] }));
    assert.equal(await page.evaluate(() => state.page), 'community');
    await page.locator('[data-open-search="community"]').click(); await page.locator('[data-workspace-search]').fill('账号甲'); await page.locator('.search-workspace-submit').click();
    await page.evaluate(() => { setState({ loggedInPhone: '13000000001', cloudToken: 'new-token' }, { skipSave: true }); searchResolvers.shift()({ posts: [{ id: 'other', title: '别人的搜索结果' }] }); });
    assert.equal(await page.locator('[data-search-post="other"]').count(), 0); assert.equal(await page.locator('[data-search-history]').count(), 0);
    await page.evaluate(() => TurtleSearch.open('community')); await page.locator('[data-workspace-search]').fill('令牌旧'); await page.locator('.search-workspace-submit').click();
    await page.evaluate(() => { setState({ cloudToken: 'renewed-token' }, { skipSave: true }); searchResolvers.shift()({ posts: [{ id: 'token', title: '旧会话结果' }] }); });
    assert.equal(await page.locator('[data-search-post="token"]').count(), 0); assert.equal(await page.locator('[data-workspace-search]').inputValue(), '');
  }, true);
  await check('failed community searches offer local matches and retry without duplicating history', async (page, seed) => {
    await seed('community'); await page.evaluate(() => { window.originalSearchApi = apiPost; apiPost = (url, payload) => url === '/api/community/search' ? Promise.reject(new Error('fixture offline')) : originalSearchApi(url, payload); });
    await page.locator('[data-open-search="community"]').click(); await page.locator('[data-workspace-search]').fill('小成长'); await page.locator('.search-workspace-submit').click();
    await page.waitForSelector('[data-retry-workspace-search]'); assert.equal(await page.locator('[data-search-post="ui-post"]').count(), 1);
    await page.locator('[data-retry-workspace-search]').click(); await page.waitForSelector('[data-retry-workspace-search]');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('turtlekeeper-search-history-v1:13000000000:community')).length), 1);
  }, true);
  await check('corrupted history is ignored and cold-start recommendations do not claim invented popularity', async (page, seed) => {
    await page.evaluate(() => localStorage.setItem('turtlekeeper-search-history-v1:13000000000:market', '{invalid'));
    await seed('market', { turtles: [], keptSpecies: [], marketFavoriteIds: [], marketHistoryIds: [] });
    await page.locator('[data-open-search="market"]').click();
    assert.match(await page.locator('.search-discovery').innerText(), /从这些品种开始/);
    assert.equal(await page.locator('[data-search-history]').count(), 0);
  });
  await check('search layouts fit narrow, wide and dark views; focused input highlights only the rounded outer control', async (page, seed) => {
    for (const theme of ['teal', 'dark']) for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 844 }); await seed('market', { themeColor: theme });
      await page.locator('[data-open-search="market"]').click();
      await page.evaluate(() => localStorage.setItem('turtlekeeper-search-history-v1:13000000000:market', JSON.stringify([{ query: '果核蛋龟' }, { query: '红面' }, { query: '搜索长词'.repeat(12) }])));
      await page.locator('[data-workspace-search]').fill('a'); await page.locator('[data-clear-workspace-search]').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const input = await page.locator('[data-workspace-search]').evaluate(el => ({ outline: getComputedStyle(el).outlineStyle, shadow: getComputedStyle(el).boxShadow }));
      assert.deepEqual(input, { outline: 'none', shadow: 'none' });
      const control = await page.locator('.search-workspace-control').evaluate(el => ({ border: getComputedStyle(el).borderColor, radius: getComputedStyle(el).borderRadius }));
      assert.equal(control.border, theme === 'dark' ? 'rgb(107, 208, 170)' : 'rgb(31, 121, 97)'); assert.notEqual(control.radius, '0px');
      await page.screenshot({ path: path.join(output, `search-${theme}-${width}-${engine}.png`), animations: 'disabled' });
      if (width === 390 && theme === 'teal') {
        await page.evaluate(() => localStorage.setItem('turtlekeeper-search-history-v1:13000000000:market', JSON.stringify([{ query: '果核蛋龟' }, { query: '红面' }, { query: '头盔龟' }])));
        await page.locator('[data-workspace-search]').fill('a'); await page.locator('[data-clear-workspace-search]').click();
        await page.screenshot({ path: path.join(output, `search-preview-${engine}.png`), animations: 'disabled' });
      }
    }
  });
  await check('search bar stays below the header while results scroll, including keyboard height changes', async (page, seed) => {
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 }); await seed('community');
      await page.locator('[data-open-search="community"]').click();
      await page.evaluate(() => {
        document.querySelector('[data-workspace-search]').blur();
        const body = document.querySelector('[data-workspace-search-body]');
        body.insertAdjacentHTML('beforeend', '<section style="height:1800px">模拟长搜索结果</section>');
      });
      await page.waitForTimeout(350);
      const original = await page.locator('[data-workspace-search-form]').boundingBox();
      const main = await page.locator('.search-workspace').boundingBox();
      assert.ok(Math.abs(original.x - main.x) < 1 && Math.abs(original.width - main.width) < 1, 'fixed search bar must retain content width');
      await page.evaluate(() => scrollTo(0, 400));
      await page.waitForTimeout(50);
      assert.ok(await page.evaluate(() => scrollY > 300), 'test must actually scroll the page');
      const moved = await page.locator('[data-workspace-search-form]').boundingBox();
      assert.ok(Math.abs(moved.y - original.y) < 1, 'search bar must not scroll away');
      const header = await page.locator('.topbar').boundingBox();
      assert.ok(moved.y >= header.y + header.height - 1, 'search bar must not cover the header/safe area');
      const visible = await page.locator('[data-workspace-search]').evaluate(el => { const b = el.getBoundingClientRect(); return document.elementFromPoint(b.x + 8, b.y + b.height / 2) === el; });
      assert.equal(visible, true, 'scrolling content cannot cover the search input');
      await page.locator('[data-workspace-search]').focus();
      await page.setViewportSize({ width, height: 500 }); await page.evaluate(() => syncMobileKeyboardUI());
      const keyboard = await page.locator('[data-workspace-search-form]').boundingBox();
      assert.ok(keyboard.y >= 0 && keyboard.y + keyboard.height <= 500);
      await page.setViewportSize({ width, height: 844 });
      if (width === 390) {
        await page.locator('[data-workspace-search]').evaluate(el => el.blur()); await page.evaluate(() => scrollTo(0, 260));
        await page.screenshot({ path: path.join(output, `search-scrolled-${engine}.png`), animations: 'disabled' });
      }
      await page.evaluate(() => navigateBack({ fromEdgeGesture: true })); assert.equal(await page.evaluate(() => state.page), 'community');
    }
  });
  await browser.close();
  fs.writeFileSync(path.join(output, `results-${engine}.json`), JSON.stringify({ scope: 'Synthetic browser/account/IME/gesture/API checks; no production or native iPhone access.', outcomes }, null, 2));
  if (outcomes.some(item => !item.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
