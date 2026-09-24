const crypto = require('node:crypto');
const { createAlipayProvider } = require('./alipay-team-provider');
const { access } = require('./team-space');
const PLANS = Object.freeze({ monthly: { amountCents: 1990, days: 30 }, yearly: { amountCents: 11800, days: 365 } });
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
function cents(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) return NaN;
  const [whole, fraction = ''] = String(value).split('.');
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(n) ? n : NaN;
}
function recalculate(user) {
  let end = 0;
  const paid = (user.alipayTeamOrders || []).filter(o => o.paidAt && o.status === 'paid').sort((a, b) => Date.parse(a.paidAt) - Date.parse(b.paidAt) || a.id.localeCompare(b.id));
  for (const o of paid) end = Math.max(end, Date.parse(o.paidAt)) + o.days * 86400000;
  user.alipayTeamEntitlement = { source: 'alipay', verified: true, expiresAt: new Date(end).toISOString(), revoked: !paid.length };
}
function createAlipayPurchases({ read, write, authenticate, provider = createAlipayProvider(), now = Date.now }) {
  // Serialize durable mutations. Never keep a database snapshot across network I/O.
  let queue = Promise.resolve(), refreshing = false;
  function exclusive(fn) { const run = queue.then(fn); queue = run.catch(() => {}); return run; }
  function userFor(body) { const u = authenticate(read(), String(body.phone || ''), body.token); if (!u) fail('登录已过期，请重新登录', 401); return u; }
  function locate(phone, id) { return read().users[phone]?.alipayTeamOrders?.find(o => o.id === id); }
  function view(user, order) { return { orderId: order.id, status: order.status, plan: order.plan, amountCents: order.amountCents,
    active: access(user).active, expiresAt: access(user).expiresAt, paid: order.status === 'paid' }; }
  async function reconcile(phone, id, notification) {
    const old = locate(phone, id); if (!old) fail('订单不存在', 404);
    const response = await provider.query(id);
    if (response.code !== '10000') {
      if (response.sub_code === 'ACQ.TRADE_NOT_EXIST') return exclusive(async () => {
        const db = read(), u = db.users[phone], o = u?.alipayTeamOrders?.find(o => o.id === id);
        if (!o) fail('订单不存在', 404);
        o.checkedAt = new Date(now()).toISOString();
        await write(db); return view(u, o);
      });
      fail('暂时无法核实支付宝订单，请稍后点击同步支付结果', 502);
    }
    if (response.out_trade_no !== id || cents(response.total_amount) !== old.amountCents ||
      (response.seller_id && response.seller_id !== provider.sellerId) ||
      (response.seller_user_id && response.seller_user_id !== provider.sellerId) ||
      (response.app_id && response.app_id !== provider.appId)) fail('支付订单核验不一致', 409);
    return exclusive(async () => {
      const db = read(), u = db.users[phone], o = u?.alipayTeamOrders?.find(o => o.id === id);
      if (!o) fail('订单不存在', 404);
      const status = response.trade_status;
      if (!['WAIT_BUYER_PAY', 'TRADE_SUCCESS', 'TRADE_FINISHED', 'TRADE_CLOSED'].includes(status)) fail('未知支付状态', 502);
      if (notification?.trade_no && notification.trade_no !== response.trade_no) fail('支付流水不一致', 409);
      if (o.tradeNo && response.trade_no !== o.tradeNo) fail('支付流水不一致', 409);
      if (['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(status) && !['refunded', 'refund_pending'].includes(o.status)) {
        if (!/^\d{10,64}$/.test(response.trade_no || '')) fail('支付流水无效', 502);
        const time = response.send_pay_date || notification?.gmt_payment;
        const paidAt = Date.parse(String(time || '').replace(' ', 'T') + '+08:00');
        if (!Number.isFinite(paidAt) || paidAt > now() + 300000 || paidAt < Date.parse(o.createdAt) - 300000) fail('支付时间无效', 502);
        o.paidAt ||= new Date(paidAt).toISOString(); o.tradeNo = response.trade_no; o.status = 'paid';
      }
      const refund = Math.max(cents(response.refund_fee || '0'), cents(notification?.refund_fee || '0'));
      if (refund >= o.amountCents || (status === 'TRADE_CLOSED' && o.paidAt)) o.status = 'refunded';
      else if (status === 'TRADE_CLOSED' && !o.paidAt) o.status = 'closed';
      o.checkedAt = new Date(now()).toISOString(); o.providerStatus = status;
      recalculate(u); await write(db); return view(u, o);
    });
  }
  async function action(body) {
    const user = userFor(body);
    if (body.action === 'prepare') return { configured: provider.ready(), billingMode: 'one_time', active: access(user).active, expiresAt: access(user).expiresAt,
      products: Object.entries(PLANS).map(([id, p]) => ({ id, ...p, displayPrice: `¥${(p.amountCents / 100).toFixed(2)}` })) };
    if (!provider.ready()) fail('支付宝会员付款暂未开放，请稍后再试', 503);
    if (body.action === 'create') {
      if (!Object.hasOwn(PLANS, body.plan)) fail('会员套餐无效');
      const apple = user.teamEntitlement;
      if (apple?.source === 'apple' && apple.verified && !apple.revoked && Date.parse(apple.expiresAt) > now()) fail('当前账号已有有效的苹果订阅，无需重复购买');
      const order = await exclusive(async () => {
        userFor(body);
        const db = read(), u = db.users[user.phone]; u.alipayTeamOrders ||= [];
        // Reuse an unpaid order. Lost create responses cannot cause duplicate orders.
        const pending = u.alipayTeamOrders.find(o => o.status === 'pending' && now() - Date.parse(o.createdAt) < 30 * 60000);
        if (pending && pending.plan !== body.plan) fail('已有待支付订单，请先同步支付结果或30分钟后更换套餐', 409);
        if (pending) return { ...pending };
        const o = { id: 'TM' + crypto.randomBytes(16).toString('hex'), plan: body.plan, ...PLANS[body.plan], status: 'pending', createdAt: new Date(now()).toISOString() };
        u.alipayTeamOrders.push(o); await write(db); return { ...o };
      });
      return { orderId: order.id, orderString: provider.orderString(order), amountCents: order.amountCents };
    }
    if (body.action === 'query') {
      if (!/^TM[a-f0-9]{32}$/.test(body.orderId || '')) fail('订单编号无效');
      return reconcile(user.phone, body.orderId);
    }
    if (body.action === 'sync') {
      const orders = (user.alipayTeamOrders || []).filter(o => ['pending', 'paid', 'refund_pending'].includes(o.status)).slice(-10);
      for (const o of orders) await reconcile(user.phone, o.id);
      const current = userFor(body); return { active: access(current).active, expiresAt: access(current).expiresAt };
    }
    fail('不支持的支付操作');
  }
  async function notification(data) {
    if (!provider.ready() || data.app_id !== provider.appId || data.seller_id !== provider.sellerId || !provider.verifyNotification(data)) fail('通知验签失败', 400);
    const user = Object.values(read().users).find(u => u.alipayTeamOrders?.some(o => o.id === data.out_trade_no));
    if (!user) return; // Never disclose deleted/unknown accounts.
    const order = locate(user.phone, data.out_trade_no);
    if (cents(data.total_amount) !== order.amountCents) fail('通知金额不一致', 400);
    await reconcile(user.phone, order.id, data);
  }
  async function refresh() {
    if (refreshing || !provider.ready()) return;
    refreshing = true;
    try {
      const due = Object.values(read().users).flatMap(u => (u.alipayTeamOrders || []).filter(o =>
        (o.status === 'pending' && now() - Date.parse(o.createdAt) < 86400000 || o.status === 'paid' && o.providerStatus !== 'TRADE_FINISHED') &&
        now() - Date.parse(o.checkedAt || o.createdAt) > (o.status === 'pending' ? 60000 : 900000)).map(o => ({ phone: u.phone, id: o.id, checkedAt: o.checkedAt || o.createdAt })))
        .sort((a,b) => a.checkedAt.localeCompare(b.checkedAt)).slice(0, 30);
      for (const o of due) { try { await reconcile(o.phone, o.id); } catch { /* Retry later; never grant on errors. */ } }
    } finally { refreshing = false; }
  }
  // Operator-only API, deliberately not exposed over HTTP. Uses one refund id.
  async function refund(phone, id) {
    const order = locate(phone, id); if (!order?.paidAt) fail('没有已付款订单', 404);
    const r = await provider.refund(order);
    if (r.code !== '10000' || r.out_trade_no !== id || r.trade_no !== order.tradeNo || cents(r.refund_fee) !== order.amountCents) fail('退款未确认，请使用原订单重试', 502);
    await exclusive(async () => { const db = read(), u = db.users[phone], o = u?.alipayTeamOrders?.find(o => o.id === id); if (!o) fail('订单不存在', 404); o.status = 'refunded'; recalculate(u); await write(db); });
  }
  return { action, notification, refresh, refund };
}
module.exports = { createAlipayPurchases, PLANS, cents, recalculate };
