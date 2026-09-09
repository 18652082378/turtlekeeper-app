const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function extract(a,b){return source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));}
const calls=[],status={textContent:''};
const sandbox={ console, Map, Set, Date, JSON, Number, String, Boolean,
  state:{loggedInPhone:'buyer',page:'market',marketListings:[],marketFeedInitialized:false,marketFeedHasMore:true},
  marketLoading:false,marketLastLoadedAt:0,incomingMarketShareLoading:false,incomingMarketShareListingId:'',
  savedMarketListingIds:()=>[],hasCloudSession:()=>true,marketRegionCities:()=>[],marketAuthPayload:x=>x,
  normalizeMarketListings:x=>x,normalizeAccountData:x=>x,saveState:()=>{},render:()=>{},
  setupMarketInfiniteScroll:()=>{},hydrateVideoFirstFrames:()=>{},syncMarketWifiVideos:()=>{},requestAnimationFrame:f=>f(),
  document:{querySelector:selector=>selector==='[data-market-load-sentinel]'?status:null},
  apiPost:async(path,body)=>{calls.push(body);return {listings:[],rankingSession:'session',hasMore:false,nextOffset:0}},
};
sandbox.setState=patch=>Object.assign(sandbox.state,patch);
vm.createContext(sandbox);
vm.runInContext(extract('function marketFeedRequestOptions(', 'function setupMarketInfiniteScroll(')+extract('function marketListingTime(', 'function marketAssistControls('),sandbox);
async function run(){
  const one={id:'one',status:'active',title:'不包含搜索字',description:'描述相关',price:900,createdAt:'2026-01-01'},two={id:'two',status:'active',price:50},three={id:'three',status:'active',price:1};
  sandbox.state.marketPriceOrder='desc';sandbox.state.marketSearch='描述相关';
  sandbox.apiPost=async(path,body)=>{calls.push(body);return {listings:[one],rankingSession:'session',hasMore:true,nextOffset:1}};
  await sandbox.refreshMarket(true);
  assert.equal(calls.at(-1).rankingVersion,1);assert.equal(calls.at(-1).priceOrder,'desc');
  assert.deepEqual(Array.from(sandbox.marketSearchResultListings(),x=>x.id),['one'],'server description matches survive client render');
  // Detail response caches products which have not yet appeared in the feed.
  sandbox.state.marketListings.push(two,three);
  assert.deepEqual(Array.from(sandbox.marketSearchResultListings(),x=>x.id),['one'],'unseen cached references stay out of feed');
  sandbox.apiPost=async(path,body)=>{calls.push(body);return {listings:[two],rankingSession:'session',hasMore:true,nextOffset:2}};
  await sandbox.loadMoreMarketListings();
  assert.equal(calls.at(-1).rankingSession,'session');assert.equal(calls.at(-1).priceOrder,'desc');
  assert.deepEqual(Array.from(sandbox.marketSearchResultListings(),x=>x.id),['one','two'],'cached future page is still appended');
  assert.equal(sandbox.state.marketListings.length,3,'no duplicated cache objects');
  // Expiration must leave the current list/position intact until explicit refresh.
  sandbox.apiPost=async()=>({rankingReset:true});
  await sandbox.loadMoreMarketListings();
  assert.deepEqual(Array.from(sandbox.marketSearchResultListings(),x=>x.id),['one','two']);
  assert.match(status.textContent,/下拉刷新/);
  let resolveOld;
  sandbox.resetMarketFeed({marketSearch:'旧搜索'});
  sandbox.apiPost=()=>new Promise(resolve=>{resolveOld=resolve});
  const old=sandbox.refreshMarket(true);
  sandbox.resetMarketFeed({marketSearch:'新搜索',marketSort:'latest',marketPriceOrder:''});
  sandbox.apiPost=async(path,body)=>{calls.push(body);return {listings:[three],rankingSession:'new-session',hasMore:false,nextOffset:1}};
  resolveOld({listings:[one],rankingSession:'old-session',hasMore:false,nextOffset:1});
  await old;
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.at(-1).keyword,'新搜索');assert.equal(calls.at(-1).sort,'latest');
  assert.equal(sandbox.state.marketFeedSessionId,'new-session');
  assert.deepEqual(Array.from(sandbox.marketSearchResultListings(),x=>x.id),['three'],'old response cannot replace newer filters');
  console.log('Ranked feed passed: server ordering, cached-page append, all query parameters, expiry stability, stale-request race.');
}
run().catch(error=>{console.error(error);process.exitCode=1});
