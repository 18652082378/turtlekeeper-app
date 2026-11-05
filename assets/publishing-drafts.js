(function () {
  'use strict';
  if (window.TurtlePublishDrafts || typeof state === 'undefined' || typeof render !== 'function') return;
  const STORE = 'drafts', DATABASE = 'turtlekeeper-publishing-drafts-v1', MIRROR = DATABASE + ':';
  const selectors = '#communityPostForm, #marketListingForm';
  const memory = new Map(), queues = new Map(), restoredURLs = new Map(), publishing = new Map();
  const mediaBytes = new WeakMap();
  let database, active = null, timer = 0, rendering = false, sequence = 0, selectingCommunityMedia = 0;
  const phone = () => String(state.loggedInPhone || '');
  const session = () => `${phone()}:${currentCloudToken() || ''}`;
  function context() {
    if (!phone()) return null;
    const kind = state.page === 'communityAdd' ? 'community' : state.page === 'marketAdd' ? 'market' : '';
    if (!kind) return null;
    const listingId = kind === 'market' ? String(state.editingMarketListingId || '') : '';
    return { kind, listingId, owner: phone(), session: session(), key: JSON.stringify([phone(), kind, listingId]) };
  }
  const current = item => item && active === item && session() === item.session && context()?.key === item.key;
  function openDatabase() {
    if (!database) database = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('草稿图片存储不可用'));
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
      request.onerror = () => reject(request.error || new Error('草稿存储不可用'));
      request.onblocked = () => reject(new Error('请关闭旧页面后重试保存草稿'));
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = null; }; resolve(request.result); };
    }).catch(error => { database = null; throw error; });
    return database;
  }
  // Start opening storage before a publishing form needs it. Rejections remain handled.
  openDatabase().catch(() => {});
  async function storage(mode, operation) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      let result;
      const transaction = db.transaction(STORE, mode), store = transaction.objectStore(STORE);
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('本机空间不足，草稿未能完整保存'));
      const request = operation(store);
      request.onsuccess = () => { result = request.result; };
    });
  }
  function readMirror(key) {
    try { const value = JSON.parse(localStorage.getItem(MIRROR + key)); return value?.key === key ? value : null; } catch { return null; }
  }
  function mediaSignature(media) {
    return JSON.stringify(media.map(item => [item.type, item.fileName, item.fileSize || item.file?.size || item.bytes?.byteLength || 0, item.fileModifiedAt,
      item.source?.length || 0, item.source?.slice(0, 100), item.source?.slice(-100), item.archiveSource?.length || 0]));
  }
  function serializeMedia(kind) {
    const items = kind === 'community' ? communityDraftMediaItems : state.marketDraftMedia || [];
    return items.slice(0, 9).map(item => ({
      type: item.type === 'video' ? 'video' : 'image', duration: Number(item.duration || 0),
      file: item.file instanceof Blob ? item.file : null,
      bytes: item.file instanceof Blob ? mediaBytes.get(item.file) : undefined,
      fileName: String(item.file?.name || 'photo.jpg'), fileType: String(item.file?.type || ''), fileSize: Number(item.file?.size || 0), fileModifiedAt: Number(item.file?.lastModified || 0),
      source: /^(?:https?:|data:|\/uploads\/)/.test(String(item.dataUrl || item.previewUrl || item.url || '')) ? String(item.dataUrl || item.previewUrl || item.url) : '',
      archiveSource: String(item.archiveSource || ''),
      posterFile: item.posterFile instanceof Blob ? item.posterFile : null,
      posterBytes: item.posterFile instanceof Blob ? mediaBytes.get(item.posterFile) : undefined,
      posterType: String(item.posterFile?.type || ''),
      posterUrl: String(item.posterUrl || '').startsWith('blob:') ? '' : String(item.posterUrl || '')
    }));
  }
  async function persistentRecord(record) {
    // Some WebKit builds cannot commit file-backed Blobs to IndexedDB. Store
    // their exact bytes instead; the restored File retains its original name,
    // type and modification time, and publication uses the same upload path.
    const read = async (file, bytes) => {
      if (bytes instanceof ArrayBuffer) return bytes;
      if (!file) return undefined;
      const value = mediaBytes.get(file) || await file.arrayBuffer();
      mediaBytes.set(file, value); return value;
    };
    return { ...record, media: await Promise.all(record.media.map(async media => ({ ...media,
      bytes: await read(media.file, media.bytes), file: null,
      posterBytes: await read(media.posterFile, media.posterBytes), posterFile: null
    }))) };
  }
  function fields(form) {
    const allowed = form.id === 'communityPostForm' ? ['title', 'content', 'question']
      : ['turtleId', 'speciesCode', 'title', 'stage', 'gender', 'shellLength', 'weight', 'price', 'negotiable', 'city', 'delivery', 'description'];
    return Object.fromEntries(allowed.map(name => {
      const field = form.elements.namedItem(name);
      return [name, field?.type === 'checkbox' ? field.checked : String(field?.value || '')];
    }));
  }
  function payload(item, form) {
    return { key: item.key, owner: item.owner, kind: item.kind, listingId: item.listingId, version: ++sequence, updatedAt: Date.now(), fields: fields(form),
      meta: item.kind === 'community' ? { topic: communityDraftTopic, circleId: communityDraftCircleId, visibility: communityDraftVisibility, turtleId: communityDraftTurtleId,
        fingerprint: communityPublishFingerprint, submissionId: communityPublishSubmissionId }
        : { turtleId: state.marketDraftTurtleId, city: state.marketDraftCity, latitude: state.marketDraftLatitude, longitude: state.marketDraftLongitude,
          description: state.marketDraftDescription, descriptionTemplate: state.marketDraftDescriptionTemplate, locationStatus: state.marketLocationStatus,
          fingerprint: marketPublishFingerprint, submissionId: marketPublishSubmissionId }, media: serializeMedia(item.kind) };
  }
  function hasContent(record) {
    return Boolean(record && (record.media?.length || Object.entries(record.fields || {}).some(([key, value]) =>
      !['gender', 'negotiable', 'turtleId'].includes(key) && typeof value === 'string' && value.trim())));
  }
  function queue(key, work) {
    const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(work);
    queues.set(key, next); return next;
  }
  function status(text, error = false) {
    if (!active) return;
    active.status = text; active.error = error;
    const slot = document.querySelector('[data-publishing-draft-status]');
    if (slot) { slot.textContent = text; slot.dataset.error = String(error); }
    const retry = document.querySelector('[data-retry-publishing-draft]');
    if (retry) retry.hidden = !error;
  }
  function capture(force = false) {
    const item = active, form = document.querySelector(selectors);
    if (!current(item) || !form || item.loading || (!item.dirty && !force)) return;
    const record = payload(item, form);
    if (!hasContent(record)) { void clearRecord(item.key).catch(() => status('草稿清除失败，请保持当前页面打开', true)); return; }
    const signature = JSON.stringify([record.fields, record.meta, mediaSignature(record.media)]);
    if (signature === item.signature && !(force && item.error)) return;
    item.signature = signature; item.record = record; memory.set(item.key, record);
    const submitting = publishing.get(item.key);
    if (submitting?.starting) submitting.version = record.version;
    let mirrored = false;
    try {
      localStorage.setItem(MIRROR + item.key, JSON.stringify({ ...record, media: record.media.filter(media => !media.file && media.source && !media.source.startsWith('data:')),
        mediaSignature: mediaSignature(record.media), mediaCount: record.media.length }));
      mirrored = true;
    } catch {}
    status('正在保存草稿…');
    queue(item.key, async () => {
      try {
        if (memory.get(item.key) !== record) return;
        const durable = await persistentRecord(record);
        await storage('readwrite', store => store.put(durable));
        if (current(item) && item.record === record) status('草稿已保存到本机');
      } catch {
        if (!current(item) || item.record !== record) return;
        const imageLoss = record.media.some(media => media.file || media.source?.startsWith('data:'));
        status(mirrored ? imageLoss ? '文字已保存，图片未能保存，请保持页面打开后重试' : '文字草稿已保存到本机' : '草稿保存失败，请保持当前页面打开', !mirrored || imageLoss);
      }
    });
  }
  function schedule() {
    if (!active || !current(active) || active.loading) return;
    active.dirty = true;
    clearTimeout(timer); timer = setTimeout(() => capture(), 250);
  }
  function revoke(key) {
    for (const url of restoredURLs.get(key) || []) URL.revokeObjectURL(url);
    restoredURLs.delete(key);
  }
  function restoreMedia(record) {
    revoke(record.key);
    const urls = [], makeURL = blob => { const url = URL.createObjectURL(blob); urls.push(url); return url; };
    const result = (record.media || []).map(media => {
      const body = media.bytes instanceof ArrayBuffer ? media.bytes : media.file instanceof Blob ? media.file : null;
      const file = body ? new File([body], media.fileName || 'photo.jpg', { type: media.fileType || media.file?.type || '', lastModified: media.fileModifiedAt || Date.now() }) : null;
      if (file && media.bytes instanceof ArrayBuffer) mediaBytes.set(file, media.bytes);
      const source = file ? makeURL(file) : media.source || media.archiveSource || '';
      const posterFile = media.posterBytes instanceof ArrayBuffer ? new Blob([media.posterBytes], { type: media.posterType || 'image/jpeg' }) : media.posterFile instanceof Blob ? media.posterFile : null;
      if (posterFile && media.posterBytes instanceof ArrayBuffer) mediaBytes.set(posterFile, media.posterBytes);
      return record.kind === 'community' ? { file, type: 'image', duration: 0, previewUrl: source, ...(media.archiveSource ? { archiveSource: media.archiveSource } : {}) }
        : { ...(file ? { file } : {}), type: media.type, duration: media.duration || 0, dataUrl: source,
          posterUrl: posterFile ? makeURL(posterFile) : media.posterUrl || '', ...(posterFile ? { posterFile } : {}) };
    }).filter(media => media.previewUrl || media.dataUrl);
    restoredURLs.set(record.key, urls); return result;
  }
  function applyRecord(item, record) {
    if (!record || record.owner !== item.owner || record.kind !== item.kind || record.listingId !== item.listingId) return;
    if (item.kind === 'community') {
      ensureCommunityDraftOwner();
      communityDraftTitle = record.fields.title || ''; communityDraftText = record.fields.content || ''; communityDraftQuestion = record.fields.question || '';
      communityDraftTopic = record.meta.topic || 'daily'; communityDraftCircleId = record.meta.circleId || 'general';
      communityDraftVisibility = record.meta.visibility || 'public'; communityDraftTurtleId = record.meta.turtleId || '';
      communityPublishFingerprint = record.meta.fingerprint || ''; communityPublishSubmissionId = record.meta.submissionId || '';
      let media = record.media || [];
      if (item.freshMedia?.length) {
        const identities = new Set(media.map(entry => mediaSignature([entry])));
        media = [...media, ...item.freshMedia.filter(entry => !identities.has(mediaSignature([entry])))].slice(0, 9);
      }
      clearCommunityDraftMedia(); communityDraftMediaItems = restoreMedia({ ...record, media }); syncCommunityDraftMediaLegacyState();
    } else {
      Object.assign(state, { marketDraftTurtleId: record.meta.turtleId || '', marketDraftCity: record.meta.city || '',
        marketDraftLatitude: record.meta.latitude || '', marketDraftLongitude: record.meta.longitude || '', marketDraftDescription: record.fields.description || record.meta.description || '',
        marketDraftDescriptionTemplate: record.meta.descriptionTemplate || '', marketLocationStatus: record.meta.locationStatus || 'idle', marketDraftMedia: restoreMedia(record) });
      marketPublishFingerprint = record.meta.fingerprint || ''; marketPublishSubmissionId = record.meta.submissionId || '';
    }
    item.restoreFields = record.fields; item.dirty = true;
    item.status = record.incompleteMedia ? '文字草稿已恢复，请重新选择未保存的图片' : '已恢复上次草稿'; item.error = Boolean(record.incompleteMedia);
  }
  async function readRecord(item) {
    const mirror = readMirror(item.key); let record = memory.get(item.key), unavailable = false;
    if (!record) { try { record = await storage('readonly', store => store.get(item.key)); } catch { unavailable = true; } }
    // Read fresh File bytes before replacing the quick-picker's object URLs.
    // WebKit can invalidate a file-backed Blob when its last URL is revoked.
    if (record && item.freshMedia?.length) {
      try { item.freshMedia = (await persistentRecord({ media: item.freshMedia })).media; }
      catch { if (current(item)) { item.loading = false; item.dirty = true; item.status = '图片读取失败，请保留页面并重新选择'; item.error = true; render(); } return; }
    }
    if (mirror && (!record || mirror.updatedAt > record.updatedAt)) {
      const sameMedia = record && mirror.mediaSignature === mediaSignature(record.media || []);
      record = { ...mirror, media: sameMedia ? record.media : mirror.media || [], incompleteMedia: !sameMedia && mirror.mediaCount > (mirror.media || []).length };
    }
    if (mirror?.deleted && (!record || mirror.updatedAt >= record.updatedAt)) record = null;
    if (record && record.owner !== item.owner) record = null;
    if (record) memory.set(item.key, record);
    if (!current(item)) return;
    item.loading = false; item.record = record || null;
    if (record && hasContent(record)) applyRecord(item, record);
    else if (unavailable) { item.status = '文字可保存，图片草稿存储暂不可用'; item.error = true; }
    render();
    if (item.freshMedia?.length) { item.freshMedia = null; capture(true); }
  }
  function enter() {
    const next = context();
    if (!next) return null;
    if (active?.key === next.key && active.session === next.session) return active;
    clearTimeout(timer);
    if (active && active.owner !== next.owner) revoke(active.key);
    active = { ...next, loading: true, dirty: false, signature: '', status: '草稿自动保存在本机', error: false };
    // Quick-pick opens the editor only after choosing files. Merge those
    // selections into a recovered draft rather than replacing either one.
    if (next.kind === 'community' && selectingCommunityMedia) active.freshMedia = serializeMedia('community');
    void readRecord(active); return active;
  }
  function installBar(form) {
    if (!active || !form || form.querySelector('[data-publishing-draft-bar]')) return;
    const bar = document.createElement('div'); bar.dataset.publishingDraftBar = '';
    bar.className = 'publishing-draft-bar';
    const text = document.createElement('span'); text.dataset.publishingDraftStatus = ''; text.setAttribute('role', 'status'); text.setAttribute('aria-live', 'polite');
    const button = document.createElement('button'); button.type = 'button'; button.textContent = '清除草稿'; button.dataset.clearPublishingDraft = '';
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重试保存'; retry.dataset.retryPublishingDraft = '';
    retry.hidden = !active.error;
    retry.addEventListener('click', () => { clearTimeout(timer); capture(true); });
    button.addEventListener('click', async () => {
      if (communityPublishInFlight || marketPublishInFlight || !confirm('清除这份未发布的草稿？已发布的内容不会受影响。')) return;
      const item = active;
      try { await clearRecord(item.key); } catch { if (current(item)) status('草稿清除失败，请稍后重试', true); return; }
      revoke(item.key);
      if (!current(item)) return;
      if (item.kind === 'community') {
        clearCommunityDraftMedia(); communityDraftTitle = communityDraftText = communityDraftQuestion = ''; communityPublishFingerprint = communityPublishSubmissionId = '';
      } else {
        Object.assign(state, { marketDraftMedia: [], marketDraftTurtleId: '', marketDraftDescription: '', marketDraftDescriptionTemplate: '' });
        marketPublishFingerprint = marketPublishSubmissionId = '';
      }
      item.record = null; item.restoreFields = {}; item.signature = ''; item.dirty = false; item.status = '草稿已清除'; item.error = false;
      render();
    });
    bar.append(text, retry, button); form.prepend(bar); status(active.status, active.error);
  }
  async function clearRecord(key, expectedVersion) {
    const existing = memory.get(key);
    if (expectedVersion != null && existing && existing.version !== expectedVersion) return;
    // A small tombstone prevents an older IndexedDB record returning after a
    // failed delete or a reload between successful publication and cleanup.
    const deleted = { key, deleted: true, updatedAt: Date.now() + 1 };
    let mirrored = false;
    try { localStorage.setItem(MIRROR + key, JSON.stringify(deleted)); mirrored = true; } catch {}
    if (mirrored && memory.get(key) === existing) memory.delete(key);
    await queue(key, async () => { try { await storage('readwrite', store => store.delete(key)); } catch (error) { if (!mirrored) throw error; } });
    // Do not remove a draft edited while the delete transaction was pending.
    if (memory.get(key) === existing) memory.delete(key);
  }
  function applyFields(form, saved, preserve = false) {
    if (!form || !saved) return;
    const changedTurtle = preserve && form.id === 'marketListingForm' && String(state.marketDraftTurtleId || '') !== saved.turtleId;
    if (changedTurtle) return;
    for (const [name, value] of Object.entries(saved)) {
      const field = form.elements.namedItem(name); if (!field || field.type === 'file') continue;
      // Community inputs already update their draft fields as a person types.
      // A template or archive selection intentionally changes those fields
      // before rendering; do not replace its new content with the old DOM.
      if (preserve && form.id === 'communityPostForm') {
        const next = { title: communityDraftTitle, content: communityDraftText, question: communityDraftQuestion };
        if (Object.hasOwn(next, name) && next[name] !== value) continue;
      }
      if (preserve && name === 'city' && state.marketDraftCity !== saved.city) continue;
      if (preserve && name === 'description' && state.marketDraftDescription !== saved.description) continue;
      if (field.type === 'checkbox') field.checked = Boolean(value); else field.value = String(value ?? '');
      if (name === 'speciesCode') {
        const species = speciesByCode(String(value || '')), search = form.querySelector('[data-market-species-search]');
        if (search) search.value = species ? `${species.code} · ${species.name}` : '';
      }
    }
  }
  const originalRender = render;
  render = function (...args) {
    if (rendering) return originalRender.apply(this, args);
    const before = context(), form = document.querySelector(selectors);
    const preserved = form && current(active) && before?.key === active.key ? fields(form) : null;
    rendering = true;
    try { originalRender.apply(this, args); } finally { rendering = false; }
    const after = document.querySelector(selectors);
    if (after && current(active)) {
      applyFields(after, active.restoreFields || preserved, !active.restoreFields); active.restoreFields = null;
      installBar(after);
    }
  };
  for (const [name, original] of [['community', pageCommunityAdd], ['market', pageMarketAdd]]) {
    const wrapper = function (...args) {
      const item = enter();
      if (item?.loading) return `${topbar(name === 'community' ? '发布帖子' : '发布出售', true)}<main class="content page-fresh"><div class="empty" role="status">正在读取本机草稿…</div></main>`;
      return original.apply(this, args);
    };
    if (name === 'community') pageCommunityAdd = wrapper; else pageMarketAdd = wrapper;
  }
  const originalSetState = setState;
  setState = function (patch, options) {
    const changesToken = Object.hasOwn(patch, 'cloudToken') && patch.cloudToken !== state.cloudToken;
    const changesTokenFallback = !state.cloudToken && Object.hasOwn(patch, 'registeredUsers') && patch.registeredUsers !== state.registeredUsers;
    const changesListing = Object.hasOwn(patch, 'editingMarketListingId') && patch.editingMarketListingId !== state.editingMarketListingId;
    if (active && current(active) && ((patch.page && patch.page !== state.page) || (patch.loggedInPhone != null && patch.loggedInPhone !== phone()) || changesToken || changesTokenFallback || changesListing)) {
      capture(true); clearTimeout(timer); active = null;
    }
    return originalSetState.call(this, patch, options);
  };
  const originalBack = navigateBack;
  navigateBack = function (...args) {
    const leaving = active;
    if (current(leaving)) capture(true);
    const result = originalBack.apply(this, args);
    if (leaving && context()?.key !== leaving.key) { clearTimeout(timer); active = null; }
    // Back navigation can restore a retained editor node, or even the loading
    // placeholder captured before its first disk read. Reconnect its draft
    // context instead of leaving a restored form without saving handlers.
    if (context() && (!current(active) || !document.querySelector(selectors))) render();
    return result;
  };
  function published({ kind, phone, listingId = '' }) {
    const key = JSON.stringify([String(phone || ''), kind, String(listingId || '')]);
    const submitted = publishing.get(key);
    if (submitted) void clearRecord(key, submitted.version).catch(() => {});
  }
  for (const [kind, original] of [['community', submitCommunityPost], ['market', submitMarketListing]]) {
    const wrapper = async function (...args) {
      let submitted, key;
      if (current(active)) {
        capture(true);
        const record = memory.get(active.key);
        if (record) { key = active.key; submitted = { version: record.version, starting: true }; publishing.set(key, submitted); }
      }
      try {
        const result = original.apply(this, args);
        if (submitted) submitted.starting = false;
        return await result;
      } finally { if (submitted && publishing.get(key) === submitted) publishing.delete(key); }
    };
    if (kind === 'community') submitCommunityPost = wrapper; else submitMarketListing = wrapper;
  }
  for (const [name, original] of [['community', readCommunityMedia], ['market', readMarketMedia]]) {
    const wrapper = async function (...args) {
      if (name === 'community') selectingCommunityMedia++;
      try { return await original.apply(this, args); }
      finally { if (name === 'community') selectingCommunityMedia--; schedule(); }
    };
    if (name === 'community') readCommunityMedia = wrapper; else readMarketMedia = wrapper;
  }
  const originalMediaRender = renderMarketMediaDraft;
  renderMarketMediaDraft = function (...args) { const result = originalMediaRender.apply(this, args); schedule(); return result; };
  const originalRemove = removeCommunityDraftMedia;
  removeCommunityDraftMedia = function (...args) { const result = originalRemove.apply(this, args); schedule(); return result; };
  document.addEventListener('input', event => { if (event.target.closest?.(selectors)) schedule(); });
  document.addEventListener('change', event => { if (event.target.closest?.(selectors)) setTimeout(schedule, 0); });
  document.addEventListener('click', event => {
    if (event.target.closest?.('[data-community-compose-mode], [data-community-draft-circle], [data-community-visibility], [data-community-turtle-source], [data-web-community-action="template"], [data-discovery-prompt], [data-discovery-archive-photo]')) setTimeout(schedule, 0);
  });
  window.addEventListener('pagehide', () => capture());
  document.addEventListener('visibilitychange', () => { if (document.hidden) capture(); });
  const style = document.createElement('style');
  style.textContent = '.publishing-draft-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;padding:8px 0;color:var(--muted);font-size:12px}.publishing-draft-bar>span{min-width:0;overflow-wrap:anywhere}.publishing-draft-bar>span[data-error="true"]{color:var(--danger)}.publishing-draft-bar>button{flex:none;min-height:44px;padding:6px 10px;border:0;border-radius:8px;background:transparent;color:var(--green);font-size:12px}';
  document.head.append(style);
  window.TurtlePublishDrafts = Object.freeze({ revision: '20261104-recovery', published, flush: () => { clearTimeout(timer); capture(true); }, settled: () => Promise.all([...queues.values()].map(value => value.catch(() => {}))) });
  if (context()) render();
})();
