const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async (page, output) => {
  await page.evaluate(() => {
    state.turtles=[]; state.ledgerRecords=[]; state.turtleFilter='all'; state.turtlePoolFilter='all'; state.turtleSearch='';
    state.turtlePools=[{id:'batch-pool',name:'果核苗子饲养池'}];
    const groups=[['batch-a','123 · 2026-09-08孵化批次',5,true,0],['batch-b','果核001',2,true,0],
      ['batch-c','果核蛋龟混合性别',4,true,1],['batch-d','全部损耗批次',2,true,2],['batch-e','果核蛋龟 · 2026-09-10批次',499,false,3]];
    groups.forEach(([id,name,count,hatched,lost])=>{
      for(let i=0;i<count;i++)state.turtles.push({id:id+'-'+i,batchId:id,batchName:name,code:id+'-'+i,
        speciesName:'果核蛋龟',speciesCode:'test',stage:'hatchling',status:i<lost?'已死亡':'正常饲养',
        health:'健康',gender:id==='batch-c'?(i===1?'公':i===2?'母':'未知'):'未知',
        acquiredDate:'2026-09-08',createdAt:'2026-09-08',lossDate:i<lost?'2026-09-12':undefined,
        sourceBreedingId:hatched?id:undefined,price:hatched?0:360,photo:defaultPhoto,
        poolId:id==='batch-b'?'batch-pool':'',history:[]});
    });
    state.page='home';state.openTurtleMenuId='';render();
  });
  const results=[];
  for(const width of [280,300,320,360,414,600,720,840,1100,1600]) {
    await page.setViewportSize({width,height:900});
    for(const theme of ['teal','dark']) {
      await page.evaluate(theme=>{state.themeColor=theme;state.page='home';render();},theme);
      await page.waitForTimeout(60);
      const cards=await page.evaluate(()=>[...document.querySelectorAll('.turtle-batch-row')].map(card=>{
        const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
        const get=s=>rect(card.querySelector(s));
        const items=[...card.querySelectorAll('.turtle-row-title > strong,.turtle-row-species > p,.turtle-pool-title-meta,.turtle-price,.turtle-row-meta > span,.turtle-keeping-days,.turtle-row-status-badge,.more-btn')].filter(el=>el.getClientRects().length);
        return {id:card.dataset.viewTurtle,box:rect(card),photo:get('img'),name:get('.turtle-row-title > strong'),
          meta:get('.turtle-row-meta'),stage:get('.turtle-row-meta > span'),species:get('.turtle-row-species > p'),price:card.querySelector('.turtle-price')?get('.turtle-price'):null,pool:get('.turtle-pool-title-meta'),days:get('.turtle-keeping-days'),menu:get('.more-btn'),
          labels:[...card.querySelectorAll('.turtle-row-meta > span')].filter(el=>el.getClientRects().length).map(el=>el.textContent),
          count:card.querySelector('.batch-count-badge').textContent,
          texts:items.map(el=>({text:el.textContent,box:rect(el),clipped:el.scrollWidth>el.clientWidth+1 && !el.classList.contains('turtle-pool-title-meta')})),
          dots:getComputedStyle(card.querySelector('.more-btn'),'::before').width,
          menuFont:getComputedStyle(card.querySelector('.more-btn')).fontSize,
          statusBox:card.querySelector('.turtle-row-status-badge')?get('.turtle-row-status-badge'):null,
          status:card.querySelector('.turtle-row-status-badge')?.textContent||''};
      }));
      assert.equal(cards.length,5,'All hatch/purchase/loss batch fixtures must be visible');
      fs.writeFileSync(path.join(output,'batch-card-current.json'),JSON.stringify({width,theme,cards},null,2));
      await page.evaluate(()=>scrollTo(0,document.querySelector('.turtle-batch-row').getBoundingClientRect().top+scrollY-72));
      await page.screenshot({path:path.join(output,'batch-card-current.png')});
      for(const card of cards) {
        assert.equal(card.photo.width,58,'Batch photo matches individual archive size');
        assert(Math.abs((card.photo.top+card.photo.bottom-card.name.top-card.meta.bottom)/2)<3,'Batch photo centers on the text group');
        assert(Math.abs(card.days.right-card.pool.right)<1,'Days align beneath pool');
        assert(card.pool.right<=card.menu.left-3 && card.menu.left-card.pool.right<=6,'Reserved compact menu column');
        assert.equal(card.dots,'3px','Batch dots use the same fixed drawing');
        assert.equal(card.menuFont,'0px','Original bullet text must not render beside the fixed dots');
        if(card.statusBox) {
          assert(Math.abs((card.statusBox.left+card.statusBox.right-card.menu.left-card.menu.right)/2)<1,'Status sits directly below menu');
          assert(Math.abs(card.stage.top-card.days.top)<1 && Math.abs(card.stage.top-card.statusBox.top)<1,'Stage, keeping days and hatch/loss status share one row');
          assert(card.statusBox.top>=card.menu.bottom,'Status does not overlap menu');
        } else {
          assert(Math.abs(card.stage.top-card.days.top)<1,'Purchased batch loss/day information aligns with stage');
          if (width >= 360) assert(card.price.bottom>card.pool.top && card.price.top<card.pool.bottom,'Purchase price is beside pool on its own information row');
          else assert(card.price.top>=card.pool.bottom && Math.abs(card.price.right-card.pool.right)<1,'Narrow batch price gets a separate row aligned with pool');
        }
        for(const item of card.texts) assert(!item.clipped && item.box.left>=card.box.left-1 && item.box.right<=card.box.right+1 && item.box.bottom<=card.box.bottom+1,`${width}/${theme} clipped batch field: ${JSON.stringify(item)}`);
        for(let i=0;i<card.texts.length;i++)for(let j=i+1;j<card.texts.length;j++) {
          const a=card.texts[i].box,b=card.texts[j].box;
          assert(!(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1),`${width}/${theme} overlapping batch fields: ${card.texts[i].text} / ${card.texts[j].text}`);
        }
      }
      assert(!cards.find(c=>c.id==='batch-a-0').labels.some(t=>t.includes('未知')), 'Hatch card omits sex summary');
      assert.equal(cards.find(c=>c.id==='batch-a-0').count,'在养 5 只','Hatch card retains count without batch prefix');
      assert(cards.find(c=>c.id==='batch-e-0').labels.some(t=>t.includes('496 未知')), 'Purchased batch retains sex summary');
      assert.equal(cards.find(c=>c.id==='batch-e-0').count,'在养 496 只');
      assert(cards.find(c=>c.id==='batch-e-0').texts.some(t=>t.text==='¥178560.00'));
      assert(cards.find(c=>c.id==='batch-e-0').texts.some(t=>t.text==='损耗 3 只'));
      assert.equal(cards.find(c=>c.id==='batch-d-0').status,'损耗');
      const before=await page.evaluate(()=>JSON.stringify(state.turtles));
      const button=page.locator('[data-view-turtle="batch-a-0"] .more-btn');
      await button.click();assert.equal(await button.getAttribute('aria-expanded'),'true');
      assert.equal(await page.locator('[data-view-turtle="batch-a-0"] [role="menuitem"]').count(),5);
      await button.click();assert.equal(await page.evaluate(()=>JSON.stringify(state.turtles)),before);
      if([320,720].includes(width)) {
        await page.evaluate(()=>scrollTo(0,document.querySelector('.turtle-batch-row').getBoundingClientRect().top+scrollY-72));
        await page.screenshot({path:path.join(output,`batch-cards-${width}-${theme}.png`)});
      }
      results.push({width,theme,cards});
    }
  }
  fs.writeFileSync(path.join(output,'batch-card-audit.json'),JSON.stringify(results,null,2));
  console.log(`PASS: ${results.length} batch card cases: hatch/purchase/loss, aligned photos and days, complete totals, no overlapping fields, working menus.`);
};
