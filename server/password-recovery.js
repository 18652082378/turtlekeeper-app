'use strict';
const crypto = require('node:crypto');
function createPasswordRecovery(d) {
  const pending = new Set();
  const { smsCodes, readDatabase, writeDatabase, validPhone, sendJson, forgetCode, persistSmsState, hashPassword, sms } = d;
  async function reset(req, res, body) {
    const phone = String(body.phone || '').trim(), code = String(body.code || '').trim(), password = String(body.password || '');
    if (!validPhone(phone)) return sendJson(res, 400, { ok: false, message: '手机号格式不正确' });
    if (password.length < 6 || password.length > 128) return sendJson(res, 400, { ok: false, message: '新密码需要 6～128 位' });
    if (!/^\d{6}$/.test(code)) return sendJson(res, 400, { ok: false, message: '请输入 6 位短信验证码' });
    if (pending.has(phone)) return sendJson(res, 429, { ok: false, message: '正在处理，请稍后再试' });
    const item = smsCodes.get(phone);
    const mode = sms.mode();
    if (!mode) return sendJson(res, 503, { ok: false, message: '短信服务暂不可用，请稍后再试' });
    if (!item || item.purpose !== 'reset_password' || item.mode !== mode) return sendJson(res, 400, { ok: false, message: '请先获取找回密码验证码' });
    if (Date.now() > item.expiresAt) return sendJson(res, 400, { ok: false, message: '验证码已过期，请重新获取' });
    if (Number(item.attempts || 0) >= 5) return sendJson(res, 400, { ok: false, message: '验证码错误次数过多，请重新获取' });
    pending.add(phone);
    try {
      item.attempts = Number(item.attempts || 0) + 1; persistSmsState();
      const passed = mode === 'aliyun-pnvs' ? await sms.check(phone, code)
        : item.codeHash === crypto.createHash('sha256').update(`${item.salt}:${phone}:${code}`).digest('hex');
      if (!passed) return sendJson(res, 400, { ok: false, message: item.attempts >= 5 ? '验证码错误次数过多，请重新获取' : '验证码不正确' });
      // The provider yields: re-read the account and recheck the challenge before mutation.
      if (smsCodes.get(phone) !== item || Date.now() > item.expiresAt) return sendJson(res, 400, { ok: false, message: '验证码已失效，请重新获取' });
      const db = readDatabase(), user = db.users[phone];
      if (!user) return sendJson(res, 400, { ok: false, message: '该手机号尚未注册，请先注册' });
      const next = hashPassword(password);
      user.passwordSalt = next.salt; user.passwordHash = next.hash;
      user.tokens = []; user.pushDevices = [];
      user.passwordChangedAt = user.updatedAt = new Date().toISOString();
      await writeDatabase(db); forgetCode(phone);
      return sendJson(res, 200, { ok: true, message: '密码已重置，请使用新密码登录' });
    } finally { pending.delete(phone); }
  }
  return { reset };
}
module.exports = { createPasswordRecovery };
