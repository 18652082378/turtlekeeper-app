(() => {
  let draft = {}, serial = 0, sending = false, submitting = false, timer = null;
  function clear() { draft = {}; serial++; sending = submitting = false; clearInterval(timer); timer = null; }
  function renderForm() {
    return `<form id="passwordRecoveryForm" class="fresh-card survey-form account-recovery-form">
      <p class="muted">验证注册手机号后设置新密码，无需填写旧密码。</p>
      <label class="survey-field"><span>手机号</span><input class="field" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="11" value="${escapeHtml(draft.phone || state.accountDraftPhone || '')}" placeholder="请输入注册手机号" required></label>
      <div class="code-row"><label class="survey-field"><span>验证码</span><input class="field" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" value="${escapeHtml(draft.code || '')}" placeholder="6 位短信验证码" required></label><button class="secondary" type="button" data-recovery-send-code>获取验证码</button></div>
      <label class="survey-field"><span>新密码</span><input class="field" name="password" type="password" autocomplete="new-password" minlength="6" maxlength="128" value="${escapeHtml(draft.password || '')}" placeholder="至少 6 位密码" required></label>
      <label class="survey-field"><span>确认密码</span><input class="field" name="confirmPassword" type="password" autocomplete="new-password" minlength="6" maxlength="128" value="${escapeHtml(draft.confirmPassword || '')}" placeholder="请再次输入新密码" required><small class="field-error" data-recovery-password-error hidden>两次输入的密码不一致</small></label>
      <p class="muted">重置后，已登录的设备需要使用新密码重新登录，原有记录保留。</p>
      <button class="primary" type="submit">重置密码</button>
      <button class="account-auth-link" type="button" data-account-mode="login">返回登录</button>
    </form>`;
  }
  function bind() {
    clearInterval(timer); timer = null;
    const form = document.querySelector('#passwordRecoveryForm'); if (!form) { clear(); return; }
    const send = form.querySelector('[data-recovery-send-code]'), submit = form.querySelector('[type="submit"]');
    const values = () => Object.fromEntries(new FormData(form));
    const current = request => request === serial && state.page === 'account' && state.accountMode === 'reset' && !hasCloudSession();
    const update = () => {
      if (!form.isConnected) { clearInterval(timer); timer = null; return; }
      const remaining = accountCodeCooldownRemaining();
      send.disabled = sending || submitting || remaining > 0;
      send.textContent = sending ? '正在发送…' : remaining > 0 ? `${remaining} 秒后重试` : '获取验证码';
      submit.disabled = submitting || sending;
      submit.textContent = submitting ? '正在重置…' : '重置密码';
    };
    const match = () => {
      const confirm = form.elements.confirmPassword;
      const valid = !confirm.value || confirm.value === form.elements.password.value;
      confirm.setCustomValidity(valid ? '' : '两次输入的密码不一致');
      form.querySelector('[data-recovery-password-error]').hidden = valid;
      return valid;
    };
    form.addEventListener('input', event => {
      if (event.target.name === 'code') event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6);
      draft = values(); match();
    });
    send.addEventListener('click', async () => {
      if (sending || submitting || accountCodeCooldownRemaining() > 0) return;
      const phone = String(values().phone || '').trim();
      if (!/^1[3-9]\d{9}$/.test(phone)) return toast('请填写正确的 11 位注册手机号');
      if (!CONFIGURED_SMS_BACKEND) return toast('找回密码需要连接短信服务，请在正式服务中使用');
      const request = serial; sending = true; update();
      try {
        const result = await apiPost('/api/sms/send', { phone, purpose: 'reset_password' });
        if (!current(request)) return;
        state.accountCodeCooldownUntil = String(Date.now() + 60000); saveState(); update();
        toast('验证码已发送，请查看手机短信');
      } catch (error) { if (current(request)) toast(error.message || '验证码发送失败，请稍后重试'); }
      finally { if (request === serial) { sending = false; update(); } }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (sending || submitting || !match() || !form.reportValidity()) return;
      if (!CONFIGURED_SMS_BACKEND) return toast('找回密码需要连接短信服务，请在正式服务中使用');
      const data = values(), phone = String(data.phone || '').trim(), code = String(data.code || '').trim();
      if (!/^1[3-9]\d{9}$/.test(phone)) return toast('请输入正确的 11 位手机号');
      if (!/^\d{6}$/.test(code)) return toast('请输入 6 位短信验证码');
      const request = serial; submitting = true; update();
      try {
        await apiPost('/api/account/password/reset', { phone, code, password: data.password });
        if (!current(request)) return;
        clear();
        setState({ accountMode: 'login', accountDraftPhone: phone, accountDraftPassword: '', accountDraftConfirmPassword: '', pendingAuthCode: '', pendingAuthPhone: '', authCodeExpiresAt: '', accountCodeCooldownUntil: '', accountSessionNotice: '密码已重置，请使用新密码登录' }, { skipCloud: true });
        toast('密码已重置，请使用新密码登录');
      } catch (error) { if (current(request)) toast(error.message || '密码重置失败，请稍后重试'); }
      finally { if (request === serial) { submitting = false; update(); } }
    });
    update(); match(); timer = setInterval(update, 1000);
  }
  window.PasswordRecovery = { render: renderForm, bind, clear };
})();
