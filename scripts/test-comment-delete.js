const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

async function main() {
  let updates = 0;
  let calls = 0;
  let message = '';
  const post = { id: 'p', comments: [{ id: 'c' }, { id: 'other' }] };
  const ctx = {
    state: { loggedInPhone: 'owner', communityPosts: [post], communityFollowingPosts: [post], communityUserPosts: [post] },
    communitySearchResults: [post],
    communityReplyTarget: { postId: 'p', commentId: 'c' },
    currentCloudToken: () => 'token',
    communityAuthPayload: extra => ({ phone: 'owner', token: 'token', ...extra }),
    canUseCommunity: () => true,
    confirm: () => true,
    escapeHtml: value => value,
    normalizeCommunityPosts: value => value,
    document: { querySelector: () => null },
    toast: value => { message = value; },
    setState: patch => { updates++; Object.assign(ctx.state, patch); },
    apiPost: async () => { calls++; return { posts: [{ id: 'p', comments: [{ id: 'other' }] }] }; }
  };
  vm.createContext(ctx);
  vm.runInContext(extract('function communityCommentDeleteMarkup(', 'function bindCommunityCommentDeletes('), ctx);
  vm.runInContext(extract('async function deleteCommunityComment(', 'async function submitCommunityComment('), ctx);
  assert.match(ctx.communityCommentDeleteMarkup({ id: 'c', canDelete: true }, 'p'), /删除/);
  assert.equal(ctx.communityCommentDeleteMarkup({ id: 'c', canDelete: false }, 'p'), '');
  ctx.state.loggedInPhone = '';
  assert.equal(ctx.communityCommentDeleteMarkup({ id: 'c', canDelete: true }, 'p'), '');
  ctx.state.loggedInPhone = 'owner';
  ctx.confirm = () => false;
  await ctx.deleteCommunityComment('p', 'c');
  assert.equal(calls, 0);
  ctx.confirm = () => true;
  await ctx.deleteCommunityComment('p', 'c');
  for (const list of [ctx.state.communityPosts, ctx.state.communityFollowingPosts, ctx.state.communityUserPosts, ctx.communitySearchResults]) {
    assert.equal(list[0].comments.length, 1);
    assert.equal(list[0].comments[0].id, 'other');
  }
  assert.equal(ctx.communityReplyTarget, null);
  assert.equal(message, '已删除');
  ctx.apiPost = async () => { throw { status: 405 }; };
  await ctx.deleteCommunityComment('p', 'c');
  assert.equal(updates, 1, 'failure must not pretend to remove content locally');
  assert.match(message, /暂不可用/);
  ctx.apiPost = async () => { ctx.state.loggedInPhone = 'different-user'; return { posts: [] }; };
  await ctx.deleteCommunityComment('p', 'c');
  assert.equal(updates, 1, 'old account response must not overwrite the new account');
  console.log('Comment deletion client checks passed: ownership display, cancellation, cache updates, reply target, failure and account switching.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
