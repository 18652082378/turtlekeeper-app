'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(path.join(root, '.browser-tests'))) process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.browser-tests');
const { launchBrowser, engine } = require('./browser-test-engine.cjs'), fixture = require('./ui-audit-fixture.cjs');
const { runtime } = require('./mediation-test-runtime.cjs');
(async () => {
  const r = await runtime(), browser = await launchBrowser();
  const out = path.join(root, 'output/mediation-ui-' + engine); fs.mkdirSync(out, { recursive: true });
  const checks = [], errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    let createRequests = 0, holdCreate = false, releaseCreate, failNextList = false, holdList = false, releaseList, loseCreateAck = false, malformedList = false, holdUpdate = false, releaseUpdate;
    const sentCreateKeys = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== r.base) return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: `window.TURTLE_API_BASE_URL=${JSON.stringify(r.base)};` });
      if (url.pathname.startsWith('/api/mediation/')) {
        if (url.pathname.endsWith('/update') && holdUpdate) { holdUpdate = false; await new Promise(resolve => releaseUpdate = resolve); }
        if (url.pathname.endsWith('/list') && malformedList) { malformedList = false; return route.fulfill({ json: { ok: true } }); }
        if (url.pathname.endsWith('/create')) {
          createRequests++;
          sentCreateKeys.push(route.request().postDataJSON().requestId);
          if (holdCreate) await new Promise(resolve => releaseCreate = resolve);
          if (loseCreateAck) { loseCreateAck = false; await route.fetch(); return route.fulfill({ status: 503, json: { ok: false, message: '测试回执丢失，请保留内容重试' } }); }
        }
        if (url.pathname.endsWith('/list') && failNextList) { failNextList = false; return route.fulfill({ status: 503, json: { ok: false, message: '测试读取失败，点击重试' } }); }
        if (url.pathname.endsWith('/list') && holdList) { holdList = false; const response = await route.fetch(); await new Promise(resolve => releaseList = () => route.fulfill({ response }).then(resolve)); return; }
        return route.continue();
      }
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, posts: [], listings: [], friends: [], messages: [], minimumBuild: 0 } });
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
    await page.goto(r.base + '/?skipIntro=1');
    const seed = async (name, target = 'mine', extra = {}) => page.evaluate(({ name, target, extra, base, phone, token, listing }) => {
      dismissTradeIntro?.(); TurtleReleaseNotes.cancel();
      state = { ...initialState, ...emptyAccountData(), ...base, page: target, loggedInPhone: phone, cloudToken: token, accountName: '测试' + name,
        isCommunityAdmin: name === 'admin', marketListings: [{ ...base.marketListings[0], ...listing, isOwn: false }], marketFeedInitialized: true, mediationScope: 'mine', ...extra };
      marketLoading = communityLoading = messageUnreadLoading = true; forceUpdateState = { required: false }; edgeBackSnapshots = []; render();
    }, { name, target, extra, base: fixture(), phone: r.accounts[name] || '', token: name ? r.token(name) : '', listing: r.listing });
    await seed('alice');
    await page.locator('[data-page="mediation"]').click();
    await page.waitForSelector('.mediation-empty'); assert.match(await page.locator('.mediation-empty').innerText(), /暂无申请记录/);
    await page.locator('[data-mediation-start]').first().click();
    await page.locator('[name="title"]').fill('双方已谈好的龟'); await page.locator('[name="speciesName"]').fill('果核蛋龟');
    await page.locator('[name="amount"]').fill('1400'); await page.locator('[name="contact"]').fill('test-alice-wechat');
    await page.locator('[name="note"]').fill('请核实买卖双方约定'); await page.locator('[name="agreed"]').check();
    assert.match(await page.locator('#mediationFee').innerText(), /9\.52/);
    holdCreate = true;
    await page.locator('[data-mediation-apply] button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('[data-mediation-apply] button[type="submit"]')?.disabled);
    await page.evaluate(() => { document.querySelector('[data-mediation-apply]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    for (let i = 0; i < 50 && !releaseCreate; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(releaseCreate); releaseCreate(); holdCreate = false;
    await page.waitForSelector('.mediation-progress'); assert.equal(createRequests, 1); assert.equal(r.disk().mediationApplications.length, 1);
    const application = r.disk().mediationApplications[0];
    assert.match(await page.locator('.mediation-summary').innerText(), /9\.52/); assert.match(await page.locator('.mediation-progress').innerText(), /待受理/);
    checks.push('Real applicant submission creates once under rapid submits, quotes 0.68% fee and preserves application information');
    for (const theme of ['teal', 'dark']) for (const width of [280, 320, 390, 720, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const target of ['mediation', 'mediationDetail', 'mediationApply']) {
        await page.evaluate(({ theme, target, id }) => { state.themeColor = theme; setState({ page: target, selectedMediationApplicationId: id }, { skipSave: true, skipCloud: true }); }, { theme, target, id: application.id });
        await page.waitForSelector('.mediation-page');
        if (target === 'mediation') await page.waitForSelector('.mediation-record');
        if (target === 'mediationDetail') await page.waitForSelector('.mediation-summary');
        const geometry = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 1, controls: [...document.querySelectorAll('.mediation-page input,.mediation-page select,.mediation-page textarea,.mediation-page button')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().right > innerWidth + 1).length }));
        assert.equal(geometry.over, false, `${theme}/${width}/${target}: page overflow`); assert.equal(geometry.controls, 0, `${theme}/${width}/${target}: control overflow`);
        if (width === 390 && target === 'mediationDetail') { await page.waitForTimeout(350); await page.screenshot({ path: path.join(out, 'detail-' + theme + '.png'), fullPage: true }); }
      }
    }
    checks.push('30 responsive layouts: applicant list/application/detail, 280–1280px and both themes');
    await seed('bob', 'mediation'); await page.waitForSelector('.mediation-empty'); assert.equal(await page.locator('[data-mediation-open]').count(), 0);
    await seed('admin', 'mine'); await page.locator('[data-mediation-all]').first().click(); await page.waitForSelector('.mediation-record');
    assert.match(await page.locator('.topbar').innerText(), /全部中介申请/);
    await page.locator('[data-mediation-open]').first().click(); await page.waitForSelector('[data-mediation-admin]');
    await page.locator('[data-mediation-admin] [name="status"]').selectOption('accepted');
    await page.locator('[data-mediation-admin] [name="reply"]').fill('已联系申请人，正在确认双方交易约定');
    await page.locator('[data-mediation-admin] button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('.mediation-summary .mediation-status')?.textContent === '已受理');
    assert.equal(r.disk().mediationApplications[0].status, 'accepted');
    checks.push('Admin all-user entry, real processing and server-saved public reply');
    await seed('alice', 'mediationDetail', { selectedMediationApplicationId: application.id }); await page.waitForSelector('.mediation-progress');
    assert.match(await page.locator('.mediation-progress').innerText(), /已联系申请人/); assert.equal(await page.locator('[data-mediation-admin]').count(), 0);
    assert.equal(await page.locator('[data-mediation-withdraw]').count(), 0);
    checks.push('Applicant sees updated admin progress without admin controls or post-acceptance withdrawal');
    await seed('bob', 'mediation'); await page.waitForSelector('.mediation-empty');
    failNextList = true; await page.locator('[data-mediation-filter] button').click(); await page.waitForSelector('[data-mediation-retry]');
    assert.match(await page.locator('.mediation-notice').innerText(), /读取失败/); await page.locator('[data-mediation-retry]').click(); await page.waitForSelector('.mediation-empty');
    checks.push('Read failure is distinct from empty success and retry recovers');
    malformedList = true; await page.locator('[data-mediation-filter] button').click(); await page.waitForSelector('[data-mediation-retry]');
    assert.match(await page.locator('.mediation-notice').innerText(), /信息不完整/);
    await page.locator('[data-mediation-retry]').click(); await page.waitForSelector('.mediation-empty');
    checks.push('Malformed successful response shows a retryable error rather than a false empty list or runtime exception');
    await seed('alice', 'mine'); holdList = true; await page.locator('[data-page="mediation"]').click();
    for (let i = 0; i < 100 && !releaseList; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(releaseList); await seed('bob', 'mediation'); await page.waitForSelector('.mediation-empty'); await releaseList();
    await page.waitForTimeout(100); assert.equal(await page.locator('[data-mediation-open]').count(), 0); assert.doesNotMatch(await page.locator('.mediation-page').innerText(), /test-alice-wechat/);
    checks.push('Late list response after account switch cannot expose another applicant record');
    await seed('alice', 'marketDetail', { selectedMarketListingId: r.listing.id });
    await page.locator('[data-market-platform-service]').click(); await page.waitForSelector('[data-mediation-apply]');
    assert.equal(await page.locator('[name="title"]').inputValue(), r.listing.title); assert.equal(await page.locator('[name="amount"]').inputValue(), '1400');
    assert.equal(r.disk().marketListings[0].wantedPhones.length, 0);
    checks.push('Product entry retains product snapshot/amount and opening application does not record market want');
    await seed('bob', 'mediation'); await page.waitForSelector('.mediation-empty');
    await page.locator('[data-mediation-start]').first().click();
    await page.locator('[name="title"]').fill('失败重试测试'); await page.locator('[name="speciesName"]').fill('果核蛋龟');
    await page.locator('[name="amount"]').fill('500'); await page.locator('[name="contact"]').fill('test-bob-wechat'); await page.locator('[name="agreed"]').check();
    loseCreateAck = true;
    await page.locator('[data-mediation-apply] button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('[data-mediation-form-error]')?.textContent.includes('回执丢失'));
    assert.equal(await page.locator('[name="contact"]').inputValue(), 'test-bob-wechat'); assert.equal(await page.locator('[name="amount"]').inputValue(), '500');
    assert.equal(await page.locator('[data-mediation-apply] button[type="submit"]').isEnabled(), true);
    await page.locator('[name="note"]').fill('回执丢失后尝试修改');
    await page.locator('[data-mediation-apply] button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('[data-mediation-form-error]')?.textContent.includes('申请内容已变化'));
    assert.equal(r.disk().mediationApplications.filter(item => item.applicantPhone === r.accounts.bob).length, 1);
    await page.locator('[name="note"]').fill('');
    await page.locator('[data-mediation-apply] button[type="submit"]').click(); await page.waitForSelector('.mediation-progress');
    assert.equal(sentCreateKeys.at(-1), sentCreateKeys.at(-2));
    assert.equal(r.disk().mediationApplications.filter(item => item.applicantPhone === r.accounts.bob).length, 1);
    page.once('dialog', dialog => dialog.accept()); await page.locator('[data-mediation-withdraw]').click();
    await page.waitForFunction(() => document.querySelector('.mediation-summary .mediation-status')?.textContent === '已撤回');
    checks.push('Lost acknowledgment retains full draft and retry identity, avoids duplicate committed applications, and pending withdrawal updates progress');
    const bobApplication = r.disk().mediationApplications.find(item => item.applicantPhone === r.accounts.bob);
    await seed('admin', 'mediation', { mediationScope: 'all' }); await page.waitForSelector(`[data-mediation-open="${application.id}"]`);
    await page.locator(`[data-mediation-open="${application.id}"]`).click(); await page.waitForSelector('[data-mediation-admin]');
    await page.locator('[data-mediation-admin] [name="status"]').selectOption('processing'); await page.locator('[data-mediation-admin] [name="reply"]').fill('上一份申请的延迟处理说明');
    holdUpdate = true; await page.locator('[data-mediation-admin] button[type="submit"]').click();
    for (let i = 0; i < 50 && !releaseUpdate; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(releaseUpdate);
    await page.evaluate(() => setState({ page: 'mediation' }, { skipSave: true, skipCloud: true })); await page.waitForSelector(`[data-mediation-open="${bobApplication.id}"]`);
    await page.locator(`[data-mediation-open="${bobApplication.id}"]`).click(); await page.waitForSelector('[data-mediation-admin]');
    releaseUpdate();
    await page.waitForFunction(() => !document.querySelector('[data-mediation-admin] button[type="submit"]')?.disabled);
    assert.match(await page.locator('.mediation-summary').innerText(), /失败重试测试/);
    assert.doesNotMatch(await page.locator('.mediation-progress').innerText(), /上一份申请的延迟处理说明/);
    await page.locator('[data-mediation-admin] [name="reply"]').fill('管理员未保存的说明');
    page.once('dialog', dialog => dialog.dismiss()); await page.locator('[data-mediation-refresh]').click();
    assert.equal(await page.locator('[data-mediation-admin] [name="reply"]').inputValue(), '管理员未保存的说明');
    page.once('dialog', dialog => dialog.accept()); await page.locator('[data-mediation-refresh]').click();
    await page.waitForFunction(() => document.querySelector('[data-mediation-admin] [name="reply"]')?.value === '');
    checks.push('Late admin save cannot replace another application or leave controls locked; cancelled refresh preserves unsaved admin writing');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), engine, nativeDevice: false, checks, errors }, null, 2));
    console.log('PASS mediation UI ' + engine + ': ' + checks.join('; ') + '.');
    await context.close();
  } finally { await browser.close(); await r.stop(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
