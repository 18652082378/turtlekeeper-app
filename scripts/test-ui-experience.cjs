const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const uiFixture = require('./ui-audit-fixture.cjs');
const outcomes = [];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'ui-experience.test') return route.abort();
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true, minimumBuild: 0, latestBuild: 0, posts: [], listings: [], notifications: [], items: [] } });
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' })[path.extname(file)] || 'application/octet-stream' });
  });
  const tick = page => page.evaluate(() => new Promise(requestAnimationFrame));
  async function check(name, run) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto('https://ui-experience.test/?skipIntro=1');
      await page.evaluate(() => {
        window.dismissTradeIntro?.();
        state = { ...state, ...emptyAccountData(), loggedInPhone: 'preview', cloudToken: '', policyConsentRequired: false, page: 'home' };
        render();
        const fixture = document.createElement('div'); fixture.id = 'uiAudit';
        fixture.style.cssText = 'position:fixed;top:160px;left:20px;right:20px;z-index:1500;background:white;color:black';
        fixture.innerHTML = '<button id="auditOpen">打开</button><aside id="auditOriginalInert" inert>原本不可交互</aside>';
        document.body.append(fixture);
        window.auditDialog = (id, z = 3000, parent = document.body) => {
          const layer = document.createElement('div'); layer.id = id + '-layer';
          layer.style.cssText = `position:fixed;inset:110px 20px auto;z-index:${z};background:white;color:black;padding:16px`;
          layer.innerHTML = `<section id="${id}" role="dialog" aria-modal="true"><h2>${id}</h2><button id="${id}-close" aria-label="关闭">关闭</button><input id="${id}-input" placeholder="输入内容"><button id="${id}-last">继续</button></section>`;
          parent.append(layer);
          layer.querySelector('button').onclick = () => layer.remove();
          return layer.querySelector('section');
        };
      });
      await run(page);
      assert.deepEqual(errors, [], 'no uncaught runtime errors');
      outcomes.push({ name, pass: true });
    } catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
    finally { await page.close(); }
  }
  try {
    await check('modal traps Tab, hides background and restores opener without removing authored inert', async page => {
      await page.evaluate(() => { auditOpen.focus(); auditOpen.onclick = () => auditDialog('first'); auditOpen.click(); });
      await tick(page);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'first');
      assert.equal(await page.evaluate(() => document.getElementById('uiAudit').inert), true);
      await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'first-close');
      await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'first-last');
      await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'first-close');
      await page.keyboard.press('Escape'); await tick(page);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'auditOpen');
      assert.equal(await page.evaluate(() => document.getElementById('uiAudit').inert), false);
      assert.equal(await page.evaluate(() => document.getElementById('auditOriginalInert').inert), true);
    });
    await check('synchronous autofocus in real account dialog restores opener on cancel', async page => {
      await page.evaluate(() => { auditOpen.focus(); auditOpen.onclick = () => openAccountDeleteDialog(); auditOpen.click(); });
      await tick(page);
      assert.equal(await page.locator('.account-delete-dialog input[name="password"]').evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Escape'); await tick(page);
      assert.equal(await page.locator('.account-delete-overlay').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'auditOpen');
      assert.equal(await page.evaluate(() => state.loggedInPhone), 'preview', 'cancel cannot execute deletion');
    });
    await check('closing nested modal restores its opener, then the original opener', async page => {
      await page.evaluate(() => { auditOpen.focus(); auditOpen.onclick = () => auditDialog('outer'); auditOpen.click(); });
      await tick(page);
      await page.evaluate(() => {
        const button = document.getElementById('outer-last'); button.focus();
        button.onclick = () => auditDialog('inner', 4000); button.click();
      });
      await tick(page);
      assert.equal(await page.evaluate(() => document.getElementById('outer-layer').inert), true);
      await page.keyboard.press('Escape'); await tick(page);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'outer-last');
      assert.equal(await page.evaluate(() => document.getElementById('outer-layer').inert), false);
      assert.equal(await page.evaluate(() => document.getElementById('uiAudit').inert), true);
      await page.keyboard.press('Escape'); await tick(page);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'auditOpen');
    });
    await check('a pointer opener restores focus even when the platform leaves another field focused', async page => {
      await page.evaluate(() => {
        const input = document.createElement('input'); input.id = 'previousField'; document.getElementById('uiAudit').append(input); input.focus();
        auditOpen.onclick = () => auditDialog('pointerOpened'); auditOpen.click();
      });
      await tick(page); await page.keyboard.press('Escape'); await tick(page);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'auditOpen');
    });
    for (const mode of ['hidden', 'style', 'class']) await check(`modal hidden by ${mode} releases background and can reopen`, async page => {
      await page.addStyleTag({ content: '.audit-concealed{display:none!important}' });
      await page.evaluate(() => { auditOpen.focus(); auditOpen.onclick = () => auditDialog('toggle'); auditOpen.click(); });
      await tick(page);
      await page.evaluate(mode => {
        const layer = document.getElementById('toggle-layer');
        if (mode === 'hidden') layer.hidden = true;
        if (mode === 'style') layer.style.display = 'none';
        if (mode === 'class') layer.classList.add('audit-concealed');
      }, mode); await tick(page);
      assert.equal(await page.evaluate(() => document.getElementById('uiAudit').inert), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'auditOpen');
      await page.evaluate(mode => {
        const layer = document.getElementById('toggle-layer');
        const second = document.createElement('button'); second.id = 'auditReopen'; second.textContent = '再次打开';
        document.getElementById('uiAudit').append(second);
        second.onclick = () => {
          if (mode === 'hidden') layer.hidden = false;
          if (mode === 'style') layer.style.removeProperty('display');
          if (mode === 'class') layer.classList.remove('audit-concealed');
        };
        second.click();
      }, mode); await tick(page);
      assert.equal(await page.evaluate(() => document.getElementById('uiAudit').inert), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'toggle');
      await page.keyboard.press('Escape'); await tick(page);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'auditReopen', 'reused dialog restores its new opener');
    });
    await check('mandatory modal cannot be dismissed by Escape', async page => {
      await page.evaluate(() => { const dialog = auditDialog('mandatory'); dialog.querySelector('button').remove(); });
      await tick(page); await page.keyboard.press('Escape'); await tick(page);
      assert.equal(await page.locator('#mandatory').count(), 1);
      assert.equal(await page.evaluate(() => document.getElementById('uiAudit').inert), true);
    });
    for (const key of ['Enter', 'Space']) await check(`growth card opens its real archive with ${key}`, async page => {
      await page.evaluate(seed => {
        state = { ...initialState, ...emptyAccountData(), ...seed, page: 'growth' };
        render();
      }, uiFixture());
      const card = page.locator('.growth-update-card').first();
      await card.focus();
      const turtleId = await card.getAttribute('data-view-turtle');
      await page.keyboard.press(key);
      assert.deepEqual(await page.evaluate(() => ({ page: state.page, id: state.selectedTurtleId })), { page: 'turtleDetail', id: turtleId });
    });
    await check('keyboard deletion inside growth history cancels without activating the parent card', async page => {
      page.on('dialog', dialog => dialog.dismiss());
      await page.evaluate(seed => {
        seed.turtles[0].measureHistory = [{ id: 'ui-keyboard-measure', updatedAt: '2026-09-28T03:00:00Z', oldSnapshot: { weight: 100 }, newSnapshot: { weight: 110 } }];
        seed.breedingRecords = [];
        state = { ...initialState, ...emptyAccountData(), ...seed, page: 'growth' };
        render();
      }, uiFixture());
      await page.locator('[data-delete-growth-update]').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => state.page), 'growth');
      assert.equal(await page.evaluate(() => state.turtles[0].measureHistory.length), 1);
    });
    for (const media of ['image', 'video']) for (const nextAction of ['ghost', 'pointer', 'keyboard'])
      await check(`${media} close suppresses only its ghost click, next ${nextAction} action stays correct`, async page => {
        await page.evaluate(media => {
          window.auditMediaClicks = 0; auditOpen.onclick = () => auditMediaClicks++;
          if (media === 'image') openImagePreview('data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="green"/></svg>'));
          else openVideoPreview('data:video/mp4;base64,AAAA');
        }, media);
        await tick(page);
        await page.evaluate(() => document.querySelector('.image-preview-close').dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, pointerId: 42
        })));
        await tick(page);
        assert.equal(await page.locator('.image-preview-overlay').count(), 0);
        await page.evaluate(nextAction => {
          if (nextAction === 'pointer') auditOpen.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 43, pointerType: 'touch', isPrimary: true }));
          if (nextAction === 'keyboard') auditOpen.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
          auditOpen.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: nextAction === 'keyboard' ? 0 : 1 }));
        }, nextAction);
        assert.equal(await page.evaluate(() => auditMediaClicks), nextAction === 'ghost' ? 0 : 1);
      });
    await check('form labels and existing accessible names survive enhancement', async page => {
      const result = await page.evaluate(() => {
        document.getElementById('uiAudit').innerHTML = '<div class="form-row"><label>龟池名称</label><input id="pool"></div><input id="query" type="search" placeholder="查找乌龟"><input id="explicit" aria-label="已有名称" placeholder="替代提示"><input id="count" type="number"><input id="decimal" type="number" step="0.1">';
        TurtleUI.enhance(document.getElementById('uiAudit'));
        return { label: document.getElementById('pool').labels[0]?.textContent, query: document.getElementById('query').getAttribute('aria-label'), existing: document.getElementById('explicit').getAttribute('aria-label'), count: document.getElementById('count').inputMode, decimal: document.getElementById('decimal').inputMode, enter: document.getElementById('query').enterKeyHint };
      });
      assert.deepEqual(result, { label: '龟池名称', query: '查找乌龟', existing: '已有名称', count: 'numeric', decimal: 'decimal', enter: 'search' });
    });
    await check('validation errors remain associated without duplicating or losing existing help', async page => {
      await page.evaluate(() => {
        document.getElementById('uiAudit').innerHTML = '<small id="fieldHelp">只填写数字</small><input id="requiredField" required aria-describedby="fieldHelp">';
        document.getElementById('requiredField').checkValidity(); document.getElementById('requiredField').checkValidity();
      });
      assert.equal(await page.locator('#uiAudit .ui-field-error').count(), 1);
      assert.equal(await page.locator('#requiredField').getAttribute('aria-invalid'), 'true');
      assert.match(await page.locator('#requiredField').getAttribute('aria-describedby'), /^fieldHelp ui-error-/);
      await page.locator('#requiredField').fill('3');
      assert.equal(await page.locator('#uiAudit .ui-field-error').count(), 0);
      assert.equal(await page.locator('#requiredField').getAttribute('aria-describedby'), 'fieldHelp');
      assert.equal(await page.locator('#requiredField').getAttribute('aria-invalid'), null);
    });
    await check('registration validation keeps field labels and agreement text intact', async page => {
      const before = await page.evaluate(() => {
        state = { ...initialState, ...emptyAccountData(), page: 'account', loggedInPhone: '', accountMode: 'register' };
        render();
        return [...document.querySelectorAll('#accountForm label')].map(label => label.textContent);
      });
      await page.evaluate(() => document.querySelector('#accountForm').checkValidity());
      assert.deepEqual(await page.locator('#accountForm label').allTextContents(), before, 'error descriptions must not become part of field labels');
      assert.equal(await page.locator('#accountForm label .ui-field-error').count(), 0);
      assert.equal(await page.locator('#accountForm .ui-field-error').count(), 5);
      assert.equal(await page.locator('#accountForm input[aria-invalid="true"]').evaluateAll(fields => fields.every(field => (field.getAttribute('aria-describedby') || '').split(/\s+/).some(id => document.getElementById(id)?.classList.contains('ui-field-error')))), true);
      await page.locator('#accountForm input[name="termsAccepted"]').check();
      assert.equal(await page.locator('#accountForm .ui-field-error').count(), 4, 'checking agreement clears its own error only');
    });
    for (const outcome of ['success', 'http-error', 'network-error']) await check(`real apiPost ${outcome} clears busy state and prevents duplicate submits`, async page => {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      let requests = 0;
      await page.route('**/api/feedback/create', async route => {
        requests++; await gate;
        if (outcome === 'network-error') return route.abort('failed');
        return route.fulfill({ status: outcome === 'success' ? 200 : 503, json: { ok: outcome === 'success', message: '测试响应' } });
      });
      await page.evaluate(() => {
        document.getElementById('uiAudit').innerHTML = '<form id="auditForm"><button type="submit" id="auditSubmit" aria-busy="false">保存</button></form>';
        window.auditSubmits = 0; window.auditResult = '';
        document.getElementById('auditForm').onsubmit = event => {
          event.preventDefault(); auditSubmits++;
          apiPost('/api/feedback/create', {}).then(() => auditResult = 'success').catch(() => auditResult = 'error');
        };
        document.getElementById('auditSubmit').click();
      });
      await page.waitForFunction(() => document.getElementById('auditSubmit').hasAttribute('data-ui-pending'));
      await page.evaluate(() => { document.getElementById('auditSubmit').click(); document.getElementById('auditForm').requestSubmit(document.getElementById('auditSubmit')); });
      assert.equal(await page.evaluate(() => auditSubmits), 1);
      assert.equal(await page.locator('#auditSubmit').getAttribute('aria-busy'), 'true');
      release();
      await page.waitForFunction(() => auditResult);
      assert.equal(requests, 1);
      assert.equal(await page.locator('#auditSubmit').getAttribute('aria-busy'), 'false');
      assert.equal(await page.locator('#auditSubmit').getAttribute('data-ui-pending'), null);
      assert.equal(await page.locator('#auditSubmit').textContent(), '保存');
      assert.equal(await page.evaluate(() => auditResult), outcome === 'success' ? 'success' : 'error');
    });
    await check('overlapping requests keep busy state until both finish, with idempotent cleanup', async page => {
      const result = await page.evaluate(() => {
        auditOpen.onclick = () => {
          const first = TurtleUI.beginRequest('/api/upload/image');
          const second = TurtleUI.beginRequest('/api/community/create');
          first(); first();
          window.auditBusyMidway = auditOpen.hasAttribute('data-ui-pending');
          second(); second();
        }; auditOpen.click();
        return { midway: auditBusyMidway, ended: !auditOpen.hasAttribute('data-ui-pending'), restored: auditOpen.getAttribute('aria-busy') };
      });
      assert.deepEqual(result, { midway: true, ended: true, restored: null });
    });
    await check('background synchronization and polling never claim a recently clicked control', async page => {
      const marked = await page.evaluate(() => {
        auditOpen.click();
        return ['/api/account/save', '/api/account/load', '/api/account/session', '/api/analytics/visit', '/api/app/version', '/api/community/unread', '/api/community/list', '/api/market/list', '/api/market/view', '/api/market/impression', '/api/community/notifications', '/api/notifications/device/register'].filter(path => {
          const end = TurtleUI.beginRequest(path); const pending = auditOpen.hasAttribute('data-ui-pending'); end(); return pending;
        });
      });
      assert.deepEqual(marked, []);
    });
    await check('market status mutation is protected even though its path ends in status', async page => {
      const result = await page.evaluate(() => {
        auditOpen.onclick = () => { window.auditEnd = TurtleUI.beginRequest('/api/market/status'); };
        auditOpen.click();
        const busy = auditOpen.hasAttribute('data-ui-pending');
        auditEnd();
        return { busy, cleared: !auditOpen.hasAttribute('data-ui-pending') };
      });
      assert.deepEqual(result, { busy: true, cleared: true });
    });
    await check('navigation controls are not blocked by background requests started on entry', async page => {
      const pending = await page.evaluate(() => {
        auditOpen.setAttribute('data-page', 'market'); auditOpen.click();
        const end = TurtleUI.beginRequest('/api/community/friends');
        const pending = auditOpen.hasAttribute('data-ui-pending'); end(); return pending;
      });
      assert.equal(pending, false);
    });
    await check('viewport permits pinch zoom and enhanced navigation identifies the current tab', async page => {
      const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
      assert.doesNotMatch(viewport, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/i);
      assert.match(await page.locator('#app').evaluate(el => getComputedStyle(el).touchAction), /pinch-zoom/);
      assert.equal(await page.locator('#app > .bottom-nav').getAttribute('aria-label'), '主导航');
      assert.equal(await page.locator('#app > .bottom-nav [aria-current="page"]').count(), 1);
    });
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    fs.writeFileSync(path.join(root, 'output/ui-experience-regression.json'), JSON.stringify(outcomes, null, 2));
    console.log(JSON.stringify(outcomes, null, 2));
    assert.ok(outcomes.every(item => item.pass), 'all UI experience regression cases must pass');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
