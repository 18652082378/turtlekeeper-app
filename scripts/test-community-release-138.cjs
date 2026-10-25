'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launchBrowser,recordResult}=require('./browser-test-engine.cjs'),fixture=require('./ui-audit-fixture.cjs')();
const root=path.resolve(__dirname,'..'),bundle=path.join(root,'www');
(async()=>{
 const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.hostname!=='release-138.test')return route.abort();
   if(u.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:'window.TURTLE_API_BASE_URL="https://release-138.test";window.TURTLE_APP_BUILD=138;window.TURTLE_APP_VERSION="1.1.9";'});
   if(u.pathname.startsWith('/api/'))return route.fulfill({json:{ok:true,minimumBuild:0,latestBuild:0,posts:[],items:[],notifications:[]}});
   const file=path.resolve(bundle,u.pathname==='/'?'index.html':'.'+decodeURIComponent(u.pathname));
   if(!file.startsWith(bundle+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
 });
 async function seed(route,theme,count=0){
   await page.evaluate(({fixture,route,theme,count})=>{
     window.dismissTradeIntro?.();window.TurtleReleaseNotes?.cancel();
     const url='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="360"><rect width="180" height="360" fill="#97b493"/></svg>');
     const post={...fixture.communityPosts[0],comments:[],photos:[url],media:[{type:'image',url}],mediaItems:[{type:'image',url}]};
     const species=window.TURTLE_SPECIES.filter(item=>!isMarketProhibitedSpecies(item)).slice(0,count);
     state={...initialState,...emptyAccountData(),...fixture,page:route,themeColor:theme,cloudToken:'',keptSpecies:[],marketFavoriteIds:[],turtles:species.map((s,i)=>({...fixture.turtles[0],id:'synthetic-'+i,speciesCode:s.code})),policyConsentRequired:false,communityPosts:[post],selectedCommunityPostId:post.id,communityFeedInitialized:true,communityFeedHasMore:false,marketFeedInitialized:true,marketFeedHasMore:false};
     communityLoading=messageUnreadLoading=communityChatLoading=false;cloudHydrationComplete=true;forceUpdateState={required:false};pendingPageEnterMotion=false;render();
   },{fixture,route,theme,count});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 }
 try{
   await page.goto('https://release-138.test/?skipIntro=1');
   for(const width of [320,390,430,1180])for(const theme of ['teal','dark']){
     await page.setViewportSize({width,height:844});
     for(const route of ['community','communityPostDetail']){
       await seed(route,theme);const selector=route==='community'?'.forum-thread-media.is-single':'.community-detail-media-gallery';
       const media=page.locator(selector).first();await media.locator('img.community-media').evaluate(img=>img.decode());
       if(route==='community')await media.locator('[data-community-photo-shape="portrait"]').waitFor();
       const actual=await media.evaluate(el=>{const img=el.querySelector('img.community-media'),button=img.closest('button'),corners=node=>['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].map(k=>getComputedStyle(node)[k]);return {corners:[...corners(el),...corners(button),...corners(img)],left:img.getBoundingClientRect().left-el.getBoundingClientRect().left,background:[getComputedStyle(el).backgroundColor,getComputedStyle(button).backgroundColor],fit:getComputedStyle(img).objectFit};});
       assert.deepEqual(actual.corners,Array(12).fill('0px'),JSON.stringify({width,theme,route,actual}));assert.ok(Math.abs(actual.left)<1);assert.deepEqual(actual.background,['rgba(0, 0, 0, 0)','rgba(0, 0, 0, 0)']);assert.equal(actual.fit,route==='community'?'cover':'contain');
       if(route==='communityPostDetail'){assert.equal(await page.locator('.forum-reply-composer button[type="submit"]').count(),0);assert.equal(await page.locator('.forum-reply-composer [data-emote-toggle]').count(),1);}
       checks.push({width,theme,route,images:'square-left-card-surface'});
     }
     for(const count of [4,5,9]){
       await seed('market',theme,count);const boxes=await page.locator('.discovery-market-entry [data-discovery-species]').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));assert.equal(boxes.length,count);
       for(let i=0;i<count;i++)assert.equal(Math.round(boxes[i].top),Math.round(boxes[Math.floor(i/4)*4].top));
       if(count>4)assert.ok(boxes[4].top>boxes[3].bottom);if(count>8)assert.ok(boxes[8].top>boxes[7].bottom);
       assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);checks.push({width,theme,route:'market',count});
     }
   }
   assert.deepEqual(errors,[]);recordResult(root,'community-release-138.json',{build:138,checks,errors,syntheticOnly:true});
   console.log(`PASS: build 138 packaged assets; ${checks.length} checks for square corners, left alignment, shared card background, original smile entry and four species per row.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
