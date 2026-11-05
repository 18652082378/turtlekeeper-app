'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), source = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
const extract = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert(from >= 0 && to > from, start);
  return source.slice(from, to);
};
const tick = () => new Promise(resolve => setImmediate(resolve));
function response() {
  return { writableEnded: false, destroyed: false, writeHead(status) { this.status = status; }, end(payload) { this.body = JSON.parse(payload); this.writableEnded = true; } };
}
async function marketCase() {
  const pendingMedia = new Map(), ready = new Map(); let writes = 0, flushes = 0, releaseCommit;
  const rows = Array.from({ length: 32 }, (_, index) => ({ id: 'market-' + index, title: '商品' + index, status: 'active',
    sellerPhoneRaw: 'seller', photoUrl: `/uploads/2026/11/image-${index}.jpg`, mediaItems: [{ type: 'image', url: `/uploads/2026/11/image-${index}.jpg` }] }));
  const db = { users: {}, marketListings: rows };
  const user = { phone: 'viewer', data: { ledgerRecords: [], marketHistoryIds: [], marketFavoriteIds: [] } };
  const ctx = { console, Promise, Set, Map, Date, Number, String, JSON,
    readJson: async req => req.body, readDatabase: () => db, optionalReviewUser: () => user,
    autoOfflineStaleMarketListings: () => false, autoOfflineRestrictedMarketListings: () => false,
    normalizeAccountData: value => value, syncMarketListingToLedger() { throw Error('Unexpected sold mutation'); },
    writeDatabase: () => { writes++; }, marketInquiry: { parse: () => null }, trimPublicText: (value, limit) => String(value || '').slice(0, limit),
    publicMarketListings: () => structuredClone(rows), ownMarketListings: () => [], marketListingView: (_db, value) => structuredClone(value),
    MYSQL_ENABLED: true, mysqlRecordStore: { flush() { flushes++; return new Promise(resolve => { releaseCommit = resolve; }); } },
    cacheBustMediaUrls: value => value, marketRankPage: () => { throw Error('Ranking is exercised separately'); },
    setTimeout() { throw Error('Market JSON must not schedule a cold-thumbnail wait'); }, clearTimeout() {},
    mediaVariants: { get: value => ready.get(value), ensure: value => {
      if (!pendingMedia.has(value)) pendingMedia.set(value, new Promise(() => {}));
      return pendingMedia.get(value);
    } }
  };
  vm.createContext(ctx);
  vm.runInContext(extract('function sendJson(', 'function readJson(')
    + extract('async function handleMarketList(', 'async function handleMarketPublicDetail('), ctx);
  async function request(body) {
    const res = response(), pending = ctx.handleMarketList({ body }, res);
    await tick();
    assert.equal(res.writableEnded, false, 'Market still waits for the database durability barrier');
    assert.equal(typeof releaseCommit, 'function');
    releaseCommit(); await pending;
    assert.equal(res.status, 200, 'Feed JSON is returned even while thumbnail promises remain unresolved');
    return res.body;
  }
  const cold = await request({ thumbnails: true, mediaVariantsVersion: 1, limit: 8 });
  assert.equal(cold.listings.length, 8); assert.equal(pendingMedia.size, 8, 'Only the returned page queues media');
  assert.equal(cold.listings[0].mediaItems[0].url, rows[0].mediaItems[0].url);
  assert.equal(cold.listings[0].mediaItems[0].thumbnailUrl, undefined, 'A cold image retains the original as immediate fallback');
  ready.set(rows[0].mediaItems[0].url, { thumbnailUrl: '/uploads/2026/11/cached-thumb.jpg', displayUrl: '/uploads/2026/11/cached-detail.jpg' });
  const warm = await request({ thumbnails: true, mediaVariantsVersion: 1, limit: 8 });
  assert.equal(warm.listings[0].mediaItems[0].thumbnailUrl, '/uploads/2026/11/cached-thumb.jpg');
  assert.equal(warm.listings[0].mediaItems[0].url, rows[0].mediaItems[0].url);
  const legacy = await request({ thumbnails: true, limit: 8 });
  assert.equal(legacy.listings[0].mediaItems[0].thumbnailUrl, '/uploads/2026/11/cached-thumb.jpg');
  assert.equal(legacy.listings[0].mediaItems[0].displayUrl, undefined, 'Legacy thumbnail opt-in does not acquire the newer detail contract');
  const plain = await request({ limit: 8 });
  assert.equal(plain.listings[0].mediaItems[0].thumbnailUrl, undefined, 'No media opt-in preserves the legacy wire format');
  ctx.autoOfflineStaleMarketListings = () => true;
  await request({ thumbnails: true, mediaVariantsVersion: 1, limit: 8 });
  assert.equal(writes, 1, 'Existing availability mutations still use the database write path');
  assert.equal(flushes, 5);
  assert.equal(rows[0].mediaItems[0].thumbnailUrl, undefined, 'Delivery metadata never rewrites originals');
}
async function communityCase() {
  const touched = new Set(), queued = new Set(), ready = new Map(); let friends = 0, profiles = 0;
  const posts = Array.from({ length: 1200 }, (_, index) => {
    const post = { id: 'post-' + index, title: '帖子' + index, authorPhoneRaw: 'author', createdAt: new Date(Date.UTC(2026, 10, 1) - index * 1000).toISOString(),
      visibility: 'public', mediaItems: Array.from({ length: 9 }, (_, media) => ({ type: 'image', url: `/uploads/2026/11/p-${index}-${media}.jpg` })) };
    Object.defineProperty(post, 'comments', { enumerable: true, get() { touched.add(post.id); return [{ id: 'comment-' + index, content: '公开评论', authorPhoneRaw: 'author' }, { id: 'blocked-' + index, content: '不应公开', authorPhoneRaw: 'blocked' }]; } });
    return post;
  });
  posts[1199].isPinned = true;
  const user = { phone: 'viewer', blocked: ['blocked'], communityCircleIds: ['general'] };
  const db = { users: { author: { phone: 'author', accountName: '龟友' } }, communityPosts: posts,
    follows: [{ followerPhone: 'viewer', targetPhone: 'author' }], friendships: [] };
  const ctx = { Date, Number, String, Boolean, Array, Object, Set, Map, console,
    readJson: async req => req.body, readDatabase: () => db, optionalReviewUser: () => user,
    sendJson: (res, status, body) => { res.status = status; res.body = body; },
    blockedPhoneSet: viewer => new Set(viewer?.blocked || []),
    isFollowingCommunityUser: (database, follower, author) => database.follows.some(link => link.followerPhone === follower && link.targetPhone === author),
    communityUserId: value => 'id-' + value, maskPhone: value => 'masked-' + value,
    isAdminUser: viewer => Boolean(viewer?.admin), isCommunityFriend: () => false,
    trimPublicText: (value, max) => String(value || '').slice(0, max),
    communityFriends: () => { friends++; return [{ id: 'friend' }]; },
    communityConversationState: () => ({ hiddenIds: [] }),
    mediaVariants: { get: value => ready.get(value), ensure: value => { queued.add(value); return new Promise(() => {}); } }
  };
  vm.createContext(ctx);
  vm.runInContext(extract('function normalizedCommunityVisibility(', 'function followedCommunityUsers(')
    + extract('function communityMediaItemsFromPost(', 'function communityProfileStats(')
    + extract('function communityProfileStats(', 'function communitySearchScore('), ctx);
  const originalStats = ctx.communityProfileStats;
  ctx.communityProfileStats = (...args) => { profiles++; return originalStats(...args); };
  async function request(body) {
    touched.clear(); const res = {};
    await ctx.handleCommunityList({ body }, res); assert.equal(res.status, 200); return res.body;
  }
  ready.set('/uploads/2026/11/p-0-0.jpg', { thumbnailUrl: '/uploads/2026/11/community-thumb.jpg' });
  const light = await request({ feedOnly: true, sort: 'latest', limit: 10, mediaVariantsVersion: 1 });
  assert.equal(light.posts.length, 10); assert.equal(light.total, 1200); assert.equal(light.nextOffset, 10); assert.equal(light.hasMore, true);
  assert.deepEqual(Array.from(touched), Array.from({ length: 10 }, (_, index) => 'post-' + index), 'Only the visible page hydrates comment trees');
  assert.equal(queued.size, 29, 'At most three image derivatives per returned post are queued; one is already cached');
  assert.equal(light.posts[0].mediaItems[0].thumbnailUrl, '/uploads/2026/11/community-thumb.jpg');
  assert.equal(light.posts[0].mediaItems[0].url, '/uploads/2026/11/p-0-0.jpg', 'Original gallery URL remains intact');
  assert.equal(light.posts[0].comments.length, 1, 'Blocked comment authors are still filtered');
  for (const field of ['friends', 'conversationState', 'profileStats']) assert.equal(Object.hasOwn(light, field), false, 'Feed-only does not compute or reset unrelated metadata');
  assert.equal(friends, 0); assert.equal(profiles, 0);
  const legacy = await request({ sort: 'latest', limit: 10 });
  assert.equal(touched.size, 1200); assert.equal(friends, 1); assert.equal(profiles, 1);
  const wireLight = JSON.parse(JSON.stringify(light.posts));
  wireLight.forEach(post => { delete post.thumbnailUrl; post.mediaItems.forEach(media => delete media.thumbnailUrl); });
  assert.deepEqual(wireLight, JSON.parse(JSON.stringify(legacy.posts)), 'Page data, comments, author metadata and order match the existing protocol');
  const pinned = await request({ feedOnly: true, limit: 2 });
  assert.equal(pinned.posts[0].id, 'post-1199', 'Default pin ordering stays unchanged');
  const target = await request({ feedOnly: true, sort: 'latest', offset: 10, limit: 10, postId: 'post-1100' });
  assert.equal(target.posts[0].id, 'post-10'); assert.equal(target.targetPost.id, 'post-1100'); assert.equal(touched.size, 11);
  posts[0].authorPhoneRaw = 'blocked'; posts[1].visibility = 'private'; posts[2].visibility = 'followers'; posts[3].authorPhoneRaw = 'stranger'; posts[3].visibility = 'followers';
  const filtered = await request({ feedOnly: true, sort: 'latest', limit: 10 });
  const fullFiltered = await request({ sort: 'latest', limit: 10 });
  assert.deepEqual(JSON.parse(JSON.stringify(filtered.posts)), JSON.parse(JSON.stringify(fullFiltered.posts)), 'Block and follower/private visibility match legacy filtering');
  assert.equal(filtered.total, fullFiltered.total);
  assert(filtered.posts.some(post => post.id === 'post-2')); assert(!filtered.posts.some(post => ['post-0', 'post-1', 'post-3'].includes(post.id)));
  assert.equal(posts[0].mediaItems[0].thumbnailUrl, undefined, 'Feed thumbnails never persist into user posts');
}
const watchdog = setTimeout(() => { console.error('Feed latency regression did not finish'); process.exit(1); }, 5000);
Promise.resolve().then(marketCase).then(communityCase).then(() => {
  console.log('PASS: cold media never blocks feed JSON; ready thumbnails and original URLs retained; durability waits preserved; community hydrates 10/1200 posts, preserves paging/visibility/comments, and omits unrelated conversation work only by opt-in.');
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
