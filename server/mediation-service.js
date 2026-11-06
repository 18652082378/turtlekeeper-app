'use strict';

// Service applications only: these records never initiate payments or release funds.
const crypto = require('node:crypto');
const TERMS_VERSION = 'mediation-20261106';
const STATUS = { pending: '待受理', accepted: '已受理', processing: '服务跟进中', completed: '服务已完成', closed: '已关闭', withdrawn: '已撤回' };
const NEXT = { pending: ['accepted', 'closed'], accepted: ['processing', 'closed'], processing: ['completed', 'closed'], completed: [], closed: [], withdrawn: [] };
const check = (ok, message, status = 400) => { if (!ok) throw Object.assign(new Error(message), { status }); };
function text(value, limit, label, required = false) {
  check(value === undefined || typeof value === 'string', `${label}格式不正确`);
  const result = String(value || '').trim();
  check(result.length <= limit && (!required || result.length > 0), `${label}${required ? '不能为空且' : ''}最多${limit}字`);
  check(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result), `${label}含无效字符`);
  return result;
}
function amount(value) {
  check(typeof value === 'string' || typeof value === 'number', '请填写交易金额');
  const match = /^(0|[1-9]\d{0,6})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  check(match, '交易金额最多两位小数');
  const result = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  check(result > 0, '交易金额必须大于零');
  return result;
}
const fee = cents => Math.max(680, Math.floor((cents * 68 + 5000) / 10000));
const rows = db => Array.isArray(db.mediationApplications) ? db.mediationApplications : [];
function visible(item, user, admin) { return admin || Boolean(user.mediationOwnerId && item.ownerId === user.mediationOwnerId); }
function output(item, admin) {
  const { ownerId, requestId, requestHash, ...result } = item;
  if (!admin) delete result.applicantPhone;
  return JSON.parse(JSON.stringify(result));
}
function find(db, user, admin, id) {
  const item = rows(db).find(row => row.id === id && visible(row, user, admin));
  check(item, '申请不存在或无权查看', 404);
  return item;
}
function createMediationService({ isAdmin, listingAllowed = () => true, audit = () => {} }) {
  function run(db, user, action, body, now = Date.now()) {
    const admin = isAdmin(user), at = new Date(now).toISOString();
    if (action === 'list') {
      const scope = body.scope === 'all' ? 'all' : 'mine';
      check(scope !== 'all' || admin, '仅管理员可查看全部申请', 403);
      const status = text(body.status, 24, '状态');
      check(!status || Object.hasOwn(STATUS, status), '申请状态无效');
      const keyword = text(body.keyword, 80, '搜索内容').toLowerCase();
      const offset = body.offset === undefined ? 0 : body.offset, limit = body.limit === undefined ? 20 : body.limit;
      check(Number.isInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit >= 1 && limit <= 50, '分页参数无效');
      const all = rows(db).filter(item => visible(item, user, scope === 'all' && admin))
        .filter(item => (!status || item.status === status) && (!keyword || [item.code, item.product.title, item.contact, ...(scope === 'all' ? [item.applicantName, item.applicantPhone] : [])].some(value => String(value).toLowerCase().includes(keyword))))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      return { applications: all.slice(offset, offset + limit).map(item => output(item, admin)), total: all.length, nextOffset: offset + Math.min(limit, Math.max(0, all.length - offset)), hasMore: offset + limit < all.length, isAdmin: admin, termsVersion: TERMS_VERSION };
    }
    if (action === 'detail') return { application: output(find(db, user, admin, body.id), admin), isAdmin: admin };
    if (action === 'create') {
      const requestId = text(body.requestId, 96, '请求标识', true);
      check(/^[a-zA-Z0-9_-]{12,96}$/.test(requestId), '请求标识无效');
      check(body.agreed === true && body.termsVersion === TERMS_VERSION, '请阅读并同意当前中介申请说明');
      check(['buyer', 'seller'].includes(body.role), '请选择买方或卖方');
      const contact = text(body.contact, 80, '联系微信或电话', true), note = text(body.note, 1000, '补充说明');
      const title = text(body.title, 120, '交易商品', true), speciesName = text(body.speciesName, 60, '品种', true);
      const listingId = text(body.listingId, 120, '商品标识');
      const amountCents = amount(body.amount);
      const requestHash = crypto.createHash('sha256').update(JSON.stringify({ listingId, title, speciesName, amountCents, contact, note, role: body.role, termsVersion: TERMS_VERSION })).digest('hex');
      const existing = rows(db).find(item => item.ownerId === user.mediationOwnerId && user.mediationOwnerId && item.requestId === requestId);
      if (existing) {
        check(existing.requestHash === requestHash, '该次申请内容已变化，请重新发起申请', 409);
        return { application: output(existing, admin), duplicate: true };
      }
      check(rows(db).filter(item => item.ownerId === user.mediationOwnerId && user.mediationOwnerId && Date.parse(item.createdAt) > now - 3600000).length < 20, '申请过于频繁，请稍后重试', 429);
      let product = { title, speciesName, listingId: '', inquiryCode: '', sellerName: '' };
      if (listingId) {
        const listing = (db.marketListings || []).find(item => item.id === listingId);
        check(listing && listing.status === 'active' && listingAllowed(listing), '商品已下架或暂不支持申请，请核实后重试', 409);
        product = { title: String(listing.title || listing.speciesName || '龟集市商品').slice(0, 120), speciesName: String(listing.speciesName || speciesName).slice(0, 60), listingId, inquiryCode: `KM-${listingId.slice(-6).toUpperCase()}`, sellerName: String(listing.sellerName || '').slice(0, 80) };
      } else check(listingAllowed({ speciesName }), '该品种暂不支持申请');
      const id = crypto.randomUUID(), code = `ZJ-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      if (!user.mediationOwnerId) user.mediationOwnerId = crypto.randomUUID();
      const item = { id, code, ownerId: user.mediationOwnerId, requestId, requestHash, applicantName: String(user.accountName || '龟友').slice(0, 80), applicantPhone: user.phone,
        role: body.role, contact, note, product, amountCents, feeCents: fee(amountCents), feeRateBps: 68, minimumFeeCents: 680,
        termsVersion: TERMS_VERSION, agreedAt: at, status: 'pending', revision: 1, createdAt: at, updatedAt: at, reply: '',
        history: [{ status: 'pending', label: STATUS.pending, note: '已提交申请，等待管理员联系核实', actor: 'applicant', at }] };
      db.mediationApplications = [item, ...rows(db)];
      return { application: output(item, admin), changed: true };
    }
    check(['withdraw', 'update'].includes(action), '不支持的申请操作', 404);
    if (action === 'update') check(admin, '仅管理员可处理申请', 403);
    const item = find(db, user, admin, body.id);
    check(Number.isInteger(body.revision) && body.revision === item.revision, '申请已更新，请刷新后核对最新进度', 409);
    if (action === 'withdraw') {
      check(visible(item, user, false), '只能撤回自己的申请', 403);
      check(item.status === 'pending', '已受理的申请请联系客服协商处理', 409);
      item.status = 'withdrawn';
      item.history.push({ status: item.status, label: STATUS[item.status], note: '申请人撤回尚未受理的申请', actor: 'applicant', at });
    } else {
      check(Object.hasOwn(STATUS, body.status) && (item.status === body.status || NEXT[item.status]?.includes(body.status)), '不允许此状态变更', 409);
      const reply = text(body.reply, 1000, '用户可见处理说明', true);
      if (item.status === body.status && item.reply === reply) return { application: output(item, admin) };
      item.status = body.status; item.reply = reply;
      item.history.push({ status: item.status, label: STATUS[item.status], note: reply, actor: 'admin', at });
      audit(db, user, '处理中介申请', `${item.code}：${STATUS[item.status]}`);
    }
    item.revision += 1; item.updatedAt = at;
    return { application: output(item, admin), changed: true };
  }
  return { run };
}
module.exports = { createMediationService, TERMS_VERSION, STATUS, NEXT, amount, fee };
