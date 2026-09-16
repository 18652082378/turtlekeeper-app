// Apple is queried over authenticated TLS for every entitlement change. A
// client receipt or notification payload is ONLY a lookup hint, never proof.
const crypto = require('crypto');
const fs = require('fs');
const { entitled } = require('./team-space');
const PRODUCTS = ['keyoushouzhang.team.monthly', 'keyoushouzhang.team.yearly'];
const bundleId = () => process.env.APPLE_IAP_BUNDLE_ID || 'com.turtlekeeper.app';
function configured() {
  if (!process.env.APPLE_IAP_KEY_ID || !process.env.APPLE_IAP_ISSUER_ID || !process.env.APPLE_IAP_KEY_PATH) return false;
  try {
    const key = crypto.createPrivateKey(fs.readFileSync(process.env.APPLE_IAP_KEY_PATH));
    return key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1';
  } catch { return false; }
}
const decode = s => JSON.parse(Buffer.from(String(s).split('.')[1] || '', 'base64url').toString());
function reject(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  const header = enc({ alg: 'ES256', kid: process.env.APPLE_IAP_KEY_ID, typ: 'JWT' });
  const payload = enc({ iss: process.env.APPLE_IAP_ISSUER_ID, iat: now, exp: now + 300, aud: 'appstoreconnect-v1', bid: bundleId() });
  const input = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(input), { key: fs.readFileSync(process.env.APPLE_IAP_KEY_PATH), dsaEncoding: 'ieee-p1363' });
  return `${input}.${signature.toString('base64url')}`;
}
async function lookup(transactionId, environment = 'Production') {
  if (!configured()) reject('苹果购买服务正在配置中，请稍后再试', 503);
  if (!/^\d{1,30}$/.test(String(transactionId))) reject('订单编号无效');
  if (!['Production', 'Sandbox'].includes(environment)) reject('订单环境无效');
  const host = environment === 'Sandbox' ? 'api.storekit-sandbox.apple.com' : 'api.storekit.apple.com';
  const response = await fetch(`https://${host}/inApps/v1/subscriptions/${transactionId}`, {
    headers: { Authorization: `Bearer ${jwt()}` }, signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) reject('暂时无法向苹果核实订阅，请重试恢复购买', 502);
  const result = await response.json();
  if (result.bundleId !== bundleId() || result.environment !== environment ||
      ((environment === 'Production' || result.appAppleId != null) && String(result.appAppleId) !== String(process.env.APPLE_IAP_APP_ID || '6783481335'))) reject('苹果订单不属于当前应用');
  return (result.data || []).flatMap(g => g.lastTransactions || []).map(row => ({ status: row.status, transaction: decode(row.signedTransactionInfo), renewal: row.signedRenewalInfo ? decode(row.signedRenewalInfo) : {} }));
}
function selectEntitlement(rows, token, now = Date.now()) {
  const owned = rows.filter(r => r.transaction.bundleId === bundleId() && PRODUCTS.includes(r.transaction.productId)
    && r.transaction.appAccountToken?.toLowerCase() === token?.toLowerCase());
  if (!owned.length) reject('此苹果订阅绑定了其他龟友手账账号，请登录购买时的账号恢复', 403);
  const mapped = owned.map(({ status, transaction: t, renewal: r = {} }) => {
    const expiry = status === 4 ? Math.max(Number(t.expiresDate), Number(r.gracePeriodExpiresDate || 0)) : Number(t.expiresDate);
    if (!Number.isFinite(expiry)) reject('苹果订单到期时间无效');
    return { source: 'apple', verified: true, productId: t.productId, originalTransactionId: String(t.originalTransactionId),
      transactionId: String(t.transactionId), environment: t.environment, expiresAt: new Date(expiry).toISOString(),
      revoked: Boolean(t.revocationDate) || ![1, 4].includes(status), status, checkedAt: new Date(now).toISOString() };
  });
  mapped.sort((a, b) => Number(!b.revoked && Date.parse(b.expiresAt) > now) - Number(!a.revoked && Date.parse(a.expiresAt) > now) || Date.parse(b.expiresAt) - Date.parse(a.expiresAt));
  return mapped[0];
}
function createApplePurchases({ read, write, authenticate, query = lookup }) {
  let refreshing = false;
  async function commit(userPhone, token, rows) {
    const e = selectEntitlement(rows, token);
    const db = read(), user = db.users[userPhone];
    if (!user || user.appleAppAccountToken !== token) reject('账号已改变，请重新登录', 401);
    if (e.environment === 'Sandbox' && !(process.env.APPLE_IAP_SANDBOX_PHONES || '').split(',').map(s => s.trim()).includes(userPhone)) reject('此账号未开放沙盒测试，请使用指定测试账号', 403);
    const conflict = Object.values(db.users).some(u => u.phone !== user.phone && u.teamEntitlement?.originalTransactionId === e.originalTransactionId);
    if (conflict) reject('订单已绑定其他账号', 409);
    user.teamEntitlement = e;
    await write(db); return e;
  }
  async function action(body) {
    const db = read(), user = authenticate(db, String(body.phone || ''), body.token);
    if (!user) reject('登录已过期，请重新登录', 401);
    if (body.action === 'prepare') {
      if (!user.appleAppAccountToken) { user.appleAppAccountToken = crypto.randomUUID(); await write(db); }
      return { appAccountToken: user.appleAppAccountToken, products: PRODUCTS, configured: configured(), active: entitled(user), entitlement: user.teamEntitlement || null };
    }
    if (body.action === 'verify') {
      if (!user.appleAppAccountToken) reject('请先初始化购买');
      const rows = await query(String(body.transactionId || ''), body.environment);
      const entitlement = await commit(user.phone, user.appleAppAccountToken, rows);
      return { entitlement, active: !entitlement.revoked && Date.parse(entitlement.expiresAt) > Date.now() };
    }
    reject('不支持的购买操作');
  }
  async function refresh() {
    if (refreshing || !configured()) return;
    refreshing = true;
    try {
      const users = Object.values(read().users).filter(u => u.teamEntitlement?.source === 'apple' && u.appleAppAccountToken
        && Date.now() - Date.parse(u.teamEntitlement.checkedAt || 0) > 5 * 60 * 1000);
      // Covers renewals/refunds after missed notifications. Never extend access
      // on errors. Expired entitlements stay denied until Apple verifies them.
      for (const user of users) {
        try { await commit(user.phone, user.appleAppAccountToken, await query(user.teamEntitlement.originalTransactionId, user.teamEntitlement.environment)); }
        catch (error) { console.warn('Apple subscription refresh failed:', error.message); }
      }
    } finally { refreshing = false; }
  }
  async function notification(body) {
    // No incoming values are used to grant/revoke anything. An unknown or
    // malformed notification is acknowledged without revealing account data.
    let tx;
    try { tx = decode(decode(body.signedPayload).data.signedTransactionInfo); } catch { return; }
    const user = Object.values(read().users).find(u => u.teamEntitlement?.originalTransactionId === String(tx.originalTransactionId));
    if (!user || Date.now() - Date.parse(user.teamEntitlement.checkedAt || 0) < 10000) return;
    const rows = await query(user.teamEntitlement.originalTransactionId, user.teamEntitlement.environment);
    await commit(user.phone, user.appleAppAccountToken, rows);
  }
  return { action, refresh, notification };
}
module.exports = { createApplePurchases, selectEntitlement, PRODUCTS };
