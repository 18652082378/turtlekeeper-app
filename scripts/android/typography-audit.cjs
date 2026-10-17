const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

// Uses synthetic, dense data. No account reads or writes. CSS comparison is
// against the shared iOS stylesheet, not a claim of running on an iPhone.
module.exports = async (page, output) => {
  await page.evaluate(() => {
    state.turtles = Array.from({ length: 540 }, (_, i) => ({
      id: 'visual-' + i, code: ['示例甲', '示例乙', '示例丙', 'GHG-1'][i % 4],
      speciesCode: 'visual-species-' + (i % 3), speciesName: '果核蛋龟',
      status: i < 535 ? '正常饲养' : i === 539 ? '已售出' : '已死亡',
      health: '健康', weight: 91 + i, carapaceLength: 8.3, price: 3300,
      acquiredDate: '2024-11-02', createdAt: '2024-11-02', photo: defaultPhoto,
      history: [], pinned: i < 2
    }));
    state.ledgerTab = 'all'; state.ledgerDatePreset = 'all';
    state.ledgerRecords = Array.from({ length: 37 }, (_, i) => ({
      id: 'visual-ledger-' + i, turtleId: 'visual-' + i, type: 'purchase',
      amount: i ? 2000 : 4066.95, recordDate: '2026-09-14', title: '示例收购记录'
    }));
    state.marketListings = Array.from({ length: 6 }, (_, i) => ({
      id: 'visual-market-' + i, title: ['自家饲养大鳄龟，状态好', '大鳄龟诚意出售'][i % 2],
      speciesName: '大鳄龟', speciesCode: 'visual', status: 'active', price: 788 + i,
      description: '示例商品', authorName: '示例用户', authorPhone: 'test-only',
      photos: [defaultPhoto], images: [defaultPhoto], image: defaultPhoto, stage: 'juvenile',
      city: '南京', delivery: 'both', negotiable: true, createdAt: '2026-09-14'
    }));
    state.marketFeedInitialized = true; state.marketFeedHasMore = false;
    state.marketFeedSessionId = ''; state.marketSearch = ''; state.marketStage = 'all';
  });
  const results = [];
  for (const width of [320, 360, 414, 720, 1100]) {
    await page.setViewportSize({ width, height: 880 });
    for (const name of ['home', 'ledger', 'market', 'messages']) {
      await page.evaluate(name => { state.themeColor = 'teal'; state.page = name; render(); scrollTo(0, 0); }, name);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(100);
      if (name === 'market') assert.equal(await page.locator('.market-card').count(), 6, 'Visual market audit requires populated cards');
      const geometry = await page.evaluate(() => {
        const rect = el => { const r = el.getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, height:r.height }; };
        const font = el => ({ size: parseFloat(getComputedStyle(el).fontSize), weight:getComputedStyle(el).fontWeight });
        const guide = document.querySelector('.market-trade-guide-entry');
        const range = document.createRange(); range.selectNodeContents(guide);
        const lines = new Set([...range.getClientRects()].filter(r => r.width).map(r => Math.round(r.top))).size;
        const collisions = [];
        for (const row of [...document.querySelectorAll('.turtle-row')].slice(0, 4)) {
          const meta = row.querySelector('.turtle-row-meta'), days = row.querySelector('.turtle-keeping-days');
          if (meta && days) for (const child of meta.children) {
            const a = child.getBoundingClientRect(), b = days.getBoundingClientRect();
            if (a.right > b.left + 1 && a.left < b.right - 1 && a.bottom > b.top + 1 && a.top < b.bottom - 1) collisions.push('measurement overlaps keeping days');
          }
        }
        return { guideLines:lines, heading:font(document.querySelector('.nav-title h1')),
          topbar:rect(document.querySelector('.topbar')), bottom:rect(document.querySelector('.bottom-nav')),
          ledgerTitle:document.querySelector('.ledger-intro h2') ? rect(document.querySelector('.ledger-intro h2')) : null,
          collisions, mainWidth:document.documentElement.scrollWidth,
          firstRow:document.querySelector('.turtle-row') ? rect(document.querySelector('.turtle-row')) : null };
      });
      assert.equal(geometry.guideLines, 1, `${name}/${width}: guide wraps at normal scale`);
      // Messages includes a two-line avatar action (image + caption).
      const headerLimit = name === 'messages' ? 72 : 65;
      if (geometry.topbar.height > headerLimit) await page.screenshot({ path:path.join(output, `typography-header-${name}-${width}.png`) });
      assert(geometry.topbar.height <= headerLimit, `${name}/${width}: header takes excessive space: ${JSON.stringify(geometry)}`);
      assert(geometry.heading.size <= 22, `${name}/${width}: oversized heading`);
      assert.equal(geometry.collisions.length, 0, `${name}/${width}: ${geometry.collisions}`);
      assert(geometry.mainWidth <= width + 1);
      if (geometry.ledgerTitle) assert(geometry.ledgerTitle.height <= 75, 'Ledger heading must not dominate the screen');
      if ([360, 414, 720].includes(width)) {
        await page.screenshot({ path: path.join(output, `visual-${name}-${width}.png`) });
        if (name === 'home') {
          await page.evaluate(() => scrollTo(0, document.querySelector('.turtle-row').getBoundingClientRect().top + scrollY - 72));
          await page.screenshot({ path: path.join(output, `visual-archives-${width}.png`) });
        }
      }
      // Capture actual effective font declarations with and without Android CSS.
      const fonts = await page.evaluate(() => {
        const selectors = ['.nav-title h1', '.market-trade-guide-entry', '.home-hero h2',
          '.home-overview-metrics strong', '.home-overview-metrics span', '.care-action strong',
          '.care-action small', '.ledger-intro h2', '.ledger-intro p:not(.eyebrow)',
          '.turtle-row-title strong', '.turtle-row-meta span', '.bottom-nav button span'];
        const capture = () => Object.fromEntries(selectors.map(s => { const el=document.querySelector(s); return [s, el ? parseFloat(getComputedStyle(el).fontSize) : null]; }));
        const android = capture();
        const css = document.querySelector('link[href="android-layout.css"]');
        css.disabled = true; const sharedIosCss = capture(); css.disabled = false;
        return { android, sharedIosCss };
      });
      for (const [selector, size] of Object.entries(fonts.android)) {
        if (size && fonts.sharedIosCss[selector]) assert(size <= fonts.sharedIosCss[selector] + 1, `${name}/${width}: ${selector} exceeds shared iOS font size`);
      }
      results.push({ name, width, geometry, fonts });
    }
  }
  fs.writeFileSync(path.join(output, 'typography-audit.json'), JSON.stringify(results, null, 2));
  console.log(`PASS: ${results.length} dense-data typography comparisons; normal header height, shared iOS font bounds, archive collisions and visual screenshots.`);
};
