'use strict';
// Tests the exact frozen browser package, without native bridges or real accounts.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launchBrowser,recordResult}=require('./browser-test-engine.cjs'),{validate}=require('./deploy-web-release-138.cjs');
const root=path.resolve(__dirname,'..'),pkg=JSON.parse(fs.readFileSync(path.join(root,'deploy/web-release-138/release.json'))),{files,index}=validate(pkg),fixture=require('./ui-audit-fixture.cjs')();
(async()=>{
 const browser=await launchBrowser(),errors=[],requests=[],layouts=[];
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));
 const post={id:'web-entry-post',title:'合成网页评论测试',content:'没有真实账号数据',circleId:'mud',topic:'daily',authorId:'friend-b',authorName:'合成龟友',comments:[],mediaItems:[]};
 let failed=false;
 await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.hostname!=='web-entry.test')return route.abort();
   if(url.pathname==='/')return route.fulfill({body:index,contentType:'text/html'});
   if(url.pathname.startsWith('/assets/'+pkg.revision+'/')){const name=url.pathname.slice(('/assets/'+pkg.revision+'/').length),bytes=files.get(name);return bytes?route.fulfill({body:bytes,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'image/svg+xml'}):route.fulfill({status:404,body:''});}
   if(url.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:'window.TURTLE_API_BASE_URL="https://web-entry.test";'});
   if(url.pathname.startsWith('/api/')){
     const body=route.request().postDataJSON();
     if(['/api/community/comment','/api/community/chat/send'].includes(url.pathname)){
       requests.push({path:url.pathname,body});if(failed)return route.fulfill({status:503,json:{ok:false,message:'合成发送失败'}});
       if(url.pathname.endsWith('/comment'))return route.fulfill({json:{ok:true,posts:[{...post,comments:[{id:'synthetic-comment',authorName:'我',content:body.content}]}]}});
       return route.fulfill({json:{ok:true,friend:{id:'friend-b',name:'合成龟友'},messages:[{id:'synthetic-message',mine:true,content:body.content}],conversationState:{clearVersions:{},hiddenIds:[]}}});
     }
     return route.fulfill({json:{ok:true,minimumBuild:0,latestBuild:0,friends:[],messages:[],posts:[],items:[],notifications:[]}});
   }
   const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({body:fs.readFileSync(file),contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'})[path.extname(file)]||'application/octet-stream'});
 });
 async function seed(route='communityPostDetail',themeColor='teal'){
   failed=false;
   await page.evaluate(({fixture,post,route,themeColor})=>{
     window.dismissTradeIntro?.();window.TurtleReleaseNotes?.cancel();state={...initialState,...emptyAccountData(),...fixture,page:route,themeColor,loggedInPhone:'13000000000',cloudToken:'synthetic-web-only',policyConsentRequired:false,communityPosts:[post],selectedCommunityPostId:post.id,communityFeedInitialized:true,communityFeedHasMore:false,communityChatToolsOpen:false,communityFriendsInitialized:true,selectedCommunityFriendId:'friend-b',selectedCommunityFriend:{id:'friend-b',name:'合成龟友'},communityFriends:[{id:'friend-b',name:'合成龟友'}],communityChatMessages:[],communityChatTextOutbox:{}};
     marketChatDraft='';communityReplyTarget=null;communityLoading=communityChatLoading=messageUnreadLoading=false;cloudHydrationComplete=true;forceUpdateState={required:false};communityLastLoadedAt=Date.now();pendingPageEnterMotion=false;edgeBackSnapshots=[];render();scrollTo(0,0);
   },{fixture,post,route,themeColor});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await field().fill('');
 }
 const field=()=>page.locator('.turtle-emote-enabled input[name="content"]');
 async function open(){await page.locator('[data-emote-toggle]').click();await page.locator('#turtleEmotePanel').waitFor({state:'visible'});}
 try{
   await page.goto('https://web-entry.test/?skipIntro=1');await seed();
   assert.equal(await page.evaluate(()=>typeof Capacitor),'undefined');
   assert.equal(await page.locator('.forum-reply-composer > button').count(),1);assert.equal(await page.locator('.forum-reply-composer button[type="submit"]').count(),0);assert.equal(await page.locator('.forum-reply-composer input + [data-emote-toggle]').count(),1);
   await field().press('Enter');await field().fill('   ');await field().press('Enter');assert.equal(requests.length,0);
   await open();await page.locator('[data-turtle-emote="smile"]').click();failed=true;await page.locator('[data-emote-send]').click();await page.waitForFunction(()=>document.querySelector('.forum-reply-composer').getAttribute('aria-busy')==='false');assert.equal(await field().inputValue(),'   [微笑]');
   failed=false;await page.locator('[data-emote-send]').click();await page.waitForFunction(()=>document.querySelector('.forum-reply-composer input').value==='');assert.equal(await page.locator('.forum-floor-content .turtle-emote').count(),1);assert.ok((await page.locator('.forum-floor-content .turtle-emote').getAttribute('src')).startsWith('/assets/'+pkg.revision+'/emotes/'));
   await seed('communityChat');await open();await page.locator('[data-turtle-emote="heart"]').click();await page.locator('[data-emote-send]').click();await page.waitForFunction(()=>communityChatTextSending.size===0&&marketChatDraft==='');assert.equal(requests.at(-1).body.content,'[爱心]');assert.equal(await page.locator('.community-chat-text-message .turtle-emote').count(),1);
   for(const route of ['communityPostDetail','communityChat'])for(const width of [280,320,390,430])for(const theme of ['teal','dark']){
     await page.setViewportSize({width,height:844});await seed(route,theme);await open();
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${route}/${width}/${theme}`);
     const position=await page.evaluate(()=>{const f=document.querySelector('.turtle-emote-enabled').getBoundingClientRect(),p=document.getElementById('turtleEmotePanel').getBoundingClientRect();return {gap:Math.abs(f.bottom-p.top),left:f.left,right:f.right};});
     assert.ok(position.gap<=1&&position.left>=-1&&position.right<=width+1,JSON.stringify(position));layouts.push({route,width,theme});
   }
   // Verify fixed portrait and landscape thumbnails using this exact published package.
   await page.evaluate(({fixture})=>{
     const samples=[[300,400],[160,480],[400,300],[900,180]];
     state={...initialState,...emptyAccountData(),...fixture,page:'community',themeColor:'teal',policyConsentRequired:false,communityPosts:samples.map(([w,h],i)=>{const url='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"></svg>');return {...fixture.communityPosts[0],id:'photo-'+i,createdAt:new Date(Date.UTC(2026,9,25,0,0,10-i)).toISOString(),photos:[url],media:[{type:'image',url}],mediaItems:[{type:'image',url}]};}),communityFeedInitialized:true,communityFeedHasMore:false};communityLoading=false;render();
   },{fixture});
   await page.setViewportSize({width:1180,height:844});
   await page.locator('.forum-thread-media.is-single img').evaluateAll(imgs=>Promise.all(imgs.map(img=>{img.loading='eager';return img.decode();})));
   await page.waitForFunction(()=>[...document.querySelectorAll('.forum-thread-media.is-single > button')].every(b=>b.dataset.communityPhotoShape&&b.dataset.communityPhotoShape!=='pending'));
   const sizes=await page.locator('.forum-thread-media.is-single > button').evaluateAll(nodes=>nodes.map(b=>{const r=b.getBoundingClientRect(),m=b.parentElement.getBoundingClientRect();return [r.width,r.height,r.left-m.left,getComputedStyle(b.querySelector('img')).borderRadius];}));
   assert.equal(sizes.length,4);for(let i=0;i<4;i++){assert.ok(Math.abs(sizes[i][0]-(i<2?195:320))<1);assert.ok(Math.abs(sizes[i][1]-(i<2?260:240))<1);assert.ok(Math.abs(sizes[i][2])<1);assert.equal(sizes[i][3],'0px');}
   assert.ok(files.has('community-page-polish.js')&&files.has('community-page-polish.css')&&files.has('discovery-workspace.css'));
   assert.deepEqual(errors,[]);recordResult(root,'web-release-138-exact-package.json',{revision:pkg.revision,layouts,requests:requests.length,errors,syntheticOnly:true,nativeBridge:false});
   console.log(`PASS exact web package ${pkg.revision}: browser-only comments, retry, emote paths, private messages and ${layouts.length} layouts.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
