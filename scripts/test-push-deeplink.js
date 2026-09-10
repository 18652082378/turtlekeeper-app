const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
function fixture() {
  const ctx = {
    window: { dismissTradeIntro() {} },
    state: { loggedInPhone: 'user', page: 'home', communityPosts: [] },
    pendingNativePushAction: null, cloudHydrationComplete: true,
    communityReplyTarget: null, token: 'token', notices: [], chats: [],
    currentCloudToken() { return ctx.token; },
    setState(patch) { Object.assign(ctx.state, patch); },
    refreshMessageUnread: async () => {}, refreshCommunity: async () => {},
    normalizeCommunityPosts: posts => posts,
    communityAuthPayload: payload => payload,
    apiPost: async () => ({ targetPost: { id: 'old-post' } }),
    openCommunityChat: id => ctx.chats.push(id), toast: text => ctx.notices.push(text),
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function nativePushData('), source.indexOf('async function unregisterNativePushNotifications(')), ctx);
  return ctx;
}
const settle = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  let c = fixture();
  c.queueNativePushAction({ data: JSON.stringify({ route: 'messages', postId: 'old-post' }) });
  await settle();
  assert.equal(c.state.page, 'communityPostDetail');
  assert.equal(c.state.selectedCommunityPostId, 'old-post');
  c = fixture();
  c.queueNativePushAction({ data: { route: 'communityDaily', postId: 'old-post' } });
  await settle();
  assert.equal(c.state.page, 'communityPostDetail');
  assert.equal(c.state.selectedCommunityPostId, 'old-post');
  c = fixture(); c.apiPost = async () => ({ targetPost: null });
  c.queueNativePushAction({ data: { route: 'communityDaily', postId: 'old-post' } });
  await settle();
  assert.equal(c.state.page, 'community');
  assert.equal(c.notices.length, 1);
  c = fixture();
  c.queueNativePushAction({ data: { route: 'messages', postId: '' } });
  assert.equal(c.state.page, 'messages');
  assert.equal(c.pendingNativePushAction, null);
  c.queueNativePushAction({ data: { senderId: 'friend' } });
  assert.deepEqual(c.chats, ['friend']);
  c.queueNativePushAction({ data: { route: 'memos' } });
  assert.equal(c.state.page, 'memos');
  c = fixture();
  c.cloudHydrationComplete = false;
  c.queueNativePushAction({ data: { postId: 'old-post' } });
  assert.equal(c.state.page, 'messages');
  assert.ok(c.pendingNativePushAction);
  c.cloudHydrationComplete = true;
  c.consumePendingNativePushAction();
  await settle();
  assert.equal(c.state.page, 'communityPostDetail');
  for (const apiPost of [async () => ({ targetPost: null }), async () => { throw Error('offline'); }]) {
    c = fixture(); c.apiPost = apiPost;
    c.queueNativePushAction({ data: { postId: 'old-post' } });
    await settle();
    assert.equal(c.state.page, 'messages');
    assert.equal(c.notices.length, 1);
  }
  c = fixture();
  let finish;
  c.apiPost = () => new Promise(resolve => { finish = resolve; });
  c.queueNativePushAction({ data: { postId: 'old-post' } });
  await settle();
  c.queueNativePushAction({ data: { route: 'memos' } });
  finish({ targetPost: { id: 'old-post' } });
  await settle();
  assert.equal(c.state.page, 'memos');
  console.log('Push deep-link regression checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
