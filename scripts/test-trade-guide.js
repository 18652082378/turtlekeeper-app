const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}, timezoneId:'Asia/Shanghai'});
    await page.clock.setFixedTime(new Date('2026-09-11T15:59:00Z'));
    await page.route('https://trade.test/**', route => route.fulfill({contentType:'text/html',body:'<button id="entry">交易指南</button>'}));
    await page.goto('https://trade.test/');
    for (const file of ['styles.css', 'chat-tools.css', 'dark-surface-audit.css']) await page.addStyleTag({path:file});
    await page.addStyleTag({path:'assets/trade-guide.css'});
    await page.addScriptTag({path:'assets/trade-guide/terms.js'});
    await page.addScriptTag({path:'assets/trade-guide.js'});
    await page.evaluate(() => { window.copyText = text => window.copied = text; showTradeIntro(); });
    // Freeze a copy for contrast checks; the production timer is tested below.
    await page.evaluate(() => { const copy = document.querySelector('.trade-intro').cloneNode(true); dismissTradeIntro(); document.body.append(copy); });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.dataset.themeColor = value, theme);
      const contrasts = await page.evaluate(() => {
        function lum(color) {
          const rgb = color.match(/[\d.]+/g).slice(0,3).map(Number).map(v => {v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;});
          return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722;
        }
        return ['.trade-intro-brand','.trade-intro-brand small','.trade-intro-content h1','.trade-intro-content p','.trade-intro-label','.trade-intro-content strong','.trade-intro-footnote','.trade-intro-skip'].map(selector => {
          const node = document.querySelector(selector);
          const style = getComputedStyle(node);
          let ancestor = node;
          while (getComputedStyle(ancestor).backgroundColor === 'rgba(0, 0, 0, 0)') ancestor = ancestor.parentElement;
          const values = [lum(style.color),lum(getComputedStyle(ancestor).backgroundColor)].sort((a,b)=>b-a);
          return {selector,ratio:(values[0]+.05)/(values[1]+.05)};
        });
      });
      for (const item of contrasts) assert.ok(item.ratio >= 4.5, `${theme} ${item.selector} contrast ${item.ratio}`);
    }
    await page.evaluate(() => { document.querySelector('.trade-intro').remove(); localStorage.clear(); });
    await page.addScriptTag({path:'assets/trade-guide.js'});
    await page.evaluate(() => showTradeIntro());
    assert.equal(await page.locator('.trade-intro').count(),1);
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('.trade-intro').count(),1, 'Intro must remain visible beyond one second');
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('.trade-intro').count(),0);
    // Old daily markers must no longer suppress another cold launch.
    await page.evaluate(() => localStorage.setItem('turtlekeeper-trade-intro-last-day', '2026-09-11'));
    await page.addScriptTag({path:'assets/trade-guide.js'});
    await page.evaluate(() => { showTradeIntro(); showTradeIntro(); });
    assert.equal(await page.locator('.trade-intro').count(),1, 'Same-day cold launch shows exactly one intro');
    await page.locator('.trade-intro-skip').click();
    await page.evaluate(() => showTradeIntro());
    assert.equal(await page.locator('.trade-intro').count(),0, 'No repeat during the same foreground visit');
    await page.addScriptTag({path:'assets/trade-guide.js'});
    await page.evaluate(() => showTradeIntro());
    assert.equal(await page.locator('.trade-intro').count(),1, 'Reopening after skip still shows intro');
    await page.evaluate(() => { dismissTradeIntro(); showTradeIntro(); });
    assert.equal(await page.locator('.trade-intro').count(),0, 'Push cancellation must suppress this entry');
    await page.evaluate(() => openTradeGuide());
    await page.getByRole('button',{name:'我想卖龟'}).click();
    assert.match(await page.locator('.trade-poster').getAttribute('src'), /seller\.png(?:\?|$)/);
    await page.getByRole('button',{name:'完整条款',exact:true}).click();
    assert.match(await page.locator('.trade-terms').textContent(), /交易总价1,000元，中介费6.80元/);
    await page.locator('[data-copy]').click();
    assert.equal(await page.evaluate(() => copied),'keyousz001');
    for (const width of [320,390,768]) {
      await page.setViewportSize({width,height:844});
      assert.equal(await page.evaluate(() => document.querySelector('.trade-guide').scrollWidth <= innerWidth),true);
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.trade-guide').count(),0);
    assert.equal(await page.evaluate(() => document.body.style.overflow),'');
    for (const file of ['assets/trade-guide/buyer.png','assets/trade-guide/seller.png','assets/trade-guide/terms.js','assets/trade-guide.js']) assert.ok(fs.existsSync(path.join('www',file)), `${file} must be bundled`);
    await page.addScriptTag({path:'assets/trade-guide.js'});
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); };
      try { showTradeIntro(); } finally { Storage.prototype.setItem = original; }
    });
    assert.equal(await page.locator('.trade-intro').count(),1, 'Intro does not depend on storage availability');
    // Simulate the actual iOS event order, including temporary interruptions.
    const nativePage = await browser.newPage();
    await nativePage.goto('about:blank');
    await nativePage.evaluate(() => {
      window.appListeners = {};
      window.Capacitor = { isNativePlatform: () => true, Plugins: { App: {
        addListener: async (name, callback) => { appListeners[name] = callback; return { remove() {} }; }
      } } };
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => Boolean(window.testHidden) });
      window.visibility = value => { testHidden = value; document.dispatchEvent(new Event('visibilitychange')); };
    });
    await nativePage.addScriptTag({path:'assets/trade-guide.js'});
    await nativePage.evaluate(() => { showTradeIntro(); dismissTradeIntro(); appListeners.appStateChange({isActive:false}); appListeners.appStateChange({isActive:true}); });
    assert.equal(await nativePage.locator('.trade-intro').count(),0, 'System prompt return is not a new entry');
    for (let visit = 0; visit < 3; visit++) {
      await nativePage.evaluate(() => { visibility(true); appListeners.pause(); appListeners.appStateChange({isActive:true}); });
      assert.equal(await nativePage.locator('.trade-intro').count(),0, 'Wait until WebView is visible');
      await nativePage.evaluate(() => { visibility(false); appListeners.appStateChange({isActive:true}); });
      assert.equal(await nativePage.locator('.trade-intro').count(),1, 'Every background return shows exactly one intro');
      await nativePage.locator('.trade-intro-skip').click();
    }
    await nativePage.evaluate(() => { visibility(true); appListeners.pause(); dismissTradeIntro(); visibility(false); appListeners.appStateChange({isActive:true}); });
    assert.equal(await nativePage.locator('.trade-intro').count(),0, 'Push routing cancels a pending foreground intro');
    await nativePage.evaluate(() => { openTradeGuide(); visibility(true); appListeners.pause(); visibility(false); appListeners.appStateChange({isActive:true}); });
    assert.equal(await nativePage.locator('.trade-intro').count(),0, 'Do not cover an already open guide');
    await nativePage.close();
    console.log('Trade guide: every cold launch/background return, prompt interruption, skip, timeout, push cancellation, storage independence, manual entry, tabs, copy and layout passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
