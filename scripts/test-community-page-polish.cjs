'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {launchBrowser,recordResult,engine}=require('./browser-test-engine.cjs');
const root=path.resolve(__dirname,'..'),local=process.argv.includes('--bundle')?path.join(root,'www'):(process.env.COMMUNITY_POLISH_ROOT||root);
const installed=!process.argv.includes('--preview'),fixture=require('./ui-audit-fixture.cjs')();
(async()=>{
 const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],mutations=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   // WebKit cannot intercept local file loads reliably. Use the same local
   // bytes behind an intercepted HTTPS origin for its layout/interaction run.
   if(engine==='webkit'&&url.hostname==='polish.test'&&!url.pathname.startsWith('/api/')){
     if(url.pathname==='/index.html'){
       let html=fs.readFileSync(path.join(local,'index.html'),'utf8');
       if(!installed)html=html.replace('</body>','<link rel="stylesheet" href="./assets/community-page-polish.css"><script src="./assets/community-page-polish.js"></script></body>');
       return route.fulfill({contentType:'text/html',body:html});
     }
     if(url.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:'window.TURTLE_API_BASE_URL="https://polish.test";'});
     const base=!installed&&/^\/assets\/community-page-polish\.(js|css)$/.test(url.pathname)?root:local;
     const file=path.resolve(base,'.'+decodeURIComponent(url.pathname));
     if(!file.startsWith(path.resolve(base)+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
     return route.fulfill({body:fs.readFileSync(file),contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
   }
   if(url.protocol==='file:'){
     if(url.pathname.endsWith('/config.js'))return route.fulfill({contentType:'text/javascript',body:'window.TURTLE_API_BASE_URL="https://polish.test";'});
     if(!installed&&url.pathname.endsWith('/index.html')){
       const html=fs.readFileSync(path.join(local,'index.html'),'utf8').replace('</body>','<link rel="stylesheet" href="./assets/community-page-polish.css"><script src="./assets/community-page-polish.js"></script></body>');
       return route.fulfill({contentType:'text/html',body:html});
     }
     if(!installed&&/\/assets\/community-page-polish\.(js|css)$/.test(url.pathname))return route.fulfill({body:fs.readFileSync(path.join(root,'assets',path.basename(url.pathname))),contentType:url.pathname.endsWith('.js')?'text/javascript':'text/css'});
     return route.continue();
   }
   if(!['GET','HEAD'].includes(route.request().method())&&!['/api/announcements/list','/api/analytics/visit'].includes(url.pathname))mutations.push(url.pathname);
   return route.fulfill({json:{ok:true,minimumBuild:0,latestBuild:0,friends:[],posts:[],items:[],notifications:[]}});
 });
 async function seed(route,{empty=false,error=false,loading=false}={}){
   await page.evaluate(({fixture,route,empty,error,loading})=>{
     window.dismissTradeIntro?.();window.TurtleReleaseNotes?.cancel();
     const user={...fixture.selectedCommunityUser,name:'这是用来检查长昵称是否遮挡关注按钮的测试龟友'};
     state={...initialState,...emptyAccountData(),...fixture,page:route,cloudToken:'',policyConsentRequired:false,communityFeedInitialized:true,communityFeedHasMore:false,communityFriendsInitialized:true,followingInitialized:true,communityActivityLoading:loading,communityActivityError:error,communityActivityHasMore:false,profileContentTab:'posts',selectedCommunityUser:user,selectedCommunityFriend:user,selectedCommunityFriendId:user.id,communityFollowingUsers:empty?[]:[user],communityFriends:empty?[]:[{...user,lastMessage:'这是一条用于检查长消息预览的测试消息'.repeat(12)}],communityChatMessages:[],communityActivityItems:empty?[]:fixture.communityActivityItems,communityUserPosts:empty?[]:fixture.communityPosts,communityUserListings:empty?[]:fixture.marketListings};
     communityLoading=messageUnreadLoading=communityChatLoading=false;cloudHydrationComplete=true;forceUpdateState={required:false};pendingPageEnterMotion=false;
     if(route==='communityAdd'){
       ensureCommunityDraftOwner();window.TurtleDiscovery?.resetDraft();communityDraftTitle='';communityDraftText='';communityDraftTopic='question';communityDraftMediaItems=[{type:'image',previewUrl:fixture.__image},{type:'image',previewUrl:fixture.__image}];
     }
     render();
   },{fixture,route,empty,error,loading});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 }
 try{
   await page.goto(engine==='webkit'?'https://polish.test/index.html':pathToFileURL(path.join(local,'index.html')).href);
   assert.equal(await page.evaluate(()=>window.TurtleCommunityPolish?.revision),'20261025-pages');
   const routes=['community','communityPostDetail','communityAdd','communityProfile','following','communityFriends','communityActivity','messages'],layouts=[];
   for(const width of [320,390,430,1180])for(const theme of ['teal','dark'])for(const route of routes){
     await page.setViewportSize({width,height:844});await seed(route);await page.evaluate(theme=>{state.themeColor=theme;render();},theme);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${route}/${width}/${theme}`);layouts.push({route,width,theme});
   }
   await seed('communityPostDetail');await page.evaluate(()=>{state.communityPosts=state.communityPosts.map(post=>({...post,comments:[]}));render();});
   const emptyReply=page.locator('.forum-reply-section > .empty');
   const compact=await emptyReply.evaluate(el=>el.getBoundingClientRect().height);
   const originalHeight=await page.evaluate(()=>{const sheet=document.querySelector('link[href*="community-page-polish.css"]').sheet;sheet.disabled=true;const height=document.querySelector('.forum-reply-section > .empty').getBoundingClientRect().height;sheet.disabled=false;return height;});
   assert.ok(compact<originalHeight-15,JSON.stringify({compact,originalHeight}));
   assert.equal(await page.locator('.forum-reply-composer button[type="submit"]').count(),0);
   await page.setViewportSize({width:390,height:844});await seed('communityAdd');
   assert.equal(await page.locator('[data-community-title-count]').textContent(),'0/31');
   assert.equal(await page.locator('.community-compose-submit').isDisabled(),true);
   await page.locator('#communityPostForm [name="title"]').fill('养龟');
   assert.ok((await page.locator('[data-community-title-hint]').textContent()).includes('3'));
   await page.locator('#communityPostForm [name="title"]').fill('果核龟换水日常记录');
   assert.equal(await page.locator('.community-compose-submit').isDisabled(),false);
   const body=page.locator('#communityPostForm [name="content"]');await body.fill('中文草稿🐢');
   assert.equal(await page.locator('[data-community-body-count]').textContent(),'5/2000');
   const focus=await body.evaluate(el=>({active:document.activeElement===el,value:el.value}));assert.deepEqual(focus,{active:true,value:'中文草稿🐢'});
   assert.ok((await page.locator('.community-draft-media-tip').textContent()).includes('2/9'));
   assert.equal(await page.locator('.community-editor-prompts').getAttribute('open'),null);
   await page.locator('.community-editor-prompts > summary').click();assert.equal(await page.locator('[data-discovery-prompt="question"]').isVisible(),true);
   await page.screenshot({path:path.join(root,'output/community-polish-editor'+(engine==='webkit'?'-webkit':'')+'.png'),fullPage:true});
   await body.fill('');await page.locator('[data-web-community-action="template"]').click();assert.ok((await body.inputValue()).includes('品种与体重'));
   for(const route of ['communityProfile','following','communityFriends','communityActivity','messages']){
     await seed(route,{empty:true});const button=page.locator('.community-polished-empty [data-page="community"]').first();await button.click();assert.equal(await page.evaluate(()=>state.page),'community',route+' empty action');
   }
   await seed('communityProfile',{empty:true});await page.locator('[data-profile-content-tab="listings"]').click();assert.equal(await page.locator('.community-polished-empty [data-page="market"]').count(),1);
   await seed('communityActivity',{empty:true,error:true});assert.equal(await page.locator('[data-community-activity-more]').count(),1);assert.equal(await page.locator('.community-polished-empty').count(),0);
   await seed('communityActivity',{empty:true,loading:true});assert.equal(await page.locator('.community-polished-empty').count(),0);
   assert.deepEqual(mutations,[],'UI checks must never publish or message');assert.deepEqual(errors,[]);
   recordResult(root,'community-page-polish.json',{installed,entryProtocol:engine==='webkit'?'https: (local bytes)':'file:',layouts,emptyActions:5,editorCounters:true,retryPreserved:true,errors,mutations,syntheticOnly:true});
   console.log(`PASS: ${layouts.length} page layouts, editor counters/focus/readiness, collapsed prompts, media count, five empty-page actions, profile tabs and activity error/loading preservation. File preview=${!installed}.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
