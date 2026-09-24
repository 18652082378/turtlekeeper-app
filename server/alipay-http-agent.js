const { Agent } = require('./alipay-dependencies').dependency('undici');
// SDK uses urllib. Pin every dispatch, including redirect hops, to Alipay's
// fixed HTTPS origin so credentials can never follow a cross-origin redirect.
class AlipayHttpAgent extends Agent {
  dispatch(options, handler) {
    let allowed = false;
    try { const url = new URL(String(options.origin)); allowed = url.origin === 'https://openapi.alipay.com' && !url.username && !url.password; } catch {}
    if (!allowed) {
      queueMicrotask(() => handler.onError(new Error('Alipay cross-origin request blocked')));
      return false;
    }
    return super.dispatch(options, handler);
  }
}
module.exports = { AlipayHttpAgent };
