const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
async function main(){
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  try {
    const page=await browser.newPage();
    await page.route('https://market-test.invalid/',route=>route.fulfill({contentType:'text/html',body:'<div id="app"><div class="market-grid"><article><button data-view-market="one"><span class="market-card-photo"><img alt="preserved cover"></span><span class="market-card-body"><strong>原商品</strong><span class="market-card-price"><b><i>¥</i>100.00</b><small data-market-want-count="one">0人想要</small></span></span></button><button data-market-favorite="one">收藏</button></article></div></div>'}));
    await page.goto('https://market-test.invalid/');
    await page.addScriptTag({content:`
      var $app=document.querySelector('#app'), originalGrid=document.querySelector('.market-grid'), originalImage=document.querySelector('img');
      var state={page:'market',marketFavoriteIds:['one'],marketListings:[{id:'one',title:'最新商品信息',price:88,status:'sold',wantCount:3}],systemAnnouncements:[]};
      var CONFIGURED_SMS_BACKEND=true,systemAnnouncementsLoading=false,systemAnnouncementsLastLoadedAt=0;
      function money(v){return Number(v||0).toFixed(2)} function saveState(){} function hasCloudSession(){return false}
      function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
      function formatTime(v){return v} function render(){throw new Error('Unexpected full render')}
      function setState(){throw new Error('Unexpected state-driven full render')}
      var announcements=[{id:'notice',title:'系统通知',content:'公告内容',status:'active'}];
      async function apiPost(){return {announcements}}
      ${extract('function patchMarketSnapshotDetails(', 'function marketFeedRequestOptions(')}
      ${extract('function announcementDismissalKey(', 'function setupCommunityInfiniteScroll(')}
      ${extract('async function refreshSystemAnnouncements(', 'async function submitSystemAnnouncement(')}
      patchMarketSnapshotDetails();
    `});
    assert.equal(await page.locator('[data-view-market]').isDisabled(),true);
    assert.equal(await page.locator('[data-market-want-count]').textContent(),'3人想要');
    assert.equal(await page.locator('.market-card-price > b').textContent(),'¥88.00');
    assert.equal(await page.locator('[data-market-favorite]').getAttribute('aria-pressed'),'true');
    await page.evaluate(async()=>{await refreshSystemAnnouncements(true);window.originalNotice=document.querySelector('.system-announcement-overlay');await refreshSystemAnnouncements(true)});
    assert.equal(await page.evaluate(()=>originalNotice===document.querySelector('.system-announcement-overlay')),true,'unchanged polling preserves existing overlay');
    await page.locator('[data-dismiss-system-announcement]').click();
    assert.equal(await page.locator('.system-announcement-overlay').count(),0);
    await page.evaluate(async()=>{await refreshSystemAnnouncements(true);state.marketListings[0].status='active';state.marketListings[0].negotiable=true;patchMarketSnapshotDetails()});
    assert.equal(await page.locator('[data-view-market]').isDisabled(),false);
    assert.equal(await page.locator('.market-card-photo > i').textContent(),'可议价');
    assert.equal(await page.locator('.system-announcement-overlay').count(),0,'dismissed announcement stays dismissed');
    assert.equal(await page.evaluate(()=>originalGrid===document.querySelector('.market-grid')&&originalImage===document.querySelector('img')),true,'metadata and announcement updates retain list and image nodes');
    console.log('Market return updates passed: media retention, favorites/price/status patches, announcement polling and dismissal without full render.');
  } finally {await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
