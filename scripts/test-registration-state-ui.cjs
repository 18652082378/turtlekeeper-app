// Real isolated API, mock SMS, synthetic accounts; no production requests.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const net = require('node:net'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
async function main() {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'turtle-registration-test-'));
  const port = await new Promise(resolve => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); });
  });
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['server/server.js'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), TURTLE_RUNTIME_DIR: runtime,
      MYSQL_HOST: '', MYSQL_URL: '', SMS_PROVIDER: 'mock', SMS_MOCK: 'true', APNS_KEY_PATH: '', APNS_KEY_BASE64: '' } });
  let browser, logs = '';
  server.stdout.on('data', b => logs += b); server.stderr.on('data', b => logs += b);
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(origin + '/api/app/version')).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const scenario of ['same-tab', 'lost-state', 'expired-local-state', 'wrong-code', 'not-sent']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.route('**/*', route => {
        if (!route.request().url().startsWith(origin + '/')) return route.abort();
        if (new URL(route.request().url()).pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: `window.TURTLE_API_BASE_URL=${JSON.stringify(origin)};window.TURTLE_APP_BUILD=114;` });
        return route.continue();
      });
      await page.goto(origin);
      await page.waitForFunction(() => typeof render === 'function');
      await page.evaluate(() => { window.dismissTradeIntro?.(); state.page = 'account'; state.accountMode = 'register'; state.policyConsentRequired = false; render(); });
      const phone = '1390000100' + ['same-tab', 'lost-state', 'expired-local-state', 'wrong-code', 'not-sent'].indexOf(scenario);
      await page.locator('#accountForm [name="phone"]').fill(phone);
      await page.locator('#accountForm [name="password"]').fill('RegistrationTest123');
      await page.locator('#accountForm [name="confirmPassword"]').fill('RegistrationTest123');
      let code = '123456';
      if (scenario !== 'not-sent') {
        const sent = page.waitForResponse(r => r.url().endsWith('/api/sms/send'));
        await page.locator('[data-send-code]').click();
        const result = await (await sent).json();
        assert.equal(result.mode, 'mock'); code = result.code;
        await page.waitForFunction(phone => state.pendingAuthPhone === phone, phone);
      }
      if (scenario === 'same-tab') {
        await page.locator('[data-account-mode="register"]').click();
        assert.equal(await page.evaluate(() => state.pendingAuthPhone), phone, 'active tab must not erase SMS state');
      }
      if (scenario === 'lost-state' || scenario === 'not-sent') {
        await page.evaluate(() => { state.pendingAuthPhone = ''; state.authCodeExpiresAt = ''; });
      }
      if (scenario === 'expired-local-state') await page.evaluate(() => { state.authCodeExpiresAt = '1'; });
      if (scenario === 'wrong-code') code = code === '000000' ? '000001' : '000000';
      await page.locator('#accountForm [name="termsAccepted"]').check();
      const registered = page.waitForResponse(r => r.url().endsWith('/api/account/register'));
      await page.locator('#accountForm [name="code"]').fill(code);
      const response = await registered, result = await response.json();
      if (scenario === 'wrong-code' || scenario === 'not-sent') {
        assert.equal(response.status(), 400);
        assert.equal(result.ok, false);
        assert.equal(result.message, scenario === 'wrong-code' ? '验证码不正确' : '请先获取验证码');
        assert(!await page.evaluate(() => state.loggedInPhone));
      } else {
        assert.equal(response.status(), 200); assert.equal(result.user.phone, phone);
        await page.waitForFunction(phone => state.loggedInPhone === phone, phone);
      }
      await context.close();
    }
    console.log('PASS: active registration tab, missing/expired client state, valid server SMS, wrong SMS and never-requested SMS.');
  } catch (e) { console.error(logs.slice(-1800)); throw e; }
  finally { await browser?.close(); server.kill(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
