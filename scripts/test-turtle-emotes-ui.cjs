'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launchBrowser,recordResult}=require('./browser-test-engine.cjs');
const emotes=require('../assets/turtle-emotes.js'),fixture=require('./ui-audit-fixture.cjs')();
const browserWeb=process.env.EMOTE_WEB_RELEASE==='1';
const root=path.resolve(__dirname,'..'),bundle=path.join(root,'www'),platform=browserWeb?'web':process.env.EMOTE_PLATFORM||'ios';
assert.ok(['ios','android','web'].includes(platform));
const webPackage=browserWeb?JSON.parse(fs.readFileSync(path.join(root,'deploy/web-comment-entry/release.json'),'utf8')):null;
const webFiles=webPackage?require('./deploy-web-comment-entry.cjs').validate(webPackage).files:null;
assert.equal(emotes.entries.length,114); assert.equal(new Set(emotes.entries.map(x=>x.id)).size,114);
assert.equal(new Set(emotes.entries.map(x=>x.token)).size,114);
assert.equal(fs.readFileSync(path.join(root,'assets/comment-smile-entry.svg'),'utf8').trim(),emotes.entryIcon);
assert.equal(new Set(emotes.entries.map(x=>fs.readFileSync(path.join(root,x.src),'utf8'))).size,114);
for(const item of emotes.entries) {
  const svg=fs.readFileSync(path.join(root,item.src),'utf8'); assert.match(svg,/<svg[^>]+viewBox="0 0 96 96"/);
  assert.doesNotMatch(svg,/<script|onload=|href=|<image|<foreignObject/i);
  assert.equal(emotes.previous('文字'+item.token,2+item.token.length),2);
}
assert.equal(emotes.previous('家👨‍👩‍👧‍👦','家👨‍👩‍👧‍👦'.length),1);
assert.equal(emotes.only('[微笑] [爱心]'),true); assert.equal(emotes.only('文字[微笑]'),false);
const post={id:'emote-post',authorId:'friend-b',authorName:'合成龟友',title:'合成表情讨论',topic:'daily',circleId:'mud',content:'仅用于本地交互测试',createdAt:'2026-10-25T00:00:00Z',mediaItems:[],comments:[{id:'emote-comment',authorId:'friend-b',authorName:'合成龟友',content:'一起养龟[微笑][爱心]<script>不执行</script>',createdAt:'2026-10-25T01:00:00Z'}]};
(async()=>{
 const browser=await launchBrowser(),results=[],layouts=[],errors=[],requests=[];
 const output=path.join(root,'output/turtle-emotes',platform);fs.mkdirSync(output,{recursive:true});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(7000);
 await page.addInitScript(platform=>{
   window.emoteNativeCalls=[];
   if(platform==='web')return;
   const hide=async()=>{emoteNativeCalls.push('hide');if(platform==='ios')window.dispatchEvent(new Event('keyboardDidHide'));else{window.TURTLE_ANDROID_KEYBOARD_VISIBLE=false;window.syncMobileKeyboardUI?.();}};
   const app={getInfo:async()=>({build:'137'}),getLaunchUrl:async()=>({}),addListener:async()=>({remove(){}})};
   const push={checkPermissions:async()=>({receive:'denied'}),addListener:async()=>({remove(){}})};
   const plugins={App:app,PushNotifications:push,TurtleAndroidPush:push,TurtleAndroidWindow:{hideKeyboard:hide,setTheme:async()=>{},getDisplayMetrics:async()=>({}),addListener:async()=>({remove(){}})},...(platform==='ios'?{Keyboard:{hide,setAccessoryBarVisible:async({isVisible})=>{emoteNativeCalls.push(isVisible);}}}:{})};
   window.Capacitor={getPlatform:()=>platform,isNativePlatform:()=>true,isPluginAvailable:name=>Boolean(plugins[name]),Plugins:plugins,registerPlugin:name=>plugins[name]||{}};
 },platform);
 let posts=[structuredClone(post)],fail=false;
 await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.hostname!=='emotes.test')return route.abort();
   if(webPackage&&url.pathname==='/')return route.fulfill({contentType:'text/html',body:Buffer.from(webPackage.index.base64,'base64')});
   if(webPackage&&url.pathname.startsWith('/assets/'+webPackage.revision+'/')){
     const name=url.pathname.slice(('/assets/'+webPackage.revision+'/').length),bytes=webFiles.get(name);
     return bytes?route.fulfill({body:bytes,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'image/svg+xml'}):route.fulfill({status:404,body:''});
   }
   if(url.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:'window.TURTLE_API_BASE_URL="https://emotes.test";window.TURTLE_APP_BUILD=137;'});
   if(url.pathname.startsWith('/api/')){
     const body=route.request().postDataJSON();
     if(['/api/community/comment','/api/community/chat/send'].includes(url.pathname)){
       requests.push({path:url.pathname,body});
       if(fail)return route.fulfill({status:503,json:{ok:false,message:'合成发送失败'}});
       if(url.pathname.endsWith('/comment')){posts=posts.map(p=>({...p,comments:[...p.comments,{id:'sent-'+requests.length,content:body.content,authorId:'audit-me',authorName:'我',replyToCommentId:body.replyToCommentId||'',createdAt:new Date().toISOString()}]}));return route.fulfill({json:{ok:true,posts}});}
       return route.fulfill({json:{ok:true,friend:{id:'friend-b',name:'合成龟友'},messages:[{id:'sent-'+requests.length,mine:true,rawContent:body.content,content:body.content,createdAt:new Date().toISOString()}],conversationState:{clearVersions:{},hiddenIds:[]}}});
     }
     return route.fulfill({json:{ok:true,minimumBuild:0,latestBuild:0,posts:[],friends:[],messages:[],notifications:[],items:[]}});
   }
   const file=path.resolve(bundle,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
   if(!file.startsWith(bundle+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   let bytes=fs.readFileSync(file);
   if(platform==='android'&&url.pathname==='/app.js')bytes=Buffer.from(require('./android/adapt-shared-asset.cjs')('app.js',bytes.toString(),{androidBuild:28,androidVersion:'1.1.9',updateChannel:'store'}));
   if(platform==='android'&&url.pathname==='/')bytes=Buffer.from(bytes.toString().replace('</head>','<style>'+fs.readFileSync(path.join(root,'scripts/android/layout.css'),'utf8')+'</style></head>'));
   return route.fulfill({body:bytes,contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'})[path.extname(file)]||'application/octet-stream'});
 });
 async function seed(pageName='communityPostDetail',changes={}){
   fail=false;posts=[structuredClone(post)];
   await page.evaluate(({fixture,post,pageName,changes})=>{
     window.dismissTradeIntro?.();window.TurtleReleaseNotes?.cancel();
     state={...initialState,...emptyAccountData(),...fixture,loggedInPhone:'13000000000',cloudToken:'synthetic-emotes',policyConsentRequired:false,page:pageName,communityPosts:[post],selectedCommunityPostId:post.id,
       communityFeedInitialized:true,communityFeedHasMore:false,communityFriendsInitialized:true,selectedCommunityFriendId:'friend-b',selectedCommunityFriend:{id:'friend-b',name:'合成龟友'},communityFriends:[{id:'friend-b',name:'合成龟友'}],
       communityChatMessages:[{id:'earlier',content:'收到[微笑]，一起加油[强]',mine:false,createdAt:'2026-10-25T00:00:00Z'}],communityChatToolsOpen:false,communityChatTextOutbox:{},...changes};
     marketChatDraft='';communityReplyTarget=null;communityLoading=messageUnreadLoading=communityChatLoading=false;cloudHydrationComplete=true;communityLastLoadedAt=Date.now();
     forceUpdateState={required:false};pendingPageEnterMotion=false;edgeBackSnapshots=[];window.emoteNotes=[];toast=t=>emoteNotes.push(t);render();scrollTo(0,0);
   },{fixture,post,pageName,changes});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await field().fill('');
 }
 const field=()=>page.locator('.turtle-emote-enabled input[name="content"]');
 const panel=()=>page.locator('#turtleEmotePanel');
 async function open(){await page.locator('[data-emote-toggle]').click();await panel().waitFor({state:'visible'});}
 const choose=id=>page.locator(`[data-turtle-emote="${id}"]`).click();
 async function check(name,run){await run();assert.deepEqual(errors,[]);results.push(name);}
 try{
   await page.goto('https://emotes.test/?skipIntro=1');await seed();
   await check('Original vectors, safe rich text and known-token-only rendering',async()=>{
     await page.evaluate(()=>Promise.all(TurtleEmotes.entries.map(async item=>{const image=new Image();image.src=item.src;await image.decode();if(!image.naturalWidth)throw Error(item.id);})));
     assert.equal(await page.locator('.forum-floor-content p .turtle-emote').count(),2);
     assert.match(await page.locator('.forum-floor-content p').innerText(),/<script>不执行<\/script>/);
     const html=await page.evaluate(()=>TurtleEmotes.render('<img src=x onerror=alert(1)>[微笑][未知]'));
     assert.match(html,/&lt;img/);assert.match(html,/\[未知\]/);assert.equal((html.match(/<img /g)||[]).length,1);
     await page.locator('.forum-floor-content p img').first().click();assert.equal(await page.locator('.image-preview-overlay').count(),0);
   });
   await check('Comment bar contains only input and original smile; keyboard send blocks empty text and IME confirmation',async()=>{
     await seed();
     const form=page.locator('.forum-reply-composer');
     assert.equal(await form.locator('button').count(),1);assert.equal(await form.locator('button[type="submit"], [data-toggle-community-chat-tools]').count(),0);
     assert.equal(await form.locator('input + [data-emote-toggle]').count(),1);assert.equal(await field().getAttribute('enterkeyhint'),'send');
     await form.screenshot({path:path.join(output,'comment-input-entry-empty.png')});
     const before=requests.filter(item=>item.path==='/api/community/comment').length;
     await field().press('Enter');await field().fill('   ');await field().press('Enter');
     assert.equal(requests.filter(item=>item.path==='/api/community/comment').length,before);
     await field().fill('中文输入确认');
     await form.screenshot({path:path.join(output,'comment-input-entry-filled.png')});
     await field().evaluate(el=>{
       el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));
       el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
       el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
       el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
     });
     assert.equal(requests.filter(item=>item.path==='/api/community/comment').length,before);
     await field().press('Enter');await page.waitForFunction(()=>document.querySelector('.forum-reply-composer input').value==='');
     assert.equal(requests.filter(item=>item.path==='/api/community/comment').length,before+1);
     assert.equal(requests.at(-1).body.content,'中文输入确认');await seed();
   });
   await check('App-owned emote send is gray and disabled for empty content, green for text or emotes',async()=>{
     for(const themeColor of ['teal','dark']){
       await seed('communityPostDetail',{themeColor});await open();
       const send=page.locator('[data-emote-send]');assert.equal(await send.isDisabled(),true);
       const empty=await send.evaluate(el=>getComputedStyle(el).backgroundColor);
       assert.equal(empty,themeColor==='dark'?'rgb(53, 53, 53)':'rgb(230, 230, 230)');
       await choose('smile');assert.equal(await send.isDisabled(),false);
       const active=await send.evaluate(el=>getComputedStyle(el).backgroundColor);assert.notEqual(active,empty);
       await page.locator('[data-emote-delete]').click();assert.equal(await send.isDisabled(),true);
       assert.equal(await send.evaluate(el=>getComputedStyle(el).backgroundColor),empty);
     }
     await seed();
   });
   await check('Emote panel replaces software keyboard, inserts at selection and restores the same input',async()=>{
     await field().fill('一起养龟快乐');
     await field().evaluate(el=>{el.setSelectionRange(2,4);window.emoteInputBefore=el;});
     await open();await choose('smile');await choose('heart');
     assert.equal(await field().inputValue(),'一起[微笑][爱心]快乐');
     const hideCalls=await page.evaluate(()=>emoteNativeCalls.filter(x=>x==='hide').length);
     if(browserWeb)assert.equal(hideCalls,0);else assert.ok(hideCalls>0);
     await page.locator('[data-emote-toggle]').click();assert.equal(await panel().isVisible(),false);
     assert.equal(await field().evaluate(el=>document.activeElement===el&&el===emoteInputBefore),true);
     assert.equal(await field().evaluate(el=>el.selectionStart),'一起[微笑][爱心]'.length);
   });
   await check('Recent expressions, empty input send state, whole-token and grapheme deletion',async()=>{
     await field().fill('[微笑]');await open();await page.locator('[data-emote-category="recent"]').click();
     assert.ok(await page.locator('[data-turtle-emote="smile"]').count());
     await page.locator('[data-emote-delete]').click();assert.equal(await field().inputValue(),'');assert.equal(await page.locator('[data-emote-send]').isDisabled(),true);
     await page.locator('[data-emote-toggle]').click();await field().fill('家👨‍👩‍👧‍👦');await open();await page.locator('[data-emote-delete]').click();assert.equal(await field().inputValue(),'家');
     await page.locator('[data-emote-toggle]').click();await field().fill('文字[爱心]');await page.keyboard.press('Backspace');assert.equal(await field().inputValue(),'文字');
   });
   await check('Text limits and comment failure preserve draft and reply recipient',async()=>{
     await field().fill('a'.repeat(498));await open();await page.locator('[data-emote-category="all"]').click();await choose('smile');assert.equal((await field().inputValue()).length,498);assert.match(await page.evaluate(()=>emoteNotes.at(-1)),/最多/);
     await page.locator('[data-emote-toggle]').click();await field().fill('喜欢这只龟');await page.locator('button[data-reply-community-comment="emote-comment"]').click();await open();await choose('heart');fail=true;
     await page.locator('[data-emote-send]').click();await page.waitForFunction(()=>document.querySelector('.forum-reply-composer').getAttribute('aria-busy')==='false');
     assert.equal(await field().inputValue(),'喜欢这只龟[爱心]');assert.equal(await page.evaluate(()=>communityReplyTarget.commentId),'emote-comment');assert.equal(await page.locator('[data-emote-send]').isDisabled(),false);
     fail=false;await page.locator('[data-emote-send]').click();await page.waitForFunction(()=>document.querySelector('.forum-reply-composer input').value==='');
     assert.equal(await page.locator('.forum-floor-content p .turtle-emote').count(),3);assert.equal(requests.at(-1).body.content,'喜欢这只龟[爱心]');assert.doesNotMatch(requests.at(-1).body.content,/<img|data:/);
   });
   await check('Private messages use the existing send API, show original art and retain failure drafts',async()=>{
     await seed('communityChat');assert.equal(await page.locator('.community-chat-text-message .turtle-emote').count(),2);
     if(platform==='ios')assert.equal(await page.evaluate(()=>emoteNativeCalls.filter(x=>typeof x==='boolean').at(-1)),false);
     await open();await choose('smile');await choose('heart');fail=true;await page.locator('[data-emote-send]').click();
     await page.waitForFunction(()=>communityChatTextSending.size===0&&emoteNotes.length>0);assert.equal(await field().inputValue(),'[微笑][爱心]');
     fail=false;await page.locator('[data-emote-send]').click();await page.waitForFunction(()=>communityChatTextSending.size===0&&marketChatDraft==='');
     assert.equal(requests.at(-1).path,'/api/community/chat/send');assert.equal(requests.at(-1).body.content,'[微笑][爱心]');assert.ok(requests.at(-1).body.clientMessageId);
     assert.equal(await page.locator('.community-chat-text-message.turtle-emote-only .turtle-emote').count(),2);
     await page.locator('.community-chat-text-message img').first().click();assert.equal(await page.locator('.image-preview-overlay').count(),0);
   });
   await check('Chat refresh retains the open emote grid, its scroll and the text draft',async()=>{
     await field().fill('轮询时保留草稿[微笑]');await open();
     await page.evaluate(()=>{window.emoteGridBefore=document.querySelector('.turtle-emote-grid');emoteGridBefore.scrollTop=160;});
     await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     await page.evaluate(()=>render());
     await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     assert.equal(await page.evaluate(()=>emoteGridBefore===document.querySelector('.turtle-emote-grid')),true);
     assert.ok((await page.locator('.turtle-emote-grid').evaluate(el=>el.scrollTop))>=159);
     assert.equal(await field().inputValue(),'轮询时保留草稿[微笑]');assert.equal(await panel().isVisible(),true);
   });
   await check('Media tools, keyboard and emote grid share one slot; route/account changes close old panels',async()=>{
      await page.locator('[data-toggle-community-chat-tools]').click();
     assert.equal(await panel().isVisible(),false);assert.equal(await page.evaluate(()=>state.communityChatToolsOpen),true);
     await open();assert.equal(await page.evaluate(()=>state.communityChatToolsOpen),false);assert.equal(await panel().isVisible(),true);
     await page.evaluate(()=>setState({page:'messages'},{skipCloud:true}));assert.equal(await page.locator('#turtleEmotePanel').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('turtle-emote-open')),false);
     await seed('communityChat');await open();await page.evaluate(()=>setState({selectedCommunityFriendId:'friend-c',selectedCommunityFriend:{id:'friend-c',name:'另一个合成用户'}},{skipCloud:true}));assert.equal(await panel().isVisible(),false);
     await open();await page.evaluate(()=>setState({loggedInPhone:'13000000001',cloudToken:'new-synthetic-owner'},{skipCloud:true}));assert.equal(await panel().isVisible(),false);
   });
   for(const routeName of ['communityPostDetail','communityChat'])for(const width of [280,320,390,430])for(const themeColor of ['teal','dark']){
     await page.setViewportSize({width,height:844});await seed(routeName,{themeColor});await open();
     await field().evaluate(el=>{el.value='[微笑]';el.dispatchEvent(new Event('input',{bubbles:true}));});
     const problems=await page.evaluate(()=>{
       const out=[],form=document.querySelector('.turtle-emote-enabled'),panel=document.getElementById('turtleEmotePanel'),f=form.getBoundingClientRect(),p=panel.getBoundingClientRect();
       if(document.documentElement.scrollWidth>innerWidth+1)out.push('page overflow');
       if(Math.abs(f.bottom-p.top)>1)out.push('gap between input and panel: '+f.bottom+'/'+p.top);
       for(const element of [form,panel,...form.querySelectorAll('button:not([hidden]),input:not([hidden])')]){
         if(!element.getClientRects().length)continue;const r=element.getBoundingClientRect();if(r.left<-.5||r.right>innerWidth+.5)out.push(element.tagName+' outside phone');
       }
       if(form.querySelector('input[name="content"]').getBoundingClientRect().width<100)out.push('input too narrow');
       const grid=panel.querySelector('.turtle-emote-grid');if(grid.clientHeight<70)out.push('grid too short');
       const send=panel.querySelector('[data-emote-send]');if(getComputedStyle(send).backgroundColor==='rgba(0, 0, 0, 0)')out.push('send button lacks visible background');
       const icon=grid.querySelector('img');if(getComputedStyle(icon).backgroundColor!=='rgba(0, 0, 0, 0)')out.push('emote transparency overridden');
       return out;
     });
     assert.deepEqual(problems,[],`${routeName}/${width}/${themeColor}`);layouts.push({routeName,width,themeColor});
     if(width===390){await page.locator('.turtle-emote-grid img').first().evaluate(img=>img.decode());await page.screenshot({path:path.join(output,`${routeName}-${themeColor}.png`)});}
   }
   recordResult(root,`turtle-emotes-${platform}.json`,{results,layouts,errors,expressions:114,syntheticOnly:true,nativeDevice:false});
   console.log(`PASS ${platform}: 114 original vectors, ${results.length} emote workflows and ${layouts.length} phone layouts.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
