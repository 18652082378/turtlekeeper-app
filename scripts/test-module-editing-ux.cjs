'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { launchBrowser, recordResult } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..'), fixture = require('./ui-audit-fixture.cjs')();
const platform = process.env.MOBILE_UI_PLATFORM || 'web', local = process.argv.includes('--local-preview');
const assetRoot = platform === 'ios' ? path.join(root, 'ios/App/App/public') : platform === 'android' ? path.join(root, 'android/app/src/main/assets/public') : root;
const localIndex = 'C:/Users/Administrator/Documents/Codex/2026-06-02/apple-store/outputs/turtlekeeper-app/index.html';
(async () => {
  const browser = await launchBrowser(), results = [];
  async function check(name, run) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/config.js')) return route.fulfill({ body: 'window.TURTLE_API_BASE_URL="https://editing.test";', contentType: 'text/javascript' });
      if (local && url.protocol === 'file:') return route.continue();
      if (url.hostname !== 'editing.test') return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, posts: [], listings: [], items: [], minimumBuild: 0 } });
      const file = path.resolve(assetRoot, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(assetRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' })[path.extname(file)] || 'application/octet-stream' });
    });
    try {
      await page.goto(local ? pathToFileURL(localIndex).href : 'https://editing.test/');
      await page.evaluate(fixture => {
        dismissTradeIntro?.(); TurtleReleaseNotes?.cancel();
        state = { ...initialState, ...emptyAccountData(), ...fixture, loggedInPhone: 'editing-owner', cloudToken: 'editing-token', policyConsentRequired: false, page: 'home' };
        forceUpdateState = { required: false }; hasCloudSession = () => false; requireLogin = canUsePublicFeedback = canUsePublicReviews = () => true;
        refreshPublicFeedback = refreshPublicReviews = refreshOperationsOverview = () => {};
        window.feedbackItem = id => ({ id, type: '功能建议', content: '本地反馈内容 ' + id, authorName: '合成账号', createdAt: '2026-11-04T00:00:00Z', comments: [] });
        window.editingCalls = []; window.editingRequests = [];
        apiPost = (route, body) => {
          if (!['/api/feedback/comment', '/api/feedback/create', '/api/reviews/create', '/api/admin/feedback/action'].includes(route)) return Promise.resolve({ ok: true, items: [], friends: [] });
          editingCalls.push({ route, body }); return new Promise((resolve, reject) => editingRequests.push({ resolve, reject }));
        };
        window.commentEvent = () => ({ preventDefault() {}, currentTarget: document.querySelector('#feedbackCommentForm') });
        render();
      }, fixture);
      await run(page); assert.deepEqual(errors, []); results.push(name); console.log('PASS ' + name);
    } finally { await page.close(); }
  }
  const openFeedback = page => page.evaluate(() => setState({ page: 'feedbackDetail', selectedFeedbackId: 'a', publicFeedbackItems: [feedbackItem('a'), feedbackItem('b')] }, { skipSave: true }));
  const startComment = page => page.evaluate(() => { window.editingSubmission = submitFeedbackComment(commentEvent()); });
  const finishComment = page => page.evaluate(async () => { editingRequests[0].resolve({ ok: true, feedbacks: [feedbackItem('a'), feedbackItem('b')] }); await editingSubmission; });
  try {
    await check('Confirmed feedback comment clears only submitted text and the pending lock survives rerenders', async page => {
      await openFeedback(page); await page.locator('#feedbackCommentForm [name="content"]').fill('已提交的一条评论'); await startComment(page);
      await page.evaluate(async () => { setState({}, { forceRender: true, preserveInputValues: true, skipSave: true }); await submitFeedbackComment(commentEvent()); });
      assert.equal(await page.evaluate(() => editingCalls.length), 1);
      await finishComment(page);
      assert.equal(await page.locator('#feedbackCommentForm [name="content"]').inputValue(), '');
    });
    await check('Later writing and backward caret selection survive a comment response', async page => {
      await openFeedback(page); await page.locator('#feedbackCommentForm [name="content"]').fill('先提交的评论'); await startComment(page);
      await page.locator('#feedbackCommentForm [name="content"]').fill('继续填写的新评论');
      await page.locator('#feedbackCommentForm [name="content"]').evaluate(field => { field.focus(); field.setSelectionRange(1, 4, 'backward'); });
      await finishComment(page);
      assert.equal(await page.locator('#feedbackCommentForm [name="content"]').inputValue(), '继续填写的新评论');
      assert.deepEqual(await page.locator('#feedbackCommentForm [name="content"]').evaluate(field => [field.selectionStart, field.selectionEnd, field.selectionDirection]), [1, 4, 'backward']);
    });
    await check('Switching feedback targets cannot copy or clear the other target draft', async page => {
      await openFeedback(page); await page.locator('#feedbackCommentForm [name="content"]').fill('给甲反馈的评论'); await startComment(page);
      await page.evaluate(() => setState({ selectedFeedbackId: 'b' }, { skipSave: true, preserveInputValues: true }));
      assert.equal(await page.locator('#feedbackCommentForm [name="content"]').inputValue(), '');
      await page.locator('#feedbackCommentForm [name="content"]').fill('给乙反馈的新草稿'); await finishComment(page);
      assert.equal(await page.locator('#feedbackCommentForm [name="content"]').inputValue(), '给乙反馈的新草稿');
      assert.equal(await page.evaluate(() => state.selectedFeedbackId), 'b');
    });
    await check('Feedback publication cannot navigate away from another editor', async page => {
      await page.evaluate(() => setState({ page: 'feedbackAdd' }, { skipSave: true }));
      await page.locator('#feedbackForm [name="content"]').fill('准备发布的建议');
      await page.evaluate(() => { window.editingSubmission = submitPublicFeedback({ preventDefault() {}, currentTarget: document.querySelector('#feedbackForm') }); setState({ page: 'poolAdd' }, { skipSave: true }); window.poolNode = document.querySelector('#turtlePoolForm'); });
      await page.locator('#turtlePoolForm [name="name"]').fill('正在编辑的龟池');
      await page.evaluate(async () => { editingRequests[0].resolve({ ok: true, feedbacks: [feedbackItem('published')] }); await editingSubmission; });
      assert.equal(await page.evaluate(() => state.page), 'poolAdd');
      assert.equal(await page.evaluate(() => poolNode === document.querySelector('#turtlePoolForm')), true);
      assert.equal(await page.locator('#turtlePoolForm [name="name"]').inputValue(), '正在编辑的龟池');
    });
    await check('Failed feedback submission retains writing and permits a retry; a newer draft keeps the editor open', async page => {
      await page.evaluate(() => setState({ page: 'feedbackAdd' }, { skipSave: true }));
      await page.locator('#feedbackForm [name="content"]').fill('遇到网络错误后还在的文字');
      await page.evaluate(() => { window.editingSubmission = submitPublicFeedback({ preventDefault() {}, currentTarget: document.querySelector('#feedbackForm') }); });
      await page.evaluate(async () => { editingRequests[0].reject(Error('synthetic offline')); await editingSubmission; });
      assert.equal(await page.locator('#feedbackForm [name="content"]').inputValue(), '遇到网络错误后还在的文字');
      await page.evaluate(() => { window.editingSubmission = submitPublicFeedback({ preventDefault() {}, currentTarget: document.querySelector('#feedbackForm') }); });
      await page.locator('#feedbackForm [name="content"]').fill('等待期间写下的另一条建议');
      await page.evaluate(async () => { editingRequests[1].resolve({ ok: true, feedbacks: [feedbackItem('published')] }); await editingSubmission; });
      assert.equal(await page.evaluate(() => state.page), 'feedbackAdd');
      assert.equal(await page.locator('#feedbackForm [name="content"]').inputValue(), '等待期间写下的另一条建议');
    });
    await check('Review submission preserves later text and rating and rejects a duplicate submit', async page => {
      await page.evaluate(() => setState({ page: 'satisfaction' }, { skipSave: true }));
      await page.locator('#satisfactionForm [name="comment"]').fill('先提交的评价');
      await page.evaluate(() => { window.editingSubmission = submitPublicSatisfaction({ preventDefault() {}, currentTarget: document.querySelector('#satisfactionForm') }); });
      await page.locator('#satisfactionForm [name="comment"]').fill('等待期间补写的新评价');
      await page.locator('[data-rating="3"]').click();
      assert.equal(await page.locator('#satisfactionForm [name="comment"]').inputValue(), '等待期间补写的新评价', 'Changing the score cannot erase the text');
      assert.equal(await page.locator('#satisfactionForm [name="rating"]').inputValue(), '3');
      await page.evaluate(async () => { await submitPublicSatisfaction({ preventDefault() {}, currentTarget: document.querySelector('#satisfactionForm') }); editingRequests[0].resolve({ ok: true, reviews: [] }); await editingSubmission; });
      assert.equal(await page.evaluate(() => editingCalls.length), 1);
      assert.equal(await page.locator('#satisfactionForm [name="comment"]').inputValue(), '等待期间补写的新评价');
      assert.equal(await page.locator('#satisfactionForm [name="rating"]').inputValue(), '3');
      assert.equal(await page.locator('[data-rating].active').count(), 3);
    });
    await check('Admin reply inputs follow feedback identities after a server reorder', async page => {
      await page.evaluate(() => setState({ page: 'operations', isCommunityAdmin: true, operationsTab: 'feedback', operationsOverview: { feedback: { pendingCount: 2, items: [{ id: 'a', content: '甲', reply: '' }, { id: 'b', content: '乙', reply: '' }] } } }, { skipSave: true }));
      await page.locator('[data-admin-feedback-form="a"] [name="reply"]').fill('给甲的回复');
      await page.locator('[data-admin-feedback-form="b"] [name="reply"]').fill('还没提交的乙回复');
      await page.evaluate(() => { window.editingSubmission = submitAdminFeedbackAction({ preventDefault() {}, currentTarget: document.querySelector('[data-admin-feedback-form="a"]') }); });
      await page.evaluate(async () => { editingRequests[0].resolve({ ok: true, feedback: { pendingCount: 1, items: [{ id: 'b', content: '乙', reply: '' }, { id: 'a', content: '甲', reply: '给甲的回复' }] } }); await editingSubmission; });
      assert.equal(await page.locator('[data-admin-feedback-form="b"] [name="reply"]').inputValue(), '还没提交的乙回复');
      assert.equal(await page.locator('[data-admin-feedback-form="a"] [name="reply"]').inputValue(), '给甲的回复');
    });
    await check('Restoring controls respects entity changes, radio identity and removed select options', async page => {
      const result = await page.evaluate(() => {
        $app.innerHTML = '<form id="entity" data-entity-id="old"><input name="note" value="old note"></form><form id="options"><input type="radio" name="method" value="a" checked><input type="radio" name="method" value="b"><select name="pool"><option value="removed" selected>旧龟池</option><option value="valid">其他</option></select></form>';
        const snapshot = captureVisibleFormInputs();
        $app.innerHTML = '<form id="entity" data-entity-id="new"><input name="note" value="new record"></form><form id="options"><input type="radio" name="method" value="b" checked><input type="radio" name="method" value="a"><select name="pool"><option value="valid">仍可选择的龟池</option></select></form>';
        restoreVisibleFormInputs(snapshot);
        return { note: document.querySelector('#entity input').value, radios: [...document.querySelectorAll('#options input')].map(field => [field.value, field.checked]), pool: document.querySelector('#options select').value };
      });
      assert.deepEqual(result, { note: 'new record', radios: [['b', false], ['a', true]], pool: 'valid' });
    });
    await check('A warmed return preview follows later updates to the retained message list', async page => {
      const result = await page.evaluate(() => {
        state.selectedCommunityFriendId = '';
        state.communityFriends = [{ id: 'friend', name: '合成龟友', lastMessage: '旧消息预览', unreadCount: 1, isAdmin: true }];
        const t = document.createElement('template');
        t.innerHTML = pageMessages();
        const snapshot = { page: 'messages', html: t.innerHTML, previewHtml: buildEdgeBackPreviewHtml(t.innerHTML), liveDom: t.content, scrollY: 0 };
        edgeBackSnapshots = [snapshot];
        const old = createEdgeBackPreview(snapshot);
        patchStoredMessageLists([{ id: 'friend', name: '合成龟友', lastMessage: '最新消息预览', unreadCount: 0, isAdmin: true }]);
        const updated = createEdgeBackPreview(snapshot);
        return {
          before: old.textContent.includes('旧消息预览'),
          latest: updated.textContent.includes('最新消息预览'),
          stale: updated.textContent.includes('旧消息预览'),
          retained: snapshot.liveDom.textContent.includes('最新消息预览'),
          adminBadge: updated.querySelector('.platform-admin-badge')?.textContent
        };
      });
      assert.deepEqual(result, { before: true, latest: true, stale: false, retained: true, adminBadge: '官方管理员' });
    });
    recordResult(root, `module-editing-${platform}${local ? '-local' : ''}.json`, { results });
    console.log(`PASS ${platform}: ${results.length} module editing continuity and late-response workflows.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
