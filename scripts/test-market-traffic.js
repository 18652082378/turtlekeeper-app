const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const extract=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return source.slice(i,j)};
(async()=>{
 fs.mkdirSync(path.join(root,'build'),{recursive:true});
 require('node:child_process').execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-nostdin','-loglevel','error','-y','-f','lavfi','-i','color=c=green:s=320x240:d=10','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',path.join(root,'build/cdn-test-video.mp4')],{windowsHide:true});
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});let videoRequests=0;
  await page.route('https://media-test.invalid/**',route=>{
   if(route.request().url().endsWith('.mp4')){videoRequests++;return route.fulfill({contentType:'video/mp4',body:fs.readFileSync(path.join(root,'build/cdn-test-video.mp4')),headers:{'Access-Control-Allow-Origin':'*'}})}
   return route.fulfill({contentType:'text/html',body:'<div id="app"></div>'});
  });
  await page.goto('https://media-test.invalid/');
  for(const file of ['styles.css','chat-tools.css','dark-surface-audit.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  const photo='data:image/jpeg;base64,'+fs.readFileSync(path.join(root,'assets/species/ABQ.jpg')).toString('base64');
  await page.addScriptTag({content:`
   var $app=document.querySelector('#app');var state={themeColor:'dark'};
   function escapeHtml(x){return String(x||'').replaceAll('&','&amp;').replaceAll('"','&quot;')}function apiAssetUrl(x){return x}
   var defaultPhoto=${JSON.stringify(photo)};
   ${extract('function applyTheme(', 'function accountSpeciesList(')}
   ${extract('function marketDetailVideoMarkup(', 'function communityMessageAspectRatio(')}
   ${extract('function releaseMarketDetailVideo(', 'function syncCommunityPublishButton(')}
   ${extract('function captureMarketVideoCover(', 'function repairMissingMarketPosters(')}
   ${extract('function prefetchNextMarketVideo(', 'function communityPublishProgressMarkup(')}
   applyTheme();
   $app.innerHTML='<main class="content market-detail-page">'+marketDetailVideoMarkup({url:'https://media-test.invalid/original.mp4',playbackUrl:'https://media-test.invalid/clip.mp4',posterUrl:defaultPhoto})+'<div style="height:1500px"></div></main>';
   hydrateMarketDetailVideos();
  `});
  await page.waitForTimeout(300);assert.equal(videoRequests,0,'opening a product downloads no video bytes');
  assert.equal(await page.locator('video').getAttribute('src'),null);
  assert.equal(await page.locator('video').getAttribute('autoplay'),null);
  assert.equal(await page.locator('video').getAttribute('preload'),'none');
  await page.screenshot({path:path.join(root,'build/market-video-click-to-play.png')});
  await page.locator('[data-market-video-play]').click();await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  assert.ok(videoRequests>0);assert.ok((await page.locator('video').getAttribute('src')).endsWith('/clip.mp4'));
  const requestsAfterPlay=videoRequests;
  await page.evaluate(()=>window.scrollTo(0,1200));await page.waitForFunction(()=>!document.querySelector('video').hasAttribute('src'));
  assert.equal(await page.evaluate(()=>document.querySelector('video').paused),true);
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(200);assert.equal(videoRequests,requestsAfterPlay,'scrolling back does not restart the video');
  await page.locator('[data-market-video-play]').click();await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  await page.evaluate(()=>stopMarketDetailVideos($app,true));assert.equal(await page.locator('video').getAttribute('src'),null);
  // The retained detail DOM can bind again after a back gesture.
  await page.evaluate(()=>hydrateMarketDetailVideos());await page.locator('[data-market-video-play]').click();await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await page.locator('video').getAttribute('src'),null);
  const noPoster=await page.evaluate(()=>captureMarketVideoCover('https://media-test.invalid/unseen.mp4'));assert.equal(noPoster,'');
  await page.evaluate(()=>prefetchNextMarketVideo());
  const swift=fs.readFileSync(path.join(root,'ios/App/App/TurtleVideoCachePlugin.swift'),'utf8');
  assert.ok(!swift.slice(swift.indexOf('@objc public func resolve'),swift.indexOf('@objc public func stats')).includes('download(source:'));
  console.log('Market traffic UI passed: no video request before click, light playback source, release offscreen/back/background, no remote poster decode or speculative download.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
