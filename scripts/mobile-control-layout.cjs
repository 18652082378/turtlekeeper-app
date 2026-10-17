'use strict';
// Runs inside the browser. Layout policies describe real control groups;
// mere document overflow checks cannot catch a wrongly wrapped tab bar.
module.exports = function auditMobileControls() {
  const problems = [], groups = [];
  const visible = e => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    if (r.width <= 1 || r.height <= 1 || s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0' || e.closest('[hidden], .sr-only, .edge-back-preview')) return false;
    // Chromium can expose geometry for unpainted descendants of closed details.
    for (let p = e.parentElement; p; p = p.parentElement) if (p.matches('details:not([open])') && !p.querySelector(':scope > summary')?.contains(e)) return false;
    return true;
  };
  const describe = e => e.className || e.getAttribute('aria-label') || e.tagName;
  const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  const policies = [
    ['.care-tabs', 1], ['.growth-filter-row', 1], ['.market-stage-tabs', 1], ['.my-market-tabs', 1],
    ['.community-activity-tabs', 1], ['.profile-content-tabs', 1], ['.forum-sort-tabs', 1],
    ['.auth-tabs', 1], ['.ledger-command-grid', 1], ['.ledger-workspace > .memo-tabs', 1],
    ['.reminders-page > .memo-tabs', 1], ['.operations-tabs', 0], ['.ts-tabs:not(.ts-preview-tabs)', 1], ['.ts-preview-tabs', 0]
  ];
  function clippedText(button) {
    const bounds = button.getBoundingClientRect();
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim() || /^[＋+×›‹−…•]+$/.test(node.textContent.trim()) || !visible(node.parentElement)) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.width && (r.left < bounds.left - 1 || r.right > bounds.right + 1 || r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1)) return true;
    }
    return false;
  }
  const checked = new Set();
  for (const [selector, maxRows] of policies) for (const group of document.querySelectorAll('#app main ' + selector)) {
    if (checked.has(group) || !visible(group)) continue;
    checked.add(group);
    const buttons = [...group.children].filter(e => e.matches('button, [role=tab]') && visible(e));
    if (buttons.length < 2) continue;
    const rects = buttons.map(e => e.getBoundingClientRect()), rows = [];
    for (const r of rects) { let row = rows.find(row => Math.abs(row.top - r.top) < 2); if (!row) rows.push(row = { top: r.top, count: 0 }); row.count++; }
    groups.push({ selector, labels: buttons.map(e => e.textContent.trim()), rows: rows.map(r => r.count) });
    if (maxRows && rows.length > maxRows) problems.push('miswrapped ' + selector + ': ' + rows.map(r => r.count).join('+'));
    if (!maxRows && Math.max(...rows.map(r => r.count)) - Math.min(...rows.map(r => r.count)) > 1) problems.push('unbalanced ' + selector + ': ' + rows.map(r => r.count).join('+'));
    for (let i = 0; i < buttons.length; i++) {
      if (clippedText(buttons[i])) problems.push('clipped button label ' + selector + ': ' + buttons[i].textContent.trim());
      for (let j = i + 1; j < buttons.length; j++) if (overlaps(rects[i], rects[j])) problems.push('overlapping controls ' + selector);
    }
  }
  for (const form of document.querySelectorAll('#app main form')) {
    const fields = [...form.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea')].filter(visible);
    for (let i = 0; i < fields.length; i++) for (let j = i + 1; j < fields.length; j++) if (overlaps(fields[i].getBoundingClientRect(), fields[j].getBoundingClientRect())) problems.push('overlapping form fields ' + (fields[i].name || fields[i].id) + '/' + (fields[j].name || fields[j].id));
    for (const button of form.querySelectorAll('button')) if (visible(button) && button.textContent.trim().length <= 30 && clippedText(button)) problems.push('clipped form action ' + describe(button) + ': ' + button.textContent.trim());
  }
  return { problems: [...new Set(problems)], groups };
};
