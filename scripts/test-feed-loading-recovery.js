const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const extract = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));

async function main() {
  let timer, delay, cleared = 0;
  const api = { window: { TURTLE_API_BASE_URL: 'https://test.invalid' }, AbortController,
    setTimeout: (fn, ms) => { timer = fn; delay = ms; return 1; }, clearTimeout: () => cleared++,
    clearExpiredCloudSession: () => {},
    fetch: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))) };
  vm.createContext(api);
  vm.runInContext(extract('async function apiPost(', 'let appAnalyticsSessionId'), api);
  for (const path of ['/api/market/list', '/api/market/detail', '/api/community/list', '/api/account/save']) {
    const pending = api.apiPost(path, {});
    assert.equal(delay, path.includes('account') ? 20000 : 15000);
    timer();
    await assert.rejects(pending, error => error.code === (path.includes('account') ? 'ACCOUNT_SYNC_TIMEOUT' : 'FEED_LOAD_TIMEOUT'));
  }
  assert.equal(cleared, 4);
  // A response with a hanging body is bounded by the same timeout.
  api.fetch = async (_url, options) => ({ ok: true, status: 200, json: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))) });
  const bodyPending = api.apiPost('/api/market/list', {});
  await new Promise(resolve => setImmediate(resolve));
  timer();
  await assert.rejects(bodyPending, error => error.code === 'FEED_LOAD_TIMEOUT');

  const ctx = { console: { warn() {} }, Date, Map, Set,
    CONFIGURED_SMS_BACKEND: true, state: { page: 'market', loggedInPhone: 'test', cloudToken: '', marketListings: [] },
    hasCloudSession: () => Boolean(ctx.state.cloudToken),
    currentCloudToken: () => ctx.state.cloudToken,
    marketLoading: false, marketLastLoadedAt: 0, incomingMarketShareLoading: false, incomingMarketShareListingId: '',
    marketFeedRequestKey: () => 'key', savedMarketListingIds: () => [], marketFeedRequestOptions: () => ({}),
    marketAuthPayload: x => x, normalizeMarketListings: x => x, normalizeAccountData: x => x,
    render: () => { ctx.renders++; }, renders: 0,
    setState: patch => Object.assign(ctx.state, patch),
    apiPost: async () => { throw new Error('network failure'); }
  };
  vm.createContext(ctx);
  vm.runInContext(extract('function feedLoadNotice(', 'function pageCommunity(') + extract('async function refreshMarket(', 'function resetMarketFeed('), ctx);
  assert.match(ctx.feedLoadNotice('market'), /登录状态已失效/);
  assert.match(ctx.feedLoadNotice('community'), /data-page="account"/);
  await ctx.refreshMarket(true);
  assert.equal(ctx.marketLoading, false);
  ctx.state.cloudToken = 'synthetic';
  await ctx.refreshMarket(true);
  assert.equal(ctx.marketLoading, false);
  assert.equal(ctx.state.marketFeedInitialized, undefined, 'Failure is not an empty success');
  assert.match(ctx.feedLoadNotice('market'), /data-feed-retry="market"/);
  assert.equal(ctx.renders, 1);
  ctx.apiPost = async () => ({ listings: [{ id: 'listing' }], hasMore: false });
  await ctx.refreshMarket(true);
  assert.equal(ctx.state.marketFeedError, '');
  assert.equal(ctx.state.marketListings[0].id, 'listing');
  assert.equal(ctx.state.marketFeedInitialized, true);

  let loading = true;
  const feed = { innerHTML: 'spinner', classList: { remove: () => { loading = false; } } };
  Object.assign(ctx, {
    communityLoading: false, communityLastLoadedAt: 0, communityAuthPayload: x => x,
    mergeCommunityFriends: x => x, deferMessageListRefreshWhileDragging: () => false,
    normalizeCommunityPosts: x => x, communityFeedSignature: x => JSON.stringify(x),
    saveState() {}, syncPersistentBottomNav() {},
    $app: { querySelector: selector => selector === '.community-feed' || (selector.includes('is-initial-loading') && loading) ? feed : null },
    communityFeedMarkup: () => 'empty-success', patchVisibleCommunityFeed: () => { throw new Error('Empty response must clear spinner'); }
  });
  ctx.state.page = 'community';
  ctx.state.communityPosts = [];
  vm.runInContext(extract('async function refreshCommunity(', 'async function loadMoreCommunityPosts('), ctx);
  ctx.apiPost = async () => ({ posts: [] });
  await ctx.refreshCommunity(true);
  assert.equal(ctx.state.communityFeedInitialized, true);
  assert.equal(loading, false);
  assert.equal(feed.innerHTML, 'empty-success');
  ctx.apiPost = async () => { throw new Error('offline'); };
  await ctx.refreshCommunity(true);
  assert.equal(ctx.communityLoading, false);
  assert.match(ctx.feedLoadNotice('community'), /重新加载/);
  assert.equal(ctx.state.communityPosts.length, 0);
  console.log('Feed loading recovery passed: expired login, request/body timeout, failure, retry, and empty success.');
}
const watchdog = setTimeout(() => { console.error('Feed recovery test did not finish'); process.exit(1); }, 5000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
