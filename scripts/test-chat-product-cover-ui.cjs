'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { engine, launchBrowser } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await launchBrowser(), outcomes = [];
  async function check(name, run) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [], videoRequests = [], repairRequests = [];
    let repairStatus = 200, repairDelay = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (/\.mp4$/.test(url.pathname)) { videoRequests.push(url.pathname); return route.abort(); }
      if (url.hostname !== 'chat-cover.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://chat-cover.test";' });
      if (url.pathname === '/api/market/video-poster') {
        repairRequests.push(route.request().postDataJSON());
        if (repairDelay) await new Promise(resolve => setTimeout(resolve, repairDelay));
        return route.fulfill({ status: repairStatus, json: repairStatus === 200 ? { ok: true, posterUrl: '/covers/repaired.svg' } : { ok: false, message: 'temporarily unavailable' } });
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, latestBuild: 0, friends: [], messages: [], posts: [], notifications: [], listings: [], items: [] } });
      if (url.pathname === '/covers/broken.svg') return route.fulfill({ status: 404, body: '' });
      if (url.pathname.startsWith('/covers/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#a46128"/></svg>' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
    });
    try {
      await page.goto('https://chat-cover.test/?skipIntro=1');
      await page.evaluate(() => {
        window.dismissTradeIntro?.();
        if (messageUnreadTimer) clearInterval(messageUnreadTimer);
        state = { ...state, ...emptyAccountData(), loggedInPhone: 'cover-test', cloudToken: 'cover-token', registeredUsers: [], page: 'communityChat', policyConsentRequired: false,
          selectedCommunityFriendId: 'seller', selectedCommunityFriend: { id: 'seller', name: '卖家' }, communityChatMessages: [], communityChatListing: null };
        cloudHydrationComplete = true;
        window.showProduct = listing => setState({ communityChatListing: normalizeCommunityChatListing({ id: 'product', title: '果核大尾种公', price: 3899, city: '上海市', delivery: '可快递', ...listing }) }, { skipCloud: true, forceRender: true });
        window.videoProduct = { mediaUrl: '/uploads/product.mp4', mediaType: 'video', mediaPosterUrl: '/covers/first.svg' };
      });
      const image = page.locator('.community-chat-product-media img');
      const decoded = () => page.waitForFunction(() => { const img = document.querySelector('.community-chat-product-media img'); return img?.complete && img.naturalWidth > 0; });
      await run({ page, image, decoded, repairRequests, setRepairStatus: value => repairStatus = value, setRepairDelay: value => repairDelay = value });
      assert.deepEqual(errors, []); assert.deepEqual(videoRequests, [], 'a product thumbnail must not fetch or play its video');
      outcomes.push({ name, pass: true });
    } catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
    finally { await page.close(); }
  }
  try {
    await check('existing video first-frame cover decodes immediately without a video element or request', async ({ page, image, decoded, repairRequests }) => {
      await page.evaluate(() => showProduct(videoProduct)); await decoded();
      assert.match(await image.getAttribute('src'), /\/covers\/first.svg$/);
      assert.equal(await page.locator('.community-chat-product-media video').count(), 0); assert.equal(repairRequests.length, 0);
      const size = await image.boundingBox(); assert.equal(Math.round(size.width), 60); assert.equal(Math.round(size.height), 60);
    });
    await check('initial seller chat takes its cover from mediaItems before the send reply', async ({ page, image, decoded, repairRequests }) => {
      await page.evaluate(() => showProduct({ mediaUrl: '/uploads/product.mp4', mediaType: 'video', mediaItems: [{ url: '/uploads/product.mp4', type: 'video', posterUrl: '/covers/first.svg' }] })); await decoded();
      assert.match(await image.getAttribute('src'), /\/covers\/first.svg$/); assert.equal(repairRequests.length, 0);
    });
    await check('mediaItems-only snapshot identifies the video and its first frame', async ({ page, image, decoded }) => {
      await page.evaluate(() => showProduct({ mediaItems: [{ url: '/uploads/product.mp4', type: 'video', poster: '/covers/first.svg' }] })); await decoded();
      assert.match(await image.getAttribute('src'), /\/covers\/first.svg$/); assert.equal(await page.locator('.community-chat-product-media.is-video').count(), 1);
    });
    await check('missing old cover uses the existing server repair and stays ready across rerenders', async ({ page, image, decoded, repairRequests }) => {
      await page.evaluate(() => showProduct({ ...videoProduct, mediaPosterUrl: '' }));
      await page.waitForFunction(() => document.querySelector('.community-chat-product-media img')?.src.endsWith('/covers/repaired.svg')); await decoded();
      assert.equal(repairRequests.length, 1); assert.equal(repairRequests[0].listingId, 'product');
      for (let i = 0; i < 5; i++) await page.evaluate(() => showProduct({ ...videoProduct, mediaPosterUrl: '' }));
      assert.match(await image.getAttribute('src'), /\/covers\/repaired.svg$/); assert.equal(repairRequests.length, 1);
    });
    await check('broken cover also repairs without decoding the remote video', async ({ page, image, decoded, repairRequests }) => {
      await page.evaluate(() => showProduct({ ...videoProduct, mediaPosterUrl: '/covers/broken.svg' }));
      await page.waitForFunction(() => document.querySelector('.community-chat-product-media img')?.src.endsWith('/covers/repaired.svg')); await decoded();
      assert.equal(repairRequests.length, 1); assert.match(await image.getAttribute('src'), /\/covers\/repaired.svg$/);
    });
    await check('a delayed repair for the old product does not overwrite another product cover', async ({ page, image, decoded, setRepairDelay }) => {
      setRepairDelay(150);
      await page.evaluate(() => showProduct({ ...videoProduct, mediaPosterUrl: '' }));
      await page.waitForRequest('**/api/market/video-poster');
      await page.evaluate(() => showProduct({ ...videoProduct, id: 'other-product', mediaPosterUrl: '/covers/other.svg' })); await decoded();
      await page.waitForTimeout(220); assert.match(await image.getAttribute('src'), /\/covers\/other.svg$/);
    });
    await check('unavailable repair has bounded retry and leaves chat usable', async ({ page, repairRequests, setRepairStatus }) => {
      setRepairStatus(503); await page.evaluate(() => showProduct({ ...videoProduct, mediaPosterUrl: '' }));
      await page.waitForFunction(() => marketPosterRepairs.get('product:https://chat-cover.test/uploads/product.mp4')?.pending === false);
      for (let i = 0; i < 5; i++) await page.evaluate(() => showProduct({ ...videoProduct, mediaPosterUrl: '' }));
      assert.equal(repairRequests.length, 1); assert.ok(await page.locator('.community-chat-product-link').isVisible());
    });
    await check('ordinary image and unavailable video product retain their existing behavior', async ({ page, image, decoded, repairRequests }) => {
      await page.evaluate(() => showProduct({ mediaUrl: '/covers/photo.svg', mediaType: 'image' })); await decoded();
      assert.equal(await page.locator('.community-chat-product-media.is-video').count(), 0); assert.equal(repairRequests.length, 0);
      await page.evaluate(() => showProduct({ ...videoProduct, status: 'sold' })); await decoded();
      assert.match(await image.getAttribute('src'), /\/covers\/first.svg$/); assert.equal(await page.locator('.community-chat-product-unavailable-mark').innerText(), '已售出');
    });
    const output = path.join(root, 'output/chat-product-cover-qa'); fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'ui-' + engine + '.json'), JSON.stringify({ engine, nativeDevice: false, outcomes }, null, 2));
    console.log(JSON.stringify({ engine, outcomes }, null, 2)); if (outcomes.some(item => !item.pass)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
