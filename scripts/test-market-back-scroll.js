const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const extract = (start, end) => app.slice(app.indexOf(start), app.indexOf(end));

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent('<style>body{margin:0}.card{height:200px}.edge-back-preview{position:fixed;inset:0;overflow:auto;background:white}</style><div id="app"></div>');
    await page.addScriptTag({ content: `
      var $app=document.querySelector('#app');
      var state={page:'market',marketSearch:'果核',marketStage:'all',marketFeedInitialized:true,marketFeedNextOffset:40,marketFeedHasMore:true,
        marketListings:Array.from({length:40},(_,i)=>({id:String(i)}))};
      var ledgerDashboardPicker=null, marketImpressionTimers=new Map(),marketImpressionSeenIds=new Set(),
        preservedMessageSnapshotActive=false,edgeBackSnapshots=[],pendingPageScrollReset=false,
        pendingCommunityChatEnterMotion=false,pendingPageEnterMotion=false,pageEnterMotionTimer=null,
        restoredSnapshotRenderHoldUntil=0,appAnalyticsSessionId=null;
      var BOTTOM_NAV_ROOT_PAGES=new Set(['market','messages','home']);
      var marketLoading=false,marketLastLoadedAt=0,incomingMarketShareLoading=false,incomingMarketShareListingId='';
      function saveState(){} function refreshCareReminderTimers(){} function setupMarketInfiniteScroll(){}
      function syncPersistentBottomNav(){} function hydrateVideoFirstFrames(){} function hydrateCommunityPostVideos(){} function hydrateMarketDetailVideos(){}
      function savedMarketListingIds(){return []} function hasCloudSession(){return true} function marketAuthPayload(x){return x}
      function normalizeMarketListings(x){return x} function normalizeAccountData(x){return x} function marketRegionCities(){return []}
      async function apiPost(){return {listings:[{id:'0',title:'updated'}],myListings:[]}}
      function bindEvents(){document.querySelector('[data-back]')?.addEventListener('click',()=>navigateBack())}
      function render(){
        if(pendingPageScrollReset){window.scrollTo(0,0);pendingPageScrollReset=false}
        $app.innerHTML=state.page==='marketDetail'?'<button data-back>返回</button><div style="height:1800px">详情</div>':
          '<input value="'+state.marketSearch+'">'+state.marketListings.map(x=>'<div class="card" data-id="'+x.id+'">'+x.id+'</div>').join('');
        bindEvents();
      }
      ${extract('function setState(', 'function requireLogin(')}
      ${extract('function backNavigationState(', 'function pageFollowing(')}
      ${extract('function buildEdgeBackPreviewHtml(', 'function setupEdgeBackAndConversationSwipe(')}
      ${extract('async function refreshMarket(', 'function resetMarketFeed(')}
      ${extract('async function loadMoreMarketListings(', 'function setupMarketInfiniteScroll(')}
      render();
    ` });
    for (const mode of ['button', 'gesture', 'html-fallback']) {
      await page.evaluate(() => { restoredSnapshotRenderHoldUntil=0; render(); window.scrollTo(0, 4567); });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const before = await page.evaluate(() => ({ y:scrollY, anchor:document.querySelector('[data-id="23"]').getBoundingClientRect().top }));
      assert.equal(before.y, 4567);
      const captured = await page.evaluate(() => {
        setState({page:'marketDetail',selectedMarketListingId:'23'});
        return edgeBackSnapshots.at(-1).scrollY;
      });
      assert.equal(captured, before.y, 'capture position before detaching the list');
      await page.evaluate(async () => { marketLastLoadedAt=0; await refreshMarket(true); });
      assert.equal(await page.evaluate(() => state.marketListings.length), 40, 'detail refresh retains all loaded feed pages');
      if (mode === 'button') await page.getByRole('button', { name: '返回' }).click();
      else await page.evaluate(mode => {
        if(mode==='html-fallback') edgeBackSnapshots.at(-1).liveDom=null;
        else showEdgeBackPreview(edgeBackSnapshots.at(-1));
        navigateBack({fromEdgeGesture:mode==='gesture'});
      }, mode);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const after=await page.evaluate(() => ({ y:scrollY, anchor:document.querySelector('[data-id="23"]').getBoundingClientRect().top,
        keyword:document.querySelector('input').value, offset:state.marketFeedNextOffset }));
      assert.equal(after.y,before.y,mode);
      assert.equal(after.anchor,before.anchor,mode+' returns to the same card');
      assert.equal(after.keyword,'果核');
      assert.equal(after.offset,40);
    }
    const latePage = await page.evaluate(async () => {
      let resolvePage;
      apiPost=()=>new Promise(resolve=>{resolvePage=resolve});
      const beforeOffset=state.marketFeedNextOffset;
      const pending=loadMoreMarketListings();
      setState({page:'marketDetail'});
      resolvePage({listings:[{id:'late-page'}],nextOffset:48,hasMore:true});
      await pending;
      navigateBack();
      return {beforeOffset,offset:state.marketFeedNextOffset,loading:state.marketFeedLoadingMore,
        count:state.marketListings.length,cards:document.querySelectorAll('.card').length};
    });
    assert.equal(latePage.offset,latePage.beforeOffset, 'background pagination must not skip a detached page');
    assert.equal(latePage.loading,false);
    assert.equal(latePage.count,latePage.cards);
    console.log('Market back-scroll browser checks passed: button, gesture hand-off, HTML fallback, exact card position, filters, loaded pagination and late page responses.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
