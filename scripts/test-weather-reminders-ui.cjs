'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { engine, launchBrowser } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await launchBrowser(), results = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'weather.test') return route.abort();
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="https://weather.test";' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, latestBuild: 0, friends: [], messages: [] } });
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream' });
  });
  async function check(name, run) {
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto('https://weather.test/?skipIntro=1');
      await page.evaluate(() => {
        window.dismissTradeIntro?.(); if (messageUnreadTimer) clearInterval(messageUnreadTimer);
        state = { ...state, ...emptyAccountData(), page: 'memos', careTab: 'weather', loggedInPhone: 'weather-a', cloudToken: 'synthetic', policyConsentRequired: false };
        cloudHydrationComplete = true; refreshMessageUnread = refreshCommunity = () => {}; window.confirm = () => true;
        window.requests = []; window.notes = []; toast = t => notes.push(t); setupNativePushNotifications = async () => {}; nativePushNotifications = () => null;
        window.city = { id: '101020100', name: '上海市', province: '上海市', city: '上海市', latitude: 31.23, longitude: 121.47 };
        window.settings = { enabled: false, targetTemperature: 20, difference: 3, remindTime: '18:00', advanceDays: 1, location: null };
        window.response = () => ({ ok: true, settings, notices: [], providerConfigured: true, pushConfigured: true, hasPushDevice: true });
        apiPost = async (route, body) => {
          requests.push({ route, body });
          if (window.defer) return new Promise(resolve => { window.resume = resolve; });
          if (route.endsWith('/locations')) return { ok: true, locations: [city] };
          if (route.endsWith('/save')) { settings = { ...body.settings, location: body.settings.locationId ? city : null }; }
          return response();
        };
        render();
      });
      await page.waitForSelector('#weatherForm input:not([disabled])');
      await run(page); assert.deepEqual(errors, []); results.push({ name, pass: true }); console.log('PASS ' + name);
    } catch (error) { results.push({ name, pass: false, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message); }
    finally { await page.close(); }
  }
  try {
    await check('mobile defaults and responsive form at 320 and 390 pixels', async page => {
      assert.match(await page.locator('.weather-consent').innerText(), /Apple Weather/); assert.equal(await page.locator('.weather-attribution img').getAttribute('src'), 'assets/apple-weather-mark.png'); assert.equal(await page.locator('.weather-attribution > a').getAttribute('href'), 'https://weatherkit.apple.com/legal-attribution.html');
      assert.equal(await page.locator('[name="remindTime"]').inputValue(), '18:00'); assert.equal(await page.locator('[name="advanceDays"]').inputValue(), '1'); assert.equal(await page.locator('[name="advanceDays"] option').count(), 7);
      for (const width of [320, 390]) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(root, 'output/weather-reminders', `settings-${engine}.png`), fullPage: true });
    });
    await check('city search requires consent, selection preserves unsaved fields and save retains preferences', async page => {
      await page.locator('[name="targetTemperature"]').fill('24'); await page.locator('[name="difference"]').fill('5'); await page.locator('[name="remindTime"]').fill('07:30'); await page.locator('[name="advanceDays"]').selectOption('7');
      await page.locator('[name="cityQuery"]').fill('上海'); await page.locator('[data-weather-search]').click(); assert.equal(await page.evaluate(() => requests.filter(r => r.route.endsWith('/locations')).length), 0);
      await page.locator('[name="weatherConsent"]').check(); await page.locator('[data-weather-search]').click(); await page.locator('[data-weather-location]').click();
      assert.equal(await page.locator('[name="targetTemperature"]').inputValue(), '24'); assert.equal(await page.locator('[name="advanceDays"]').inputValue(), '7');
      await page.locator('[name="enabled"]').check(); await page.locator('#weatherForm [type="submit"]').click();
      await page.waitForFunction(() => requests.some(r => r.route.endsWith('/save')) && notes.includes('温度提醒已保存'));
      const saved = await page.evaluate(() => requests.find(r => r.route.endsWith('/save')).body); assert.equal(saved.settings.locationId, '101020100'); assert.equal(saved.settings.location, undefined); assert.equal(saved.settings.remindTime, '07:30'); assert.equal(saved.settings.advanceDays, 7); assert.equal(saved.weatherConsent, true);
      assert.match(await page.locator('[data-weather-rule]').innerText(), /≤19℃/); assert.equal(await page.evaluate(() => TurtleWeather.hasChanges()), false);
    });
    await check('Enter in city search does not submit reminder settings', async page => {
      await page.locator('[name="weatherConsent"]').check(); await page.locator('[name="cityQuery"]').fill('上海'); await page.locator('[name="cityQuery"]').press('Enter'); await page.waitForSelector('[data-weather-location]');
      assert.equal(await page.evaluate(() => requests.some(r => r.route.endsWith('/save'))), false);
    });
    await check('location refusal permits manual city search', async page => {
      await page.evaluate(() => { getMarketLocationPosition = async () => { throw Error('denied'); }; });
      await page.locator('[name="weatherConsent"]').check(); await page.locator('[data-weather-locate]').click(); await page.waitForFunction(() => document.querySelector('.weather-feedback')?.textContent.includes('定位未成功'));
      await page.locator('[name="cityQuery"]').fill('上海'); await page.locator('[data-weather-search]').click(); await page.waitForSelector('[data-weather-location]');
    });
    await check('failed save preserves form and marks it unsaved; cancelled leave stays', async page => {
      await page.locator('[name="targetTemperature"]').fill('28');
      await page.evaluate(() => { apiPost = async () => { throw Error('synthetic offline'); }; window.confirm = () => false; });
      await page.locator('#weatherForm [type="submit"]').click(); await page.waitForSelector('[role="alert"]');
      assert.equal(await page.locator('[name="targetTemperature"]').inputValue(), '28'); assert.equal(await page.evaluate(() => TurtleWeather.hasChanges()), true);
      await page.locator('[data-care-tab="care"]').click(); assert.equal(await page.evaluate(() => state.careTab), 'weather');
    });
    await check('late response after account switch cannot leak city or notices', async page => {
      await page.evaluate(() => { window.defer = true; }); await page.locator('[data-weather-retry]').click();
      await page.evaluate(() => { window.oldResume = resume; window.defer = false; settings = { ...settings, location: null }; state.loggedInPhone = 'weather-b'; render(); });
      await page.waitForSelector('#weatherForm input:not([disabled])');
      await page.evaluate(() => oldResume({ ...response(), settings: { ...settings, location: city }, notices: [{ body: 'private account-a notice' }] }));
      assert.doesNotMatch(await page.locator('.weather-content').innerText(), /private account-a|上海市/);
    });
    await check('notification tap navigates directly to temperature reminder settings', async page => {
      await page.evaluate(() => { state.page = 'messages'; queueNativePushAction({ data: { route: 'weather' } }); });
      assert.equal(await page.evaluate(() => state.page), 'memos'); assert.equal(await page.evaluate(() => state.careTab), 'weather');
    });
    await check('load failure exposes retry, never an editable fake successful setting', async page => {
      await page.evaluate(() => { state.loggedInPhone = 'failed-weather-account'; apiPost = async () => { throw Error('settings offline'); }; render(); });
      await page.waitForSelector('[data-weather-retry]'); assert.equal(await page.locator('#weatherForm').count(), 0); assert.match(await page.locator('.weather-content').innerText(), /settings offline/);
    });
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(root, 'output/weather-reminders', `ui-${engine}.json`), JSON.stringify(results, null, 2));
  if (results.some(r => !r.pass)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
