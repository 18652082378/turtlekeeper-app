(function () {
  'use strict';
  if (window.TurtleCommunityPolish || typeof pageCommunityAdd !== 'function') return;
  const template = html => { const node = document.createElement('template'); node.innerHTML = html; return node; };
  function editorCounts(form) {
    const title = form.querySelector('[name="title"]'), content = form.querySelector('[name="content"]');
    const length = [...(title?.value || '').trim()].length;
    const hint = form.querySelector('[data-community-title-hint]');
    if (hint) { hint.textContent = length > 0 && length < 5 ? `标题还差 ${5 - length} 个字` : '标题需 5–31 个字'; hint.dataset.short = String(length > 0 && length < 5); }
    const titleCount = form.querySelector('[data-community-title-count]'); if (titleCount) titleCount.textContent = `${length}/31`;
    const bodyCount = form.querySelector('[data-community-body-count]'); if (bodyCount) bodyCount.textContent = `${[...(content?.value || '')].length}/2000`;
  }
  const add = pageCommunityAdd;
  pageCommunityAdd = function (...args) {
    const node = template(add.apply(this, args)), form = node.content.querySelector('#communityPostForm');
    if (!form) return node.innerHTML;
    const title = form.querySelector('[name="title"]'), body = form.querySelector('[name="content"]');
    if (title) {
      title.setAttribute('aria-label', '帖子标题');
      title.setAttribute('aria-describedby', [title.getAttribute('aria-describedby'), 'communityTitleHint'].filter(Boolean).join(' '));
      const meta = document.createElement('div'); meta.className = 'community-editor-meta';
      meta.innerHTML = '<span id="communityTitleHint" data-community-title-hint></span><span data-community-title-count aria-label="标题字数"></span>';
      title.closest('label').after(meta);
    }
    if (body) {
      body.setAttribute('aria-label', '帖子正文');
      const meta = document.createElement('div'); meta.className = 'community-editor-meta community-editor-body-meta';
      meta.innerHTML = '<span>分享真实经历，更容易获得有用回复</span><span data-community-body-count aria-label="正文字数"></span>';
      body.closest('label').after(meta);
    }
    const prompts = form.querySelector('.discovery-compose-prompts'), note = form.querySelector('.web-community-draft-note');
    if (prompts || note) {
      const details = document.createElement('details'); details.className = 'community-editor-prompts';
      const summary = document.createElement('summary'); summary.textContent = '需要灵感？展开写作提示';
      (prompts || body?.closest('label') || note).after(details); details.append(summary);
      if (note) details.append(note); if (prompts) details.append(prompts);
    }
    const mediaTip = form.querySelector('.community-draft-media-tip');
    if (mediaTip) { const count = form.querySelectorAll('.community-draft-media-item').length; mediaTip.textContent = count ? `已选 ${count}/9 张图片 · 列表预览前 3 张，详情可查看全部` : '最多添加 9 张图片，支持逐张移除'; }
    editorCounts(form); return node.innerHTML;
  };
  function emptyPage(html, ready = true) {
    const node = template(html);
    node.content.querySelectorAll('main').forEach(main => main.classList.add('community-polished-page'));
    if (!ready) return node.innerHTML;
    node.content.querySelectorAll('.empty, .message-empty, .message-notification-empty').forEach(empty => {
      if (empty.querySelector('button, .ui-request-status') || /加载|失败|重试/.test(empty.textContent)) return;
      empty.classList.add('community-polished-empty');
      const listings = Boolean(empty.closest('.profile-content-panel.is-listings'));
      const button = document.createElement('button'); button.type = 'button'; button.dataset.page = listings ? 'market' : 'community';
      button.textContent = listings ? '逛逛龟集市' : '逛逛龟友圈';
      empty.append(button);
    });
    return node.innerHTML;
  }
  const profile = pageCommunityProfile, followingProfile = pageFollowingProfile, following = pageFollowing, friends = pageCommunityFriends, activity = pageCommunityActivity, messages = pageMessages;
  pageCommunityProfile = function (...args) { return emptyPage(profile.apply(this, args)); };
  pageFollowingProfile = function (...args) { return emptyPage(followingProfile.apply(this, args)); };
  pageFollowing = function (...args) { return emptyPage(following.apply(this, args), !hasCloudSession() || state.followingInitialized); };
  pageCommunityFriends = function (...args) { return emptyPage(friends.apply(this, args), !hasCloudSession() || state.communityFriendsInitialized); };
  pageCommunityActivity = function (...args) { return emptyPage(activity.apply(this, args), !state.communityActivityLoading && !state.communityActivityError); };
  pageMessages = function (...args) { return emptyPage(messages.apply(this, args), !hasCloudSession() || state.communityFriendsInitialized); };
  document.addEventListener('input', event => {
    const field = event.target;
    if (field?.matches?.('#communityPostForm [name="title"], #communityPostForm [name="content"]')) editorCounts(field.form);
  });
  const photoSelector = '.community-page .forum-thread-media.is-single > .community-feed-media-button:not(.is-video) img.community-media';
  function sizePhoto(img) {
    if (!img?.matches?.(photoSelector)) return;
    const shape = img.complete && img.naturalWidth > 0 && img.naturalHeight > 0
      ? (img.naturalWidth === img.naturalHeight ? 'square' : img.naturalWidth < img.naturalHeight ? 'portrait' : 'landscape')
      : 'pending';
    const button = img.parentElement;
    if (button.dataset.communityPhotoShape !== shape) button.dataset.communityPhotoShape = shape;
  }
  function sizePhotos(node) {
    sizePhoto(node); node.querySelectorAll?.(photoSelector).forEach(sizePhoto);
  }
  // Captured load events also cover lazy images and cached navigation DOM.
  document.addEventListener('load', event => sizePhoto(event.target), true);
  const app = document.getElementById('app');
  if (app) {
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') sizePhoto(record.target);
        else for (const node of record.addedNodes) if (node.nodeType === 1) sizePhotos(node);
      }
    }).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] });
    sizePhotos(app);
  }
  window.TurtleCommunityPolish = Object.freeze({ revision: '20261025-pages' });
  if (typeof state !== 'undefined' && ['communityAdd', 'communityProfile', 'followingProfile', 'following', 'communityFriends', 'communityActivity', 'messages'].includes(state.page)) render();
})();
