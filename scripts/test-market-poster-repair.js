const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const code = app.slice(app.indexOf('function marketVideoPosterUrl('), app.indexOf('function marketDetailVideoMarkup('));
function cover(id, missing) {
  return { dataset: { marketPosterListing:id, marketPosterVideo:`https://media.test/${id}.mp4`, posterMissing:String(missing) }, src:'original', isConnected:true, complete:true, naturalWidth:100, events:{}, getAttribute(name) { return this[name]; }, addEventListener(name, fn) { this.events[name]=fn; } };
}
(async()=>{
 const good=cover('good',false), a=cover('a',true), b=cover('b',true);
 let covers=[good,a,b], calls=0, decodes=0, active=0, maxActive=0;
 const context={window:{setTimeout,clearTimeout}, Image:class { set src(value) { this.naturalWidth=100; queueMicrotask(()=>this.onload?.()); } },document:{querySelectorAll:()=>covers},defaultPhoto:'placeholder',apiAssetUrl:x=>x,communityAuthPayload:x=>x,URL,apiPost:async()=>{calls++;throw Object.assign(Error('unsupported'),{status:405});},createVideoPoster:async()=>{decodes++;active++;maxActive=Math.max(active,maxActive);await new Promise(r=>setImmediate(r));active--;return {file:{},previewUrl:'blob:temporary'};},fileAsDataUrl:async()=> 'data:image/jpeg;base64,cover'};
 vm.createContext(context);vm.runInContext(code,context);
 context.repairMissingMarketPosters();
 for(let i=0;i<10;i++) await new Promise(r=>setImmediate(r));
 assert.equal(good.src,'original');assert.equal(a.src,'data:image/jpeg;base64,cover');assert.equal(b.src,a.src);assert.equal(decodes,2);assert.equal(maxActive,1);
 const previousCalls=calls;
 covers=[cover('a',true)];context.repairMissingMarketPosters();await new Promise(r=>setImmediate(r));
 assert.equal(covers[0].src,a.src);assert.equal(decodes,2);assert.equal(calls,previousCalls);
 const clone=cover('broken',false);clone.dataset.posterBound='true';covers=[clone];context.repairMissingMarketPosters();
 assert.equal(typeof clone.events.error,'function');await clone.events.error();
 for(let i=0;i<10;i++) await new Promise(r=>setImmediate(r));
 assert.equal(clone.src,a.src);
 const media={url:a.dataset.marketPosterVideo,posterUrl:'',type:'video'};
 assert.equal(context.marketVideoPosterUrl(media,'placeholder','a'),a.src);
 Object.assign(context,{marketListingMediaItems:item=>item.mediaItems,marketListingPhoto:item=>item.mediaItems[0].url,escapeHtml:x=>String(x||''),marketStageLabel:()=>'',money:()=>0,marketSellerAvatar:()=>'',platformAdminBadge:()=>'',marketFavoriteButton:()=>''});
 vm.runInContext(app.slice(app.indexOf('function marketListingCard('),app.indexOf('const MARKET_PROVINCE_CITIES')),context);
 for(let i=0;i<100;i++) {
   const markup=context.marketListingCard({id:'a',status:'active',mediaItems:[media]});
   assert.ok(markup.includes('src="'+a.src+'"'));
   assert.ok(markup.includes('data-poster-missing="false"'));
   assert.ok(!markup.includes('src="placeholder"'));
 }
 // A stale remote poster from a subsequent feed response cannot replace a ready cover.
 assert.equal(context.marketVideoPosterUrl({...media,posterUrl:'https://broken.test/poster.jpg'},'placeholder','a'),a.src);
 // Cache pruning must not evict successful covers when the next repair starts.
 vm.runInContext('for(let i=0;i<110;i++) marketPosterRepairs.set("other"+i,{url:"ready",pending:false});',context);
 covers=[cover('new',true)];context.repairMissingMarketPosters();
 for(let i=0;i<10;i++) await new Promise(r=>setImmediate(r));
 assert.equal(context.marketVideoPosterUrl(media,'placeholder','a'),a.src);
 const beforeSkip=decodes;
 assert.equal(await context.captureMarketVideoCover('https://media.test/offscreen.mp4',()=>false),'');
 assert.equal(decodes,beforeSkip);
 assert.equal(context.marketCoverIsVisible({isConnected:false}),false);
 context.window.TURTLE_API_BASE_URL='https://api.turtleworld.cn';
 assert.equal(context.marketImageBackupUrl('https://media.turtleworld.cn/uploads/test.jpg'),'https://api.turtleworld.cn/uploads/test.jpg');
 assert.equal(context.marketImageBackupUrl('https://unrelated.test/uploads/test.jpg'),'');
 const photo=cover('photo',false);photo.dataset.marketImageOriginal='https://media.turtleworld.cn/uploads/original.jpg';photo.src='https://media.turtleworld.cn/uploads/thumb.jpg';covers=[photo];
 context.bindMarketImageRecovery();photo.events.error();assert.equal(photo.src,photo.dataset.marketImageOriginal);
 photo.events.error();assert.equal(photo.src,'https://api.turtleworld.cn/uploads/original.jpg');
 photo.events.error();assert.equal(photo.src,'https://api.turtleworld.cn/uploads/original.jpg');
 console.log('Offscreen decoding skipped; thumbnail and CDN image recovery bounded.');
 console.log('100 renders retain first frame; successful covers survive cache pruning.');
 console.log('Market cover repair passed: old server fallback, normal cover preserved, serial decode, cache, snapshot listeners, broken cover.');
})().catch(error=>{console.error(error);process.exitCode=1;});
