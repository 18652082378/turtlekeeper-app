'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser } = require('./browser-test-engine.cjs');

const root = path.resolve(__dirname, '..');
const origin = 'https://operations-tabs.test';
const operationsPath = '/api/admin/operations/overview';

async function main() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(12000);
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const { origin: target, pathname } = new URL(route.request().url());
      if (target !== origin) return route.abort();
      if (pathname === operationsPath) {
        const payload = route.request().postDataJSON();
        requests.push({ tab: payload.tab, date: payload.date, finish: json => route.fulfill({ json }),
          fail: () => route.fulfill({ status: 503, json: { ok: false } }) });
        return;
      }
      if (pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, latestBuild: 0 } });
      if (pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: `window.TURTLE_API_BASE_URL=${JSON.stringify(origin)}` });
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404 });
      const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
      return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await page.goto(origin + '/?skipIntro=1');
    const nextRequest = async (count, action) => {
      const response = page.waitForRequest(request => new URL(request.url()).pathname === operationsPath);
      await action();
      await response;
      for (let attempt = 0; requests.length < count && attempt < 50; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(requests.length, count);
      return requests[count - 1];
    };
    const growth = await nextRequest(1, () => page.evaluate(() => {
      dismissTradeIntro?.();
      TurtleReleaseNotes?.cancel();
      setState({ loggedInPhone: '13900007889', cloudToken: 'synthetic', isCommunityAdmin: true,
        page: 'operations', operationsTab: 'analytics' }, { skipSave: true });
    }));
    assert.equal(growth.tab, 'analytics');
    const market = await nextRequest(2, () => page.locator('[data-operations-tab="market"]').click());
    assert.equal(market.tab, 'market');
    const marketDate = await nextRequest(3, () => page.locator('[data-operations-date]').evaluate(input => {
      input.value = '2026-11-14';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }));
    assert.equal(marketDate.date, '2026-11-14');
    await marketDate.finish({ ok: true, tab: 'market', date: marketDate.date, market: { topListings: [{ title: '所选日期商品' }] } });
    await page.getByText('所选日期商品').waitFor();
    await market.finish({ ok: true, tab: 'market', date: '2026-11-15', market: { topListings: [{ title: '旧日期商品' }] } });
    await growth.finish({ ok: true, tab: 'analytics', date: '2026-11-15', analytics: { date: '2026-11-15', visitCount: 6 } });
    assert.equal(await page.getByText('旧日期商品').count(), 0);
    assert.equal(await page.getByText('所选日期商品').count(), 1);
    const chat = await nextRequest(4, () => page.locator('[data-operations-tab="chats"]').click());
    assert.equal(chat.tab, 'chats');
    assert.equal(chat.date, undefined);
    await chat.fail();
    const retry = await nextRequest(5, () => page.locator('[data-operations-retry]').click());
    await retry.finish({ ok: true, tab: 'chats', conversations: [] });
    await page.getByText('暂无用户聊天').waitFor();
    await page.locator('[data-operations-tab="market"]').click();
    await page.getByText('所选日期商品').waitFor();
    assert.equal(requests.length, 5, 'fresh tab cache avoids a duplicate request');
    assert.deepEqual(errors, []);
    console.log('PASS operations tabs: request only the active section, independent date requests, stale-response isolation and retry.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
