const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const friend = { id: 'cached-friend', name: '缓存会话', lastMessage: '上次的聊天内容', lastMessageAt: '2026-09-14T10:00:00Z', unreadCount: 2 };
const user = { phone: '13900000008', token: 'cache-test-token', accountName: '缓存测试', termsVersion: '2026-09-01', dataRevision: 'revision-1', updatedAt: '2026-09-17T00:00:00Z', data: { turtles: [], ledgerRecords: [], memos: [], breedingRecords: [] } };
async function main() {
 const browser = await chromium.launch({ headless: true, channel: 'msedge' });
 try {
  async function open(cached, initialized = false) {
   const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
   const errors = [], gates = []; let hold = true, fail = false, rows = [friend];
   page.on('pageerror', e => errors.push(e.message));
   await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'message.test') return route.abort();
    if (url.pathname.startsWith('/api/')) {
     if (url.pathname === '/api/account/load') return route.fulfill({ json: { ok: true, user } });
     if (['/api/community/list','/api/community/unread','/api/community/chat/list','/api/reviews/list'].includes(url.pathname)) {
      // Capture each response at request time to exercise replies for the old account.
      const result = { ok: true, friends: rows, posts: [], reviews: [], notifications: [], unreadCount: rows.length ? 2 : 0, totalUnreadCount: rows.length ? 2 : 0, nextOffset: 0, hasMore: false, friend: rows[0], messages: [] };
      if (hold) await new Promise(resolve => gates.push(resolve));
      return route.fulfill(fail ? { status: 503, json: { ok: false, message: '模拟离线' } } : { json: result });
     }
     return route.fulfill({ json: { ok: true, minimumBuild: 95, latestBuild: 99, posts: [], listings: [], notifications: [], items: [] } });
    }
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://message.test"; window.TURTLE_APP_BUILD=110;' });
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
    return route.fulfill({ body: fs.readFileSync(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
   });
   await page.addInitScript(({user, friend, cached, initialized}) => {
    if (localStorage.getItem('turtlekeeper-state-v1')) return;
    localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ ...user.data, loggedInPhone: user.phone, cloudToken: user.token, accountName: user.accountName,
     communityFriends: cached ? [friend] : [], communityFriendsInitialized: initialized,
     registeredUsers: [{ ...user, cloudToken: user.token }] }));
   }, { user, friend, cached, initialized });
   await page.goto('https://message.test/', { waitUntil: 'load' });
   await page.waitForFunction(() => cloudHydrationComplete);
   await page.evaluate(() => { window.dismissTradeIntro?.(); setState({ page: 'messages' }, { skipCloud: true }); });
   return { page, errors, gates,
    release: () => { hold = false; gates.splice(0).forEach(resolve => resolve()); },
    hold: () => { hold = true; }, fail: value => { fail = value; }, rows: value => { rows = value; },
    close: async () => { hold = false; gates.splice(0).forEach(resolve => resolve()); await page.close(); } };
  }
  const cached = await open(true);
  assert.equal(await cached.page.locator('.message-friend-row').count(), 1, 'cached list survives account hydration before network completes');
  await cached.page.locator('.message-friend-row').waitFor({ state: 'visible' });
  assert.equal(await cached.page.locator('.message-empty').count(), 0);
  assert.equal(await cached.page.evaluate(() => state.communityFriendsInitialized), true, 'old caches without a flag migrate');
  fs.mkdirSync(path.join(root, 'output/message-cache-qa'), { recursive: true });
  await cached.page.screenshot({ path: path.join(root,'output/message-cache-qa/cached-before-network.png') });
  cached.fail(true); cached.release();
  await cached.page.waitForFunction(() => !communityLoading && !messageUnreadLoading);
  assert.equal(await cached.page.locator('.message-friend-row').count(), 1, 'offline refresh preserves cached list');
  cached.hold();
  await cached.page.reload({ waitUntil: 'load' });
  await cached.page.waitForFunction(() => cloudHydrationComplete);
  await cached.page.evaluate(() => setState({ page: 'messages' }, { skipCloud: true }));
  assert.equal(await cached.page.locator('.message-friend-row').count(), 1, 'cache survives a full app reload');
  cached.fail(false);
  await cached.page.evaluate(user => applyCloudUser({ ...user, phone: '13900000009', token: 'other-token' }, '', { page: 'messages', skipMigration: true, skipCloud: true }), user);
  assert.equal(await cached.page.locator('.message-friend-row').count(), 0, 'switch account clears cached conversations');
  cached.release();
  await cached.page.waitForFunction(() => !communityLoading && !messageUnreadLoading);
  assert.equal(await cached.page.evaluate(() => state.communityFriends.length), 0, 'old-account delayed results cannot restore its list');
  assert.deepEqual(cached.errors, []); await cached.close();

  const fresh = await open(false);
  assert.match(await fresh.page.locator('.message-empty').innerText(), /正在加载消息/);
  assert.doesNotMatch(await fresh.page.locator('.message-empty').innerText(), /暂无消息/);
  fresh.fail(true); fresh.release();
  await fresh.page.waitForFunction(() => !communityLoading && !messageUnreadLoading);
  assert.match(await fresh.page.locator('.message-empty').innerText(), /消息加载失败/);
  fresh.fail(false); fresh.rows([]);
  await fresh.page.evaluate(() => refreshMessageUnread(true));
  assert.match(await fresh.page.locator('.message-empty').innerText(), /暂无消息/, 'only successful empty response confirms empty state');
  assert.equal(await fresh.page.evaluate(() => state.communityFriendsInitialized), true);
  fresh.hold();
  await fresh.page.reload({ waitUntil: 'load' });
  await fresh.page.waitForFunction(() => cloudHydrationComplete);
  await fresh.page.evaluate(() => setState({ page: 'messages' }, { skipCloud: true }));
  assert.match(await fresh.page.locator('.message-empty').innerText(), /暂无消息/, 'confirmed-empty cache survives reload');
  fresh.rows([friend]);fresh.release();
  await fresh.page.waitForFunction(() => !messageUnreadLoading && !communityLoading);
  await fresh.page.evaluate(() => refreshMessageUnread(true));
  assert.equal(await fresh.page.locator('.message-friend-row').count(), 1, 'background refresh replaces confirmed-empty cache');
  // A normal account refresh also preserves the currently open chat and unread state.
  assert.ok(await fresh.page.evaluate(user => {
   const before=JSON.stringify(state.communityFriends);state.communityChatMessages=[{id:'cached-message',content:'保留聊天'}];
   state.communityPosts=[{id:'cached-post'}];state.marketListings=[{id:'cached-listing'}];
   state.marketFeedInitialized=true;state.marketFeedNextOffset=16;state.marketFeedOrderIds=['cached-listing'];
   state.communityFeedInitialized=true;state.communityFeedNextOffset=20;
   state.selectedCommunityFriendId='cached-friend';applyCloudUser(user,'',{page:'messages',skipCloud:true,skipMigration:true});
   return JSON.stringify(state.communityFriends)===before && state.communityChatMessages[0].id==='cached-message'
    && state.communityPosts[0].id==='cached-post' && state.marketListings[0].id==='cached-listing'
    && state.marketFeedNextOffset===16 && state.communityFeedNextOffset===20;
  }, user));
  fresh.hold();
  await fresh.page.evaluate(() => setState({ page: 'satisfaction' }, { skipCloud: true }));
  await fresh.page.locator('#satisfactionForm textarea').fill('还没提交的评价，不要清空');
  fresh.release();
  await fresh.page.waitForFunction(() => !publicReviewsLoading);
  assert.equal(await fresh.page.locator('#satisfactionForm textarea').inputValue(), '还没提交的评价，不要清空', 'list response preserves typed form text');
  fresh.rows([{ ...friend, lastMessage: '后台有新消息' }]);
  await fresh.page.evaluate(() => refreshMessageUnread(true));
  assert.equal(await fresh.page.locator('#satisfactionForm textarea').inputValue(), '还没提交的评价，不要清空', 'unread polling does not reset unrelated forms');
  assert.deepEqual(fresh.errors, []); await fresh.close();
  console.log('PASS: cached first frame, same-account hydration, reload, failed refresh, first-load loading/error/empty, successful retry, account isolation and delayed replies.');
 } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
