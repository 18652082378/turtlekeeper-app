'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const extract = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(page = 'market') {
  let now = 50000;
  const frames = [], tasks = [], calls = [], writes = [], changes = [];
  const feed = { innerHTML: '', classList: { remove() {} } };
  const c = { console: { warn() {} }, Map, Set, Number, String, Boolean, JSON, Date: { now: () => now },
    BOTTOM_NAV_ROOT_PAGES: new Set(['home', 'market', 'community', 'messages', 'ledger']),
    state: { page, loggedInPhone: 'one', cloudToken: 'token-one', marketListings: [{ id: 'cached' }], marketFeedInitialized: true,
      communityPosts: [{ id: 'cached-post' }], communityFeedInitialized: true, communityFriends: [{ id: 'friend', unreadCount: 3 }], communityProfileStats: { followerCount: 7 } },
    feedEntryRefresh: { market: { pending: false, at: 0, key: '' }, community: { pending: false } }, feedCacheSaveTicket: 0,
    marketLoading: false, marketLastLoadedAt: 0, incomingMarketShareLoading: false, incomingMarketShareListingId: '', marketLoadRetryKey: '',
    communityLoading: false, communityLastLoadedAt: 0, communityConversationRevision: 0, communityPublicationRevision: 0, communityConversationDeleting: new Set(),
    hasCloudSession: () => Boolean(c.state.cloudToken), currentCloudToken: () => c.state.cloudToken,
    savedMarketListingIds: () => [], marketRegionCities: () => [], marketAuthPayload: value => value, communityAuthPayload: value => value,
    normalizeMarketListings: value => value, normalizeAccountData: value => value, normalizeCommunityPosts: value => value,
    setupMarketInfiniteScroll() {}, patchMarketSnapshotDetails() {}, syncPersistentBottomNav() {}, reconcileCommunityConversationState() {},
    mergeCommunityFriends: value => value, deferMessageListRefreshWhileDragging: () => false,
    communityFeedSignature: value => JSON.stringify(value), communityFeedMarkup: () => 'empty',
    patchVisibleCommunityFeed: posts => changes.push(posts.map(post => post.id)),
    $app: { querySelector: selector => selector === '.community-feed' ? feed : null },
    requestAnimationFrame: fn => frames.push(fn), window: { setTimeout: fn => tasks.push(fn) },
    saveState: () => writes.push(c.state.loggedInPhone), render() {},
    apiPost: async (url, body) => { calls.push({ url, body }); return { listings: [{ id: 'new' }], posts: [{ id: 'new-post' }], rankingSession: 'new-session', nextOffset: 1, hasMore: false }; }
  };
  c.setState = (patch, options = {}) => { Object.assign(c.state, patch); if (!options.skipSave) c.saveState(); changes.push('DOM'); };
  vm.createContext(c);
  vm.runInContext(extract('function deferFeedCacheSave(', 'let marketCityLocationRequestId')
    + extract('function marketFeedRequestOptions(', 'function resetMarketFeed(')
    + extract('async function refreshCommunity(', 'async function loadMoreCommunityPosts(')
    + extract('function navigateBottomTab(', 'function restoreBottomNavAfterForeground('), c);
  return { c, calls, writes, changes, frames, tasks, advance: ms => { now += ms; }, paint: () => { while (frames.length) frames.shift()(); while (tasks.length) tasks.shift()(); } };
}
(async () => {
  {
    const x = setup();
    await x.c.refreshMarket(true);
    assert.equal(x.writes.length, 0, 'Read-only feed response does not serialize the account before its DOM update');
    assert(x.changes.includes('DOM')); assert(x.frames.length > 0);
    x.paint(); assert.equal(x.writes.length, 1);
    x.calls.length = 0; const cached = x.c.state.marketListings;
    x.c.feedEntryRefresh.market.pending = true;
    await x.c.refreshMarket(); assert.equal(x.calls.length, 0, 'Quick tab return preserves the current ranking and pages');
    x.advance(10001); x.c.feedEntryRefresh.market.pending = true;
    let release;
    x.c.apiPost = async (_url, body) => { x.calls.push({ body }); return new Promise(resolve => { release = resolve; }); };
    const pending = x.c.refreshMarket();
    assert.equal(x.c.state.marketListings, cached, 'Cached cards stay visible during stale-entry refresh');
    release({ listings: [{ id: 'fresh-entry' }], rankingSession: 'fresh-session', nextOffset: 1, hasMore: true });
    await pending;
    assert.equal(x.c.state.marketListings[0].id, 'fresh-entry'); assert.equal(x.c.state.marketFeedSessionId, 'fresh-session');
    assert.equal(x.c.state.marketFeedNextOffset, 1, 'A new ranking keeps its matching first-page cursor');
  }
  {
    const x = setup('mine'); x.c.state.marketFeedInitialized = false;
    let release;
    x.c.apiPost = async (_url, body) => { x.calls.push({ body }); return body.all ? new Promise(resolve => { release = resolve; }) : { listings: [{ id: 'first-page' }], rankingSession: 'feed', nextOffset: 1 }; };
    const background = x.c.refreshMarket(true);
    x.c.state.page = 'market'; x.c.feedEntryRefresh.market.pending = true;
    await x.c.refreshMarket(); assert.equal(x.calls.length, 1, 'No parallel request fights the existing lock');
    release({ listings: [{ id: 'non-feed' }] }); await background; await tick();
    assert.equal(x.calls.length, 2, 'Feed entry queued behind a non-feed request is fulfilled immediately after it');
    assert.equal(x.calls[1].body.limit, 8); assert.equal(x.c.state.marketListings[0].id, 'first-page');
  }
  {
    const x = setup();
    x.c.apiPost = async () => ({ listings: [], accountData: { turtles: [{ id: 'sold-sync' }] } });
    await x.c.refreshMarket(true); assert.equal(x.writes.length, 1, 'A server account-data/sold update still saves immediately');
  }
  {
    const x = setup('community'); const friends = x.c.state.communityFriends, stats = x.c.state.communityProfileStats;
    x.c.state.messageUnreadCount = 9;
    x.c.communityConversationDeleting.add('unrelated-conversation');
    await x.c.refreshCommunity(true);
    assert.equal(x.calls[0].body.feedOnly, true); assert.equal(x.calls[0].body.mediaVariantsVersion, 1);
    assert.equal(x.c.state.communityPosts[0].id, 'new-post', 'Conversation deletion does not block a post-only response');
    assert.equal(x.c.state.communityFriends, friends); assert.equal(x.c.state.communityProfileStats, stats);
    assert.equal(x.c.state.messageUnreadCount, 9, 'Post-only responses preserve the existing unread summary');
    assert.equal(x.writes.length, 0); assert(x.changes.length > 0); x.paint(); assert.equal(x.writes.length, 1);
  }
  {
    const x = setup('community'); x.c.state.communityFeedInitialized = false; x.c.communityLastLoadedAt = 49999;
    await x.c.refreshCommunity(); assert.equal(x.calls.length, 1, 'Cold entry is not held behind an unrelated ten-second timestamp');
    x.c.feedEntryRefresh.community.pending = true;
    x.c.apiPost = async () => { x.calls.push('error'); throw Error('offline'); };
    await x.c.refreshCommunity(true); await tick();
    assert.equal(x.calls.length, 2, 'Failure settles without an automatic retry loop');
    assert.equal(x.c.state.communityPosts[0].id, 'new-post', 'Offline errors retain cached content');
  }
  {
    const x = setup(); x.c.deferFeedCacheSave(); x.c.deferFeedCacheSave(); x.paint(); assert.equal(x.writes.length, 1, 'Cache writes coalesce');
    x.c.deferFeedCacheSave(); x.c.state.cloudToken = 'replacement-session'; x.paint(); assert.equal(x.writes.length, 1, 'A replaced session cannot run the old cache write');
    x.c.state.page = 'home'; x.c.navigateBottomTab('market'); assert.equal(x.writes.length, 1, 'A tab switch does not serialize the whole account');
  }
  for (const kind of ['market', 'community']) {
    const x = setup(kind); let release;
    x.c.apiPost = async () => new Promise(resolve => { release = resolve; });
    const pending = kind === 'market' ? x.c.refreshMarket(true) : x.c.refreshCommunity(true);
    x.c.state.cloudToken = 'replacement-session';
    x.c.apiPost = async () => ({ listings: [{ id: 'new-session' }], posts: [{ id: 'new-session' }], hasMore: false });
    release({ listings: [{ id: 'expired-session' }], posts: [{ id: 'expired-session' }] });
    await pending; await tick();
    const rows = kind === 'market' ? x.c.state.marketListings : x.c.state.communityPosts;
    assert.equal(rows[0].id, 'new-session', `${kind}: replacement session gets its own response instead of the expired in-flight one`);
  }
  console.log('PASS: stale-entry refresh, cache-first DOM, queued market entry, matching ranking cursor, lightweight community, post-paint/coalesced account-scoped cache, durability, offline recovery and navigation writes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
