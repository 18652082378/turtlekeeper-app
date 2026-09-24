'use strict';

// Pure order rules. No HTTP endpoint or payment provider is enabled by this file.
// The caller must persist each transition atomically with its inventory/event
// changes. Provider events below are INTERNAL inputs, after signature verification.
const crypto = require('node:crypto');
const RECEIPT_WINDOW_MS = 48 * 60 * 60 * 1000;
const DISPATCH_WINDOW_MS = 48 * 60 * 60 * 1000;
function check(value, message, status = 400) {
  if (!value) throw Object.assign(new Error(message), { status });
}
function text(value, limit, label) {
  check(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit, `${label}无效`);
  return value.trim();
}
function cents(value) {
  check(typeof value === 'string' || typeof value === 'number', '金额无效');
  const match = /^(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/.exec(String(value));
  check(match, '金额必须为非负金额且最多两位小数');
  return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
}
function timestamp(now) {
  check(Number.isSafeInteger(now) && now >= 0, '订单时间无效');
  return new Date(now).toISOString();
}
function commission(totalCents) {
  check(Number.isSafeInteger(totalCents) && totalCents > 0 && totalCents <= 19999999998, '结算金额无效');
  // 0.68%, rounded half up to a cent. No minimum platform fee.
  const platformFeeCents = Number((BigInt(totalCents) * 68n + 5000n) / 10000n);
  return { platformFeeBps: 68, platformFeeCents, sellerGrossCents: totalCents - platformFeeCents };
}
function audit(order, status, actor, now) {
  order.status = status;
  order.updatedAt = timestamp(now);
  order.revision += 1;
  order.history.push({ status, actor, at: order.updatedAt });
  return order;
}
// quote is computed by the server from a qualified seller, approved listing and
// current delivery quote, NEVER copied from an HTTP request's amount fields.
function createOrder({ buyerId, quote, requestId }, now = Date.now()) {
  buyerId = text(buyerId, 100, '买方');
  check(quote && typeof quote === 'object', '订单报价无效');
  const sellerId = text(quote.sellerId, 100, '卖方');
  check(buyerId !== sellerId, '不能购买自己的商品');
  const goodsCents = cents(quote.goodsAmount), shippingCents = cents(quote.shippingAmount);
  check(goodsCents > 0, '商品金额必须大于零');
  check(Number.isInteger(quote.quantity) && quote.quantity > 0 && quote.quantity <= 10000, '商品数量无效');
  return {
    id: crypto.randomUUID(), requestId: text(requestId, 96, '请求标识'), buyerId, sellerId,
    listingId: text(quote.listingId, 100, '商品'),
    item: { title: text(quote.title, 120, '商品标题'), quantity: quote.quantity },
    currency: 'CNY', goodsCents, shippingCents, totalCents: goodsCents + shippingCents,
    status: 'pending_payment', revision: 0, createdAt: timestamp(now), updatedAt: timestamp(now),
    history: [{ status: 'pending_payment', actor: buyerId, at: timestamp(now) }],
    payment: null, refund: null, shipment: null, delivery: null, dispute: null,
    dispatchDeadline: null, extension: null,
    // This is a fee quote, not a settlement result. Payment-channel fees must
    // be allocated separately once the merchant contract/policy is confirmed.
    feeQuote: commission(goodsCents + shippingCents)
  };
}
function transition(order, { action, actorId, data = {} }, now = Date.now()) {
  const next = structuredClone(order);
  check(actorId === order.buyerId || actorId === order.sellerId, '无权操作此订单', 403);
  const buyer = actorId === order.buyerId;
  if (action === 'cancel') {
    check(buyer, '仅买方可取消订单', 403);
    check(order.status === 'pending_payment', '此订单不能直接取消', 409);
    // Provider closure must be confirmed before the service applies this event.
    return audit(next, 'cancel_requested', actorId, now);
  }
  if (action === 'ship') {
    check(!buyer, '仅卖方可发货', 403);
    check(order.status === 'paid', '仅已付款且无退款申请的订单可发货', 409);
    check(order.dispatchDeadline && now < Date.parse(order.dispatchDeadline), '已超过约定发货期限，需处理超时订单', 409);
    next.shipment = { carrier: text(data.carrier, 60, '承运方'), trackingNumber: text(data.trackingNumber, 80, '运单号'), at: timestamp(now) };
    return audit(next, 'shipped', actorId, now);
  }
  if (action === 'request_extension') {
    check(!buyer, '仅卖方可申请延长发货时间', 403);
    check(order.status === 'paid' && now < Date.parse(order.dispatchDeadline), '此订单不能申请延期', 409);
    check(!order.extension || order.extension.status !== 'pending', '已有待处理的延期申请', 409);
    const deadline = data.deadline;
    // The absolute proposed date is shown to both parties; consent never means
    // an unbounded extension. The old deadline remains effective until accepted.
    check(Number.isSafeInteger(deadline) && deadline > Date.parse(order.dispatchDeadline) && deadline - now <= 30 * 86400000, '延期期限必须晚于原期限且在30天内');
    next.extension = { id: crypto.randomUUID(), status: 'pending', reason: text(data.reason, 500, '延期原因'), previousDeadline: order.dispatchDeadline, proposedDeadline: timestamp(deadline), requestedAt: timestamp(now) };
    return audit(next, order.status, actorId, now);
  }
  if (action === 'accept_extension' || action === 'reject_extension') {
    check(buyer, '仅买方可决定延期申请', 403);
    check(order.status === 'paid' && now < Date.parse(order.dispatchDeadline), '原发货期限已到或订单状态已变，延期申请不可处理', 409);
    check(order.extension?.status === 'pending' && data.extensionId === order.extension.id, '延期申请已变化，请刷新后重试', 409);
    next.extension.status = action === 'accept_extension' ? 'accepted' : 'rejected';
    next.extension.respondedAt = timestamp(now);
    if (action === 'accept_extension') next.dispatchDeadline = next.extension.proposedDeadline;
    return audit(next, order.status, actorId, now);
  }
  if (action === 'receive') {
    check(buyer, '仅买方可确认收货', 403);
    check(order.status === 'shipped', '此订单不能确认收货', 409);
    // Completion does not assert settlement. Provider settlement needs its own
    // verified record and must account for open disputes and refunds.
    return audit(next, 'completed', actorId, now);
  }
  if (action === 'request_refund') {
    check(buyer, '仅买方可申请退款', 403);
    check(['paid', 'shipped', 'completed', 'disputed'].includes(order.status), '此订单不能申请退款', 409);
    next.refund = { reason: text(data.reason, 500, '退款原因'), amountCents: order.totalCents, requestedAt: timestamp(now) };
    return audit(next, 'refund_requested', actorId, now);
  }
  if (action === 'report_issue') {
    check(buyer, '仅买方可提交到货问题', 403);
    check(['shipped', 'completed'].includes(order.status), '此订单不能提交到货问题', 409);
    next.dispute = { reason: text(data.reason, 500, '问题描述'), openedAt: timestamp(now) };
    return audit(next, 'disputed', actorId, now);
  }
  check(false, '不支持的订单操作');
}
function providerEvent(order, event, now = Date.now()) {
  const next = structuredClone(order);
  check(event.orderId === order.id, '支付订单不匹配', 409);
  const provider = text(event.provider, 40, '支付渠道');
  check(event.currency === order.currency && Number.isSafeInteger(event.amountCents) && event.amountCents === order.totalCents, '支付金额或币种不匹配', 409);
  if (event.type === 'payment_succeeded') {
    const transactionId = text(event.transactionId, 128, '支付流水');
    if (order.payment) {
      check(order.payment.transactionId === transactionId && order.payment.provider === provider, '支付流水冲突', 409);
      return next;
    }
    check(['pending_payment', 'cancel_requested', 'cancelled'].includes(order.status), '订单支付状态冲突', 409);
    check(Number.isSafeInteger(event.paidAt) && event.paidAt >= Date.parse(order.createdAt) && event.paidAt <= now, '支付成功时间无效');
    next.payment = { provider, transactionId, amountCents: event.amountCents, at: timestamp(event.paidAt) };
    next.dispatchDeadline = timestamp(event.paidAt + DISPATCH_WINDOW_MS);
    // A late success after cancellation is retained for reconciliation/refund;
    // it must never silently re-open inventory or permit shipment.
    return audit(next, order.status === 'pending_payment' ? 'paid' : 'payment_exception', provider, now);
  }
  if (event.type === 'payment_closed') {
    if (order.status === 'cancelled') return next;
    check(order.status === 'cancel_requested' && !order.payment, '此订单不能关闭付款', 409);
    return audit(next, 'cancelled', provider, now);
  }
  if (event.type === 'refund_succeeded') {
    check(order.payment && order.payment.provider === provider && order.payment.transactionId === event.transactionId, '退款原支付流水不匹配', 409);
    const refundId = text(event.refundId, 128, '退款流水');
    if (order.status === 'refunded') {
      check(order.refund.providerRefundId === refundId, '退款流水冲突', 409);
      return next;
    }
    check(['refund_requested', 'payment_exception'].includes(order.status), '此订单未申请退款', 409);
    next.refund = { ...order.refund, providerRefundId: refundId, amountCents: event.amountCents, completedAt: timestamp(now) };
    return audit(next, 'refunded', provider, now);
  }
  check(false, '不支持的支付通知');
}
// Call only from an authenticated logistics integration (or separately audited
// evidence review). A seller clicking "shipped" cannot start the receipt clock.
function deliveryEvent(order, event, now = Date.now()) {
  check(event.orderId === order.id, '物流订单不匹配', 409);
  check(order.shipment && event.trackingNumber === order.shipment.trackingNumber && event.carrier === order.shipment.carrier, '物流运单不匹配', 409);
  const deliveredAt = event.deliveredAt;
  check(Number.isSafeInteger(deliveredAt) && deliveredAt >= Date.parse(order.shipment.at) && deliveredAt <= now, '物流签收时间无效');
  const next = structuredClone(order);
  if (order.delivery) {
    check(order.delivery.deliveredAt === timestamp(deliveredAt), '物流签收时间冲突，需人工核对', 409);
    return next;
  }
  check(['shipped', 'completed', 'refund_requested', 'refunded', 'disputed'].includes(order.status), '订单物流状态冲突', 409);
  next.delivery = { deliveredAt: timestamp(deliveredAt), autoConfirmAt: timestamp(deliveredAt + RECEIPT_WINDOW_MS) };
  return audit(next, order.status, 'logistics', now);
}
function autoConfirm(order, now = Date.now()) {
  const next = structuredClone(order);
  timestamp(now);
  if (order.status !== 'shipped' || order.refund || order.dispute || !order.delivery) return next;
  const deadline = Date.parse(order.delivery.autoConfirmAt);
  if (!Number.isFinite(deadline) || now < deadline) return next;
  return audit(next, 'completed', 'auto_confirm_48h', now);
}
module.exports = { cents, commission, createOrder, transition, providerEvent, deliveryEvent, autoConfirm };
