'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { reviewHash, createDailyCommunityDispatcher } = require(process.env.COMMUNITY_PUSH_MODULE ? path.resolve(process.env.COMMUNITY_PUSH_MODULE) : '../server/community-daily-push');
const copy = value => JSON.parse(JSON.stringify(value));
const outcomes = [];
const now = new Date('2026-10-01T02:00:00Z');
function post(id, overrides = {}) {
  const item = { id, authorPhoneRaw: 'author', title: '小龟的新家布置好了', content: '记录今天的布置过程和小龟适应的情况。',
    visibility: 'public', createdAt: '2026-10-01T01:00:00Z', mediaItems: [{ type: 'image', url: '/uploads/2026/10/home.jpg' }], ...overrides };
  item.dailyPushReview = { hash: reviewHash(item), reviewedAt: '2026-10-01T01:30:00Z', reviewedBy: 'admin' };
  return item;
}
function fixture(posts, extra = {}) {
  let db = { users: { author: { token: 'author-device' }, reader: { token: 'reader-device' } }, communityPosts: posts, reports: [], ...extra };
  const sent = [];
  const options = { read: () => copy(db), write: async next => { db = copy(next); }, now: () => now,
    configured: () => true, devices: user => [{ token: user.token }], canReceive: () => true,
    send: async (token, payload) => { sent.push({ token, payload }); } };
  return { options, sent, get db() { return db; }, dispatch: () => createDailyCommunityDispatcher(options)() };
}
async function check(name, run) {
  try { await run(); outcomes.push({ name, pass: true }); }
  catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
}
(async () => {
  await check('reviewed title, excerpt, image and detail target belong to the selected post', async () => {
    const f = fixture([post('selected')]); await f.dispatch();
    assert.equal(f.sent.length, 2);
    for (const { payload } of f.sent) {
      assert.equal(payload.aps.alert.title, '小龟的新家布置好了');
      assert.equal(payload.aps.alert.body, '记录今天的布置过程和小龟适应的情况。');
      assert.equal(payload.attachmentUrl, 'https://api.turtleworld.cn/uploads/2026/10/home.jpg');
      assert.equal(payload.aps['mutable-content'], 1);
      assert.equal(payload.route, 'communityDaily'); assert.equal(payload.postId, 'selected');
    }
  });
  await check('latest admin approval wins over an older pending candidate', async () => {
    const older = post('older', { createdAt: '2026-10-01T00:00:00Z' });
    older.dailyPushReview.reviewedAt = '2026-10-01T01:20:00Z';
    const selected = post('just-selected', { createdAt: '2026-10-01T01:10:00Z', title: '管理员选择的这篇' });
    selected.dailyPushReview.reviewedAt = '2026-10-01T01:40:00Z';
    const f = fixture([older, selected]); await f.dispatch();
    assert.ok(f.sent.every(({ payload }) => payload.postId === selected.id));
  });
  await check('admin approval overrides advertising, contact and sales keyword heuristics', async () => {
    for (const text of ['出售小龟500元', '加微信联系我', '扫码查看联系方式', '出龟包邮', 'https://example.com']) {
      const selected = post('admin-selected', { title: text, content: text });
      const f = fixture([selected]); await f.dispatch();
      assert.equal(f.sent.length, 2, text);
      assert.equal(f.sent[0].payload.aps.alert.title, text);
      delete selected.dailyPushReview;
      const unreviewed = fixture([selected]); await unreviewed.dispatch(); assert.equal(unreviewed.sent.length, 0, 'Human approval is still required');
    }
  });
  await check('changing a reviewed title prevents sending until re-approved', async () => {
    const changed = post('edited'); changed.title = '编辑后的标题';
    const f = fixture([changed]); await f.dispatch(); assert.equal(f.sent.length, 0);
    changed.dailyPushReview.hash = reviewHash(changed);
    const approved = fixture([changed]); await approved.dispatch();
    assert.equal(approved.sent[0].payload.aps.alert.title, changed.title);
  });
  await check('a changed image cannot use a stale review', async () => {
    const changed = post('edited-image'); changed.mediaItems[0].url = '/uploads/new.jpg';
    const f = fixture([changed]); await f.dispatch(); assert.equal(f.sent.length, 0);
  });
  await check('private and reported selections cannot broadcast', async () => {
    for (const f of [fixture([post('private', { visibility: 'private' })]), fixture([post('reported')], { reports: [{ targetId: 'reported', status: 'pending' }] })]) {
      await f.dispatch(); assert.equal(f.sent.length, 0);
    }
  });
  await check('a locked daily selection is not replaced after sending starts', async () => {
    const existing = post('already-selected'); const newer = post('newer'); newer.dailyPushReview.reviewedAt = '2026-10-01T01:50:00Z';
    const f = fixture([existing, newer], { communityDailyDeliveries: { '2026-10-01': { postId: existing.id, attempted: {}, createdAt: now.toISOString() } } });
    await f.dispatch(); assert.ok(f.sent.every(({ payload }) => payload.postId === existing.id));
    await f.dispatch(); assert.equal(f.sent.length, 2);
  });
  await check('no image still sends the real title without requesting an attachment', async () => {
    const f = fixture([post('text', { mediaItems: [] })]); await f.dispatch();
    assert.equal(f.sent[0].payload.aps.alert.title, '小龟的新家布置好了');
    assert.equal(f.sent[0].payload.attachmentUrl, undefined);
    assert.equal(f.sent[0].payload.aps['mutable-content'], undefined);
  });
  await check('legacy relative image is attached to the same post', async () => {
    const f = fixture([post('legacy', { mediaItems: [], mediaUrl: '/uploads/legacy.png' })]); await f.dispatch();
    assert.equal(f.sent[0].payload.attachmentUrl, 'https://api.turtleworld.cn/uploads/legacy.png');
  });
  await check('signed media URLs retain the query and video uses its reviewed cover', async () => {
    const image = 'https://media.turtleworld.cn/uploads/cover.jpg?x-oss-signature=a%2Bb&expires=123';
    const f = fixture([post('video', { mediaItems: [{ type: 'video', url: '/uploads/movie.mp4', posterUrl: image }] })]); await f.dispatch();
    assert.equal(f.sent[0].payload.attachmentUrl, image);
  });
  await check('unsafe and unrelated media addresses fall back to text', async () => {
    for (const url of ['javascript:alert(1)', 'data:image/png;base64,AAA', 'http://media.turtleworld.cn/a.jpg', 'https://127.0.0.1/a.jpg', 'https://example.com/a.jpg', 'https://api.turtleworld.cn:8443/a.jpg', '/uploads/../private.jpg', '/uploads/%2e%2e/private.jpg']) {
      const f = fixture([post('unsafe', { mediaItems: [{ type: 'image', url }] })]); await f.dispatch();
      assert.equal(f.sent[0].payload.attachmentUrl, undefined, url);
      assert.equal(f.sent[0].payload.aps.alert.title, '小龟的新家布置好了');
    }
  });
  await check('oversized Unicode text remains a valid APNs payload', async () => {
    const f = fixture([post('long', { title: '🐢'.repeat(1000), content: '成长记录'.repeat(1000) })]); await f.dispatch();
    const payload = f.sent[0].payload;
    assert.ok(Buffer.byteLength(JSON.stringify(payload)) <= 4096);
    assert.ok(!/[\ud800-\udbff]$/.test(payload.aps.alert.title));
  });
  await check('authorless title falls back to that post content instead of a generic new-post alert', async () => {
    const f = fixture([post('untitled', { title: '', content: '今天第一次测量小龟的体重' })]); await f.dispatch();
    assert.equal(f.sent[0].payload.aps.alert.title, '今天第一次测量小龟的体重');
  });
  await check('admin confirmation and request refer to the clicked post', async () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');
    const calls = [], prompts = [];
    const context = { state: { isCommunityAdmin: true, communityPosts: [{ id: 'a', title: '旧候选' }, { id: 'b', title: '本次选中标题' }] },
      window: { confirm: text => { prompts.push(text); return true; } }, communityPostTitle: item => item.title,
      communityAuthPayload: data => data, apiPost: async (url, data) => { calls.push({ url, data }); return { ok: true, posts: [] }; },
      setState() {}, normalizeCommunityPosts: items => items, toast() {} };
    vm.createContext(context);
    vm.runInContext(source.slice(source.indexOf('async function communityAdminPostAction('), source.indexOf('async function toggleCommunityCircleFollow(')), context);
    await context.communityAdminPostAction('b', 'dailyPushApprove');
    assert.ok(prompts[0].includes('本次选中标题')); assert.ok(!prompts[0].includes('旧候选'));
    assert.equal(calls[0].data.postId, 'b'); assert.equal(calls[0].data.confirmNoAdvertising, true);
    context.window.confirm = () => false;
    await context.communityAdminPostAction('a', 'dailyPushApprove'); assert.equal(calls.length, 1, 'Cancelling review must not approve a different post');
  });
  fs.mkdirSync(path.resolve(__dirname, '../output'), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, '../output/community-recommendation-20261001.json'), JSON.stringify({ nativeDevice: false, productionTested: false, externalPushSent: false, outcomes }, null, 2));
  console.log(JSON.stringify(outcomes, null, 2));
  assert.ok(outcomes.every(item => item.pass), 'recommendation regression must pass');
})().catch(error => { console.error(error); process.exitCode = 1; });
