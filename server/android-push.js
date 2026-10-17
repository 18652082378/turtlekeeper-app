'use strict';

// Aliyun Push RPC: server RAM credentials are deliberately separate from the
// EMAS client AppSecret and from the existing SMS/OSS credentials.
const crypto = require('node:crypto');
const https = require('node:https');
const CHANNEL_ID = 'turtle_updates';
const normalizeDeviceId = value => {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_-]{16,128}$/.test(token) ? token : '';
};
const encode = value => encodeURIComponent(String(value)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function signedBody(params, credentials, now = new Date(), nonce = crypto.randomUUID()) {
  const all = { ...params, AccessKeyId: credentials.accessKeyId, Format: 'JSON',
    SignatureMethod: 'HMAC-SHA1', SignatureNonce: nonce, SignatureVersion: '1.0',
    Timestamp: now.toISOString().replace(/\.\d{3}Z$/, 'Z'), Version: '2016-08-01',
    ...(credentials.securityToken ? { SecurityToken: credentials.securityToken } : {}) };
  const canonical = Object.keys(all).sort().map(k => encode(k) + '=' + encode(all[k])).join('&');
  const signature = crypto.createHmac('sha1', credentials.accessKeySecret + '&')
    .update('POST&%2F&' + encode(canonical)).digest('base64');
  return 'Signature=' + encode(signature) + '&' + canonical;
}
function requestPush(body) {
  return new Promise(resolve => {
    let settled = false;
    const deadline = setTimeout(() => { request.destroy(); finish({ ok: false, reason: 'PushTimeout' }); }, 10000);
    const finish = result => { if (!settled) { settled = true; clearTimeout(deadline); resolve(result); } };
    const request = https.request({ hostname: 'cloudpush.aliyuncs.com', path: '/', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { raw += chunk; if (raw.length > 65536) { request.destroy(); finish({ ok: false, reason: 'PushResponseTooLarge' }); } });
      response.on('error', () => finish({ ok: false, reason: 'PushResponseError' }));
      response.on('end', () => {
        try {
          const data = JSON.parse(raw);
          // A rejected app, credential or request must never remove a user's
          // device. Device deletion is not inferred from generic API errors.
          finish({ ok: response.statusCode === 200 && Boolean(data.MessageId) && !data.Code,
            ...(data.Code ? { reason: /^[A-Za-z0-9._-]{1,100}$/.test(data.Code) ? data.Code : 'PushRejected' } : {}), status: response.statusCode });
        } catch { finish({ ok: false, reason: 'PushResponseInvalid' }); }
      });
    });
    request.setTimeout(10000, () => { request.destroy(); finish({ ok: false, reason: 'PushTimeout' }); });
    request.on('error', () => finish({ ok: false, reason: 'PushConnectionError' }));
    request.end(body);
  });
}
function createAndroidPush({ env = process.env, request = requestPush, now = () => new Date() } = {}) {
  const credentials = () => ({ accessKeyId: env.ANDROID_PUSH_ACCESS_KEY_ID || '',
    accessKeySecret: env.ANDROID_PUSH_ACCESS_KEY_SECRET || '', securityToken: env.ANDROID_PUSH_SECURITY_TOKEN || '' });
  const configured = () => Boolean(/^\d+$/.test(env.ANDROID_PUSH_APP_KEY || '') && credentials().accessKeyId && credentials().accessKeySecret);
  async function send(deviceToken, payload) {
    if (!configured()) return { ok: false, skipped: true };
    const token = normalizeDeviceId(deviceToken);
    if (!token) return { ok: false, invalid: true, reason: 'InvalidAndroidDevice' };
    const alert = payload?.aps?.alert;
    // APNs badge-only updates are not Android notifications.
    if (!alert || typeof alert !== 'object') return { ok: false, skipped: true };
    const data = Object.fromEntries(Object.entries(payload).filter(([k, v]) => k !== 'aps' && ['string', 'number', 'boolean'].includes(typeof v)));
    const title = Array.from(String(alert.title || '龟友手账')).slice(0, 50).join('');
    const body = Array.from(String(alert.body || '你有一条新消息')).slice(0, 200).join('');
    const params = { Action: 'Push', RegionId: 'cn-hangzhou', AppKey: env.ANDROID_PUSH_APP_KEY, PushType: 'NOTICE', DeviceType: 'ANDROID',
      Target: 'DEVICE', TargetValue: token, Title: title, Body: body,
      AndroidOpenType: 'APPLICATION', AndroidNotificationChannel: CHANNEL_ID,
      AndroidNotifyType: 'BOTH', AndroidExtParameters: JSON.stringify(data),
      // Never replay an obsolete reminder or recommendation after reconnect.
      StoreOffline: 'false', ExpireTime: new Date(now().getTime() + 5 * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z') };
    try { return await request(signedBody(params, credentials(), now())); }
    catch { return { ok: false, reason: 'PushRequestFailed' }; }
  }
  return { configured, send };
}
module.exports = { CHANNEL_ID, normalizeDeviceId, signedBody, createAndroidPush };
