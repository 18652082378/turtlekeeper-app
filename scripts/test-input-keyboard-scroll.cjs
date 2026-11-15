'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, engine } = require('./browser-test-engine.cjs');
const root = path.resolve(__dirname, '..');
const origin = 'https://input-scroll.test';

async function main() {
  const browser = await launchBrowser();
  try {
    for (const width of [280, 390, 720]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: true } });
        const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404 });
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
        return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
      });
      await page.goto(origin + '/?skipIntro=1');
      const scenarios = await page.evaluate(async () => {
        dismissTradeIntro?.();
        TurtleReleaseNotes?.cancel();
        const root = document.documentElement;
        const scrollRoot = document.scrollingElement;
        const viewport = window.visualViewport;
        const nativeHeight = innerHeight;
        const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        function keyboard(height, scale = 1, pan = 0) {
          for (const [name, value] of Object.entries({ height, scale, offsetTop: pan })) {
            Object.defineProperty(viewport, name, { configurable: true, get: () => value });
          }
          viewport.dispatchEvent(new Event('resize'));
        }
        async function focus(selector) {
          document.querySelector(selector).focus({ preventScroll: true });
          await nextFrame();
        }
        const box = selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        };
        setState({ page: 'add', archivePurchaseMode: 'single', formDraft: {} }, { skipSave: true });
        const archiveField = '#turtleForm textarea[name="note"]';
        keyboard(nativeHeight);
        await focus(archiveField);
        keyboard(450);
        await nextFrame();
        const archive = { field: box(archiveField), header: box('.topbar') };
        document.activeElement.blur();
        keyboard(nativeHeight);
        await nextFrame();
        setState({ page: 'marketAdd' }, { skipSave: true });
        const marketField = '#marketListingForm textarea[name="description"]';
        await focus(marketField);
        keyboard(450);
        await nextFrame();
        const market = { field: box(marketField), header: box('.topbar') };
        document.activeElement.blur();
        keyboard(nativeHeight);
        await nextFrame();
        root.classList.remove('ios-tab-scroll');
        $app.innerHTML = `<header class="topbar" style="position:fixed;top:0;height:56px">标题</header>
          <main style="padding-top:75px;padding-bottom:0"><label>昵称<input id="top" type="text"></label>
          <div style="height:570px"></div><label>克重<input id="weight" type="number"></label>
          <div style="height:290px"></div><label>备注<textarea id="notes" style="height:80px"></textarea></label></main>`;
        scrollRoot.scrollTop = 0;
        await focus('#weight');
        const before = scrollRoot.scrollTop;
        keyboard(485, 1, 14);
        await nextFrame();
        const weight = box('#weight');
        const header = box('.topbar');
        const after = scrollRoot.scrollTop;
        await focus('#notes');
        const notes = box('#notes');
        // An intentional gesture cancels pending alignment.
        document.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100 }));
        scrollRoot.scrollTop = 30;
        await nextFrame();
        viewport.dispatchEvent(new Event('scroll'));
        await nextFrame();
        const afterManualScroll = scrollRoot.scrollTop;
        // A fixed dialog scrolls inside the overlay, without moving the page.
        document.activeElement.blur();
        keyboard(nativeHeight);
        document.body.classList.add('content-report-open');
        const pageBeforeDialog = scrollRoot.scrollTop;
        $app.insertAdjacentHTML('beforeend', `<div class="content-report-overlay"><section class="content-report-dialog" role="dialog">
          <div style="height:600px"></div><input id="dialog-field" type="password"></section></div>`);
        await focus('#dialog-field');
        keyboard(465);
        await nextFrame();
        const dialog = box('#dialog-field');
        const pageAfterDialog = scrollRoot.scrollTop;
        keyboard(nativeHeight);
        document.activeElement.blur();
        await nextFrame();
        const dialogReset = !$app.querySelector('[data-keyboard-input-layer]');
        $app.querySelector('.content-report-overlay').remove();
        document.body.classList.remove('content-report-open');
        $app.insertAdjacentHTML('beforeend', '<form class="feedback-detail-comment"><input class="field" id="feedback-comment"></form>');
        await focus('#feedback-comment');
        keyboard(465);
        await nextFrame();
        const feedback = box('#feedback-comment');
        document.activeElement.blur();
        keyboard(nativeHeight);
        $app.querySelector('.feedback-detail-comment').remove();
        // Native iOS tab mode scrolls only main and leaves its header fixed.
        root.classList.add('ios-tab-scroll');
        $app.querySelector('main').scrollTop = 0;
        await focus('#weight');
        keyboard(480);
        await nextFrame();
        const ios = { field: box('#weight'), header: box('.topbar'), main: $app.querySelector('main').scrollTop };
        root.classList.remove('ios-tab-scroll');
        keyboard(nativeHeight);
        document.activeElement.blur();
        await nextFrame();
        // Android can resize the WebView itself. The visible area should be
        // used directly, with no second offset equal to the keyboard height.
        scrollRoot.scrollTop = 0;
        await focus('#weight');
        Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 465 });
        window.TURTLE_ANDROID_KEYBOARD_VISIBLE = true;
        keyboard(465);
        await nextFrame();
        const android = { field: box('#weight'), inset: root.style.getPropertyValue('--forum-keyboard-bottom') };
        delete window.innerHeight;
        delete window.TURTLE_ANDROID_KEYBOARD_VISIBLE;
        keyboard(nativeHeight);
        document.activeElement.blur();
        $app.innerHTML = '<main><div class="community-chat-form"><input id="chat" type="text"></div><input id="date" type="date"><textarea id="readonly" readonly></textarea></main>';
        await focus('#chat');
        keyboard(450);
        await nextFrame();
        const nativeControls = { chatOwned: mobileInputFocus === null && !root.classList.contains('keyboard-input-page'), date: mobileEditableField(document.querySelector('#date')) === null,
          readonly: mobileEditableField(document.querySelector('#readonly')) === null };
        await focus('#date');
        keyboard(nativeHeight / 2, 2);
        await nextFrame();
        return { before, after, weight, header, notes, afterManualScroll, dialog, pageBeforeDialog, pageAfterDialog,
          dialogReset, feedback, ios, android, archive, market, nativeControls, zoomKeyboard: root.classList.contains('keyboard-open') };
      });
      for (const form of [scenarios.archive, scenarios.market]) {
        assert.ok(form.field.bottom <= 442 && form.field.top >= form.header.bottom + 8, JSON.stringify(scenarios));
      }
      assert.ok(scenarios.after > scenarios.before, JSON.stringify(scenarios));
      assert.ok(scenarios.weight.bottom <= 488 && scenarios.weight.top >= scenarios.header.bottom + 8, JSON.stringify(scenarios));
      assert.ok(scenarios.notes.bottom <= 488, JSON.stringify(scenarios));
      assert.equal(scenarios.afterManualScroll, 30);
      assert.ok(scenarios.dialog.bottom <= 455, JSON.stringify(scenarios));
      assert.equal(scenarios.pageBeforeDialog, scenarios.pageAfterDialog);
      assert.equal(scenarios.dialogReset, true);
      assert.ok(scenarios.feedback.bottom <= 455, JSON.stringify(scenarios));
      assert.ok(scenarios.ios.main > 0 && scenarios.ios.field.bottom <= 472 && scenarios.ios.header.top >= -1, JSON.stringify(scenarios));
      assert.ok(scenarios.android.field.bottom <= 457, JSON.stringify(scenarios));
      assert.equal(scenarios.android.inset, '0px');
      assert.deepEqual(scenarios.nativeControls, { chatOwned: true, date: true, readonly: true });
      assert.equal(scenarios.zoomKeyboard, false);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log(`PASS ${engine}: archive and marketplace forms, fixed header, dialog, feedback, iOS and Android resize, manual scroll and zoom at 280/390/720px`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
