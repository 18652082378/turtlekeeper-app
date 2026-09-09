const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const extract = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
};

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent('<html data-theme-color="dark"><head></head><body><div id="app" class="phone-shell"></div></body></html>');
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'styles.css'), 'utf8') });
    const photo = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(root, 'assets/species/ABQ.jpg')).toString('base64');
    await page.addScriptTag({ content: `
      var state={page:'community', turtles:[], communityFollowedCircleIds:['general']};
      var communityForumSort='hot', communitySelectedCircleId='all', communitySearchQuery='',communitySearchResults=[];
      var communityDraftTopic='',communityDraftTurtleId='',communityDraftQuestion='',communityDraftTitle='',communityDraftCircleId='',communityDraftVisibility='',communityVisibilitySheetOpen=false,communityDraftText='';
      var CONFIGURED_SMS_BACKEND=false, canCompose=true;
      function canUseCommunity(){return canCompose} function setState(patch){Object.assign(state,patch)}
      function communityPublishProgressMarkup(){return ''} function platformServiceTopButton(){return ''}
      function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
      function platformAdminBadge(){return ''} function accountAvatarSource(v){return v}
      ${extract('function applyTheme(', 'function accountSpeciesList(')}
      ${extract('function topbar(', 'function bottomNavActivePage(')}
      ${extract('function communityAvatar(', 'function marketSellerAvatar(')}
      ${extract('function communityPostMediaItems(', 'function communityCompactCard(')}
      ${extract('function formatCommunityCommentTime(', 'function communityCommentDeleteMarkup(')}
      ${extract('const COMMUNITY_TOPICS =', 'function communityShareUrl(')}
      ${extract('function communitySearchSuggestionsMarkup(', 'function bindCommunitySearchResults(')}
      ${extract('function pageCommunity()', 'function communityFeedSignature(')}
      var fixtures=[
        {id:'one',authorId:'u1',authorName:'小满的养龟日记',title:'阳光刚好，出来晒晒背',content:'吃饱后最喜欢的事，就是安静地趴在晒台上。你家的小家伙也这么爱晒太阳吗？',circleId:'general',speciesName:'安布闭壳龟',createdAt:new Date(Date.now()-3600000).toISOString(),likeCount:18,comments:[{},{}],mediaItems:[{url:${JSON.stringify(photo)},type:'image'}]},
        {id:'two',authorId:'u2',authorName:'昵称很长很长的养龟爱好者',title:'分享一下新布置的龟池',content:'终于布置好了，欢迎大家给点建议。',circleId:'habitat',isOwn:true,visibility:'public',createdAt:new Date().toISOString(),comments:[],mediaItems:Array.from({length:5},()=>({url:${JSON.stringify(photo)},type:'image'}))},
        {id:'three',authorId:'u3',authorName:'壳友',content:'今天也要好好养龟。',circleId:'general',isFeatured:true,createdAt:new Date().toISOString(),comments:[]}
      ];
      state.communityPosts=fixtures;
      function render(){
        document.querySelector('#app').innerHTML=pageCommunity();
        ${extract('  document.querySelectorAll("[data-community-compose]")', '  document.querySelectorAll("[data-community-topic-filter]")')}
        ${extract('  document.querySelectorAll("[data-community-forum-sort]")', '  document.querySelectorAll("[data-toggle-community-circle]")')}
      }
      state.themeColor='dark';applyTheme();render();
    ` });
    for (const topic of ['daily', 'growth', 'identify', 'question']) {
      await page.locator(`[data-community-compose="${topic}"]`).first().click();
      assert.deepEqual(await page.evaluate(() => [state.page,communityDraftTopic]), ['communityAdd',topic]);
    }
    await page.evaluate(() => {canCompose=false; state.page='community'});
    await page.locator('[data-community-compose="daily"]').first().click();
    assert.equal(await page.evaluate(() => state.page), 'community', 'login gate retained');
    await page.locator('[data-community-circle="habitat"]').click();
    assert.equal(await page.locator('[data-community-feed-card]').count(),1);
    assert.equal(await page.locator('[data-community-feed-card]').getAttribute('data-community-feed-card'),'two');
    await page.locator('[data-community-circle="all"]').click();
    await page.locator('[data-community-forum-sort="featured"]').click();
    assert.equal(await page.locator('[data-community-feed-card]').count(),1);
    assert.equal(await page.locator('[data-community-feed-card="three"] .forum-thread-main > p').count(),0,'short untitled content is not duplicated');
    await page.locator('[data-community-forum-sort="hot"]').click();
    assert.equal(await page.locator('[data-community-feed-card="two"] [data-preview-community-media]').count(),3);
    assert.equal(await page.locator('[data-community-feed-card="two"] .community-media-more').textContent(),'+2');
    fs.mkdirSync(path.join(root,'build'), {recursive:true});
    for (const theme of ['dark','light']) {
      for (const width of [320,390,768]) {
        await page.setViewportSize({width,height:844});
        await page.evaluate(theme=>{ state.themeColor=theme==='light'?'teal':theme;applyTheme(); document.activeElement?.blur();window.scrollTo(0,0); },theme);
        const metrics=await page.evaluate(()=>{
          const toolbar=document.querySelector('.community-feed-toolbar');
          const buttons=[...document.querySelectorAll('.forum-thread-actions button')].slice(0,3).map(x=>x.getBoundingClientRect());
          return {overflow:document.documentElement.scrollWidth>innerWidth,toolbarOverflow:toolbar.scrollWidth>toolbar.clientWidth+1,
            firstCard:document.querySelector('.forum-thread-card').getBoundingClientRect().top,
            aligned:buttons.every(x=>Math.abs(x.top-buttons[0].top)<1)};
        });
        assert.equal(metrics.overflow,false,`no page overflow ${theme}/${width}`);
        assert.equal(metrics.toolbarOverflow,false,`tabs fit ${theme}/${width}`);
        assert.equal(metrics.aligned,true,`actions aligned ${theme}/${width}`);
        assert.ok(metrics.firstCard<530,`content appears early ${theme}/${width}: ${metrics.firstCard}`);
        if(width===390) await page.screenshot({path:path.join(root,`build/community-home-${theme}-390.png`),fullPage:true});
      }
    }
    await page.evaluate(()=>{state.communityPosts=[];render()});
    assert.equal(await page.locator('.empty').count(),1);
    assert.equal(await page.locator('.community-invite-publish').count(),1,'empty feed still offers publishing');
    console.log('Community home checks passed: composer/login, circle/sort filtering, gallery, empty state, 320/390/768px in light/dark.');
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});

