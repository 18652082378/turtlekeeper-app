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
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'city-ui.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
    });
    async function check(name, phone, admin, run) {
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto('https://city-ui.test/?skipIntro=1');
        await page.evaluate(({ phone, admin }) => {
          window.dismissTradeIntro?.();
          state = { ...state, ...emptyAccountData(), page: 'marketAdd', loggedInPhone: phone, isCommunityAdmin: admin, cloudToken: '', policyConsentRequired: false,
            marketDraftCity: '', marketDraftLatitude: '', marketDraftLongitude: '', marketLocationStatus: 'idle', editingMarketListingId: '',
            marketDraftMedia: [{ dataUrl: '/uploads/city-fixture.jpg', type: 'image' }] };
          window.locationCalls = 0; window.notes = []; window.publishRequests = [];
          toast = text => notes.push(text); canUseCommunity = () => true;
          getMarketLocationPosition = async () => { locationCalls++; throw new Error('fixture GPS unavailable'); };
          reverseGeocodeMarketCity = async () => '上海市';
          apiPost = async (route, body) => {
            if (['/api/market/create', '/api/market/update'].includes(route)) publishRequests.push({ route, body });
            return { ok: true, listings: [], myListings: [] };
          };
          render();
          window.completeForm = () => {
            const form = document.querySelector('#marketListingForm');
            for (const [name, value] of Object.entries({ title: '城市测试商品', speciesCode: 'GHG', stage: 'juvenile', gender: '未知', shellLength: '6', price: '100', delivery: '可快递', description: '城市测试详情' })) form.elements.namedItem(name).value = value;
            return form;
          };
          window.submitFixture = async () => {
            const form = completeForm();
            await submitMarketListing({ preventDefault() {}, currentTarget: form });
          };
        }, { phone, admin });
        await run(page);
        assert.deepEqual(errors, []);
        outcomes.push({ name, pass: true });
      } catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
      finally { await page.close(); }
    }
    for (const [label, phone, admin] of [['designated account', '17302554044', false], ['default administrator', '18652082378', false], ['configured administrator', '13900000001', true]]) {
      await check(label + ' can publish a typed city without GPS', phone, admin, async page => {
        assert.equal(await page.locator('[data-market-city]').getAttribute('readonly'), null);
        assert.equal(await page.evaluate(() => locationCalls), 0);
        await page.locator('[data-market-city]').fill('杭州市');
        await page.evaluate(() => submitFixture());
        const requests = await page.evaluate(() => publishRequests);
        assert.equal(requests.length, 1);
        assert.equal(requests[0].body.city, '杭州市');
        assert.equal(requests[0].body.locationSource, 'manual');
        assert.equal(requests[0].body.latitude, undefined);
      });
    }
    await check('ordinary account keeps the readonly GPS requirement', '13900000002', false, async page => {
      assert.notEqual(await page.locator('[data-market-city]').getAttribute('readonly'), null);
      await page.evaluate(() => { document.querySelector('[data-market-city]').value = '杭州市'; return submitFixture(); });
      assert.equal(await page.evaluate(() => publishRequests.length), 0);
      assert.match(await page.evaluate(() => notes.join(' ')), /位置访问|定位/);
    });
    await check('an authorized edit starts with the existing city and saves the new city', '17302554044', false, async page => {
      await page.evaluate(() => {
        state.myMarketListings = [{ id: 'city-edit', city: '南京市', title: '城市测试商品', status: 'active', speciesCode: 'GHG', mediaItems: [{ url: '/uploads/city-fixture.jpg', type: 'image' }] }];
        beginMarketListingEdit('city-edit');
      });
      assert.equal(await page.locator('[data-market-city]').inputValue(), '南京市');
      await page.locator('[data-market-city]').fill('苏州市');
      await page.evaluate(() => submitFixture());
      assert.deepEqual(await page.evaluate(() => publishRequests.map(request => [request.route, request.body.listingId, request.body.city])), [['/api/market/update', 'city-edit', '苏州市']]);
    });
    await check('typed city survives background form reconstruction', '17302554044', false, async page => {
      await page.locator('[data-market-city]').fill('杭州市');
      await page.evaluate(() => setState({ marketDraftDescription: '更新说明' }, { skipCloud: true, preserveInputValues: true }));
      assert.equal(await page.locator('[data-market-city]').inputValue(), '杭州市');
      assert.equal(await page.evaluate(() => state.marketDraftCity), '杭州市');
      assert.equal(await page.evaluate(() => locationCalls), 0);
    });
    await check('late GPS result cannot overwrite a manual edit', '17302554044', false, async page => {
      await page.evaluate(() => {
        getMarketLocationPosition = () => new Promise(resolve => { window.resolvePosition = resolve; });
        window.locationPending = requestMarketCityAutofill({ force: true });
      });
      await page.locator('[data-market-city]').fill('杭州市');
      await page.evaluate(async () => { resolvePosition({ coords: { latitude: 31, longitude: 121 } }); await locationPending; });
      assert.equal(await page.locator('[data-market-city]').inputValue(), '杭州市');
      assert.equal(await page.evaluate(() => state.marketLocationStatus), 'manual');
    });
    await check('explicit locate still fills a city for an authorized account', '17302554044', false, async page => {
      await page.evaluate(async () => { getMarketLocationPosition = async () => ({ coords: { latitude: 31, longitude: 121 } }); await requestMarketCityAutofill({ force: true }); });
      assert.equal(await page.locator('[data-market-city]').inputValue(), '上海市');
      assert.equal(await page.locator('[data-market-city]').getAttribute('readonly'), null);
    });
    await check('authorized account must still provide a nonempty city', '17302554044', false, async page => {
      await page.evaluate(() => submitFixture());
      assert.equal(await page.evaluate(() => publishRequests.length), 0);
      assert.match(await page.evaluate(() => notes.join(' ')), /所在城市/);
    });
    await check('GPS failure does not prevent an authorized manual city', '17302554044', false, async page => {
      await page.evaluate(() => requestMarketCityAutofill({ force: true }));
      await page.locator('[data-market-city]').fill('杭州市');
      await page.evaluate(() => submitFixture());
      assert.equal(await page.evaluate(() => publishRequests.length), 1);
    });
    recordResult(root, 'market-city-ui-regression.json', { scope: 'Isolated desktop UI with simulated GPS and submissions; no production requests or native device.', outcomes });
    console.log(JSON.stringify({ engine, outcomes }, null, 2));
    if (outcomes.some(outcome => !outcome.pass)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
