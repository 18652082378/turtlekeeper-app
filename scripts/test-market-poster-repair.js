const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const code=app.slice(app.indexOf('function marketVideoPosterUrl('),app.indexOf('function marketDetailVideoMarkup('));
function cover(id,missing){return {dataset:{marketPosterListing:id,marketPosterVideo:`https://media.test/${id}.mp4`,posterMissing:String(missing)},src:'original',isConnected:true,complete:true,naturalWidth:100,events:{},getAttribute(name){return this[name]},addEventListener(n,f){this.events[n]=f}}}
(async()=>{
 let covers=[cover('good',false),cover('a',true)],calls=0,decodes=0;
 const ctx={window:{setTimeout,clearTimeout},Image:class{set src(v){this.naturalWidth=100;queueMicrotask(()=>this.onload?.())}},document:{querySelectorAll:()=>covers},defaultPhoto:'placeholder',apiAssetUrl:x=>x,communityAuthPayload:x=>x,URL,apiPost:async()=>{calls++;return {posterUrl:'https://media.test/poster.jpg'}},createVideoPoster:()=>{decodes++;throw Error('remote decode forbidden')}};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 const flush=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r))};
 ctx.repairMissingMarketPosters();await flush();assert.equal(covers[0].src,'original');assert.equal(covers[1].src,'https://media.test/poster.jpg');assert.equal(decodes,0);
 const count=calls;for(let i=0;i<100;i++){covers=[cover('a',true)];ctx.repairMissingMarketPosters();await flush();assert.equal(covers[0].src,'https://media.test/poster.jpg')};assert.equal(calls,count);
 // Old server or missing ffmpeg: remain a stable cover; never fetch the video.
 vm.runInContext('marketPosterRepairs.clear();marketPosterServerUnavailable=false',ctx);ctx.apiPost=async()=>{calls++;throw Object.assign(Error('unsupported'),{status:405})};
 covers=[cover('old',true)];ctx.repairMissingMarketPosters();await flush();assert.equal(decodes,0);const oldCalls=calls;ctx.repairMissingMarketPosters();await flush();assert.equal(calls,oldCalls);
 assert.equal(await ctx.captureMarketVideoCover('https://media.test/a.mp4'),'');
 const broken=cover('broken',false);covers=[broken];ctx.repairMissingMarketPosters();await broken.events.error();await flush();assert.equal(broken.src,'placeholder');assert.equal(decodes,0);
 ctx.window.TURTLE_API_BASE_URL='https://api.turtleworld.cn';
 assert.equal(ctx.marketImageBackupUrl('https://media.turtleworld.cn/uploads/test.jpg'),'https://api.turtleworld.cn/uploads/test.jpg');assert.equal(ctx.marketImageBackupUrl('https://unrelated.test/uploads/test.jpg'),'');
 const photo=cover('photo',false);photo.dataset.marketImageOriginal='https://media.turtleworld.cn/uploads/original.jpg';photo.src='https://media.turtleworld.cn/uploads/thumb.jpg';covers=[photo];ctx.bindMarketImageRecovery();photo.events.error();assert.equal(photo.src,photo.dataset.marketImageOriginal);photo.events.error();assert.equal(photo.src,'https://api.turtleworld.cn/uploads/original.jpg');photo.events.error();assert.equal(photo.src,'https://api.turtleworld.cn/uploads/original.jpg');
 console.log('Market poster repair passed: 100 stable renders, server covers, zero remote video reads on missing/broken covers, bounded image recovery.');
})().catch(e=>{console.error(e);process.exitCode=1});
