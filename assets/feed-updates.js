(function () {
  'use strict';
  if (window.TurtleFeedUpdates || typeof render !== 'function') return;
  const pending = new Map(), accepted = new Map();
  const owner = () => `${state.loggedInPhone || ''}:${currentCloudToken() || ''}`;
  const keyFor = kind => JSON.stringify([kind === 'market' ? marketFeedRequestKey() : communityPublicationRevision, state.blockedUsers || []]);
  const viewFor = kind => kind === 'community' ? `${communitySelectedCircleId}:${communityForumSort}` : '';
  const visible = (kind, rows) => kind === 'community' ? communityForumPosts(rows) : rows;
  const anchor = kind => document.querySelector(kind === 'market' ? '.market-page .market-grid' : '.community-page .community-feed');
  const busy = kind => kind === 'market' ? marketLoading || state.marketFeedLoadingMore : communityLoading || state.communityFeedLoadingMore;
  const blocked = () => [...document.querySelectorAll('[aria-modal="true"], .modal-overlay, .image-preview-overlay, .video-preview-overlay, .trade-guide, .trade-intro')]
    .some(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sync(); });
  }
  function valid(kind, entry) { return entry && entry.owner === owner() && entry.key === keyFor(kind); }
  function apply(kind, scroll = true) {
    const entry = pending.get(kind);
    if (!valid(kind, entry) || state.page !== kind || busy(kind) || blocked()) return;
    pending.delete(kind);
    if (entry.apply() !== false && scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
    sync();
  }
  function sync() {
    for (const [kind, entry] of pending) {
      if (!valid(kind, entry)) pending.delete(kind);
      else if (kind === 'community' && state.page === kind && entry.view !== viewFor(kind) && !busy(kind)) apply(kind, false);
    }
    const kind = state.page, entry = pending.get(kind), target = anchor(kind);
    let button = document.querySelector('[data-feed-update-notice]');
    if (!valid(kind, entry) || !target || blocked()) { button?.remove(); return; }
    if (!button) {
      button = document.createElement('button'); button.type = 'button'; button.className = 'feed-update-notice';
      button.dataset.feedUpdateNotice = kind;
      button.addEventListener('click', () => apply(button.dataset.feedUpdateNotice));
      document.body.appendChild(button);
    }
    button.dataset.feedUpdateNotice = kind;
    const currentIds = new Set(visible(kind, kind === 'market' ? marketSearchResultListings() : state.communityPosts || []).map(item => String(item.id)));
    const count = visible(kind, entry.items).filter(item => !currentIds.has(String(item.id))).length;
    const label = count ? `有 ${count} 条新${kind === 'market' ? '商品' : '作品'}，点击查看` : '内容已更新，点击查看';
    if (button.textContent !== '↑ ' + label) button.textContent = '↑ ' + label;
    button.setAttribute('aria-label', label); button.disabled = Boolean(busy(kind));
  }
  function stage(kind, { items, hasMore = false, apply: callback }) {
    const acceptedEntry = accepted.get(kind);
    if (acceptedEntry) {
      accepted.delete(kind);
      if (acceptedEntry.owner === owner() && acceptedEntry.key === keyFor(kind)) return false;
    }
    const cached = visible(kind, kind === 'market' ? marketSearchResultListings() : state.communityPosts || []);
    const incoming = visible(kind, items);
    if (!cached.length) { pending.delete(kind); schedule(); return false; }
    // A first-page check is not a change just because the user has already
    // loaded subsequent pages. Keep those cards and their matching cursor.
    const sameLoadedHead = hasMore && incoming.length > 0 && cached.length > incoming.length
      && incoming.every((item, index) => String(item.id) === String(cached[index]?.id));
    if (sameLoadedHead) { pending.delete(kind); schedule(); return true; }
    const sameOrder = cached.length === incoming.length && cached.every((item, index) => String(item.id) === String(incoming[index]?.id));
    if (sameOrder && !pending.has(kind)) return false;
    pending.set(kind, { owner: owner(), key: keyFor(kind), view: viewFor(kind), items, apply: callback });
    schedule(); return true;
  }
  function clear(kind, acceptIncoming = false) {
    pending.delete(kind); accepted.delete(kind);
    if (acceptIncoming) accepted.set(kind, { owner: owner(), key: keyFor(kind) });
    sync();
  }
  function settled(kind) { accepted.delete(kind); sync(); }
  const originalRender = render;
  render = function (...args) { const result = originalRender.apply(this, args); sync(); return result; };
  // Media previews and some dialogs are mounted next to #app. Watching the
  // body also restores the pending prompt when those blockers close.
  if (document.body) new MutationObserver(records => {
    // Compositor-only swipe samples do not change feed content or dialogs.
    // Avoid scheduling a full notice/overlay scan on every animation frame.
    if (records.every(record => record.type === 'attributes' && record.attributeName === 'style'
      && (record.target.id === 'app' || record.target.classList?.contains('edge-back-preview')))) return;
    schedule();
  }).observe(document.body, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-modal']
  });
  window.TurtleFeedUpdates = Object.freeze({ stage, clear, settled, sync });
})();
