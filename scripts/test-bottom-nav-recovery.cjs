const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
  try {
    const page=await browser.newPage({viewport:{width:402,height:874}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='nav-recovery.test') return route.abort();
      if(url.pathname==='/config.js') return route.fulfill({contentType:'text/javascript',body:'window.TURTLE_API_BASE_URL="";'});
      const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()) return route.fulfill({status:404,body:''});
      return route.fulfill({body:fs.readFileSync(file),contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
    });
    await page.goto('https://nav-recovery.test/?skipIntro=1');
    async function seed() {
      await page.evaluate(()=>{
        window.dispatchEvent(new Event('blur'));
        state.loggedInPhone='preview';state.policyConsentRequired=false;state.page='market';
        state.marketListings=Array.from({length:20},(_,i)=>({id:'nav'+i,title:'果核蛋龟 '+i,speciesCode:'GHG',speciesName:'果核蛋龟',price:100+i,photoUrl:'/assets/species/GHG.jpg',status:'active',sellerName:'测试',gender:'未知'}));
        state.marketFeedInitialized=true;state.marketFeedHasMore=false;state.marketSearch='';state.marketStage='all';
        edgeBackSnapshots=[];document.querySelector('#app > .bottom-nav')?.remove();
        render();window.scrollTo(0,480);
        setState({page:'about'},{skipSave:true});
      });
      await page.waitForFunction(()=>!$app.classList.contains('page-enter-motion'));
      assert.equal(await page.locator('#app > .bottom-nav').count(),1);
    }
    async function startSwipe(release=true, distance=60) {
      await page.mouse.move(5,220);await page.mouse.down();await page.mouse.move(5+distance,222,{steps:3});
      assert.equal(await page.locator('#app > .bottom-nav').evaluate(n=>getComputedStyle(n).position),'absolute','gesture temporarily pins the tab bar');
      if(release) await page.mouse.up();
    }
    const result=()=>page.locator('#app > .bottom-nav').evaluate(n=>({position:getComputedStyle(n).position,top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,viewport:innerHeight,style:n.getAttribute('style')}));
    const outcomes=[];
    for(const viewport of [{width:375,height:667},{width:402,height:874},{width:430,height:932}]) {
    await page.setViewportSize(viewport);
    for(const interruption of ['new-touch','blur','pagehide','pageshow','visibilitychange','resize','foreground-recovery','route-change','pointercancel','normal-finish','normal-rebound']) {
      await seed();await startSwipe(interruption!=='pointercancel',interruption==='normal-finish'?200:interruption==='normal-rebound'?15:60);
      if(interruption==='new-touch'){await page.mouse.down();await page.mouse.up();}
      else if(interruption==='pointercancel') {await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,isPrimary:true,bubbles:true})));await page.mouse.up();}
      else if(interruption==='foreground-recovery') await page.evaluate(()=>restoreBottomNavAfterForeground());
      else if(interruption==='route-change') {
        const savedPosition=await page.evaluate(()=>{
          setState({page:'marketAdd'},{skipSave:true});
          const saved=document.createElement('div');saved.innerHTML=edgeBackSnapshots.at(-1).bottomNavHtml;
          return saved.firstElementChild.style.position;
        });
        assert.notEqual(savedPosition,'absolute','navigation must restore fixed layers before serializing a snapshot');
      }
      else if(interruption==='visibilitychange') await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
      else if(!interruption.startsWith('normal-')) await page.evaluate(type=>window.dispatchEvent(new Event(type)),interruption);
      if(interruption.startsWith('normal-')) {
        await page.waitForFunction(()=>!$app.style.transform&&!$app.style.transition);
        assert.equal(await page.evaluate(()=>state.page),interruption==='normal-finish'?'market':'about');
      }
      if(interruption!=='route-change') {
        const immediate=await result();
        assert.equal(immediate.position,'fixed',`${interruption} releases positioning before the next navigation`);
      }
      await page.evaluate(()=>{navigateBottomTab('market');window.scrollTo(0,480);});
      const measured=await result();outcomes.push({width:viewport.width,interruption,...measured});
      if(measured.position!=='fixed'||Math.abs(measured.bottom-measured.viewport)>2){
        fs.mkdirSync(path.join(root,'output'),{recursive:true});
        await page.screenshot({path:path.join(root,`output/bottom-nav-${interruption}-failure.png`)});
      }
    }
    }
    fs.mkdirSync(path.join(root,'output'),{recursive:true});
    fs.writeFileSync(path.join(root,'output/bottom-nav-recovery.json'),JSON.stringify({outcomes,errors},null,2));
    console.log(JSON.stringify(outcomes));
    assert.ok(outcomes.every(x=>x.position==='fixed'&&Math.abs(x.bottom-x.viewport)<=2),'every interruption must restore viewport-bottom anchoring');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
