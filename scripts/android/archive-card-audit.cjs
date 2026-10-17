const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

module.exports = async (page, output) => {
  await page.evaluate(() => {
    state.turtles = [
      ['示例甲', 91, 8.3, 3300], ['示例乙', 93.8, 7.8, 488],
      ['示例丙', 5, 5, 300], ['GHG-1', 230, 10.5, 610], ['示例丁', 123, 12.8, 3601.95]
    ].map(([code, weight, carapaceLength, price], i) => ({ id:'card-' + i, code, weight, carapaceLength, price,
      speciesName:'果核蛋龟', speciesCode:'test-species', status:'正常饲养', health:'健康',
      acquiredDate:'2024-11-02', createdAt:'2024-11-02', photo:defaultPhoto, pinned:i < 2, history:[] }));
    state.page = 'home'; state.openTurtleMenuId = ''; render();
  });
  const results = [];
  for (const width of [280, 300, 320, 340, 360, 414, 600, 720, 840, 1100, 1600]) {
    await page.setViewportSize({ width, height: 880 });
    for (const theme of ['teal', 'dark']) {
      await page.evaluate(theme => { state.themeColor = theme; state.page = 'home'; render(); }, theme);
      await page.waitForTimeout(60);
      const result = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.home-archive-section .turtle-row')];
        return cards.map(card => {
          const r=card.getBoundingClientRect(), menu=card.querySelector('.more-btn'), b=menu.getBoundingClientRect();
          const dots=menu.querySelector('span'), dot=getComputedStyle(dots, '::before');
          const rect = el => { const x=el.getBoundingClientRect(); return {left:x.left,right:x.right,top:x.top,bottom:x.bottom}; };
          const chips=[...card.querySelectorAll('.turtle-row-meta > span')].map(el => ({text:el.textContent, ...rect(el)}));
          const name=rect(card.querySelector('.turtle-row-title > strong'));
          const species=rect(card.querySelector('.turtle-row-species > p'));
          const meta=rect(card.querySelector('.turtle-row-meta'));
          const photo=rect(card.querySelector('img'));
          const info=['.turtle-pool-title-meta','.turtle-price','.turtle-keeping-days'].map(s=>rect(card.querySelector(s)));
          return { height:r.height, width:r.width, chips, name, species, meta, photo, info, menuLeft:b.left,
            target:{width:b.width,height:b.height,inside:b.left>=r.left && b.right<=r.right && b.top>=r.top && b.bottom<=r.bottom},
            dot:{font:getComputedStyle(dots).fontSize,width:dot.width,height:dot.height,shadow:dot.boxShadow},
            contentInside: [...chips,...info,name,species].every(x=>x.left>=r.left && x.right<=r.right+1 && x.bottom<=r.bottom) };
        });
      });
      assert.equal(result.length, 5, 'Use all varied archive examples');
      fs.writeFileSync(path.join(output, 'archive-card-current.json'), JSON.stringify({ width, theme, cards: result }, null, 2));
      if (result.some(card => card.info.some(x => x.right > card.menuLeft - 3))) {
        await page.evaluate(() => scrollTo(0, document.querySelector('.turtle-row').getBoundingClientRect().top + scrollY - 72));
        await page.screenshot({ path: path.join(output, 'archive-card-current-failure.png') });
      }
      for (const card of result) {
        assert(Math.abs(card.photo.right-card.photo.left-58)<1 && Math.abs(card.photo.bottom-card.photo.top-58)<1, 'Archive photo retains the iOS 58px size');
        assert(Math.abs((card.photo.top+card.photo.bottom)/2-(card.name.top+card.meta.bottom)/2)<3, 'Photo centers on the entire name/species/measurement group');
        assert([card.species.left,card.meta.left,card.chips[0].left].every(x=>Math.abs(x-card.name.left)<1), `${width}/${theme}: identity and measurement column misaligned`);
        assert(Math.abs(card.chips[0].top-card.chips[1].top)<1, `${width}/${theme}: measurements must stay on one line`);
        assert(card.info.every(x=>Math.abs(x.right-card.info[0].right)<1), `${width}/${theme}: pool/price/days must share a right edge`);
        assert(card.info.every(x=>x.right<=card.menuLeft-3), `${width}/${theme}: information under menu`);
        assert(card.menuLeft-card.info[0].right<=6, `${width}/${theme}: excessive menu gutter`);
        assert(card.info[0].bottom<=card.info[1].top && card.info[1].bottom<=card.info[2].top, 'Financial rows must not overlap');
        assert(card.chips.every(x=>x.bottom<=card.info[2].top || x.right<=card.info[2].left-3), `${width}/${theme}: measurements collide with keeping days: ${JSON.stringify({chips:card.chips,days:card.info[2]})}`);
        assert(card.contentInside, `${width}/${theme}: card content overflow`);
        assert(card.target.inside && card.target.width>=44 && card.target.height>=44, 'Menu target must be inside the card and separate from data');
        assert(card.dot.font==='0px' && card.dot.width==='3px' && card.dot.height==='3px' && card.dot.shadow!=='none', 'Dots must be drawn at a fixed size, not font glyphs');
        assert(card.height <= (width<360 ? 132 : 106), `${width}/${theme}: unnecessary card height ${card.height}`);
      }
      assert(Math.max(...result.map(r=>r.height))-Math.min(...result.map(r=>r.height))<=1, 'Typical card heights should match');
      const menu = page.locator('[data-view-turtle="card-0"] .more-btn');
      await menu.click();
      assert.equal(await menu.getAttribute('aria-expanded'), 'true');
      assert.equal(await page.evaluate(() => state.page), 'home', 'Menu click must not open record details');
      assert.equal(await page.locator('[data-view-turtle="card-0"] .archive-turtle-menu [role="menuitem"]').count(), 6);
      await menu.click();
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.evaluate(() => state.turtles.length), 5, 'Menu must not mutate records');
      if ([280,320,360,720].includes(width)) {
        await page.evaluate(() => scrollTo(0, document.querySelector('.turtle-row').getBoundingClientRect().top + scrollY - 72));
        await page.screenshot({ path:path.join(output, `cards-${width}-${theme}.png`) });
      }
      results.push({width,theme,cards:result});
    }
  }
  fs.writeFileSync(path.join(output,'archive-card-audit.json'),JSON.stringify(results,null,2));
  console.log(`PASS: ${results.length} archive card cases: aligned identity and financial columns, clear menu gutter, full measurements and working menus.`);
};
