'use strict';
// Synthetic accounts and intercepted transport only; no live uploads or writes.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await launchBrowser(), page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [], outcomes = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'boundaries.test') return route.abort();
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, posts: [], listings: [], friends: [], items: [] } });
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
  });
  async function prepare(owner) {
    await page.evaluate(owner => {
      dismissTradeIntro?.(); TurtleReleaseNotes?.cancel();
      state = { ...initialState, ...emptyAccountData(), loggedInPhone: owner, cloudToken: 'token-' + owner, policyConsentRequired: false, page: 'home' };
      forceUpdateState = { required: false }; canUseCommunity = () => true; hasCloudSession = () => false;
      setState({ page: 'marketAdd', marketDraftCity: '杭州', marketDraftLatitude: 30.2, marketDraftLongitude: 120.1, marketLocationStatus: 'success', marketDraftMedia: [{ type: 'image', dataUrl: 'https://boundaries.test/uploads/synthetic.jpg' }] }, { skipSave: true });
      window.boundaryCalls = [];
      apiPost = (url, body) => { boundaryCalls.push({ url, body }); return new Promise(resolve => { window.finishPublication = resolve; }); };
    }, owner);
    await page.locator('#marketListingForm').waitFor();
    await page.locator('#marketListingForm [name="title"]').fill('本地合成商品测试');
    await page.locator('#marketListingForm [name="shellLength"]').fill('6.8');
    await page.locator('#marketListingForm [name="price"]').fill('188');
    await page.locator('#marketListingForm [name="stage"]').selectOption('juvenile');
    assert.equal(await page.locator('#marketListingForm [name="city"]').inputValue(), '杭州');
    await page.locator('#marketListingForm [name="description"]').fill('仅供隔离测试使用的合成商品内容');
    await page.locator('#marketListingForm [name="delivery"]').selectOption({ index: 1 });
    await page.evaluate(() => { document.querySelector('#marketListingForm [name="speciesCode"]').value = 'GHG'; });
  }
  async function start() {
    await page.evaluate(() => { window.boundaryPublishing = submitMarketListing({ preventDefault() {}, currentTarget: document.querySelector('#marketListingForm') }); });
  }
  try {
    await page.goto('https://boundaries.test/');
    await prepare('navigation-owner'); await start();
    await page.waitForFunction(() => boundaryCalls.length === 1);
    await page.evaluate(() => { setState({ page: 'feedbackAdd' }, { skipSave: true }); window.untouchedForm = document.querySelector('#feedbackForm'); });
    await page.locator('#feedbackForm [name="content"]').fill('发布完成不能覆盖我正在填写的反馈');
    await page.evaluate(async () => { finishPublication({ ok: true, myListings: [{ id: 'confirmed-listing' }] }); await boundaryPublishing; });
    assert.equal(await page.evaluate(() => state.page), 'feedbackAdd');
    assert.equal(await page.evaluate(() => untouchedForm === document.querySelector('#feedbackForm')), true);
    assert.match(await page.locator('#feedbackForm [name="content"]').inputValue(), /正在填写/);
    outcomes.push('Background publication retains the current form, its DOM and unsaved input');

    await prepare('old-owner'); await start();
    await page.waitForFunction(() => boundaryCalls.length === 1);
    await page.evaluate(async () => {
      setState({ loggedInPhone: 'new-owner', cloudToken: 'new-token', page: 'home', myMarketListings: [{ id: 'new-owner-listing' }] }, { skipSave: true });
      setState({ myMarketListings: [{ id: 'new-owner-listing' }] }, { skipSave: true });
      finishPublication({ ok: true, myListings: [{ id: 'old-owner-result' }] }); await boundaryPublishing;
    });
    assert.deepEqual(await page.evaluate(() => state.myMarketListings.map(item => item.id)), ['new-owner-listing']);
    assert.equal(await page.evaluate(() => state.page), 'home');
    outcomes.push('A late successful response cannot replace another account listing or page');

    await prepare('upload-owner');
    await page.evaluate(() => {
      const poster = new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' });
      state.marketDraftMedia = [{ type: 'video', dataUrl: 'data:video/mp4;base64,AAAA', posterFile: poster }];
      apiUploadMediaFile = (_file, _duration, options) => { window.capturedUploadOwner = options.owner; return new Promise(resolve => { window.finishPoster = resolve; }); };
    });
    await start();
    assert.deepEqual(await page.evaluate(() => capturedUploadOwner), { phone: 'upload-owner', token: 'token-upload-owner' });
    await page.evaluate(async () => {
      setState({ loggedInPhone: 'upload-new-owner', cloudToken: 'different-token', page: 'home' }, { skipSave: true });
      finishPoster({ url: '/uploads/old-owner-poster.jpg' }); await boundaryPublishing;
    });
    assert.equal(await page.evaluate(() => boundaryCalls.length), 0, 'Changing accounts during a poster upload must stop before uploading or posting media with the new identity');
    outcomes.push('Media upload belongs to its initiating account and stops before the next upload after session changes');
    assert.deepEqual(errors, []);
    recordResult(root, 'publish-navigation-boundaries.json', { outcomes, errors });
    console.log('PASS: ' + outcomes.join('; ') + '.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
