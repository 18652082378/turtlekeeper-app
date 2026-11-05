'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..'), platform = process.env.MOBILE_UI_PLATFORM || 'web';
const assetRoot = platform === 'ios' ? path.join(root, 'ios/App/App/public') : platform === 'android' ? path.join(root, 'android/app/src/main/assets/public') : root;
const local = process.argv.includes('--local-preview');
const { pathToFileURL } = require('node:url');
const localIndex = 'C:/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app/index.html';
const photo = fs.readFileSync(path.join(root, 'assets/species/GHG.jpg'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };
(async () => {
  const browser = await launchBrowser(), page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [], results = []; let rejectPublication = false;
  page.on('pageerror', error => { errors.push(error.message); console.error('Draft test page error after', results.at(-1), error.stack); });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/config.js')) return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://drafts.test";' });
    if (local && url.protocol === 'file:') return route.continue();
    if (url.hostname !== 'drafts.test') return route.abort();
    if (url.pathname.startsWith('/api/')) {
      if (rejectPublication && /\/(community|market)\/(create|update)$/.test(url.pathname)) return route.fulfill({ status: 503, json: { ok: false, message: '测试上传失败' } });
      return route.fulfill({ json: { ok: true, minimumBuild: 0, posts: [], listings: [], myListings: [], friends: [], items: [] } });
    }
    const file = path.resolve(assetRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(assetRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    let body = fs.readFileSync(file);
    if (url.pathname === '/' && !body.toString().includes('assets/publishing-drafts.js')) body = Buffer.from(body.toString().replace('</body>', '<script src="/assets/publishing-drafts.js"></script></body>'));
    return route.fulfill({ body, contentType: mime[path.extname(file)] || 'application/octet-stream' });
  });
  async function seed(owner = 'draft-owner-a') {
    await page.evaluate(owner => {
      dismissTradeIntro?.(); TurtleReleaseNotes?.cancel();
      state = { ...initialState, ...emptyAccountData(), page: 'home', loggedInPhone: owner, cloudToken: 'fixture-token', registeredUsers: [{ phone: owner, cloudToken: 'fixture-token' }], policyConsentRequired: false };
      forceUpdateState = { required: false }; canUseCommunity = () => true; render();
    }, owner);
  }
  async function enter(kind, id = '') {
    await page.evaluate(({ kind, id }) => setState({ page: kind === 'community' ? 'communityAdd' : 'marketAdd', editingMarketListingId: id }, { skipCloud: true }), { kind, id });
    await page.locator(kind === 'community' ? '#communityPostForm' : '#marketListingForm').waitFor();
  }
  async function flush() { await page.evaluate(async () => { TurtlePublishDrafts.flush(); await TurtlePublishDrafts.settled(); }); }
  async function reload(owner = 'draft-owner-a') { await page.reload(); await seed(owner); }
  async function addPhoto(kind) {
    const before = await page.evaluate(kind => kind === 'community' ? communityDraftMediaItems.length : state.marketDraftMedia.length, kind);
    await page.locator(kind === 'community' ? '#communityPostForm input[type="file"]' : '[data-market-media-input]').setInputFiles({ name: 'retained-photo.jpg', mimeType: 'image/jpeg', buffer: photo });
    await page.waitForFunction(({ kind, before }) => (kind === 'community' ? communityDraftMediaItems.length : state.marketDraftMedia.length) === before + 1, { kind, before });
  }
  async function photoInfo(kind) {
    return page.evaluate(async kind => {
      const item = kind === 'community' ? communityDraftMediaItems[0] : state.marketDraftMedia[0];
      const source = item?.previewUrl || item?.dataUrl || '';
      const bytes = item?.file ? new Uint8Array(await item.file.arrayBuffer()) : source.startsWith('data:') ? Uint8Array.from(atob(source.split(',')[1]), character => character.charCodeAt(0)) : [];
      return { name: item?.file?.name, bytes: bytes.length, first: Array.from(bytes.slice(0, 8)), source };
    }, kind);
  }
  try {
    await page.goto(local ? pathToFileURL(localIndex).href : 'https://drafts.test/');
    assert(await page.evaluate(() => Boolean(window.TurtlePublishDrafts)), `${platform} must load the durable draft module`);
    await seed(); await enter('community');
    await page.locator('#communityPostForm [name="title"]').fill('意外离开仍可继续编辑');
    await page.locator('#communityPostForm [name="content"]').fill('正文和所选照片都需要保留。');
    await addPhoto('community'); await flush();
    assert.match(await page.locator('[data-publishing-draft-status]').innerText(), /已保存/);
    await reload(); await enter('community');
    assert.equal(await page.locator('#communityPostForm [name="title"]').inputValue(), '意外离开仍可继续编辑');
    const restored = await photoInfo('community');
    assert.equal(restored.bytes, photo.length, JSON.stringify({ restored, status: await page.locator('[data-publishing-draft-status]').innerText(), media: await page.evaluate(() => communityDraftMediaItems.map(item => ({ type: item.file?.constructor?.name, blob: item.file instanceof Blob, size: item.file?.size, source: item.previewUrl }))) })); assert.equal(restored.name, 'retained-photo.jpg');
    assert.deepEqual(restored.first, [...photo.subarray(0, 8)]); assert(restored.source.startsWith('blob:'));
    results.push('Community title/body and real photo bytes survive reload');

    // Navigate immediately before the debounce has elapsed.
    await page.locator('#communityPostForm [name="content"]').fill('离开前最后一次修改');
    await page.evaluate(() => setState({ page: 'home' }, { skipCloud: true }));
    await enter('community');
    assert.equal(await page.locator('#communityPostForm [name="content"]').inputValue(), '离开前最后一次修改');
    results.push('Navigation flushes the latest edit before debounce');

    // Renew the same account's token in the same task as an input event,
    // before the debounced save can run or the composer is reconstructed.
    await page.evaluate(() => {
      const field = document.querySelector('#communityPostForm [name="content"]');
      field.value = '会话更新前最后输入的一行'; field.dispatchEvent(new Event('input', { bubbles: true }));
      setState({ cloudToken: 'renewed-fixture-token' }, { skipCloud: true });
    });
    await page.locator('#communityPostForm').waitFor();
    assert.equal(await page.locator('#communityPostForm [name="content"]').inputValue(), '会话更新前最后输入的一行');
    await page.evaluate(() => TurtlePublishDrafts.settled());
    await reload(); await enter('community');
    assert.equal(await page.locator('#communityPostForm [name="content"]').inputValue(), '会话更新前最后输入的一行');
    results.push('Same-account token renewal flushes the latest input before debounce');

    await reload('draft-new-media-owner'); await enter('community'); await addPhoto('community');
    await page.evaluate(() => setState({ cloudToken: 'renewed-photo-token' }, { skipCloud: true }));
    await page.locator('#communityPostForm').waitFor(); await flush();
    await reload('draft-new-media-owner'); await enter('community');
    assert.equal((await photoInfo('community')).bytes, photo.length, 'Token renewal must retain media selected before its first debounced byte save');
    results.push('Fresh media survives token renewal before its first debounced save');

    await reload('draft-owner-b'); await enter('community');
    assert.equal(await page.locator('#communityPostForm [name="title"]').inputValue(), '');
    assert.equal(await page.evaluate(() => communityDraftMediaItems.length), 0);
    await reload(); await enter('community');
    assert.equal(await page.locator('#communityPostForm [name="title"]').inputValue(), '意外离开仍可继续编辑');
    results.push('Drafts stay isolated by signed-in owner');

    // The feed quick-picker must merge new selections into the saved editor,
    // including when no previous draft has been hydrated in this document.
    await reload();
    await page.evaluate(() => {
      const input = document.createElement('input'); input.type = 'file'; input.dataset.communityQuickMedia = ''; input.id = 'draftQuickPicker'; input.onchange = readCommunityMedia; document.body.append(input);
    });
    await page.locator('#draftQuickPicker').setInputFiles({ name: 'quick-picked.jpg', mimeType: 'image/jpeg', buffer: photo });
    await page.locator('#communityPostForm').waitFor(); await flush();
    assert.equal(await page.locator('#communityPostForm [name="title"]').inputValue(), '意外离开仍可继续编辑');
    assert.equal(await page.evaluate(() => communityDraftMediaItems.length), 2);
    await reload(); await enter('community');
    assert.equal(await page.evaluate(() => communityDraftMediaItems.length), 2);
    await page.evaluate(async () => {
      const upload = apiUploadMediaFile; apiUploadMediaFile = async () => { throw new Error('测试图片上传失败'); };
      if (window.TurtleDiscovery) TurtleDiscovery.canPublishDraft = () => true;
      try { await submitCommunityPost({ preventDefault() {}, currentTarget: document.querySelector('#communityPostForm') }); } finally { apiUploadMediaFile = upload; }
      await TurtlePublishDrafts.settled();
    });
    await reload(); await enter('community');
    assert.equal(await page.evaluate(() => communityDraftMediaItems.length), 2);
    assert.equal((await photoInfo('community')).bytes, photo.length);
    results.push('Quick-picked photos merge with the previous draft and survive upload failure');

    await page.evaluate(() => { removeCommunityDraftMedia(1); removeCommunityDraftMedia(0); }); await flush();
    await reload(); await enter('community');
    assert.equal(await page.evaluate(() => communityDraftMediaItems.length), 0);
    results.push('Removed media does not return after reload');

    rejectPublication = true;
    await page.evaluate(async () => { if (window.TurtleDiscovery) TurtleDiscovery.canPublishDraft = () => true; await submitCommunityPost({ preventDefault() {}, currentTarget: document.querySelector('#communityPostForm') }); });
    await page.evaluate(() => TurtlePublishDrafts.settled());
    await reload(); await enter('community');
    assert.equal(await page.locator('#communityPostForm [name="title"]').inputValue(), '意外离开仍可继续编辑');
    assert(await page.evaluate(() => Boolean(communityPublishSubmissionId)), 'Failed requests retain their idempotency key');
    results.push('Failed publication retains text and idempotency key');
    rejectPublication = false;
    await page.evaluate(async () => { if (window.TurtleDiscovery) TurtleDiscovery.canPublishDraft = () => true; await submitCommunityPost({ preventDefault() {}, currentTarget: document.querySelector('#communityPostForm') }); await TurtlePublishDrafts.settled(); });
    await reload(); await enter('community');
    assert.equal(await page.locator('#communityPostForm [name="title"]').inputValue(), '');
    results.push('Confirmed publication clears the matching draft');

    await reload('draft-growth-owner');
    await page.evaluate(() => { state.turtles = [
      { id: 'growth-one', code: '小果', speciesCode: 'GHG', speciesName: '果核蛋龟', weight: 65, carapaceLength: 6.89 },
      { id: 'growth-two', code: '小虎', speciesCode: 'HNG', speciesName: '虎泥蛋龟', weight: 88, carapaceLength: 7.2 }
    ]; });
    await enter('community');
    await page.locator('[data-community-compose-mode="growth"]').click();
    assert.equal(await page.locator('#communityPostForm [name="content"]').inputValue(), await page.evaluate(() => communityGrowthTemplate(state.turtles[0])));
    await page.locator('[data-community-turtle-source]').selectOption('growth-two', { force: true });
    assert.equal(await page.locator('#communityPostForm [name="content"]').inputValue(), await page.evaluate(() => communityGrowthTemplate(state.turtles[1])));
    assert.equal(await page.locator('#communityPostForm [name="title"]').inputValue(), '虎泥蛋龟的成长记录');
    await page.locator('#communityPostForm [name="content"]').fill('自行编辑的成长观察');
    await page.locator('#communityPostForm [name="title"]').fill('自行编辑的成长标题');
    await page.locator('[data-community-turtle-source]').selectOption('growth-one', { force: true });
    assert.equal(await page.locator('#communityPostForm [name="content"]').inputValue(), '自行编辑的成长观察');
    assert.equal(await page.locator('#communityPostForm [name="title"]').inputValue(), '自行编辑的成长标题');
    await page.locator('[data-community-compose-mode="daily"]').click();
    await page.locator('.community-editor-prompts summary').click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-discovery-prompt="habitat"]').click();
    assert.match(await page.locator('#communityPostForm [name="content"]').inputValue(), /龟池尺寸与水深/);
    await flush(); await reload('draft-growth-owner'); await enter('community');
    assert.match(await page.locator('#communityPostForm [name="content"]').inputValue(), /龟池尺寸与水深/);
    assert.equal(await page.locator('#communityPostForm [name="title"]').inputValue(), '自行编辑的成长标题');
    results.push('Growth templates, archive changes and discovery prompts update visible fields without overwriting custom text');

    await reload('draft-navigation-owner');
    const hadLoadingSnapshot = await page.evaluate(() => {
      setState({ page: 'communityAdd' }, { skipCloud: true });
      const loading = document.querySelector('#app').textContent.includes('正在读取本机草稿');
      setState({ page: 'about' }, { skipCloud: true });
      return loading;
    });
    assert(hadLoadingSnapshot, 'Navigation fixture must leave while the asynchronous draft read is pending');
    await page.evaluate(() => navigateBack());
    await page.locator('#communityPostForm').waitFor();
    await page.locator('#communityPostForm [name="title"]').fill('返回后继续编辑的草稿');
    await page.evaluate(() => setState({ page: 'about' }, { skipCloud: true }));
    await page.evaluate(() => navigateBack());
    await page.locator('#communityPostForm').waitFor();
    await page.locator('#communityPostForm [name="content"]').fill('从保留页面继续输入');
    await flush(); await reload('draft-navigation-owner'); await enter('community');
    assert.equal(await page.locator('#communityPostForm [name="title"]').inputValue(), '返回后继续编辑的草稿');
    assert.equal(await page.locator('#communityPostForm [name="content"]').inputValue(), '从保留页面继续输入');
    results.push('Back navigation recovers pending-read placeholders and reconnects retained editor saving');

    await reload();

    await page.evaluate(() => setState({ page: 'home' }, { skipCloud: true })); await enter('market');
    await page.locator('#marketListingForm [name="title"]').fill('新商品尚未发布');
    await page.locator('#marketListingForm [name="description"]').fill('健康活泼，照片和售价均保留');
    await page.locator('#marketListingForm [name="price"]').fill('1888');
    await page.evaluate(() => { document.querySelector('#marketListingForm [name="speciesCode"]').value = 'GHG'; });
    await addPhoto('market'); await flush();
    await reload(); await enter('market');
    assert.equal(await page.locator('#marketListingForm [name="title"]').inputValue(), '新商品尚未发布');
    assert.equal(await page.locator('#marketListingForm [name="price"]').inputValue(), '1888');
    assert.equal((await photoInfo('market')).bytes, photo.length);
    assert.match(await page.locator('[data-market-species-search]').inputValue(), /GHG/);
    await page.evaluate(() => setState({ page: 'home' }, { skipCloud: true })); await enter('market', 'existing-listing');
    assert.equal(await page.locator('#marketListingForm [name="title"]').inputValue(), '', 'A new-listing draft cannot replace an edited listing');
    await page.locator('#marketListingForm [name="title"]').fill('编辑商品独立草稿'); await flush();
    await reload(); await enter('market', 'existing-listing');
    assert.equal(await page.locator('#marketListingForm [name="title"]').inputValue(), '编辑商品独立草稿');
    await page.evaluate(() => setState({ page: 'home', marketDraftMedia: [] }, { skipCloud: true })); await enter('market');
    assert.equal(await page.locator('#marketListingForm [name="title"]').inputValue(), '新商品尚未发布');
    results.push('Market text/price/species/photo survive reload and new/edit contexts remain separate');

    page.once('dialog', dialog => dialog.accept()); await page.locator('[data-clear-publishing-draft]').click();
    await page.waitForFunction(() => document.querySelector('[data-publishing-draft-status]')?.textContent === '草稿已清除');
    await reload(); await enter('market');
    assert.equal(await page.locator('#marketListingForm [name="title"]').inputValue(), '');
    assert.equal(await page.evaluate(() => state.marketDraftMedia.length), 0);
    results.push('Explicit discard removes stored text and media');

    const videoBytes = [0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109, 7, 8, 9];
    const posterBytes = [...photo];
    await page.evaluate(({ videoBytes, posterBytes }) => {
      const file = new File([new Uint8Array(videoBytes)], 'retained-video.mp4', { type: 'video/mp4', lastModified: 1730000000000 });
      const posterFile = new Blob([new Uint8Array(posterBytes)], { type: 'image/jpeg' });
      state.marketDraftMedia = [{ type: 'video', duration: 3.25, file, dataUrl: URL.createObjectURL(file), posterFile, posterUrl: URL.createObjectURL(posterFile) }];
      renderMarketMediaDraft();
    }, { videoBytes, posterBytes });
    await flush(); await reload(); await enter('market');
    const video = await page.evaluate(async () => {
      const item = state.marketDraftMedia[0];
      return { type: item.type, duration: item.duration, name: item.file.name, mime: item.file.type, modified: item.file.lastModified,
        bytes: [...new Uint8Array(await item.file.arrayBuffer())], posterType: item.posterFile.type, posterBytes: [...new Uint8Array(await item.posterFile.arrayBuffer())] };
    });
    assert.deepEqual(video, { type: 'video', duration: 3.25, name: 'retained-video.mp4', mime: 'video/mp4', modified: 1730000000000,
      bytes: videoBytes, posterType: 'image/jpeg', posterBytes });
    results.push('Market video and poster retain original bytes, MIME, filename, modification time and duration');
    page.once('dialog', dialog => dialog.accept()); await page.locator('[data-clear-publishing-draft]').click();
    await page.waitForFunction(() => document.querySelector('[data-publishing-draft-status]')?.textContent === '草稿已清除');

    // A quota failure must never claim that photos were saved successfully.
    await page.evaluate(() => { window.originalDraftPut = IDBObjectStore.prototype.put; const put = originalDraftPut; IDBObjectStore.prototype.put = function (value, ...args) { if (value?.kind) throw new DOMException('Full', 'QuotaExceededError'); return put.call(this, value, ...args); }; });
    await page.locator('#marketListingForm [name="title"]').fill('磁盘满仍保留文字'); await addPhoto('market'); await flush();
    assert.match(await page.locator('[data-publishing-draft-status]').innerText(), /图片未能保存/);
    assert(await page.locator('[data-retry-publishing-draft]').isVisible());
    await page.evaluate(() => { IDBObjectStore.prototype.put = originalDraftPut; });
    await page.locator('[data-retry-publishing-draft]').click();
    await page.evaluate(() => TurtlePublishDrafts.settled());
    assert.match(await page.locator('[data-publishing-draft-status]').innerText(), /草稿已保存/);
    assert.equal(await page.locator('[data-retry-publishing-draft]').isVisible(), false);
    await reload(); await enter('market');
    assert.equal((await photoInfo('market')).bytes, photo.length, 'Retry saves the unchanged photo draft without making the user edit or reselect it');
    results.push('Retry after storage recovery saves unchanged text and original photo bytes');
    await page.evaluate(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (value, ...args) { if (value?.kind) throw new DOMException('Full', 'QuotaExceededError'); return put.call(this, value, ...args); }; });
    await page.locator('#marketListingForm [name="title"]').fill('磁盘满仍保留文字');
    await addPhoto('market'); await flush();
    await reload(); await enter('market');
    assert.equal(await page.locator('#marketListingForm [name="title"]').inputValue(), '磁盘满仍保留文字');
    assert.match(await page.locator('[data-publishing-draft-status]').innerText(), /重新选择未保存的图片/);
    const stored = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('turtlekeeper-publishing-drafts-v1:')).map(([, value]) => value).join(''));
    assert(!stored.includes('fixture-token'), 'Draft metadata must never contain authentication credentials');
    results.push('Quota failure reports unsaved photos honestly while recovering text; no tokens stored');
    assert.deepEqual(errors, []);
    recordResult(root, `publishing-drafts-${platform}${local ? '-local' : ''}.json`, { results, errors });
    console.log(`PASS publishing drafts ${platform}${local ? '/file:' : ''}: ` + results.join('; ') + '.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
