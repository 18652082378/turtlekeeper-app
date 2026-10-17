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
// Optional keyword hint only. Explicit administrator approval is authoritative;
// this heuristic must never veto approval or dispatch.
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
    && post.dailyPushReview?.hash === reviewHash(post)
    && !(db.reports || []).some(report => report.targetId === post.id && report.status !== 'dismissed');
}
// Keep this allow-list in sync with the notification service extension. The
// extension never fetches arbitrary URLs supplied by user-generated content.
const ATTACHMENT_HOSTS = ['api.turtleworld.cn', 'media.turtleworld.cn', 'turtlekeeper-media-hz2026.oss-cn-hangzhou.aliyuncs.com'];
function attachmentUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 800 || /[\u0000-\u0020\u007f"'<>`\\]/.test(value)) return '';
  if (!/^https:\/\//i.test(value) && !/^\/(?:uploads|assets)\//.test(value)) return '';
  try {
    const rawPath = value.replace(/^https:\/\/[^/]+/i, '').split(/[?#]/)[0];
    const decoded = decodeURIComponent(rawPath);
    if (decoded.includes('\\') || decoded.split('/').some(part => part === '.' || part === '..')) return '';
    const url = new URL(value, 'https://api.turtleworld.cn');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !ATTACHMENT_HOSTS.includes(url.hostname)) return '';
    return value.startsWith('/') ? url.href : value; // Preserve signed queries.
  } catch { return ''; }
}
function pushText(value, limit) {
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  const characters = Array.from(text);
  return characters.length > limit ? characters.slice(0, limit - 1).join('') + '…' : text;
}
function recommendationPayload(post) {
  const title = pushText(post.title, 120) || pushText(post.question || post.content, 80) || '分享了一张龟龟照片';
  const excerpt = pushText(post.content || post.question, 160);
  const media = Array.isArray(post.mediaItems) ? post.mediaItems : [];
  // Use reviewed media only, never the author's avatar or an unrelated image.
  const candidates = media.length ? media.map(item => item?.type === 'video' ? item.posterUrl || item.poster : item?.url) : [post.mediaUrl];
  const image = candidates.map(attachmentUrl).find(Boolean);
  return { aps: { alert: { title, body: excerpt && excerpt !== title ? excerpt : '点击查看完整内容' }, sound: 'default', ...(image ? { 'mutable-content': 1 } : {}) },
    route: 'communityDaily', postId: post.id, ...(image ? { attachmentUrl: image } : {}) };
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
          // The latest explicit admin choice wins before today's selection is
          // durably locked. Retain deterministic ordering for legacy reviews.
          .sort((a,b) => (Date.parse(b.dailyPushReview.reviewedAt) || 0) - (Date.parse(a.dailyPushReview.reviewedAt) || 0)
            || Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))[0];
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
          const key = crypto.createHash('sha256').update((device.platform === 'android' ? 'android:' : '') + device.token).digest('hex');
          if (delivery.attempted[key]) continue;
          delivery.attempted[key] = now().toISOString();
          await write(db);
          const payload = recommendationPayload(post);
          await send(device.token, payload, device);
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
module.exports = { clock, reviewHash, advertisingRisk, eligible, ATTACHMENT_HOSTS, attachmentUrl, recommendationPayload, createDailyCommunityDispatcher };
