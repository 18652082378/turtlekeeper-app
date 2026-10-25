(function () {
  'use strict';
  const emotes = window.TurtleEmotes;
  if (!emotes || window.TurtleEmotePicker || typeof state === 'undefined') return;
  let route = '', form = null, input = null, panel = null, observer = null, open = false;
  let category = 'all', position = { start: 0, end: 0 }, recent = [], composing = false, panelRoute = '', gridScroll = 0;
  const icon = emotes.entryIcon;
  const keyboardIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 16h10"/></svg>';
  const scope = () => `${state.loggedInPhone || 'guest'}:${typeof currentCloudToken === 'function' ? currentCloudToken() : ''}:${state.page}:${state.page === 'communityChat' ? state.selectedCommunityFriendId : state.selectedCommunityPostId}`;
  const recentKey = () => 'turtle-emotes-recent-v1:' + (state.loggedInPhone || 'guest');
  function loadRecent() {
    try { const values = JSON.parse(localStorage.getItem(recentKey()) || '[]'); recent = Array.isArray(values) ? [...new Set(values.filter(id => typeof id === 'string' && emotes.byId(id)))].slice(0,16) : []; }
    catch (_) { recent = []; }
  }
  function remember(id) {
    recent = [id, ...recent.filter(item => item !== id)].slice(0,16);
    try { localStorage.setItem(recentKey(), JSON.stringify(recent)); } catch (_) { /* Selection also works with storage disabled. */ }
  }
  function savePosition() {
    if (input && document.activeElement === input) position = { start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length };
  }
  function hideKeyboard() {
    input?.blur();
    const cap = window.Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    const api = cap.getPlatform?.() === 'ios'
      ? (cap.isPluginAvailable?.('Keyboard') && (cap.Plugins?.Keyboard || cap.registerPlugin?.('Keyboard')))
      : cap.Plugins?.TurtleAndroidWindow;
    try { Promise.resolve(api?.hide ? api.hide() : api?.hideKeyboard?.()).catch(() => {}); } catch (_) { /* Blur is sufficient in the browser. */ }
  }
  function renderGrid() {
    if (!panel) return;
    const list = category === 'recent' ? recent.map(id => emotes.byId(id)) : emotes.entries.filter(item => category === 'all' || item.category === category);
    const grid = panel.querySelector('.turtle-emote-grid');
    grid.innerHTML = list.length ? list.map(item => `<button type="button" data-turtle-emote="${item.id}" aria-label="${item.label}" title="${item.label}"><img src="${item.src}" alt="" width="34" height="34" draggable="false" loading="lazy"></button>`).join('') : '<p class="turtle-emote-empty">用过的表情会出现在这里</p>';
    panel.querySelectorAll('[data-emote-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.emoteCategory === category)));
    gridScroll = 0; grid.scrollTop = 0;
  }
  function setOpen(value, focus = false) {
    if (value && (input?.disabled || composing)) return;
    savePosition(); open = value;
    if (open) {
      // Media tools and the emote grid have one shared bottom slot.
      if (state.page === 'communityChat' && state.communityChatToolsOpen) {
        setState({ communityChatToolsOpen: false }, { skipCloud: true });
      }
      hideKeyboard();
    }
    sync();
    if (!open && focus && input && !input.disabled) {
      input.focus({ preventScroll: true });
      input.setSelectionRange(Math.min(position.start,input.value.length),Math.min(position.end,input.value.length));
    }
  }
  function changeText(text, deleting = false) {
    if (!input || input.disabled || composing || route !== scope()) return;
    savePosition();
    let start = Math.min(position.start,input.value.length), end = Math.min(position.end,input.value.length);
    if (deleting && start === end) start = emotes.previous(input.value,start);
    if (input.maxLength >= 0 && input.value.length - (end-start) + text.length > input.maxLength) {
      if (typeof toast === 'function') toast(`最多输入 ${input.maxLength} 个字符`);
      return;
    }
    input.setRangeText(text,start,end,'end');
    position = { start: start+text.length, end: start+text.length };
    input.dispatchEvent(new Event('input',{ bubbles:true }));
    syncActions();
    return true;
  }
  function syncActions() {
    if (!panel || !input) return;
    const sending = input.disabled || form.getAttribute('aria-busy') === 'true' || form.querySelector('button[type="submit"]')?.getAttribute('aria-busy') === 'true';
    for (const button of panel.querySelectorAll('[data-turtle-emote], [data-emote-delete]')) {
      if (button.disabled !== Boolean(sending)) button.disabled = Boolean(sending);
    }
    const send = panel.querySelector('[data-emote-send]'), disabled = Boolean(sending || !input.value.trim());
    if (send.disabled !== disabled) send.disabled = disabled;
    const text = sending ? '发送中…' : '发送'; if (send.textContent !== text) send.textContent = text;
  }
  function mount(nextForm, nextInput) {
    observer?.disconnect(); form = nextForm; input = nextInput;
    form.classList.add('turtle-emote-enabled');
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'turtle-emote-toggle';
    toggle.dataset.emoteToggle = ''; toggle.setAttribute('aria-controls','turtleEmotePanel');
    // Comments have one original smile entry to the right of the input, without a send or plus button.
    input.after(toggle);
    const reusable = panel && panelRoute === route;
    const old = document.getElementById('app').querySelector(':scope > #turtleEmotePanel'); old?.remove();
    if (!reusable) {
      panel = document.createElement('section'); panel.id = 'turtleEmotePanel'; panel.className = 'turtle-emote-panel'; panel.setAttribute('aria-label','龟友原创表情');
      panel.innerHTML = `<nav class="turtle-emote-tabs" aria-label="表情分类">${[{id:'all',label:'全部'},{id:'recent',label:'最近'},...emotes.groups].map(item => `<button type="button" data-emote-category="${item.id}">${item.label}</button>`).join('')}</nav><div class="turtle-emote-grid" role="group" aria-label="选择表情"></div><footer><span>龟友原创表情</span><button type="button" data-emote-delete aria-label="删除前一个表情或文字">⌫</button><button type="button" data-emote-send>发送</button></footer>`;
      panelRoute = route; renderGrid();
      const node=panel, grid=panel.querySelector('.turtle-emote-grid');
      grid.addEventListener('scroll',()=>{if(panel===node)gridScroll=grid.scrollTop;},{passive:true});
    }
    document.getElementById('app').append(panel);
    if (reusable) {
      const node=panel, scroll=gridScroll;
      requestAnimationFrame(()=>{if(panel===node && open)node.querySelector('.turtle-emote-grid').scrollTop=scroll;});
    }
    input.addEventListener('compositionstart',()=>{ composing=true; });
    input.addEventListener('compositionend',()=>{ composing=false; savePosition(); });
    if (state.page === 'communityPostDetail') input.addEventListener('keydown',event=>{
      if (event.currentTarget !== input || event.currentTarget.form !== form) return;
      if (event.key !== 'Enter' || event.isComposing || composing || event.keyCode === 229) return;
      event.preventDefault();
      if (!input.disabled && input.value.trim()) form.requestSubmit();
    });
    input.addEventListener('beforeinput',event=>{
      if (event.inputType !== 'deleteContentBackward' || event.isComposing || composing || input.selectionStart !== input.selectionEnd) return;
      const caret=input.selectionStart, previous=emotes.previous(input.value,caret);
      if (input.value.slice(previous,caret).startsWith('[') && emotes.entries.some(item=>item.token===input.value.slice(previous,caret))) {
        event.preventDefault(); position={start:caret,end:caret}; changeText('',true);
      }
    });
    observer = new MutationObserver(syncActions);
    observer.observe(form,{subtree:true,attributes:true,attributeFilter:['disabled','aria-busy']});
  }
  function sync() {
    const nextForm = state.page === 'communityPostDetail' ? document.querySelector('.web-community-detail .forum-reply-composer')
      : state.page === 'communityChat' ? document.getElementById('communityChatForm') : null;
    const nextInput = nextForm?.querySelector('input[name="content"]'), nextRoute=scope();
    if (route !== nextRoute || !nextInput) {
      open=false; category='all'; position={start:nextInput?.value.length||0,end:nextInput?.value.length||0}; composing=false;
      route=nextRoute; loadRecent();
    }
    if (!nextInput) {
      observer?.disconnect(); form=input=null; panel?.remove(); panel=null;
      document.documentElement.classList.remove('turtle-emote-open'); return;
    }
    if (form !== nextForm || !panel?.isConnected || !nextForm.querySelector('[data-emote-toggle]')) mount(nextForm,nextInput);
    const visible = open && !document.documentElement.classList.contains('keyboard-open');
    document.documentElement.classList.toggle('turtle-emote-open',visible);
    panel.hidden=!visible;
    const toggle=form.querySelector('[data-emote-toggle]');
    const label=open?'切换键盘':'打开表情';
    if(toggle.getAttribute('aria-label')!==label){toggle.setAttribute('aria-label',label);toggle.innerHTML=open?keyboardIcon:icon;}
    toggle.setAttribute('aria-expanded',String(open));
    syncActions();
  }
  document.addEventListener('pointerdown',event=>{
    if(event.target.closest('[data-emote-toggle], .turtle-emote-panel')){
      savePosition(); if(event.target.closest('button') && event.cancelable)event.preventDefault();
    } else if(open && !event.target.closest('.turtle-emote-enabled')) setOpen(false);
  },true);
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-emote-toggle]')){setOpen(!open,true);return;}
    const button=event.target.closest('.turtle-emote-panel button'); if(!button || button.disabled)return;
    if(button.hasAttribute('data-emote-category')){category=button.dataset.emoteCategory;renderGrid();syncActions();}
    else if(button.hasAttribute('data-turtle-emote')){const item=emotes.byId(button.dataset.turtleEmote);if(item&&changeText(item.token))remember(item.id);}
    else if(button.hasAttribute('data-emote-delete'))changeText('',true);
    else if(button.hasAttribute('data-emote-send'))form?.requestSubmit();
  });
  document.addEventListener('selectionchange',savePosition);
  document.addEventListener('input',event=>{if(event.target===input){savePosition();syncActions();}});
  document.addEventListener('focusin',event=>{if(event.target===input && open)setOpen(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && open){event.preventDefault();setOpen(false,true);}});
  // Switching to the existing media picker closes this panel before its route rerender.
  document.addEventListener('click',event=>{if(event.target.closest('[data-toggle-community-chat-tools]') && open)setOpen(false);},true);
  window.TurtleEmotePicker=Object.freeze({sync});
  sync();
})();
