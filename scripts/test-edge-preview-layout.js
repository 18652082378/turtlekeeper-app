const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync('app.js','utf8');
const extract = (start,end) => source.slice(source.indexOf(start),source.indexOf(end));
(async()=>{
  const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.setContent('<div id="app" class="phone-shell"></div>');
    for(const file of ['styles.css','chat-tools.css','dark-surface-audit.css']) await page.addStyleTag({path:file});
    await page.addStyleTag({content:'.test-card{height:210px;border-bottom:1px solid #555}.test-detail{height:2100px}.test-content{padding-top:90px}'});
    await page.addScriptTag({content:`
      var $app=document.querySelector('#app'),state={page:'market'},edgeBackSnapshots=[],ledgerDashboardPicker=null,
      marketImpressionTimers=new Map(),marketImpressionSeenIds=new Set(),preservedMessageSnapshotActive=false,
      pendingPageEnterMotion=false,pendingCommunityChatEnterMotion=false,pendingPageScrollReset=false,
      pageEnterMotionTimer=null,restoredSnapshotRenderHoldUntil=0,appAnalyticsSessionId=null,renderCount=0;
      var BOTTOM_NAV_ROOT_PAGES=new Set(['market','home','messages','mine','ledger']);
      function saveState(){} function refreshCareReminderTimers(){} function setupMarketInfiniteScroll(){}
      function syncPersistentBottomNav(){} function stopMarketDetailVideos(){} function patchMarketSnapshotDetails(){}
      function patchSystemAnnouncementOverlay(){} function hydrateMarketDetailVideos(){} function bindEvents(){}
      function render(){renderCount++;$app.innerHTML='<div class="topbar"><div class="nav-title"><h1>'+state.page+'</h1></div></div>'+
        (state.page==='child'?'<main class="test-detail">DETAIL</main>':'<main class="test-content">'+Array.from({length:24},(_,i)=>'<div class="test-card" data-card="'+i+'">'+i+'</div>').join('')+'</main>')+
        '<nav class="bottom-nav"><button>看板</button><button>账本</button><button>龟集市</button><button>壳友圈</button></nav>';if(pendingPageScrollReset){scrollTo(0,0);pendingPageScrollReset=false;}}
      ${extract('function setState(', 'function requireLogin(')}
      ${extract('function backNavigationState(', 'function pageFollowing(')}
      ${extract('function buildEdgeBackPreviewHtml(', '\nrestorePendingCloudData();')}
      setupEdgeBackAndConversationSwipe();
    `});
    for(const theme of ['light','dark']) for(const origin of ['market','community','mine','home']){
      await page.evaluate(({origin,theme})=>{document.documentElement.dataset.themeColor=theme;state.page=origin;render();scrollTo(0,origin==='home'?0:theme==='dark'?99999:1200);},{origin,theme});
      await page.waitForTimeout(40);
      const before = await page.evaluate(()=>{
        window.originalCard=document.querySelector('[data-card="6"]');
        const result={header:document.querySelector('.topbar').getBoundingClientRect().top,nav:document.querySelector('.bottom-nav').getBoundingClientRect().top,y:scrollY,card:originalCard.getBoundingClientRect().top};
        setState({page:'child'});return result;
      });
      await page.mouse.move(4,400);await page.mouse.down();await page.mouse.move(190,400,{steps:10});
      await page.waitForTimeout(40);
      const during=await page.evaluate(()=>{
        const root=document.querySelector('.edge-back-preview');
        return {header:root.querySelector('.topbar').getBoundingClientRect().top,nav:root.querySelector('.bottom-nav').getBoundingClientRect().top,card:root.querySelector('[data-card="6"]').getBoundingClientRect().top,renders:renderCount};
      });
      for(const key of ['header','nav','card'])assert.ok(Math.abs(during[key]-before[key])<1,`${origin} ${key}: ${during[key]} vs ${before[key]}`);
      await page.screenshot({path:'build/edge-preview-'+origin+'.png'});
      await page.mouse.move(380,400,{steps:5});await page.mouse.up();await page.waitForTimeout(500);
      const after=await page.evaluate(()=>({same:originalCard===document.querySelector('[data-card="6"]'),renders:renderCount,y:scrollY,page:state.page,nav:document.querySelector('#app .bottom-nav').getBoundingClientRect().top}));
      assert.equal(after.same,true,origin+' retains original DOM');assert.equal(after.renders,during.renders,origin+' does not render on swipe completion');assert.equal(after.y,before.y);assert.equal(after.page,origin);assert.ok(Math.abs(after.nav-before.nav)<1);
      // Cancelled swipe must keep the detail and allow the following button return.
      await page.evaluate(()=>setState({page:'child'}));
      await page.mouse.move(4,400);await page.mouse.down();await page.mouse.move(35,400,{steps:4});await page.waitForTimeout(120);await page.mouse.move(30,400);await page.mouse.up();await page.waitForTimeout(450);
      assert.equal(await page.evaluate(()=>state.page),'child');
      await page.evaluate(()=>navigateBack());await page.waitForTimeout(40);
      assert.equal(await page.evaluate(()=>scrollY),before.y);
    }
    console.log('Actual pointer gestures passed: scrolled market/community/mine and growth-style home, fixed header/footer geometry, unchanged DOM, completion, cancellation and button return.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
