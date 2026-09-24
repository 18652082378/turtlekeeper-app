// Official Alipay SDK; signing material is loaded only by the API process.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { dependency } = require('./alipay-dependencies');
function createAlipayProvider(env = process.env) {
  let sdk;
  const appId = env.ALIPAY_APP_ID || '';
  const sellerId = env.ALIPAY_SELLER_ID || '';
  function client() {
    if (sdk) return sdk;
    if (!/^\d{16}$/.test(appId) || !/^2088\d{12}$/.test(sellerId)) throw Error('Alipay merchant configuration missing');
    const notify = new URL(env.ALIPAY_TEAM_NOTIFY_URL);
    if (notify.protocol !== 'https:' || notify.username || notify.password || notify.pathname !== '/api/alipay/team/notify') throw Error('Invalid Alipay notification URL');
    let pem = fs.readFileSync(env.ALIPAY_PRIVATE_KEY_PATH, 'utf8').trim();
    if (!pem.includes('-----BEGIN')) pem = `-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----`;
    const key = crypto.createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048) throw Error('Invalid Alipay signing key');
    const cert = new crypto.X509Certificate(fs.readFileSync(env.ALIPAY_APP_CERT_PATH));
    if (!crypto.createPublicKey(key).export({ type: 'spki', format: 'der' }).equals(cert.publicKey.export({ type: 'spki', format: 'der' }))) throw Error('Alipay certificate/key mismatch');
    // Load optional Android payment dependencies only when configured. A missing
    // SDK or a bad certificate must never prevent the existing API from starting.
    const { AlipaySdk } = dependency('alipay-sdk');
    const { AlipayHttpAgent } = require('./alipay-http-agent');
    sdk = new AlipaySdk({ appId, privateKey: key.export({ type: 'pkcs8', format: 'pem' }), keyType: 'PKCS8', signType: 'RSA2', camelcase: false,
      appCertPath: env.ALIPAY_APP_CERT_PATH, alipayPublicCertPath: env.ALIPAY_PUBLIC_CERT_PATH,
      alipayRootCertPath: env.ALIPAY_ROOT_CERT_PATH, timeout: 12000, proxyAgent: new AlipayHttpAgent() });
    return sdk;
  }
  return {
    appId, sellerId,
    ready() { if (env.ALIPAY_TEAM_ENABLED !== '1') return false; try { client(); return true; } catch { return false; } },
    validateConfig() { client(); return true; },
    // Preparing an SDK order signs locally; it does not debit a buyer.
    orderString(order) { return client().sdkExecute('alipay.trade.app.pay', { notifyUrl: env.ALIPAY_TEAM_NOTIFY_URL,
      bizContent: { outTradeNo: order.id, totalAmount: (order.amountCents / 100).toFixed(2), subject: `龟友手账团队${order.plan === 'monthly' ? '月度' : '年度'}会员`,
        productCode: 'QUICK_MSECURITY_PAY', timeExpire: new Date(Date.parse(order.createdAt) + 30 * 60000 + 8 * 3600000).toISOString().slice(0,19).replace('T', ' '), sellerId } }); },
    verifyNotification(data) { return data.sign_type === 'RSA2' && client().checkNotifySignV2(data); },
    query(id) { return client().exec('alipay.trade.query', { bizContent: { outTradeNo: id } }, { validateSign: true }); },
    refund(order) { return client().exec('alipay.trade.refund', { bizContent: { outTradeNo: order.id,
      outRequestNo: `refund_${order.id}`, refundAmount: (order.amountCents / 100).toFixed(2), refundReason: '团队会员退款' } }, { validateSign: true }); }
  };
}
module.exports = { createAlipayProvider };
