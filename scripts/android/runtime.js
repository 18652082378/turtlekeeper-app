/* Loaded only in the Android package, after app.js. */
(() => {
  const capacitor = window.Capacitor;
  if (capacitor?.getPlatform?.() !== 'android') return;
  const app = capacitor.Plugins?.App || capacitor.registerPlugin('App');
  const bars = capacitor.Plugins?.TurtleAndroidWindow || capacitor.registerPlugin('TurtleAndroidWindow');
  const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  // Actual bar heights can change with narrow windows and larger system text.
  // Observe geometry without rerendering pages or losing an in-progress form.
  const root = document.documentElement;
  const barsObserver = new ResizeObserver(entries => {
    for (const { target } of entries) {
      const height = target.offsetHeight;
      if (!height) continue; // Keep the last navigation height while IME hides it.
      const name = target.matches('.topbar') ? '--android-topbar-height' : '--android-tabbar-height';
      const value = height + 'px';
      if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
    }
  });
  let measuredBars = [];
  const observeBars = () => {
    const next = [...document.querySelectorAll('#app > .topbar, #app > .bottom-nav')];
    if (next.length === measuredBars.length && next.every((node, i) => node === measuredBars[i])) return;
    barsObserver.disconnect();
    measuredBars = next;
    next.forEach(node => barsObserver.observe(node));
  };
  new MutationObserver(observeBars).observe(document.querySelector('#app'), { childList: true });
  observeBars();

  function closeTopLayer() {
    // Click the real dismiss control so each dialog performs its own cleanup.
    // Never synthesize an accept/confirm action or remove a state-owned dialog.
    const layers = [...document.querySelectorAll('[aria-modal="true"], [class*="-overlay"], .trade-zoom, .trade-intro, .community-chat-message-menu')]
      .filter(element => visible(element) && !element.closest('.edge-back-preview'));
    const zIndex = element => {
      let z = 0;
      for (let node = element; node && node !== document.body; node = node.parentElement) {
        z = Math.max(z, parseInt(getComputedStyle(node).zIndex, 10) || 0);
      }
      return z;
    };
    layers.sort((a, b) => zIndex(a) - zIndex(b));
    const layer = layers.at(-1);
    if (!layer) return false;
    const button = [...layer.querySelectorAll('button')].find(button => visible(button) && !button.disabled && (
      (button.getAttribute('aria-label') || '').startsWith('关闭') ||
      button.matches('[data-close], [data-directory-back], [data-app-review-later], .trade-intro-skip, .trade-zoom button') ||
      [...button.attributes].some(attribute => /^data-.*-(close|cancel)$/.test(attribute.name))
    ));
    if (button) button.click();
    else if (layer.matches('.community-chat-message-menu')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
    // Non-dismissible notices stay in place; back must not bypass consent.
    return true;
  }

  let lastBack = 0;
  app.addListener('backButton', () => {
    if (Date.now() - lastBack < 250) return;
    lastBack = Date.now();
    if (window.TURTLE_ANDROID_KEYBOARD_VISIBLE) {
      // Dismiss IME before closing a dialog or cancelling an unfinished form.
      Promise.resolve(bars.hideKeyboard?.()).catch(() => document.activeElement?.blur());
      if (!bars.hideKeyboard) document.activeElement?.blur();
      return;
    }
    if (closeTopLayer()) return;
    const menuKeys = ['openTurtleMenuId', 'openLedgerMenuId', 'openBreedingMenuId', 'openFeedbackMenuId'];
    if (menuKeys.some(key => state[key])) {
      setState(Object.fromEntries(menuKeys.map(key => [key, ''])), { skipSave: true });
      return;
    }
    const cancelDraft = document.querySelector('[data-cancel-memo], [data-cancel-ledger]');
    if (cancelDraft && visible(cancelDraft)) { cancelDraft.click(); return; }
    if (ledgerDashboardPicker) { navigateBack(); return; }
    if (!BOTTOM_NAV_ROOT_PAGES.has(state.page)) { navigateBack(); return; }
    if (state.page !== 'home') { navigateBottomTab('home'); return; }
    // Preserve the activity and local data when leaving the root page.
    app.minimizeApp().catch(error => console.warn('Could not minimize Android app', error));
  }).catch(error => console.error('Android back button setup failed', error));

  // Retain local display measurements for diagnostics; never upload them.
  const measureDisplay = async () => {
    if (!bars.getDisplayMetrics) return;
    try {
      const native = await bars.getDisplayMetrics();
      window.TURTLE_ANDROID_DISPLAY = { ...native, cssWidth: innerWidth, cssHeight: innerHeight,
        devicePixelRatio, pageScale: visualViewport?.scale ?? 1 };
    } catch (error) { console.warn('Android display measurement unavailable', error); }
  };
  let displayTimer;
  window.addEventListener('resize', () => { clearTimeout(displayTimer); displayTimer = setTimeout(measureDisplay, 200); });
  measureDisplay();
  bars.addListener('keyboardVisibilityChange', ({ visible }) => {
    window.TURTLE_ANDROID_KEYBOARD_VISIBLE = Boolean(visible);
    syncMobileKeyboardUI();
  }).catch(error => console.warn('Android keyboard listener failed', error));
  let lastBarAppearance = '';
  const syncBars = () => {
    const dark = root.dataset.themeColor === 'dark';
    const cssColor = getComputedStyle(root).getPropertyValue('--topbar-bg').trim();
    const rgb = cssColor.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    // Theme headers may use rgba. System-bar backgrounds must be opaque:
    // use exactly the same solid RGB surface in CSS and in the native window.
    const backgroundColor = /^#[\da-f]{6}$/i.test(cssColor) ? cssColor
      : rgb ? '#' + rgb.slice(1, 4).map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')
      : dark ? '#1c1c1e' : '#fbfaf7';
    if (root.style.getPropertyValue('--android-system-bar-bg') !== backgroundColor) {
      root.style.setProperty('--android-system-bar-bg', backgroundColor);
    }
    const appearance = `${dark}:${backgroundColor}`;
    if (appearance === lastBarAppearance) return;
    lastBarAppearance = appearance;
    bars.setTheme({ dark, backgroundColor }).catch(error => {
      lastBarAppearance = '';
      console.warn('Android system bar appearance failed', error);
    });
  };
  new MutationObserver(syncBars).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-color', 'style'] });
  syncBars();
})();
