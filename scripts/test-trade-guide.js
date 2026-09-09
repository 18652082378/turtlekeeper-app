const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.route('https://trade.test/**', route => route.fulfill({contentType:'text/html',body:'<button id="entry">交易指南</button>'}));
    await page.goto('https://trade.test/');
    await page.addStyleTag({path:'assets/trade-guide.css'});
    await page.addScriptTag({path:'assets/trade-guide/terms.js'});
    await page.addScriptTag({path:'assets/trade-guide.js'});
    await page.evaluate(() => { window.copyText = text => window.copied = text; showTradeIntro(); });
    assert.equal(await page.locator('.trade-intro').count(),1);
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('.trade-intro').count(),1, 'Intro must remain visible beyond one second');
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('.trade-intro').count(),0);
    // Simulate a new cold start on the same day by reloading the module.
    await page.addScriptTag({path:'assets/trade-guide.js'});
    await page.evaluate(() => showTradeIntro());
    assert.equal(await page.locator('.trade-intro').count(),0);
    await page.evaluate(() => { localStorage.clear(); dismissTradeIntro(); showTradeIntro(); });
    assert.equal(await page.locator('.trade-intro').count(),0, 'Push cancellation must suppress startup');
    await page.evaluate(() => openTradeGuide());
    await page.getByRole('button',{name:'我想卖龟'}).click();
    assert.match(await page.locator('.trade-poster').getAttribute('src'), /seller.png$/);
    await page.getByRole('button',{name:'完整条款',exact:true}).click();
    assert.match(await page.locator('.trade-terms').textContent(), /交易总价1,000元，中介费8.80元/);
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
    console.log('Trade guide: daily intro, timeout, push cancellation, tabs, fees, copy, responsive layout, cleanup and bundled assets passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
