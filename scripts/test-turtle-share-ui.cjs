'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..'), platform = process.env.MOBILE_UI_PLATFORM || 'web';
const assetRoot = platform === 'ios' ? path.join(root, 'ios/App/App/public') : platform === 'android' ? path.join(root, 'android/app/src/main/assets/public') : root;
const local = process.argv.includes('--local-preview');
const localIndex = 'C:/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app/index.html';
const photo = 'https://photos.test/turtle.jpg';
const turtle = { id: 'share-one', code: '小果', speciesCode: 'GHG', speciesName: '果核蛋龟', weight: 65, carapaceLength: 6.89, gender: '母',
  status: '正常饲养', health: '健康', acquiredDate: '2026-10-01', photo, price: 1400, source: '个人购买来源', poolId: 'private-pool', note: '私人备注', measureHistory: [] };
(async () => {
  const browser = await launchBrowser(), page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = []; let layouts = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/config.js')) return route.fulfill({ body: 'window.TURTLE_API_BASE_URL="";', contentType: 'text/javascript' });
    if (local && url.protocol === 'file:') return route.continue();
    if (url.hostname === 'photos.test') return route.fulfill({ body: fs.readFileSync(path.join(root, 'assets/species/GHG.jpg')), contentType: 'image/jpeg' });
    if (url.hostname !== 'turtle-share.test') return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, items: [] } });
    const file = path.resolve(assetRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(assetRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
    return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
  });
  try {
    await page.goto(local ? pathToFileURL(localIndex).href : 'https://turtle-share.test/');
    await page.evaluate(turtle => {
      dismissTradeIntro?.(); TurtleReleaseNotes?.cancel();
      state = { ...initialState, ...emptyAccountData(), loggedInPhone: 'share-fixture', accountName: '本地分享测试', policyConsentRequired: false,
        turtles: [turtle], turtlePools: [{ id: 'private-pool', name: '私人龟池' }], page: 'home' };
      forceUpdateState = { required: false }; render();
      window.shareCaptures = [];
      Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { shareCaptures.push(data); } });
    }, turtle);
    await page.evaluate(() => shareTurtleProfile('share-one'));
    const share = await page.evaluate(() => shareCaptures[0]);
    assert.equal(share.title, '龟友手账');
    assert.equal(share.text, '小果 · 果核蛋龟 · 母 · 65g · 背甲 6.89cm');
    const snapshot = await page.evaluate(url => decodeSharedTurtle(new URL(url).searchParams.get('turtle')), share.url);
    assert.equal(snapshot.photo, photo);
    for (const privateKey of ['price', 'poolId', 'source', 'note', 'ledgerRecords']) assert.equal(snapshot[privateKey], undefined);
    await page.evaluate(() => {
      window.Capacitor = { Plugins: { TurtleMediaPicker: { shareLink: async data => { shareCaptures.push(data); return { completed: true }; } } } };
    });
    await page.evaluate(() => shareTurtleProfile('share-one'));
    assert.deepEqual(await page.evaluate(() => ({ title: shareCaptures[1].title, text: shareCaptures[1].text, thumbnailUrl: shareCaptures[1].thumbnailUrl })),
      { title: share.title, text: share.text, thumbnailUrl: photo });
    await page.evaluate(async () => {
      window.shareCopies = [];
      copyText = async value => shareCopies.push(value);
      window.Capacitor.Plugins.TurtleMediaPicker.shareLink = async () => ({ cancelled: true });
      await shareTurtleProfile('share-one');
    });
    assert.equal(await page.evaluate(() => shareCopies.length), 0, 'Native cancellation does not copy or resend the link');
    await page.evaluate(async () => {
      window.Capacitor = undefined;
      Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }); } });
      await shareTurtleProfile('share-one');
    });
    assert.equal(await page.evaluate(() => shareCopies.length), 0, 'Web cancellation does not copy or resend the link');
    await page.evaluate(async () => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      await shareTurtleProfile('share-one');
    });
    assert.equal(await page.evaluate(() => shareCopies[0]), share.url, 'Older clients can still copy a normal public turtle URL');
    const bounded = await page.evaluate(() => {
      const turtle = { ...state.turtles[0], measureHistory: Array.from({ length: 8 }, (_, i) => ({ id: 'h' + i,
        oldPhoto: 'https://photos.test/' + 'a'.repeat(2800), newPhoto: 'https://photos.test/' + 'b'.repeat(2800) })) };
      state.turtles = [turtle];
      return shareTurtleProfile('share-one').then(() => shareCopies[1]);
    });
    assert(new URL(bounded).searchParams.get('turtle').length <= 12000, 'Large growth photos cannot produce a link the receiving client rejects');
    await page.evaluate(turtle => { state.turtles = [turtle]; }, turtle);
    const photoUpload = await page.evaluate(async () => {
      const original = { hasCloudSession, currentCloudToken, uploadDataUrlToCloud, toast, turtles: state.turtles };
      const image = 'data:image/jpeg;base64,c3ludGhldGlj';
      const results = { uploads: [], notices: [] };
      try {
        state.turtles = [{ ...state.turtles[0], photo: image }];
        hasCloudSession = () => true;
        currentCloudToken = () => 'fixture-token';
        toast = value => results.notices.push(value);
        uploadDataUrlToCloud = async (photo, kind, options) => {
          results.uploads.push({ photo, kind, owner: options.owner });
          return '/uploads/shared-turtle.jpg';
        };
        const before = shareCopies.length;
        await shareTurtleProfile('share-one');
        const snapshot = decodeSharedTurtle(new URL(shareCopies[before]).searchParams.get('turtle'));
        results.photo = snapshot.photo;
        results.originalUnchanged = state.turtles[0].photo === image;
        uploadDataUrlToCloud = async () => { throw new Error('测试照片上传失败'); };
        const count = shareCopies.length;
        await shareTurtleProfile('share-one');
        results.failedShareCount = shareCopies.length - count;
      } finally {
        hasCloudSession = original.hasCloudSession; currentCloudToken = original.currentCloudToken;
        uploadDataUrlToCloud = original.uploadDataUrlToCloud; toast = original.toast; state.turtles = original.turtles;
      }
      return results;
    });
    assert.equal(photoUpload.photo, 'https://api.turtleworld.cn/uploads/shared-turtle.jpg');
    assert.equal(photoUpload.uploads[0].owner.phone, 'share-fixture');
    assert.equal(photoUpload.originalUnchanged, true, 'Sharing an embedded photo does not rewrite the owner archive');
    assert.equal(photoUpload.failedShareCount, 0, 'Failed photo upload cannot emit a misleading share');
    assert.deepEqual(photoUpload.notices, ['测试照片上传失败']);
    await page.evaluate(url => { openSharedTurtleFromLocation(url, { initial: true }); render(); }, share.url);
    assert.deepEqual(await page.locator('.detail-grid-card > div > span').allTextContents(), ['性别', '体重', '背甲长', '入手日期']);
    assert.equal(await page.locator('.growth-preview-photo').first().getAttribute('src'), photo);
    assert.equal(await page.locator('[data-update-turtle], [data-delete-turtle], [data-ledger-for-turtle]').count(), 0, 'Public viewers do not see owner-only editing controls');
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    await page.screenshot({ path: path.join(root, `output/turtle-share-public-${platform}${local ? '-local' : ''}.png`), fullPage: true });
    for (const width of [280, 390, 768, 1180]) for (const theme of ['teal', 'dark']) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(theme => setState({ themeColor: theme }, { skipSave: true }), theme);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}/${theme} fits`);
      assert.doesNotMatch(await page.locator('.detail-grid-card').innerText(), /来源|购入价|龟池|未关联|私人|1400/);
      layouts++;
    }
    await page.evaluate(() => {
      sharedTurtlePreview = { ...sharedTurtlePreview, gender: '未知', weight: '', carapaceLength: 0, acquiredDate: '', birthDate: '', source: '', price: null, poolId: '' };
      render();
    });
    assert.equal(await page.locator('.detail-grid-card').count(), 0, 'A shared profile without recorded fields has no empty field card');
    assert.equal(await page.locator('.detail-growth-chart').count(), 0);
    assert.doesNotMatch(await page.locator('.content').innerText(), /未关联|购入价|来源|0g|0cm|暂时还没有成长记录/);
    await page.evaluate(() => {
      sharedTurtlePreview = { ...sharedTurtlePreview, measureHistory: [{ id: 'one', updatedAt: '2026-10-01', oldSnapshot: {}, newSnapshot: { weight: 65 } }] };
      render();
    });
    assert.equal(await page.locator('.growth-snapshot-meta span').count(), 1, 'Empty history measurements and private pool fields are omitted');
    assert.equal((await page.locator('.growth-snapshot-meta').last().innerText()).replace(/\s+/g, ''), '体重65g');
    await page.evaluate(() => { sharedTurtlePreview = null; setState({ page: 'turtleDetail', selectedTurtleId: 'share-one' }, { skipSave: true }); });
    assert.match(await page.locator('.detail-grid-card').innerText(), /个人购买来源[\s\S]*1400\.00[\s\S]*私人龟池/, 'Owner details remain complete');
    assert.equal(await page.evaluate(() => state.turtles[0].price), 1400);
    assert.deepEqual(errors, []);
    recordResult(root, `turtle-share-${platform}${local ? '-local' : ''}.json`, { layouts, errors, publicFieldsOnly: true });
    console.log(`PASS ${platform}${local ? '/file:' : ''}: turtle photo/title/info passed to native and web share; private/empty public fields omitted; ${layouts} layouts and owner data retained.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
