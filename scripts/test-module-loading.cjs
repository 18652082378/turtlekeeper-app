const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const extract=name=>{const start=source.search(new RegExp('(?:async )?function '+name+'\\('));assert(start>=0,name);return source.slice(start,source.indexOf('\n}',start)+2);};
function setup(){
 const ctx={console:{warn(){}},Date,Map,Set,Number,String,Boolean,structuredClone,
  CONFIGURED_SMS_BACKEND:true,canUseCommunity:()=>true,state:{loggedInPhone:'A',cloudToken:'tokenA',page:'following',communityFriends:[],communityFollowingUsers:[]},
  followingLoading:false,followingLastLoadedAt:0,publicReviewsLoading:false,publicReviewsLastLoadedAt:0,publicFeedbackLoading:false,publicFeedbackLastLoadedAt:0,
  communityUserProfileLoading:false,communityUserProfileLoadedKey:'',communityLoading:false,
  contentReportsLoading:false,contentReportsLastLoadedAt:0,operationsOverviewLoading:false,operationsOverviewLastLoadedAt:0,systemAnnouncementsLoading:false,systemAnnouncementsLastLoadedAt:0,
  normalizeCommunityPosts:x=>x,normalizeMarketListings:x=>x,communityUserSnapshot:id=>({id}),communityAuthPayload:x=>x,reviewAuthPayload:()=>({}),feedbackAuthPayload:()=>({}),
  saveState(){},setupCommunityInfiniteScroll(){},patchVisibleCommunityFeed(){},$app:{querySelector:()=>null},render(){},toast(){},patchAnnouncementSlot(){}};
 ctx.currentCloudToken=()=>ctx.state.cloudToken;ctx.hasCloudSession=()=>!!ctx.state.cloudToken;ctx.setState=p=>Object.assign(ctx.state,p);
 vm.createContext(ctx);vm.runInContext(['refreshFollowing','refreshPublicReviews','refreshPublicFeedback','refreshCommunityUserProfile','loadMoreCommunityPosts','refreshContentReports','refreshOperationsOverview','refreshBlockedUsers','remoteListEmptyMarkup','accountModuleCache'].map(extract).join('\n'),ctx);return ctx;
}
(async()=>{
 for(const [fn,key,result] of [['refreshFollowing','communityFollowingUsers',{following:[{id:'private-A'}]}],['refreshPublicReviews','publicReviews',{reviews:[{id:'private-A'}]}],['refreshPublicFeedback','publicFeedbackItems',{feedbacks:[{id:'private-A'}]}],['refreshContentReports','contentReports',{reports:[{id:'private-A'}]}],['refreshOperationsOverview','operationsOverview',{conversations:[{id:'private-A'}]}],['refreshBlockedUsers','blockedUsers',{users:[{id:'private-A'}]}]]){
  const c=setup();c.state.isCommunityAdmin=true;let resolve;c.apiPost=()=>new Promise(r=>resolve=r);const pending=c[fn](true);assert(resolve,fn);
  c.state={loggedInPhone:'B',cloudToken:'tokenB',page:'mine',[key]:[]};resolve(result);await pending;assert.equal(JSON.stringify(c.state[key]),'[]',fn+' discards old account');
 }
 for(const [fn,key,flag,result] of [['refreshFollowing','communityFollowingUsers','following',{following:[]}],['refreshPublicReviews','publicReviews','publicReviews',{reviews:[]}],['refreshPublicFeedback','publicFeedbackItems','publicFeedback',{feedbacks:[]}]]){
  const c=setup();c.state[key]=[{id:'cached'}];c.apiPost=async()=>{throw Error('offline')};await c[fn](true);assert.equal(c.state[key][0].id,'cached');
  assert(c.state[flag+'Error']);assert.match(c.remoteListEmptyMarkup(false,true,'EMPTY','hint'),/加载失败/);
  c.apiPost=async()=>result;await c[fn](true);assert.equal(c.state[flag+'Initialized'],true);assert.equal(c.state[flag+'Error'],false);assert.match(c.remoteListEmptyMarkup(true,false,'EMPTY','hint'),/EMPTY/);
 }
 {
  const c=setup();c.state.page='communityProfile';c.state.selectedCommunityUserId='first';let resolve;const seen=[];
  c.apiPost=(_url,p)=>{seen.push(p.userId);return p.userId==='first'?new Promise(r=>resolve=r):Promise.resolve({user:{id:'second'},posts:[],listings:[]})};
  const first=c.refreshCommunityUserProfile(true);c.state.selectedCommunityUserId='second';await c.refreshCommunityUserProfile(true);resolve({user:{id:'first'},posts:[{id:'wrong'}]});await first;await new Promise(r=>setImmediate(r));
  assert.equal(c.state.selectedCommunityUser.id,'second');assert.deepEqual(seen,['first','second']);assert.equal(c.state.communityUserPosts.length,0);
 }
 for(const switchAccount of [false,true]){
  const c=setup();Object.assign(c.state,{page:'community',communityPosts:[{id:'existing'}],communityFeedNextOffset:10,communityFeedHasMore:true});let resolve;c.apiPost=()=>new Promise(r=>resolve=r);
  const pending=c.loadMoreCommunityPosts();if(switchAccount)c.state={loggedInPhone:'B',cloudToken:'tokenB',page:'community',communityPosts:[],communityFeedNextOffset:0};else c.state.page='mine';
  resolve({posts:[{id:'late'}],nextOffset:20,hasMore:false});await pending;assert.equal(c.state.communityFeedNextOffset,switchAccount?0:10);assert(!c.state.communityPosts.some(p=>p.id==='late'));
 }
 {
  const c=setup();c.initialState={communityPosts:[],marketListings:[],communityFollowingUsers:[],communityFeedInitialized:false,marketFeedInitialized:false,operationsOverview:{conversations:[]}};
  Object.assign(c.state,{communityPosts:[{id:'post'}],marketListings:[{id:'listing'}],marketFeedInitialized:true,communityFeedInitialized:true});
  assert.equal(Object.keys(c.accountModuleCache('A')).length,0,'same-account hydration preserves lists and pagination');const reset=c.accountModuleCache('B');assert.equal(reset.marketListings.length,0);assert.equal(reset.communityPosts.length,0);assert.equal(reset.marketFeedInitialized,false);assert.equal(reset.communityFeedInitialized,false);
 }
 console.log('PASS: account-scoped following/reviews/feedback/admin lists; offline cache; loading versus empty; fast profile switching; abandoned feed pagination; cache preservation and account reset.');
})().catch(e=>{console.error(e);process.exitCode=1});
