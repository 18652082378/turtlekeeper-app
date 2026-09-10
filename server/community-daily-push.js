const crypto = require('node:crypto');

function clock(now = new Date()) {
  const local = new Date(now.getTime() + 8 * 3600000).toISOString();
  return { day: local.slice(0, 10), hour: Number(local.slice(11, 13)) };
}
function reviewHash(post) {
  return crypto.createHash('sha256').update(JSON.stringify([
    post.title, post.content, post.question, post.location, post.mentions,
    post.speciesName, post.mediaUrl, post.mediaItems, post.visibility
  ])).digest('hex');
}
// A conservative pre-filter, NOT an image/ad classifier. Human review is mandatory.
function advertisingRisk(post) {
  const text = [post.title, post.content, post.question, post.location, post.mentions, post.speciesName].join(' ')
    .normalize('NFKC').replace(/[\s\u200b-\u200f\ufeff]/g, '').toLowerCase();
  return /https?:|www\.|二维码|扫码|微信|微[信芯]|加[ⅴv薇威]|vx|wechat|公众号|小程序|加群|进群|私信|私聊|联系我|购买|出售|售卖|出龟|收龟|求购|包邮|优惠|折扣|代购|团购|推广|代理|返利|招商|中介|客服|淘宝|拼多多|闲鱼|抖音|橱窗|直播间|下单|¥|￥|\d+(?:\.\d+)?元|1[3-9]\d{9}|[a-z0-9-]+\.(?:com|cn|net|shop)/i.test(text);
}
function eligible(db, post, now) {
  return post && (post.visibility || 'public') === 'public'
    && db.users?.[post.authorPhoneRaw]
    && Date.parse(post.createdAt) <= now.getTime()
    && Date.parse(post.createdAt) >= now.getTime() - 24 * 3600000
    && !advertisingRisk(post)
    && post.dailyPushReview?.hash === reviewHash(post)
    && !(db.reports || []).some(report => report.targetId === post.id && report.status !== 'dismissed');
}
function createDailyCommunityDispatcher({ read, write, send, devices, canReceive, configured, now = () => new Date() }) {
  let running = false;
  return async function dispatch() {
    if (running || !configured()) return;
    running = true;
    try {
      const start = now();
      const { day, hour } = clock(start);
      if (hour < 9 || hour >= 21) return;
      let db = read();
      db.communityDailyDeliveries ||= {};
      let delivery = db.communityDailyDeliveries[day];
      if (!delivery) {
        const used = new Set(Object.values(db.communityDailyDeliveries).map(item => item.postId));
        const post = (db.communityPosts || []).filter(item => !used.has(item.id) && eligible(db, item, start))
          .sort((a,b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))[0];
        if (!post) return;
        delivery = { postId: post.id, attempted: {}, createdAt: start.toISOString() };
        db.communityDailyDeliveries[day] = delivery;
        // Persist the daily selection BEFORE contacting APNs. A crash can lose a
        // notification, but may never cause a second post to be broadcast that day.
        await write(db);
      }
      if (delivery.complete) return;
      const phones = Object.keys(read().users || {});
      for (const phone of phones) {
        if (clock(now()).day !== day || clock(now()).hour >= 21) break;
        db = read();
        delivery = db.communityDailyDeliveries[day];
        const post = (db.communityPosts || []).find(item => item.id === delivery.postId);
        if (!eligible(db, post, now())) break;
        const user = db.users[phone];
        if (!user || user.communityDailyPushEnabled === false || !canReceive(db, post, user)) continue;
        for (const device of devices(user)) {
          const key = crypto.createHash('sha256').update(device.token).digest('hex');
          if (delivery.attempted[key]) continue;
          delivery.attempted[key] = now().toISOString();
          await write(db);
          // Fixed copy prevents an account nickname or title from injecting an ad.
          const payload = { aps: { alert: { title: '壳友圈有新分享', body: '有壳友分享了新的养龟记录，点击看看吧。' }, sound: 'default' }, route: 'communityDaily', postId: post.id };
          await send(device.token, payload);
          // Re-read after each await: do not overwrite newer user/account changes.
          db = read(); delivery = db.communityDailyDeliveries[day];
        }
      }
      db = read();
      db.communityDailyDeliveries[day].complete = true;
      for (const key of Object.keys(db.communityDailyDeliveries)) if (key < new Date(start.getTime() - 60 * 86400000).toISOString().slice(0,10)) delete db.communityDailyDeliveries[key];
      await write(db);
    } finally { running = false; }
  };
}
module.exports = { clock, reviewHash, advertisingRisk, eligible, createDailyCommunityDispatcher };
