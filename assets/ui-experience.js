// Shared presentation behavior only; account data and navigation remain in app.js.
(function (root) {
  const modalSelector = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]';
  const focusableSelector = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const inertNodes = new Set();
  const modalOrigins = new WeakMap();
  const pendingControls = new WeakMap();
  const focusHistory = [];
  // Explicit user actions only: several endpoints (including /market/status)
  // mutate records despite sounding like reads, while view/impression are telemetry.
  const actionPaths = new Set([
    '/api/account/login', '/api/account/register', '/api/account/delete', '/api/account/terms/accept',
    '/api/account/species/create', '/api/account/growth-record/delete', '/api/sms/send', '/api/sms/verify',
    '/api/upload/image', '/api/upload/media', '/api/market/want', '/api/market/create', '/api/market/update',
    '/api/market/status', '/api/market/delete', '/api/market/refresh', '/api/market/offline',
    '/api/reviews/create', '/api/reviews/comment', '/api/reviews/delete', '/api/reviews/comment/delete',
    '/api/community/create', '/api/community/delete', '/api/community/like', '/api/community/comment',
    '/api/community/comment/like', '/api/community/comment/delete', '/api/community/follow/toggle',
    '/api/community/circle/follow', '/api/community/chat/send', '/api/community/chat/recall',
    '/api/community/chat/pin', '/api/community/chat/delete', '/api/community/admin/action',
    '/api/feedback/create', '/api/feedback/like', '/api/feedback/comment', '/api/feedback/delete', '/api/feedback/comment/delete',
    '/api/content-reports/create', '/api/content-reports/action', '/api/users/block', '/api/users/unblock',
    '/api/admin/feedback/action', '/api/announcements/create', '/api/announcements/action', '/api/notifications/test'
  ]);
  let modal = null, lastControl = null, lastControlAt = 0, sequence = 0, queued = false, spaceControl = null;
  const visible = el => el.isConnected && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const usable = el => visible(el) && !el.disabled && !el.closest('[inert]');

  function enhance(container = document, updateModalState = true) {
    container.querySelectorAll('.bottom-nav').forEach(nav => {
      nav.setAttribute('aria-label', '主导航');
      nav.querySelectorAll('button').forEach(button => {
        if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      });
    });
    container.querySelectorAll('button svg, .bottom-nav svg').forEach(svg => svg.setAttribute('aria-hidden', 'true'));
    container.querySelectorAll('input:not([type="hidden"]), textarea, select').forEach(field => {
      if (field.type === 'file') return;
      const hasLabel = [...(field.labels || [])].some(label => {
        const copy = label.cloneNode(true);
        copy.querySelectorAll('input, textarea, select, button').forEach(el => el.remove());
        return copy.textContent.trim();
      });
      if (!field.getAttribute('aria-label') && !field.getAttribute('aria-labelledby') && !hasLabel) {
        const row = field.closest('.form-row, .field-row, .input-row');
        const label = row?.querySelector('label');
        const adjacent = field.previousElementSibling;
        if (label && row.querySelectorAll('input:not([type="hidden"]), select, textarea').length === 1) {
          if (!field.id) field.id = `ui-field-${++sequence}`;
          label.htmlFor = field.id;
        } else if (adjacent?.matches('.label, label') && adjacent.textContent.trim()) {
          if (!adjacent.id) adjacent.id = `ui-label-${++sequence}`;
          field.setAttribute('aria-labelledby', adjacent.id);
        } else if (field.placeholder) field.setAttribute('aria-label', field.placeholder);
      }
      if (field.tagName === 'INPUT' && !field.hasAttribute('enterkeyhint'))
        field.setAttribute('enterkeyhint', field.type === 'search' ? 'search' : 'next');
      if (field.tagName === 'INPUT' && field.type === 'number' && !field.hasAttribute('inputmode'))
        field.setAttribute('inputmode', field.step && field.step !== '1' ? 'decimal' : 'numeric');
    });
    container.querySelectorAll('button').forEach(button => {
      if (button.hasAttribute('aria-label') || button.hasAttribute('aria-labelledby')) return;
      const text = button.textContent.trim();
      const name = { '×': '关闭', '✕': '关闭', '‹': '返回', '←': '返回', '…': '更多操作', '⋯': '更多操作', '+': '新增' }[text];
      if (name || (!text && button.title)) button.setAttribute('aria-label', name || button.title);
    });
    if (updateModalState) scheduleModals();
  }

  function refreshModals() {
    queued = false;
    // Remove only the inert state this module owns, preserving app-authored state.
    for (const el of inertNodes) el.inert = false;
    inertNodes.clear();
    const candidates = [...document.querySelectorAll(modalSelector)]
      .filter(el => visible(el) && !el.closest('.edge-back-preview, .page-transition-snapshot'));
    // DOM order resolves equal layers; parent overlays commonly own the z-index.
    const layer = el => {
      let max = 0;
      for (let node = el; node && node !== document.body; node = node.parentElement)
        max = Math.max(max, Number.parseInt(getComputedStyle(node).zIndex, 10) || 0);
      return max;
    };
    candidates.sort((a, b) => layer(a) - layer(b));
    const next = candidates.at(-1) || null;
    const previous = modal;
    if (next && next !== previous && !modalOrigins.has(next)) {
      const recentTrigger = performance.now() - lastControlAt <= 1000 ? lastControl : null;
      const origin = [recentTrigger, document.activeElement, ...focusHistory.slice().reverse()]
        .find(el => el && el !== document.body && el.isConnected && !next.contains(el));
      modalOrigins.set(next, origin);
    }
    modal = next;
    const previousClosed = previous && previous !== next && (!previous.isConnected || !visible(previous));
    const previousOrigin = previousClosed && modalOrigins.get(previous);
    const shouldRestore = previousClosed && (document.activeElement === document.body || previous.contains(document.activeElement));
    if (previousClosed) modalOrigins.delete(previous);
    if (!next) {
      if (previousOrigin?.isConnected && shouldRestore) previousOrigin.focus({ preventScroll: true });
      return;
    }
    enhance(next, false);
    if (!next.hasAttribute('tabindex')) next.tabIndex = -1;
    if (!next.hasAttribute('aria-label') && !next.hasAttribute('aria-labelledby')) {
      const heading = next.querySelector('h1, h2, h3');
      if (heading) {
        if (!heading.id) heading.id = `ui-dialog-title-${++sequence}`;
        next.setAttribute('aria-labelledby', heading.id);
      }
    }
    for (let node = next; node && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement?.children || []) {
        if (sibling === node || sibling.inert || ['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName) || sibling.classList.contains('toast')) continue;
        sibling.inert = true;
        inertNodes.add(sibling);
      }
    }
    if (previousOrigin?.isConnected && next.contains(previousOrigin) && shouldRestore)
      previousOrigin.focus({ preventScroll: true });
    if (!next.contains(document.activeElement)) next.focus({ preventScroll: true });
  }
  function scheduleModals() {
    if (queued) return;
    queued = true;
    queueMicrotask(refreshModals);
  }

  function clearFieldError(field) {
    if (!field?.dataset?.uiErrorId) return;
    const id = field.dataset.uiErrorId;
    document.getElementById(id)?.remove();
    const describedBy = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(value => value !== id).join(' ');
    if (describedBy) field.setAttribute('aria-describedby', describedBy); else field.removeAttribute('aria-describedby');
    field.removeAttribute('aria-invalid');
    delete field.dataset.uiErrorId;
  }
  document.addEventListener('invalid', event => {
    const field = event.target;
    if (!field.matches('input, select, textarea')) return;
    clearFieldError(field);
    const error = document.createElement('small');
    error.id = `ui-error-${++sequence}`;
    error.className = 'ui-field-error';
    error.textContent = field.validationMessage || '请检查这里的填写内容';
    field.dataset.uiErrorId = error.id;
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
    // A wrapping label is the accessible name, not an error container. Keep
    // descriptions outside it so checkbox text and two-column labels remain
    // intact while aria-describedby still associates the message with the field.
    (field.closest('label') || field).insertAdjacentElement('afterend', error);
  }, true);
  for (const type of ['input', 'change']) document.addEventListener(type, event => clearFieldError(event.target), true);
  document.addEventListener('focusin', event => {
    if (event.target === document.body) return;
    focusHistory.push(event.target);
    if (focusHistory.length > 8) focusHistory.shift();
  }, true);

  document.addEventListener('click', event => {
    const control = event.target.closest?.('button, a[href], [role="button"]');
    if (control?.hasAttribute('data-ui-pending')) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    lastControl = control;
    lastControlAt = performance.now();
  }, true);
  document.addEventListener('submit', event => {
    lastControl = event.submitter || event.target.querySelector('[type="submit"]');
    lastControlAt = performance.now();
    if (lastControl?.hasAttribute('data-ui-pending')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  // Custom cards/images with button semantics need the same keyboard action as
  // native buttons. Run after their own handlers and only for the focused node,
  // so child inputs/actions and controls already handling keys remain untouched.
  const customButton = event => {
    const el = event.target;
    return el?.matches?.('[role="button"]')
      && !el.matches('button, input, select, textarea, a[href], summary')
      && !el.isContentEditable && el.getAttribute('aria-disabled') !== 'true'
      && document.activeElement === el && usable(el) ? el : null;
  };
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || !['Enter', ' '].includes(event.key)) return;
    const button = customButton(event);
    if (!button) return;
    event.preventDefault();
    if (event.repeat) return;
    if (event.key === 'Enter') button.click();
    else spaceControl = button;
  });
  document.addEventListener('keyup', event => {
    if (event.key !== ' ') return;
    const button = spaceControl;
    spaceControl = null;
    if (event.defaultPrevented || !button || customButton(event) !== button) return;
    event.preventDefault();
    button.click();
  });
  document.addEventListener('keydown', event => {
    if (!modal?.isConnected || event.defaultPrevented) return;
    if (event.key === 'Tab') {
      const controls = [...modal.querySelectorAll(focusableSelector)].filter(usable);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); modal.focus({ preventScroll: true }); }
      else if (!modal.contains(document.activeElement) || document.activeElement === modal) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    if (event.key === 'Escape') {
      const close = modal.querySelector('button[aria-label="关闭"], button[data-directory-close], button[data-close-preview], button[data-close-community-visibility]');
      // Never dismiss a mandatory consent/update dialog by removing its DOM.
      if (close && usable(close)) { event.preventDefault(); event.stopImmediatePropagation(); close.click(); }
    }
  });

  function beginRequest(path) {
    // Background syncing must not flash a spinner or block an unrelated control.
    if (!actionPaths.has(path)
      || performance.now() - lastControlAt > 1000 || !lastControl?.isConnected) return () => {};
    const button = lastControl;
    if (button.disabled || !button.matches('button') || button.matches('[data-page], [data-back], .bottom-nav button')) return () => {};
    let entry = pendingControls.get(button);
    if (!entry) {
      entry = { count: 0, previousBusy: button.getAttribute('aria-busy') };
      pendingControls.set(button, entry);
      button.setAttribute('aria-busy', 'true');
      button.setAttribute('data-ui-pending', '');
    }
    entry.count++;
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      if (--entry.count) return;
      if (entry.previousBusy === null) button.removeAttribute('aria-busy');
      else button.setAttribute('aria-busy', entry.previousBusy);
      button.removeAttribute('data-ui-pending');
      pendingControls.delete(button);
    };
  }
  const observer = new MutationObserver(records => {
    if (records.some(record => record.type === 'attributes'
      ? record.target.matches(modalSelector) || record.target.querySelector(modalSelector)
      : [...record.addedNodes, ...record.removedNodes].some(node =>
        node.nodeType === 1 && (node.matches(modalSelector) || node.querySelector(modalSelector))))) scheduleModals();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
  root.TurtleUI = { enhance, beginRequest, refreshModals };
})(window);
