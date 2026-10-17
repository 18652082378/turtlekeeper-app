'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launchBrowser}=require('./browser-test-engine.cjs'),fixture=require('./ui-audit-fixture.cjs');
const {rankMarketListings}=require('../server/market-ranking');
const repo=path.resolve(__dirname,'..'),root=process.env.UI_TEST_ASSET_ROOT?path.resolve(process.env.UI_TEST_ASSET_ROOT):repo,out=path.join(repo,process.env.UI_TEST_ASSET_ROOT?'output/android/inquiry-qa':'output/market-inquiry');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await launchBrowser();
 try {
  for(const cloud of [false,true]) {
   let products=[],calls=[];
   const ctx=await browser.newContext({viewport:{width:390,height:844}});
   await ctx.route('**/*',r=>{
    const u=new URL(r.request().url());if(u.hostname!=='inquiry.test')return r.abort();
    if(u.pathname==='/config.js')return r.fulfill({contentType:'text/javascript',body:'window.TURTLE_API_BASE_URL='+JSON.stringify(cloud?'https://inquiry.test':'')+';'});
    if(u.pathname==='/api/market/list') {
     const body=r.request().postDataJSON();calls.push(body);
     const found=rankMarketListings(products,body);
     return r.fulfill({json:{ok:true,listings:found,total:found.length,rankingSession:'synthetic-session',nextOffset:found.length,hasMore:false}});
    }
    if(u.pathname==='/api/market/detail')return r.fulfill({json:{ok:true,listing:products.find(p=>p.id===r.request().postDataJSON().listingId)}});
    if(u.pathname.startsWith('/api/'))return r.fulfill({json:{ok:true,listings:[],posts:[],messages:[],minimumBuild:0}});
    const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return r.fulfill({status:404,body:''});
    return r.fulfill({body:fs.readFileSync(file),contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
   });
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
   if (process.env.UI_TEST_ASSET_ROOT) await page.addInitScript(() => {
 const app={getInfo:async()=>({build:'16'}),getLaunchUrl:async()=>({}),addListener:async()=>({remove(){}}),minimizeApp:async()=>{}};
 const bars={getDisplayMetrics:async()=>({}),setTheme:async()=>{},addListener:async(_name,cb)=>{cb({visible:false});return {remove(){}};}};
 window.Capacitor={getPlatform:()=>'android',isNativePlatform:()=>true,Plugins:{App:app,TurtleAndroidWindow:bars},registerPlugin:name=>name==='App'?app:name==='TurtleAndroidWindow'?bars:{}};
});
   await page.goto('https://inquiry.test/?skipIntro=1');
   const base=fixture(),model=base.marketListings[0];
   products=[{...model,id:'first-abc123'},{...model,id:'second-abc123',title:'第二只测试龟',sellerName:'另一位虚构卖家'},{...model,id:'title-zzzzzz',title:'KM-ABC123'},{...model,id:'sold-abc123',status:'sold'},{...model,id:'off-abc123',status:'inactive'}];
   const seed=async(theme='teal')=>{
    await page.evaluate(({base,products,cloud,theme})=>{
     dismissTradeIntro?.();TurtleReleaseNotes.cancel();
     state={...initialState,...emptyAccountData(),...base,page:'market',themeColor:theme,marketListings:products,marketSearch:'',marketFeedInitialized:false,marketFeedSessionId:'',marketStage:'adult',marketRegion:'city:上海市',marketDelivery:'仅自提',marketFreshOnly:true,cloudToken:cloud?'synthetic-token':''};
     marketLoading=communityLoading=messageUnreadLoading=cloud;forceUpdateState={required:false};edgeBackSnapshots=[];TurtleSearch.reset();render();
    },{base,products,cloud,theme});
   };
   for(const theme of ['teal','dark'])for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:844});await seed(theme);
    await page.locator('[data-open-search="market"]').click();
    assert.match(await page.locator('[data-workspace-search]').getAttribute('placeholder'),/咨询码/);
    await page.locator('[data-workspace-search]').fill(' km-abc123 ');
    await page.evaluate(()=>{marketLoading=false;});
    await page.locator('.search-workspace-submit').click();
    await page.waitForSelector('[data-view-market="first-abc123"]');
    assert.equal(await page.locator('.market-card').count(),2);
    assert.match(await page.locator('.market-inquiry-summary').innerText(),/匹配多个商品/);
    assert.equal(await page.locator('.market-card-inquiry-code').count(),2);
    assert.equal(await page.locator('[data-market-stage]').count(),0);
    assert.equal(await page.evaluate(()=>state.marketStage==='all'&&state.marketRegion===''&&state.marketDelivery===''&&!state.marketFreshOnly),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(width===390)await page.screenshot({path:path.join(out,(cloud?'cloud':'local')+'-'+theme+'.png')});
   }
   assert.deepEqual(errors,[]);
   if(cloud)assert.ok(calls.some(x=>x.keyword==='KM-ABC123'&&x.stage==='all'));
   await seed();await page.locator('[data-open-search="market"]').click();
   await page.evaluate(()=>{
    const input=document.querySelector('[data-workspace-search]'),data=new DataTransfer();
    data.setData('text','您好，我想咨询「'+'长标题'.repeat(100)+'」，商品咨询码：km-abc123');
    input.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
   });
   assert.equal(await page.locator('[data-workspace-search]').inputValue(),'KM-ABC123');
   await page.evaluate(()=>marketLoading=false);await page.locator('.search-workspace-submit').click();
   await page.waitForSelector('[data-view-market="first-abc123"]');
   await page.locator('[data-view-market="second-abc123"]').click();
   assert.equal(await page.evaluate(()=>state.selectedMarketListingId),'second-abc123');
   await seed();await page.locator('[data-open-search="market"]').click();
   assert.match(await page.locator('.search-history-chips').innerText(),/KM-ABC123/);
   await page.locator('[data-workspace-search]').fill('KM-999999');await page.evaluate(()=>marketLoading=false);
   await page.locator('.search-workspace-submit').click();
   await page.waitForSelector('.market-empty');
   assert.match(await page.locator('.market-empty').innerText(),/核对完整代码/);
   assert.equal(await page.locator('.market-card').count(),0);
   assert.deepEqual(errors,[]);await ctx.close();
  }
  console.log('PASS consultation UI: local/cloud search, exact collisions, no unavailable/title impostors, filters reset, full message paste, normalized history, correct selected detail, empty guidance, 320/390/1280 light/dark.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
