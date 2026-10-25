'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launchBrowser,recordResult,engine}=require('./browser-test-engine.cjs'),fixture=require('./ui-audit-fixture.cjs')();
const root=path.resolve(__dirname,'..'),bundle=path.resolve(process.env.COMMUNITY_PHOTO_ROOT||path.join(root,'www'));
const samples=[['portrait',300,400],['portrait',160,480],['landscape',400,300],['landscape',900,180],['square',400,400]];
(async()=>{
 const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.hostname!=='single-photo.test')return route.abort();
   if(url.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:'window.TURTLE_API_BASE_URL="https://single-photo.test";'});
   if(url.pathname.startsWith('/api/'))return route.fulfill({json:{ok:true,minimumBuild:0,latestBuild:0,posts:[],items:[],notifications:[]}});
   const file=path.resolve(bundle,url.pathname==='/'?'index.html':'.'+decodeURIComponent(url.pathname));
   if(!file.startsWith(bundle+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
 });
 async function seed(theme){
   await page.evaluate(({fixture,samples,theme})=>{
     window.dismissTradeIntro?.();window.TurtleReleaseNotes?.cancel();
     const posts=samples.map(([shape,w,h],i)=>{const url='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#789b75"/></svg>`);return {...fixture.communityPosts[0],id:'size-'+i,createdAt:new Date(Date.UTC(2026,9,25,0,0,10-i)).toISOString(),title:shape+' '+w+'×'+h,photos:[url],media:[{type:'image',url}],mediaItems:[{type:'image',url}]};});
     state={...initialState,...emptyAccountData(),...fixture,page:'community',themeColor:theme,cloudToken:'',policyConsentRequired:false,communityPosts:posts,communityFeedInitialized:true,communityFeedHasMore:false};communityLoading=false;cloudHydrationComplete=true;forceUpdateState={required:false};pendingPageEnterMotion=false;render();
   },{fixture,samples,theme});
   await page.locator('.forum-thread-media.is-single img').evaluateAll(imgs=>Promise.all(imgs.map(img=>{img.loading='eager';return img.decode();})));
   await page.waitForFunction(()=>[...document.querySelectorAll('.forum-thread-media.is-single > button')].every(b=>b.dataset.communityPhotoShape&&b.dataset.communityPhotoShape!=='pending'));
 }
 try{
   await page.goto('https://single-photo.test/?skipIntro=1');
   for(const width of [280,320,390,430,1180])for(const theme of ['teal','dark']){
     await page.setViewportSize({width,height:844});await seed(theme);
     const sizes=await page.locator('.forum-thread-media.is-single > button').evaluateAll(nodes=>nodes.map(button=>{const img=button.querySelector('img'),r=button.getBoundingClientRect(),m=button.parentElement.getBoundingClientRect(),i=img.getBoundingClientRect();return {shape:button.dataset.communityPhotoShape,width:r.width,height:r.height,available:m.width,left:r.left-m.left,imageWidth:i.width,imageHeight:i.height,fit:getComputedStyle(img).objectFit,radius:getComputedStyle(img).borderRadius};}));
     assert.equal(sizes.length,samples.length);
     sizes.forEach((s,i)=>{const shape=samples[i][0],w=Math.min(shape==='portrait'?195:shape==='landscape'?320:260,s.available),h=w*(shape==='portrait'?4/3:shape==='landscape'?3/4:1);assert.equal(s.shape,shape);assert.ok(Math.abs(s.width-w)<1&&Math.abs(s.height-h)<1,JSON.stringify(s));assert.ok(Math.abs(s.imageWidth-s.width)<1&&Math.abs(s.imageHeight-s.height)<1);assert.ok(Math.abs(s.left)<1);assert.equal(s.fit,'cover');assert.equal(s.radius,'0px');});
     assert.equal(sizes[0].width,sizes[1].width);assert.equal(sizes[0].height,sizes[1].height);assert.equal(sizes[2].width,sizes[3].width);assert.equal(sizes[2].height,sizes[3].height);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);checks.push({width,theme,photos:sizes.length});
     if(width===390&&theme==='teal')await page.locator('.forum-thread-card').first().screenshot({path:path.join(root,'output/single-photo-portrait-'+engine+'.png')});
   }
   await page.setViewportSize({width:390,height:844});await seed('teal');
   // Reused image nodes must update direction after their source changes.
   await page.locator('.forum-thread-media.is-single img').first().evaluate(async img=>{const other=document.querySelectorAll('.forum-thread-media.is-single img')[2];img.src=other.src;await img.decode();});
   await page.waitForFunction(()=>document.querySelector('.forum-thread-media.is-single > button').dataset.communityPhotoShape==='landscape');
   await seed('teal');
   await page.evaluate(()=>{const before=state.communityPosts;state.communityPosts=[...before,{...before[0],id:'size-appended',createdAt:'2026-10-01T00:00:00Z'}];patchVisibleCommunityFeed(state.communityPosts,before);});
   const appended=page.locator('[data-community-feed-card="size-appended"] img.community-media');await appended.evaluate(img=>{img.loading='eager';return img.decode();});
   await page.locator('[data-community-feed-card="size-appended"] [data-community-photo-shape="portrait"]').waitFor();
   await page.evaluate(()=>{const p=state.communityPosts[0],images=state.communityPosts.slice(0,3).map(post=>post.mediaItems[0]);state.communityPosts=[{...p,mediaItems:images,media:images,photos:images.map(x=>x.url)}];render();});
   assert.equal(await page.locator('.forum-thread-media.is-grid').count(),1);assert.equal(await page.locator('.forum-thread-media.is-grid [data-community-photo-shape]').count(),0);
   await seed('teal');
   const source=await page.locator('.forum-thread-media.is-single img').first().getAttribute('src');
   await page.locator('.forum-thread-media.is-single > button').first().click();await page.locator('.image-preview-overlay').waitFor({state:'visible'});
   assert.ok(await page.locator('.image-preview-overlay img').evaluateAll((imgs,src)=>imgs.some(img=>img.getAttribute('src')===src),source));
   assert.deepEqual(errors,[]);recordResult(root,'community-single-photo.json',{checks,sourceChange:true,pagination:true,galleryUnaffected:true,originalPreview:true,errors,syntheticOnly:true});
   console.log(`PASS: ${checks.length*5} single-photo cases; equal portrait/landscape dimensions, responsive square frames, source changes and full original preview.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
