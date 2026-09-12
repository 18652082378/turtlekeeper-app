const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent('<html data-theme-color="dark"><head></head><body><div id="app" class="phone-shell"></div></body></html>');
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'styles.css'), 'utf8') });
    const actionsStart = source.indexOf('  const detailActions =');
    const actionsEnd = source.indexOf('\n  return `', actionsStart);
    const profileStart = source.indexOf('  document.querySelectorAll("[data-view-community-user]")');
    const profileEnd = source.indexOf('  bindMessageActivityEntries();', profileStart);
    assert.ok(profileStart >= 0 && profileEnd > profileStart, 'isolate the profile click handler without unrelated page bindings');
    await page.addScriptTag({ content: `
      var state={loggedInPhone:'viewer'}, communityReplyTarget=null, communityCommentsPostId='',communityExpandedReplyRoots=new Set();
      var profiles=[],likes=[],deletions=[];
      function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
      function platformAdminBadge(){return ''} function accountAvatarSource(x){return x}
      function openCommunityUserProfile(id){profiles.push(id)}
      function toggleCommunityCommentLike(post,id){likes.push(id)}
      async function deleteCommunityComment(post,id){deletions.push(id)}
      ${extract('function communityAvatar(', 'function marketSellerAvatar(')}
      ${extract('function formatCommunityCommentTime(', 'function pageCommunityPostDetail(')}
      var item={id:'post',likeCount:1,comments:[]};
      for(let i=0;i<12;i++) item.comments.push({id:'root'+i,authorId:'user'+i,authorName:i?'壳友 '+i:'昵称比较长的养龟爱好者',content:'这只龟养得很好，分享一下饲养经验。',createdAt:'2026-09-09T02:00:00Z',canDelete:true});
      for(let i=0;i<5;i++) item.comments.push({id:'reply'+i,replyToCommentId:'root0',replyToName:'壳友',authorId:'reply-user'+i,authorName:'回复用户 '+i,content:'这是第 '+(i+1)+' 条回复。',createdAt:'2026-09-09T03:00:00Z',canDelete:true});
      function actions(){const isOwn=false,canDelete=false,comments=item.comments; ${source.slice(actionsStart, actionsEnd)} return detailActions;}
      function render(){
        document.querySelector('#app').innerHTML='<main class="content community-detail-page"><article class="community-detail-card is-single-image">'+actions()+'</article><section class="forum-reply-section">'+communityCommentsMarkup(item)+'</section></main><form class="forum-reply-composer"><input><button>发送</button></form>';
        bindCommunityCommentInteractions();bindCommunityCommentDeletes();
        ${source.slice(profileStart,profileEnd)}
      }
      render();
    ` });
    assert.equal(await page.locator('.forum-comment-thread > .forum-floor').count(), 12, 'all main comments visible');
    assert.equal(await page.locator('[data-expand-community-comments]').count(), 0);
    assert.equal(await page.locator('.forum-nested-replies .forum-floor').count(), 3);
    await page.locator('[data-expand-comment-replies]').click();
    assert.equal(await page.locator('.forum-nested-replies .forum-floor').count(), 5);
    await page.locator('[data-expand-comment-replies]').click();
    assert.equal(await page.locator('.forum-nested-replies .forum-floor').count(), 3);
    await page.locator('.forum-comment-avatar-link').first().click();
    await page.locator('.forum-comment-author-link').first().click();
    assert.deepEqual(await page.evaluate(() => profiles), ['user0','user0']);
    assert.equal(await page.evaluate(() => communityReplyTarget), null, 'profile clicks must not trigger reply');
    await page.locator('[data-like-community-comment]').first().click();
    assert.deepEqual(await page.evaluate(() => likes), ['root0']);
    await page.locator('[data-delete-community-comment]').first().click();
    assert.deepEqual(await page.evaluate(() => deletions), ['root0']);
    assert.equal(await page.evaluate(() => communityReplyTarget), null);
    await page.locator('.forum-floor-content > p').first().click();
    assert.equal(await page.evaluate(() => communityReplyTarget.commentId), 'root0');
    await page.evaluate(() => { communityReplyTarget=null; render(); });
    await page.locator('.forum-nested-replies .forum-floor').first().dispatchEvent('click');
    assert.equal(await page.evaluate(() => communityReplyTarget.commentId), 'reply0');
    for (const width of [320,390,768]) {
      await page.setViewportSize({width,height:844});
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0,0); });
      const layout = await page.evaluate(() => {
        const actionButtons=Array.from(document.querySelectorAll('.community-detail-actions > button')).map(node=>node.getBoundingClientRect());
        const main=document.querySelector('.forum-comment-thread > .forum-floor .forum-floor-content').getBoundingClientRect();
        const nestedAvatar=document.querySelector('.forum-nested-replies .forum-floor-avatar').getBoundingClientRect();
        const nestedText=document.querySelector('.forum-nested-replies .forum-floor-content').getBoundingClientRect();
        const expand=document.querySelector('[data-expand-comment-replies]').getBoundingClientRect();
        return {actionTops:actionButtons.map(rect=>rect.top),alignedAvatar:Math.abs(main.left-nestedAvatar.left)<1,alignedExpand:Math.abs(nestedText.left-expand.left)<1,
          overflow:Array.from(document.querySelectorAll('.forum-comment-actions,.community-detail-actions')).some(node=>node.scrollWidth>node.clientWidth+1)};
      });
      assert.ok(layout.actionTops.every(top=>Math.abs(top-layout.actionTops[0])<1), 'post actions share one line at '+width);
      assert.ok(layout.alignedAvatar && layout.alignedExpand, 'consistent reply indentation at '+width);
      assert.equal(layout.overflow,false,'actions must fit at '+width);
    }
    await page.setViewportSize({width:390,height:844});
    fs.mkdirSync(path.join(root,'build'),{recursive:true});
    await page.screenshot({path:path.join(root,'build/comment-layout-390.png')});
    console.log('Comment layout browser checks passed: all roots, 3 replies, expansion, profile/reply/action routing, alignment at 320/390/768px.');
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
