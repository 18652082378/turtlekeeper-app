'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..'), platform = process.env.MOBILE_UI_PLATFORM || 'web';
const assetRoot = platform === 'ios' ? path.join(root, 'ios/App/App/public') : platform === 'android' ? path.join(root, 'android/app/src/main/assets/public') : root;
const local = process.argv.includes('--local-preview');
const localIndex = 'C:/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app/index.html';
(async () => {
  const browser = await launchBrowser(), page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = [], images = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/config.js')) return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
    if (local && url.protocol === 'file:') return route.continue();
    if (url.hostname === 'pictures.test') {
      images.push(url.pathname);
      if (url.pathname === '/broken-thumb.jpg') return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(path.join(root, 'assets/species/GHG.jpg')), contentType: 'image/jpeg' });
    }
    if (url.hostname !== 'delivery.test') return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, posts: [], listings: [], items: [] } });
    const file = path.resolve(assetRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(assetRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };
    return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
  });
  try {
    await page.goto(local ? pathToFileURL(localIndex).href : 'https://delivery.test/');
    await page.evaluate(() => {
      dismissTradeIntro?.(); TurtleReleaseNotes?.cancel();
      const base = { authorName: '龟友', authorId: 'author', circleId: 'mud', title: '新作品', content: '新作品图片', speciesName: '果核蛋龟',
        createdAt: '2026-11-01', comments: [], likeCount: 0 };
      state = { ...initialState, ...emptyAccountData(), loggedInPhone: 'local-fixture', policyConsentRequired: false, page: 'community', communityFeedInitialized: true,
        communityPosts: normalizeCommunityPosts([{ ...base, id: 'ready', mediaItems: [{ type: 'image', url: 'https://pictures.test/original.jpg', thumbnailUrl: 'https://pictures.test/thumb.jpg' }] },
          { ...base, id: 'fallback', mediaItems: [{ type: 'image', url: 'https://pictures.test/fallback-original.jpg', thumbnailUrl: 'https://pictures.test/broken-thumb.jpg' }] }]) };
      forceUpdateState = { required: false }; render();
      window.previewCapture = [];
      openImagePreview = (url, title, options) => previewCapture.push({ url, title, options });
    });
    const ready = page.locator('[data-community-feed-card="ready"] img.community-media');
    await ready.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('[data-community-feed-card="ready"] img.community-media')?.naturalWidth > 0);
    assert.equal(await ready.getAttribute('src'), 'https://pictures.test/thumb.jpg');
    assert.equal(images.includes('/original.jpg'), false, 'The list does not download the original when a cached thumbnail is ready');
    await ready.click();
    assert.equal(await page.evaluate(() => previewCapture[0].url), 'https://pictures.test/original.jpg');
    assert.equal(await page.evaluate(() => previewCapture[0].options.gallery[0].src), 'https://pictures.test/original.jpg');
    const fallback = page.locator('[data-community-feed-card="fallback"] img.community-media');
    await fallback.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const image = document.querySelector('[data-community-feed-card="fallback"] img.community-media');
      return image?.getAttribute('src') === 'https://pictures.test/fallback-original.jpg' && image.naturalWidth > 0;
    });
    assert.equal(images.filter(url => url === '/broken-thumb.jpg').length, 1, 'A missing derivative falls back without a request loop');
    for (const width of [280, 390, 1180]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    assert.deepEqual(errors, []);
    recordResult(root, `feed-media-delivery-${platform}${local ? '-local' : ''}.json`, { errors, images, thumbnailsUsed: true, originalsPreserved: true });
    console.log(`PASS ${platform}${local ? '/file:' : ''}: cached thumbnail list delivery, full original preview, derivative failure fallback, three viewports, no JS errors.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
