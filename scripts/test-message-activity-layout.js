const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const extract=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return source.slice(i,j)};
async function main(){
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.setContent('<html><body><div id="app" class="phone-shell"></div></body></html>');
  for(const file of ['styles.css','chat-tools.css','dark-surface-audit.css']) await page.addStyleTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  const photo='data:image/jpeg;base64,'+fs.readFileSync(path.join(root,'assets/species/ABQ.jpg')).toString('base64');
  await page.addScriptTag({content:`
   var $app=document.querySelector('#app'), edgeBackSnapshots=[],communityNotificationReadRevision=0,communityNotificationReadQueue=Promise.resolve(),communityActivityRequestId=0;
   var messageUnreadLoading=false,messageUnreadLastLoadedAt=0,messageUnreadRenderRequested=false,CONFIGURED_SMS_BACKEND=true;
   var state={page:'messages',loggedInPhone:'owner',communityFriends:[{id:'friend1',name:'一起养龟',lastMessage:'你好，这只龟还在吗？',lastMessageAt:new Date().toISOString(),unreadCount:3},{id:'friend2',name:'小满',lastMessage:'谢谢！',unreadCount:0}],communityNotifications:[],messageUnreadCount:6};
   var fixtures=[{id:'comment',type:'comment',actorName:'小满',preview:'这只龟的背纹真好看，你养了多久？',postTitle:'晒晒小龟',postId:'post1',createdAt:new Date().toISOString(),read:false},{id:'like',type:'like',actorName:'阿航',postTitle:'晒晒小龟',postId:'post1',createdAt:new Date(Date.now()-60000).toISOString(),read:false},{id:'follow',type:'follow',actorName:'新壳友',actorId:'newFriend',createdAt:new Date(Date.now()-120000).toISOString(),read:false}].map(x=>({...x,actorAvatar:${JSON.stringify(photo)},postThumbnail:x.type==='follow'?'':${JSON.stringify(photo)}}));
   var calls=[],failRead=false,delayList=false,pendingList=[],latestToast='';
   function currentCloudToken(){return 'token'} function requireLogin(){return !!state.loggedInPhone} function communityAuthPayload(x={}){return {phone:state.loggedInPhone,...x}}
   function saveState(){} function syncPersistentBottomNav(){} function messageListSwipeIsActive(){return false} function deferMessageListRefreshWhileDragging(){return false}
   function mergeCommunityFriends(x){return x} function buildEdgeBackPreviewHtml(x){return x}
   function summary(){const out={};for(const g of ['interactions','follows']){const r=fixtures.filter(x=>g==='follows'?x.type==='follow':x.type!=='follow');out[g]={total:r.length,unread:r.filter(x=>!x.read).length,likeCount:r.filter(x=>x.type==='like').length,commentCount:r.filter(x=>x.type==='comment').length,latest:r[0]||null}}return out}
   function unread(){return {friends:state.communityFriends,notifications:fixtures.map(x=>({...x})),notificationSummary:summary(),totalUnreadCount:3+fixtures.filter(x=>!x.read).length}}
   async function apiPost(url,body){calls.push({url,body});
    if(url.endsWith('/notifications')){if(delayList)await new Promise(r=>pendingList.push(r));const rows=fixtures.filter(x=>body.group==='follows'?x.type==='follow':x.type!=='follow');return {notifications:rows.slice(body.offset,body.offset+50).map(x=>({...x})),nextOffset:rows.length,hasMore:false}}
    if(body.readNotificationIds){if(failRead)throw Error('offline');fixtures.forEach(x=>{if(body.readNotificationIds.includes(x.id))x.read=true})}
    return unread();
   }
   function toast(v){latestToast=v} function latestCommunityMessagePreview(){return null} function isCommunityPreviewAtLeastAsNew(){return true}
   function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
   function apiAssetUrl(x){return x} function platformAdminBadge(){return ''} function accountAvatarSource(x){return x}
   function spaceAvatarTopButton(){return ''} function platformServiceTopButton(){return ''} function guestLoginSlot(){return ''} function bottomNav(){return ''}
   ${extract('function topbar(', 'function tabIcon(')}
   function formatMessagePreviewTime(){return '刚刚'}
   ${extract('function applyTheme(', 'function accountSpeciesList(')}
   ${extract('function communityAvatar(', 'function marketSellerAvatar(')}
   ${extract('function communityNotificationCopy(', 'function platformAdminBadge(')}
   ${extract('async function refreshMessageUnread(', 'function markCommunityConversationReadLocally(')}
   ${extract('function patchVisibleMessageList(', 'function bindCommunityChatTextMessageMenus(').split('function patchMessageListInRoot')[0]}
   ${extract('function patchMessageListInRoot(', 'function ')}
   function render(){ $app.innerHTML=state.page==='messages'?pageMessages():pageCommunityActivity();bindMessageActivityEntries();document.querySelector('[data-community-activity-more]')?.addEventListener('click',()=>loadCommunityActivity()); }
   function setState(patch){state={...state,...patch};render()}
   state.communityNotifications=fixtures.map(x=>({...x}));state.communityNotificationSummary=summary();state.themeColor='dark';applyTheme();render();
  `});
  assert.equal(await page.locator('.message-activity-row[data-open-community-activity="interactions"]').count(),1);
  assert.equal(await page.locator('.message-notification-row').count(),0);
  assert.equal(await page.locator('.message-friend-row').count(),2);
  assert.equal(await page.locator('[data-open-community-activity="interactions"] .message-activity-badge').textContent(),'2');
  assert.match(await page.locator('.message-activity-copy').first().innerText(),/小满 评论了你的帖子/);
  // Poll updates the summary while retaining each existing chat node.
  assert.ok(await page.evaluate(async()=>{const row=document.querySelector('.message-friend-row');fixtures[0].actorName='最新壳友';await refreshMessageUnread(true);return row===document.querySelector('.message-friend-row')&&calls.every(c=>!c.body.markNotificationsRead&&!c.body.readNotificationIds)}));
  for(const theme of ['dark','teal'])for(const width of [320,390,768]){
   await page.setViewportSize({width,height:844});await page.evaluate(theme=>{state.themeColor=theme;applyTheme()},theme);
   const metric=await page.evaluate(()=>{const row=document.querySelector('.message-activity-row'),badge=row.querySelector('i'),icon=row.querySelector('.message-activity-icon'),copy=row.querySelector('.message-activity-copy');return {overflow:document.documentElement.scrollWidth>innerWidth,badgeRight:badge.getBoundingClientRect().left>=copy.getBoundingClientRect().right,bg:getComputedStyle(badge).backgroundColor,icon:getComputedStyle(icon).backgroundColor,color:getComputedStyle(badge).color}});
   assert.equal(metric.overflow,false);assert.equal(metric.badgeRight,true);assert.equal(metric.bg,'rgb(250, 59, 86)');assert.equal(metric.icon,'rgb(255, 56, 133)');assert.equal(metric.color,'rgb(255, 255, 255)');
   if(width===390)await page.screenshot({path:path.join(root,'build',`message-activity-${theme}.png`)});
  }
  // A preserved main-page snapshot receives the read-count patch without rebuilding chats.
  await page.evaluate(()=>{const template=document.createElement('template');template.innerHTML=$app.innerHTML;edgeBackSnapshots=[{page:'messages',html:$app.innerHTML,liveDom:template.content}];});
  await page.locator('[data-open-community-activity="interactions"]').click();
  await page.waitForFunction(()=>calls.some(c=>c.body.readNotificationIds)&&state.communityNotificationSummary.interactions.unread===0);
  assert.equal(await page.locator('.message-notification-row').count(),2);
  assert.equal(await page.evaluate(()=>state.communityNotificationSummary.follows.unread),1);
  assert.equal(await page.evaluate(()=>state.communityFriends[0].unreadCount),3);
  assert.equal(await page.evaluate(()=>edgeBackSnapshots[0].liveDom.querySelector('[data-open-community-activity="interactions"] .message-activity-badge')),null);
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});await page.evaluate(()=>{state.themeColor='dark';applyTheme()});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const aligned=await page.evaluate(()=>{const rows=[...document.querySelectorAll('.message-notification-row')];return rows[0].querySelector('.message-notification-copy').getBoundingClientRect().left===rows[1].querySelector('.message-notification-copy').getBoundingClientRect().left});assert.equal(aligned,true);
   if(width===390)await page.screenshot({path:path.join(root,'build','message-activity-detail.png')});
  }
  // Failure leaves unread intact; a later successful visit acknowledges it.
  await page.evaluate(()=>{failRead=true});await page.locator('[data-open-community-activity="follows"]').click();
  await page.waitForFunction(()=>latestToast.includes('同步失败'));
  assert.equal(await page.evaluate(()=>state.communityNotificationSummary.follows.unread),1);
  await page.evaluate(()=>{failRead=false});await page.locator('[data-open-community-activity="follows"]').click();
  await page.waitForFunction(()=>state.communityNotificationSummary.follows.unread===0);
  // Switching tabs during a request cannot display or acknowledge the abandoned tab.
  await page.evaluate(()=>{delayList=true;calls=[];fixtures.forEach(x=>x.read=false);openCommunityActivity('interactions');openCommunityActivity('follows');pendingList.splice(0).forEach(r=>r())});
  await page.waitForFunction(()=>!state.communityActivityLoading);
  assert.equal(await page.locator('.message-notification-row').count(),1);
  assert.ok(await page.evaluate(()=>calls.filter(c=>c.body.readNotificationIds).every(c=>c.body.readNotificationIds.every(id=>id==='follow'))));
  console.log('Activity inbox UI passed: collapse, numeric badge, chat DOM retention, themes/widths, read receipts, snapshot updates and tab races.');
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
