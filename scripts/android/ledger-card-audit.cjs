const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
module.exports=async(page,output)=>{
  await page.evaluate(()=>{
    state.turtles=[['小点',91,8.3],['GHG-1',230,10.5],['果核蛋龟批量购入',123,12.8]].map(([code,weight,carapaceLength],i)=>({id:'ledger-t-'+i,code,weight,carapaceLength,speciesName:'果核蛋龟',status:'正常饲养',photo:defaultPhoto}));
    state.ledgerRecords=[
      {id:'audit-purchase',turtleId:'ledger-t-0',type:'purchase',amount:3300},
      {id:'audit-large',turtleId:'ledger-t-1',type:'purchase',amount:178560},
      {id:'audit-sold',turtleId:'ledger-t-0',type:'sold',amount:3500},
      {id:'audit-loss',turtleId:'ledger-t-2',type:'loss',amount:1080},
      {id:'audit-other',type:'other',amount:1234.56,title:'龟粮与养护用品采购',category:'饲料',note:'本次购入饲料、维生素及日常清洁用品，留作长期养护使用。'},
      {id:'audit-empty',type:'other',amount:0.01,title:'日常支出',note:''}
    ].map(item=>({...item,recordDate:'2026-09-15',createdAt:'2026-09-15T01:00:00Z'}));
    state.ledgerDatePreset='all';state.ledgerTab='all';state.ledgerDraftType='';state.openLedgerMenuId='';state.page='ledger';render();
  });
  const report=[];
  for(const width of [280,320,360,414,600,720,1100])for(const theme of ['teal','dark']){
    await page.setViewportSize({width,height:900});
    await page.evaluate(theme=>{state.themeColor=theme;state.page='ledger';render();},theme);
    await page.evaluate(()=>document.fonts.ready);
    await page.mouse.move(0,0);
    await page.waitForTimeout(300); // Let the previous card's press transition finish.
    const cards=await page.evaluate(()=>[...document.querySelectorAll('.ledger-row')].map(card=>{
      const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
      const menu=card.querySelector('.ledger-more-btn'),dots=menu.querySelector('span');
      const fields=[...card.querySelectorAll('.ledger-row-title,.ledger-row-species,.ledger-turtle-meta > span,.ledger-amount,.ledger-row-date,.ledger-linked-status,.ledger-more-btn')];
      return {id:card.dataset.viewLedger,box:rect(card),menu:rect(menu),dot:getComputedStyle(dots,'::before').width,dotFont:getComputedStyle(dots).fontSize,
        fields:fields.map(el=>({text:el.textContent,box:rect(el),clipped:el.scrollWidth>el.clientWidth+1 && !el.matches('.ledger-row-title,.ledger-row-species')})),
        meta:rect(card.querySelector('.ledger-turtle-meta')),chips:[...card.querySelectorAll('.ledger-turtle-meta > span')].map(rect)};
    }));
    if([280,320,720].includes(width)){
      await page.evaluate(()=>scrollTo(0,document.querySelector('.ledger-row').getBoundingClientRect().top+scrollY-72));
      await page.screenshot({path:path.join(output,`ledger-cards-${width}-${theme}.png`)});
    }
    for(const card of cards){
      assert(card.dot==='3px' && card.dotFont==='0px','Ledger menu uses fixed drawn dots');
      assert(card.menu.width>=28 && card.menu.height>=44,`Ledger menu has a usable touch target: ${width}/${theme} ${JSON.stringify(card.menu)}`);
      assert(Math.abs(card.fields[0].box.left-card.meta.left)<1,'Ledger title and measurement group share the same left edge');
      for(const f of card.fields)assert(!f.clipped && f.box.left>=card.box.left-1 && f.box.right<=card.box.right+1 && f.box.bottom<=card.box.bottom+1,`${width}/${theme}: clipped ledger field ${f.text}`);
      for(const c of card.chips)assert(c.right<=card.meta.right+1 && c.bottom<=card.meta.bottom+1,`${width}/${theme}: clipped weight, carapace or note`);
      for(let i=0;i<card.fields.length;i++)for(let j=i+1;j<card.fields.length;j++){
        const a=card.fields[i].box,b=card.fields[j].box;
        assert(!(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1),`${width}/${theme}: overlapping ledger fields ${card.fields[i].text} / ${card.fields[j].text}`);
      }
    }
    const before=await page.evaluate(()=>JSON.stringify(state.ledgerRecords));
    const menu=page.locator('[data-view-ledger="audit-purchase"] .ledger-more-btn');
    await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');
    assert.equal(await page.evaluate(()=>state.page),'ledger');
    assert.equal(await page.locator('[data-view-ledger="audit-purchase"] .ledger-action-menu [data-delete-ledger]').count(),1);
    await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'false');
    await page.locator('[data-view-ledger="audit-purchase"] .ledger-title-text').click();
    assert.equal(await page.evaluate(()=>state.selectedLedgerId),'audit-purchase');
    assert.equal(await page.evaluate(()=>state.page),'ledgerDetail');
    assert.equal(await page.evaluate(()=>JSON.stringify(state.ledgerRecords)),before);
    report.push({width,theme,cards});
  }
  fs.writeFileSync(path.join(output,'ledger-card-audit.json'),JSON.stringify(report,null,2));
  console.log(`PASS: ${report.length} ledger card cases: dots, amounts/dates, measurements/notes, menus, detail navigation and record preservation.`);
};
