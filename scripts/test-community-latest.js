const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../server/server.js'),'utf8');
const start=source.indexOf('async function handleCommunityList(');
const end=source.indexOf('function communitySearchScore(',start);
const posts=Array.from({length:25},(_,i)=>({id:String(i).padStart(2,'0'),createdAt:new Date(Date.UTC(2026,8,1,0,i)).toISOString(),isPinned:i===0}));
const context={
  readJson:async req=>req,readDatabase:()=>({}),optionalReviewUser:()=>null,
  publicCommunityPosts:()=>[posts[0],...posts.slice(1).reverse()],
  sendJson:(res,status,body)=>body,communityProfileStats:()=>({}),isAdminUser:()=>false
};
vm.createContext(context);vm.runInContext(source.slice(start,end),context);
(async()=>{
  const first=await context.handleCommunityList({sort:'latest',limit:10},null);
  const next=await context.handleCommunityList({sort:'latest',limit:10,offset:first.nextOffset},null);
  assert.deepEqual(Array.from(first.posts,x=>x.id),['24','23','22','21','20','19','18','17','16','15']);
  assert.deepEqual(Array.from(next.posts,x=>x.id),['14','13','12','11','10','09','08','07','06','05']);
  assert.equal(first.total,25);assert.equal(next.hasMore,true);
  const legacy=await context.handleCommunityList({limit:10},null);
  assert.equal(legacy.posts[0].id,'00','older clients keep their existing pinned-first protocol');
  console.log('Community latest passed: full-set chronological pagination and legacy compatibility.');
})().catch(error=>{console.error(error);process.exitCode=1});
