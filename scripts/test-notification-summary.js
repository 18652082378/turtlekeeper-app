const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
const slice = (a,b) => source.slice(source.indexOf(a), source.indexOf(b,source.indexOf(a)));
const rows = Array.from({length:125},(_,i)=>({id:`n${i}`,recipientPhone:'owner',actorPhone:'actor',type:i%2?'comment':'like',createdAt:new Date(1700000000000+i*1000).toISOString(),readAt:''}));
rows.push({id:'follow',recipientPhone:'owner',actorPhone:'actor',type:'follow',createdAt:new Date().toISOString()});
rows.push({id:'foreign',recipientPhone:'other',actorPhone:'actor',type:'like',createdAt:new Date().toISOString()});
const db={communityNotifications:rows,users:{actor:{accountName:'小龟友'}}};
const ctx={readJson:async x=>x,readDatabase:()=>db,requireReviewUser:(db,body)=>({phone:body.phone}),sendJson:(r,s,body)=>body,communityUserId:x=>x,maskPhone:x=>x,isAdminUser:()=>false,communityMediaItemsFromPost:()=>[],writeDatabase:()=>{},syncCommunityUnreadBadge:()=>{},communityUnreadMessageCount:()=>3,communityFriends:()=>[]};
vm.createContext(ctx);
vm.runInContext(slice('function communityUnreadActivityCount(', 'function communityTotalUnreadCount(')+slice('function publicCommunityNotifications(', '// A badge-only APNs payload')+slice('async function handleCommunityUnread(', 'const MARKET_REFRESH_WINDOW_MS'),ctx);
(async()=>{
 let inbox=await ctx.handleCommunityUnread({phone:'owner'});
 assert.equal(inbox.notifications.length,100);
 assert.equal(inbox.notificationSummary.interactions.total,125);
 assert.equal(inbox.notificationSummary.interactions.unread,125);
 assert.equal(inbox.notificationSummary.interactions.latest.id,'n124');
 assert.equal(inbox.notificationSummary.follows.unread,1);
 const seen=[];
 for(let offset=0;offset<125;offset+=50){
  const page=await ctx.handleCommunityNotifications({phone:'owner',group:'interactions',offset,limit:50});
  seen.push(...page.notifications.map(x=>x.id));
  inbox=await ctx.handleCommunityUnread({phone:'owner',readNotificationIds:page.notifications.map(x=>x.id)});
 }
 assert.equal(new Set(seen).size,125);
 assert.equal(inbox.notificationSummary.interactions.unread,0);
 assert.equal(inbox.notificationSummary.follows.unread,1);
 assert.equal(inbox.chatUnreadCount,3);
 assert.equal(inbox.totalUnreadCount,4);
 assert.equal(rows.find(x=>x.id==='foreign').readAt,undefined);
 await ctx.handleCommunityUnread({phone:'owner',markNotificationsRead:true});
 assert.ok(rows.find(x=>x.id==='follow').readAt,'old clients retain mark-all compatibility');
 assert.equal(rows.find(x=>x.id==='foreign').readAt,undefined);
 console.log('Notification aggregation passed: >100 counts, pagination, exact read scope, independent follows/chat, legacy compatibility.');
})().catch(error=>{console.error(error);process.exitCode=1});
