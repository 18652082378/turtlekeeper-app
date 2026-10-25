(function () {
  'use strict';
  // Bundled community presentation for iOS, Android and the browser test build.
  if (window.TurtleMobileCommunity?.installed) return;
  if (typeof state === 'undefined' || typeof communityForumPosts !== 'function' ||
      typeof communityFeedMarkup !== 'function' || typeof communityTopicTabs !== 'function' ||
      typeof setupCommunityInfiniteScroll !== 'function' || typeof render !== 'function' ||
      typeof openCommunityComposer !== 'function' || typeof apiPost !== 'function' ||
      typeof normalizeCommunityPosts !== 'function' || typeof communityAuthPayload !== 'function' ||
      typeof patchVisibleCommunityFeed !== 'function' || typeof saveState !== 'function' ||
      typeof hasCloudSession !== 'function' || typeof currentCloudToken !== 'function' || typeof escapeHtml !== 'function' ||
      typeof pageCommunity !== 'function' || typeof communityCreateHub !== 'function' || typeof communityCircleStrip !== 'function' ||
      typeof communityForumCard !== 'function' || typeof communityFeedSignature !== 'function' || typeof communityPostRenderSignature !== 'function' ||
      typeof pageCommunityAdd !== 'function' || typeof pageCommunityPostDetail !== 'function' || typeof submitCommunityComment !== 'function') return;

  const originalPosts = communityForumPosts;
  const originalMarkup = communityFeedMarkup;
  const originalTabs = communityTopicTabs;
  const originalInfiniteScroll = setupCommunityInfiniteScroll;
  const originalPage = pageCommunity, originalHub = communityCreateHub, originalCircles = communityCircleStrip;
  const originalCard = communityForumCard, originalFeedSignature = communityFeedSignature, originalCardSignature = communityPostRenderSignature;
  const originalComposer = pageCommunityAdd;
  const originalDetail = pageCommunityPostDetail, originalSubmitComment = submitCommunityComment;
  let detailOwner = '', detailDrafts = new Map(), detailSending = new Map(), detailAttempts = new Map();
  const detailActive = () => state.page === 'communityPostDetail';
  let accessoryDesired = null, accessoryQueue = Promise.resolve(), composerObserved = null, composerObserver = null;
  function iosKeyboard() {
    const cap = window.Capacitor;
    if (cap?.getPlatform?.() !== 'ios' || !cap.isNativePlatform?.() || !cap.isPluginAvailable?.('Keyboard')) return null;
    return cap.Plugins?.Keyboard || cap.registerPlugin?.('Keyboard');
  }
  function syncKeyboard() {
    const form = detailActive() ? document.querySelector('.web-community-detail .forum-reply-composer') : null;
    if (form !== composerObserved) {
      composerObserver?.disconnect(); composerObserved = form;
      if (form && typeof ResizeObserver === 'function') {
        composerObserver = new ResizeObserver(() => {
          if (form.isConnected) document.documentElement.style.setProperty('--forum-composer-height', Math.ceil(form.getBoundingClientRect().height) + 'px');
        });
        composerObserver.observe(form);
      }
      if (!form) document.documentElement.style.removeProperty('--forum-composer-height');
    }
    if (form) document.documentElement.style.setProperty('--forum-composer-height', Math.ceil(form.getBoundingClientRect().height) + 'px');
    const keyboard = iosKeyboard();
    if (!keyboard?.setAccessoryBarVisible) return;
    const visible = !detailActive() && state.page !== 'communityChat';
    if (visible === accessoryDesired) return;
    accessoryDesired = visible;
    // Serialize bridge calls so a late detail response cannot hide another page's toolbar.
    accessoryQueue = accessoryQueue.then(() => keyboard.setAccessoryBarVisible({ isVisible: visible })).catch(() => {
      if (accessoryDesired === visible) accessoryDesired = null;
    });
  }
  function prepareDetailOwner() {
    const next = owner();
    if (next !== detailOwner) { detailOwner = next; detailDrafts.clear(); detailSending.clear(); detailAttempts.clear(); }
  }
  let circlesExpanded = false;
  const templateFor = html => { const template = document.createElement('template'); template.innerHTML = html; return template; };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${({
    write: '<path d="m15 4 5 5M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15l-1 6Z"/>',
    growth: '<path d="M4 19h16M5 14l5-5 4 3 5-8M14 4h5v5"/>',
    identify: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M8 10h4M10 8v4"/>',
    question: '<path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 1-2Z"/><path d="M10 8a2 2 0 0 1 4 0c0 1.5-2 1.5-2 3M12 14h.01"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>'
  })[name] || ''}</svg>`;
  const active = () => state.page === 'community';
  const canLoad = () => Boolean(state.communityFeedHasMore && typeof hasCloudSession === 'function' && hasCloudSession());
  const busy = () => Boolean(state.communityFeedLoadingMore || (typeof communityLoading !== 'undefined' && communityLoading));
  const owner = () => `${state.loggedInPhone || ''}:${currentCloudToken() || ''}`;
  let loadMessage = null, requestSequence = 0;
  const currentMessage = () => loadMessage && loadMessage.owner === owner() && loadMessage.sort === communityForumSort &&
    loadMessage.circle === communitySelectedCircleId && loadMessage.posts === state.communityPosts ? loadMessage : null;
  const loadLabel = () => busy() ? '正在加载…' : currentMessage()?.error ? '重新加载帖子' : '继续加载帖子';
  const loadButton = () => canLoad() ? `<button type="button" data-web-community-action="load" ${busy() ? 'disabled' : ''}>${loadLabel()}</button>` : '';
  const statusMarkup = () => `<p class="web-community-load-status" data-web-community-status role="status" aria-live="polite">${escapeHtml(currentMessage()?.text || '')}</p>`;
  const validCount = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  const replyCount = post => Math.max(Array.isArray(post?.comments) ? post.comments.length : 0,
    validCount(post?.commentCount), validCount(post?.replyCount));
  const unanswered = post => ['question', 'identify'].includes(post?.topic) && replyCount(post) === 0;
  function latestReply(post) {
    return (Array.isArray(post?.comments) ? post.comments : []).reduce((latest, comment) => {
      if (!comment?.id || !String(comment.content || '').trim()) return latest;
      return !latest || (Date.parse(comment.createdAt) || 0) >= (Date.parse(latest.createdAt) || 0) ? comment : latest;
    }, null);
  }

  // Build from the real controls/actions; the website never creates posts or replies automatically.
  communityCreateHub = function (...args) {
    if (!active()) return originalHub.apply(this, args);
    return `<section class="community-invite web-community-compose" aria-label="发布帖子">
      <div class="web-community-compose-copy"><strong>和龟友聊聊</strong><span>分享日常，也交流养龟心得</span></div>
      <button class="community-invite-publish" type="button" data-community-compose="daily">${icon('write')}<span>发帖子</span></button>
      <div class="community-invite-shortcuts">
        <button type="button" data-community-compose="growth">${icon('growth')}记录成长</button>
        <button type="button" data-community-compose="identify">${icon('identify')}请教品种</button>
        <button type="button" data-community-compose="question">${icon('question')}饲养求助</button>
      </div>
    </section>`;
  };
  communityCircleStrip = function (...args) {
    const html = originalCircles.apply(this, args);
    if (!active()) return html;
    const template = templateFor(html), section = template.content.querySelector('.forum-circle-section');
    if (!section) return html;
    section.classList.toggle('is-expanded', circlesExpanded);
    const header = document.createElement('div'); header.className = 'web-community-circle-heading';
    const selected = template.content.querySelector('[data-community-circle].active')?.textContent || '全部圈子';
    header.innerHTML = `<span><strong>交流圈子</strong><small>${escapeHtml(selected)}</small></span><button type="button" data-web-community-action="circles" aria-expanded="${circlesExpanded}" aria-controls="web-community-circle-list">${circlesExpanded ? '收起' : '展开'}${icon('chevron')}</button>`;
    section.prepend(header);
    section.querySelector('.forum-circle-strip')?.setAttribute('id', 'web-community-circle-list');
    return template.innerHTML;
  };
  communityForumCard = function (post, ...args) {
    const html = originalCard.call(this, post, ...args);
    if (!active()) return html;
    const template = templateFor(html), card = template.content.querySelector('[data-community-feed-card]');
    if (!card) return html;
    const pending = unanswered(post);
    card.classList.toggle('web-community-needs-reply', pending);
    const topics = { daily: '日常分享', growth: '成长记录', question: '饲养求助', identify: '品种鉴定' };
    const badges = card.querySelector('.forum-thread-badges');
    if (badges && topics[post.topic]) {
      const badge = document.createElement('span'); badge.className = 'web-community-topic-badge';
      badge.textContent = topics[post.topic]; badges.prepend(badge);
      if (pending) {
        const label = document.createElement('span'); label.className = 'web-community-reply-badge';
        label.textContent = '等待首条回复'; badges.append(label);
      }
    }
    const reply = card.querySelector('[data-open-community-comments] .forum-action-content > span');
    if (reply) reply.textContent = replyCount(post) ? `${replyCount(post)} 条回复` : pending && !post.isOwn && !post.pendingLocal ? '我来回应' : '回复';
    card.querySelector('[data-open-community-comments]')?.setAttribute('aria-label', pending && !post.isOwn && !post.pendingLocal ? '我来回应' : '查看回复');
    const latest = latestReply(post);
    if (latest) {
      const preview = document.createElement('button'); preview.type = 'button'; preview.className = 'mobile-community-reply-preview';
      preview.dataset.webCommunityAction = 'preview-reply'; preview.dataset.postId = String(post.id); preview.dataset.commentId = String(latest.id);
      preview.innerHTML = `<small>最新回复</small><span><b>${escapeHtml(latest.authorName || '龟友')}</b>：${communityTextMarkup(String(latest.content).replace(/\s+/g, ' ').trim().slice(0, 120))}</span>`;
      preview.setAttribute('aria-label', `查看${latest.authorName || '龟友'}的最新回复`);
      card.querySelector('.forum-thread-actions')?.before(preview);
    }
    return template.innerHTML;
  };
  // Aggregate reply counts can change without the preview comments array changing.
  communityFeedSignature = function (posts = []) {
    const signature = originalFeedSignature.apply(this, arguments);
    return active() ? JSON.stringify([signature, posts.map(post => replyCount(post))]) : signature;
  };
  communityPostRenderSignature = function (post = {}) {
    const signature = originalCardSignature.apply(this, arguments);
    return active() ? JSON.stringify([signature, replyCount(post)]) : signature;
  };
  pageCommunity = function (...args) {
    const html = originalPage.apply(this, args);
    if (!active()) return html;
    const template = templateFor(html);
    const heading = template.content.querySelector('.topbar h1'); if (heading) heading.textContent = '龟友圈';
    const search = template.content.querySelector('[data-community-search]');
    if (search) { search.placeholder = '搜索帖子、品种或龟友'; search.setAttribute('aria-label', '搜索龟友圈'); }
    const communityTab = template.content.querySelector('.bottom-nav [data-page="community"]');
    communityTab?.childNodes.forEach(node => { if (node.nodeType === 3 && node.textContent.trim() === '壳友圈') node.textContent = '龟友圈'; });
    return template.innerHTML;
  };
  function syncReplyForm(form) {
    if (!form || !detailActive()) return;
    const postId = String(form.dataset.communityCommentForm || '');
    const input = form.querySelector('input[name="content"]'), button = form.querySelector('button[type="submit"]');
    const pending = detailOwner === owner() && detailSending.has(postId);
    if (input) input.disabled = pending;
    if (button) { button.disabled = pending || !input?.value.trim(); button.textContent = pending ? '发送中…' : '发送'; }
    form.setAttribute('aria-busy', String(pending));
  }
  function focusReply() {
    const input = document.querySelector('.web-community-detail-discussion input[name="content"]');
    if (!input || input.disabled) return;
    input.focus({ preventScroll: true });
  }
  function updateReplyTarget(form) {
    form.querySelector('.web-community-reply-target')?.remove();
    if (communityReplyTarget?.postId !== String(form.dataset.communityCommentForm || '')) return;
    const target = document.createElement('div'); target.className = 'web-community-reply-target';
    target.innerHTML = `<span>正在回复 ${escapeHtml(communityReplyTarget.name || '龟友')}</span><button type="button" data-web-community-action="cancel-reply" aria-label="取消回复对象">取消</button>`;
    form.prepend(target);
  }
  function refreshReplyTarget() {
    if (!detailActive()) return false;
    const form = document.querySelector('.web-community-detail .forum-reply-composer');
    if (!form) return false;
    // Keep the same focused input, selection and scroll position when changing recipients.
    updateReplyTarget(form); focusReply(); return true;
  }
  function dismissReplyKeyboard() {
    const input = document.activeElement;
    if (!detailActive() || !input?.matches?.('.web-community-detail .forum-reply-composer input')) return;
    const form = input.closest('form');
    if (detailOwner === owner()) detailDrafts.set(String(form.dataset.communityCommentForm || ''), input.value);
    input.blur();
    const keyboard = iosKeyboard() || (window.Capacitor?.getPlatform?.() === 'android' && window.Capacitor?.Plugins?.TurtleAndroidWindow);
    try { Promise.resolve(keyboard?.hide ? keyboard.hide() : keyboard?.hideKeyboard?.()).catch(() => {}); } catch (_) { /* Blur remains the browser fallback. */ }
  }
  let replyDrag = null;
  document.addEventListener('touchstart', event => {
    replyDrag = null;
    if (!detailActive() || event.touches.length !== 1 ||
        !document.activeElement?.matches?.('.web-community-detail .forum-reply-composer input')) return;
    const target = event.target;
    if (!target?.closest?.('.web-community-detail') || target.closest('.forum-reply-composer, [role="dialog"], .image-preview-overlay, .video-preview-overlay')) return;
    const touch = event.touches[0]; replyDrag = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
  }, { passive: true });
  document.addEventListener('touchmove', event => {
    if (!replyDrag) return;
    if (event.touches.length !== 1 || event.touches[0].identifier !== replyDrag.id) { replyDrag = null; return; }
    const touch = event.touches[0], dy = Math.abs(touch.clientY - replyDrag.y), dx = Math.abs(touch.clientX - replyDrag.x);
    if (dy < 12 || dy < dx * 1.2) return;
    replyDrag = null; dismissReplyKeyboard();
  }, { passive: true });
  for (const name of ['touchend', 'touchcancel']) document.addEventListener(name, () => { replyDrag = null; }, { passive: true });
  // A notification may point into a collapsed thread. Expand its ancestors before locating it.
  function openComment(postId, commentId) {
    if (!detailActive() || String(state.selectedCommunityPostId) !== String(postId)) return;
    const requestOwner = owner(), id = String(commentId || '');
    const post = (state.communityPosts || []).find(item => String(item.id) === String(postId));
    const byId = new Map((post?.comments || []).map(comment => [String(comment.id), comment]));
    let current = byId.get(id), seen = new Set();
    const exists = Boolean(current);
    if (current && typeof communityExpandedReplyRoots !== 'undefined') {
      if (communityCommentsPostId !== String(postId)) { communityCommentsPostId = String(postId); communityExpandedReplyRoots.clear(); }
      while (current && !seen.has(String(current.id))) {
        seen.add(String(current.id)); communityExpandedReplyRoots.add(String(current.id));
        current = byId.get(String(current.replyToCommentId || ''));
      }
      render();
    }
    requestAnimationFrame(() => {
      if (requestOwner !== owner() || !detailActive() || String(state.selectedCommunityPostId) !== String(postId)) return;
      const row = [...document.querySelectorAll('[data-community-comment-row]')].find(element => element.dataset.replyCommunityComment === id);
      document.querySelectorAll('.mobile-community-comment-target').forEach(element => element.classList.remove('mobile-community-comment-target'));
      const target = row || document.querySelector('.forum-reply-section');
      target?.scrollIntoView({ block: 'center', behavior: 'instant' });
      if (row) { row.classList.add('mobile-community-comment-target'); row.focus({ preventScroll: true }); }
      else if (id && !exists) toast('这条回复已删除或暂时不可见，可查看其他回复');
    });
  }
  pageCommunityPostDetail = function (...args) {
    const html = originalDetail.apply(this, args);
    if (!detailActive()) return html;
    prepareDetailOwner();
    const template = templateFor(html), main = template.content.querySelector('.community-detail-page');
    const article = main?.querySelector('.community-detail-card'), replies = main?.querySelector('.forum-reply-section');
    const form = template.content.querySelector('.forum-reply-composer');
    if (!main || !article || !replies || !form) return html;
    const postId = String(form.dataset.communityCommentForm || '');
    main.classList.add('web-community-detail');
    const topbar = template.content.querySelector('.topbar'); topbar?.classList.add('web-community-detail-topbar');
    const title = topbar?.querySelector('h1'); if (title) title.textContent = '帖子详情';
    const context = article.querySelector('.forum-detail-context'), author = article.querySelector('.community-detail-head');
    if (context) { context.classList.add('web-community-detail-meta'); article.prepend(context); }
    if (author) article.prepend(author);
    const primary = article.querySelector('.community-detail-actions');
    if (primary) {
      const secondary = [...primary.querySelectorAll('button')].filter(button => !button.matches('[data-like-community-post],[data-show-community-comment],[data-share-community-post]'));
      if (secondary.length && author) {
        const more = document.createElement('details'); more.className = 'web-community-detail-more';
        more.innerHTML = '<summary aria-label="更多帖子操作" title="更多帖子操作">•••</summary><div class="web-community-detail-more-panel"></div>';
        const panel = more.querySelector('div'); secondary.forEach(button => panel.append(button)); author.append(more);
      }
      const comment = primary.querySelector('[data-show-community-comment]');
      if (comment) { comment.removeAttribute('data-show-community-comment'); comment.dataset.webCommunityAction = 'reply-focus'; }
    }
    article.querySelectorAll('.community-discussion-hook[data-show-community-comment]').forEach(button => {
      button.removeAttribute('data-show-community-comment'); button.dataset.webCommunityAction = 'reply-focus';
    });
    const admin = article.querySelector('.forum-admin-actions');
    if (admin) {
      const tools = document.createElement('details'); tools.className = 'web-community-detail-admin';
      tools.innerHTML = '<summary>管理此帖<span aria-hidden="true">⌄</span></summary>';
      admin.before(tools); tools.append(admin);
    }
    const gallery = article.querySelector('.community-detail-media-gallery');
    if (gallery) {
      const figure = document.createElement('figure'); figure.className = 'web-community-detail-media';
      gallery.before(figure); figure.append(gallery);
      const caption = document.createElement('figcaption');
      const count = gallery.querySelectorAll('.community-detail-media-button').length;
      caption.textContent = count > 1 ? `共 ${count} 张图片 · 点击查看大图` : '点击图片，查看完整大图';
      figure.append(caption);
    }
    const discussion = document.createElement('aside'); discussion.className = 'web-community-detail-discussion'; discussion.setAttribute('aria-label', '帖子回复');
    main.append(discussion); discussion.append(replies, form);
    const empty = replies.querySelector('.empty');
    if (empty) empty.innerHTML = `<div><span class="web-community-empty-art" aria-hidden="true">${icon('question')}</span><strong>还没有回复</strong><p>说说你的看法，开启这篇讨论。</p><button type="button" data-web-community-action="reply-focus">写第一条回复</button></div>`;
    const input = form.querySelector('input[name="content"]');
    if (input) { input.setAttribute('aria-label', '回复内容'); input.setAttribute('enterkeyhint', 'send'); input.required = true; input.autocomplete = 'off'; input.setAttribute('value', detailDrafts.get(postId) || ''); }
    // Keyboard send and the emote panel own submission. Keep only the input and smile entry here.
    form.querySelector('button[type="submit"]')?.remove();
    updateReplyTarget(form);
    syncReplyForm(form);
    return template.innerHTML;
  };
  submitCommunityComment = async function (event) {
    if (!detailActive() || !event.currentTarget?.matches('.forum-reply-composer')) return originalSubmitComment.call(this, event);
    event.preventDefault();
    if (!canUseCommunity()) return;
    prepareDetailOwner();
    const form = event.currentTarget, postId = String(form.dataset.communityCommentForm || '');
    const input = form.querySelector('input[name="content"]'), content = String(input?.value || '').trim();
    if (!content || postId !== String(state.selectedCommunityPostId || '') || detailSending.has(postId)) return;
    const requestOwner = owner(), request = {}, replyToCommentId = communityReplyTarget?.postId === postId ? communityReplyTarget.commentId : '';
    const fingerprint = JSON.stringify([content, replyToCommentId]);
    if (detailAttempts.get(postId)?.fingerprint !== fingerprint) detailAttempts.set(postId, { fingerprint, submissionId: crypto.randomUUID() });
    const submissionId = detailAttempts.get(postId).submissionId;
    detailDrafts.set(postId, input.value); detailSending.set(postId, request); syncReplyForm(form);
    const sameAccount = () => requestOwner === owner() && detailOwner === requestOwner;
    try {
      const result = await apiPost('/api/community/comment', communityAuthPayload({ postId, content, replyToCommentId, submissionId }));
      if (!sameAccount()) return;
      if (result.ok !== true || !Array.isArray(result.posts) || !result.posts.some(post => String(post.id) === postId)) throw Error('服务器尚未确认回复，请保留内容后重试');
      detailDrafts.delete(postId); detailSending.delete(postId); detailAttempts.delete(postId);
      if (communityReplyTarget?.postId === postId && String(communityReplyTarget.commentId) === String(replyToCommentId)) communityReplyTarget = null;
      setState({ communityPosts: normalizeCommunityPosts(result.posts), communityCommentPostId: '' }, { skipCloud: true });
    } catch (error) {
      if (sameAccount()) toast(error.message || '回复发送失败，内容已保留，请重试');
    } finally {
      if (sameAccount() && detailSending.get(postId) === request) detailSending.delete(postId);
      if (sameAccount() && detailActive()) syncReplyForm(document.querySelector(`.forum-reply-composer[data-community-comment-form]`));
    }
  };
  const composerGuides = {
    question: { text: '说明品种、体重、饲养环境和问题持续时间，配上清晰图片，更方便龟友了解情况。', body: '品种与体重：\n饲养环境（水位、温度、设备等）：\n观察到的情况：\n持续时间：\n最近的变化：\n最想请教的问题：' },
    identify: { text: '尽量提供背甲、腹甲和头部的清晰图片，也可以写下你目前的判断。', body: '我目前的判断：\n想确认的特征：\n背甲、腹甲及头部图片：\n其他补充：' }
  };
  pageCommunityAdd = function (...args) {
    const html = originalComposer.apply(this, args);
    const guide = composerGuides[communityDraftTopic];
    if (state.page !== 'communityAdd' || !guide) return html;
    const template = templateFor(html), textarea = template.content.querySelector('#communityPostForm textarea[name="content"]');
    if (!textarea) return html;
    textarea.placeholder = '把具体情况写在这里，也可以先插入描述提纲。';
    const note = document.createElement('aside'); note.className = 'web-community-draft-note';
    note.innerHTML = `<div><strong>${communityDraftTopic === 'question' ? '让求助更容易得到回应' : '让鉴定更有依据'}</strong><p>${escapeHtml(guide.text)}</p></div><button type="button" data-web-community-action="template" ${textarea.value.trim() ? 'disabled' : ''}>${textarea.value.trim() ? '已有正文' : '插入描述提纲'}</button>`;
    textarea.closest('label').before(note);
    return template.innerHTML;
  };
  function syncControls(root) {
    if (!root || !active() || document.querySelector('.community-page') !== root) return;
    root.querySelectorAll('[data-web-community-action="load"]').forEach(control => {
      control.hidden = !canLoad(); control.disabled = busy(); control.textContent = loadLabel();
    });
    root.querySelectorAll('[data-web-community-status]').forEach(status => { status.textContent = currentMessage()?.text || ''; });
    if (communityForumSort === 'unanswered') {
      const sentinel = root.querySelector('[data-community-load-sentinel]');
      if (sentinel) sentinel.textContent = state.communityFeedHasMore ? '更多内容请点击“继续加载帖子”' : '已加载完全部内容';
    }
  }
  async function loadWebPage() {
    if (!active() || !canLoad() || busy()) return;
    const requestOwner = owner(), root = document.querySelector('.community-page'), sequence = ++requestSequence;
    const sort = communityForumSort, circle = communitySelectedCircleId;
    const offset = Math.max(0, Number(state.communityFeedNextOffset) || 0);
    const sameAccount = () => requestOwner === owner() && sequence === requestSequence;
    const sameView = () => sameAccount() && active() && document.querySelector('.community-page') === root &&
      communityForumSort === sort && communitySelectedCircleId === circle;
    const message = (text, error = false) => { loadMessage = { owner: requestOwner, sort, circle, posts: state.communityPosts, text, error }; };
    // Own the legacy lock, so automatic refresh/pagination cannot race this request.
    communityLoading = true;
    state = { ...state, communityFeedLoadingMore: true };
    message('正在加载更多帖子…'); syncControls(root);
    try {
      // Unlike the legacy helper, keep the actual request outcome so errors can be retried visibly.
      const result = await apiPost('/api/community/list', communityAuthPayload({ offset, limit: 10, sort: 'latest' }));
      if (!sameView()) return;
      const incoming = normalizeCommunityPosts(Array.isArray(result.posts) ? result.posts : []);
      const existing = state.communityPosts || [], ids = new Set(existing.map(post => String(post.id)));
      const appended = incoming.filter(post => {
        const id = String(post.id); if (ids.has(id)) return false; ids.add(id); return true;
      });
      const rawOffset = result.nextOffset == null ? offset + incoming.length : Number(result.nextOffset);
      const nextOffset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : offset;
      state = { ...state, communityPosts: [...existing, ...appended], communityFeedInitialized: true,
        communityFeedNextOffset: nextOffset, communityFeedHasMore: Boolean(result.hasMore), communityFeedLoadingMore: false };
      saveState({ skipCloud: true });
      patchVisibleCommunityFeed(state.communityPosts, existing);
      if (!state.communityFeedHasMore) message(appended.length ? `已加载 ${appended.length} 篇新帖子，全部内容已加载完成。` : '本页没有新帖子，全部内容已加载完成。');
      else if (!appended.length) message(nextOffset > offset ? '本页没有新帖子，已移至下一页，可继续加载。' : '本页没有新帖子，服务器尚未提供下一页，可稍后重试。');
      else message(`已加载 ${appended.length} 篇新帖子，可继续加载。`);
    } catch {
      if (sameView()) message('加载失败，已有帖子已保留，请点击“重新加载帖子”重试。', true);
    } finally {
      if (sequence === requestSequence) communityLoading = false;
      // Release our state flag for the same account, but never touch another page's DOM.
      if (sameAccount()) state = { ...state, communityFeedLoadingMore: false };
      if (sameAccount() && active()) { syncControls(document.querySelector('.community-page')); setupCommunityInfiniteScroll(); }
    }
  }

  communityForumPosts = function (...args) {
    const posts = originalPosts.apply(this, args);
    return active() && communityForumSort === 'unanswered' ? posts.filter(unanswered) : posts;
  };
  communityTopicTabs = function (...args) {
    const html = originalTabs.apply(this, args);
    if (!active()) return html;
    const selected = communityForumSort === 'unanswered';
    const button = `<button class="${selected ? 'active' : ''}" type="button" data-community-forum-sort="unanswered" aria-pressed="${selected}">待回复</button>`;
    const template = templateFor(html);
    template.content.querySelector('.community-toolbar-publish')?.remove();
    const nav = template.content.querySelector('.forum-sort-tabs');
    if (nav) {
      if (!nav.querySelector('[data-community-forum-sort="unanswered"]')) nav.insertAdjacentHTML('beforeend', button);
      for (const value of ['latest', 'unanswered', 'hot', 'featured', 'followed']) {
        const control = nav.querySelector(`[data-community-forum-sort="${value}"]`); if (control) nav.append(control);
      }
    }
    return template.innerHTML + (selected
      ? `<section class="web-community-filter-note" aria-label="待回复筛选说明"><p>仅查看已加载帖子中尚无回复的求助和鉴定。${state.communityFeedHasMore ? '可继续加载更多内容再筛选。' : ''}</p>${loadButton()}${statusMarkup()}</section>` : statusMarkup());
  };
  communityFeedMarkup = function (...args) {
    const html = originalMarkup.apply(this, args);
    const posts = Array.isArray(args[0]) ? args[0] : (state.communityPosts || []);
    if (!active() || args[1]?.allowDetail || posts.length) return html;
    // Authentication, loading and transport errors keep the existing notices.
    if (typeof feedLoadNotice === 'function' && feedLoadNotice('community')) return html;
    if (!state.communityFeedInitialized && typeof CONFIGURED_SMS_BACKEND !== 'undefined' && CONFIGURED_SMS_BACKEND) return html;
    const pending = communityForumSort === 'unanswered';
    const filtered = communitySelectedCircleId !== 'all' || communityForumSort !== 'latest';
    const title = pending ? '已加载内容里暂无待回复的求助' : filtered ? '当前筛选暂时没有帖子' : '这里还没有帖子';
    const detail = filtered ? '可以恢复全部帖子，或继续查看其他圈子。' : '分享一次真实的养龟记录，发起第一篇讨论。';
    const primary = filtered ? '<button type="button" data-web-community-action="reset">查看全部帖子</button>'
      : '<button type="button" data-web-community-action="compose">写第一篇帖子</button>';
    return `<div class="empty small-empty web-community-empty"><div><span class="web-community-empty-art" aria-hidden="true">${icon('question')}</span><strong>${title}</strong><p>${detail}</p><div class="web-community-empty-actions">${primary}${!pending ? loadButton() : ''}</div></div></div>`;
  };
  setupCommunityInfiniteScroll = function (...args) {
    if (active() && communityForumSort === 'unanswered') {
      // A local filter must not silently walk every page looking for matches.
      if (typeof communityLoadObserver !== 'undefined') { communityLoadObserver?.disconnect(); communityLoadObserver = null; }
      syncControls(document.querySelector('.community-page'));
      return;
    }
    return originalInfiniteScroll.apply(this, args);
  };

  document.addEventListener('click', event => {
    const control = event.target?.closest?.('[data-open-community-comments]');
    if (!active() || !control) return;
    const postId = String(control.dataset.openCommunityComments || ''), requestOwner = owner();
    requestAnimationFrame(() => {
      if (requestOwner === owner() && detailActive() && String(state.selectedCommunityPostId) === postId) focusReply();
    });
  }, true);

  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('[data-web-community-action]');
    if (!button?.isConnected) return;
    const action = button.dataset.webCommunityAction;
    if (detailActive() && action === 'reply-focus') { focusReply(); return; }
    if (detailActive() && action === 'cancel-reply') { communityReplyTarget = null; refreshReplyTarget(); return; }
    if (action === 'template' && state.page === 'communityAdd') {
      const guide = composerGuides[communityDraftTopic], textarea = document.querySelector('#communityPostForm textarea[name="content"]');
      if (!guide || !textarea || textarea.value.trim()) return;
      textarea.value = guide.body;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.focus(); textarea.setSelectionRange(guide.body.indexOf('：') + 1, guide.body.indexOf('：') + 1);
      return;
    }
    if (!active()) return;
    if (action === 'preview-reply') {
      const postId = button.dataset.postId, commentId = button.dataset.commentId;
      communityReplyTarget = null;
      setState({ page: 'communityPostDetail', selectedCommunityPostId: postId, openCommunityActionId: '', communityCommentPostId: '' }, { skipCloud: true });
      openComment(postId, commentId);
    } else if (action === 'circles') {
      circlesExpanded = !circlesExpanded;
      const section = button.closest('.forum-circle-section');
      section?.classList.toggle('is-expanded', circlesExpanded);
      button.setAttribute('aria-expanded', String(circlesExpanded));
      button.innerHTML = `${circlesExpanded ? '收起' : '展开'}${icon('chevron')}`;
    } else if (action === 'reset') {
      loadMessage = null;
      communitySelectedCircleId = 'all'; communityForumSort = 'latest'; render();
    } else if (action === 'compose') {
      openCommunityComposer('daily');
    } else if (action === 'load' && canLoad() && !busy()) {
      await loadWebPage();
    }
  });
  document.addEventListener('input', event => {
    if (detailActive() && event.target?.matches?.('.forum-reply-composer input[name="content"]')) {
      if (detailOwner !== owner()) return;
      const form = event.target.closest('form'), postId = String(form.dataset.communityCommentForm || '');
      if (postId !== String(state.selectedCommunityPostId || '')) return;
      detailDrafts.set(postId, event.target.value); syncReplyForm(form); return;
    }
    if (state.page !== 'communityAdd' || !event.target?.matches?.('#communityPostForm textarea[name="content"]')) return;
    const button = document.querySelector('[data-web-community-action="template"]');
    if (button) { button.disabled = Boolean(event.target.value.trim()); button.textContent = button.disabled ? '已有正文' : '插入描述提纲'; }
  });
  document.addEventListener('keydown', event => {
    if (!detailActive() || event.key !== 'Escape') return;
    const more = event.target?.closest?.('.web-community-detail-more[open]');
    if (more) { more.open = false; more.querySelector('summary')?.focus(); }
  });
  window.TurtleMobileCommunity = Object.freeze({ installed: true, version: 'community-mobile-ui', revision: '20261025-comment-keyboard', openComment, refreshReplyTarget, syncKeyboard });
  document.documentElement.classList.add('community-mobile-ui');
  if (active() || detailActive() || (state.page === 'communityAdd')) render();
})();
