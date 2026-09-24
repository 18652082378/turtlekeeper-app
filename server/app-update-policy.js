'use strict';

const buildNumber = value => Math.max(0, Number.parseInt(String(value || 0), 10) || 0);
function androidUpdateUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password
      || /(^|\.)(apple\.com|itunes\.com)$/i.test(url.hostname)) return '';
    return url.href;
  } catch { return ''; }
}

function appUpdatePolicy(req, env = process.env) {
  const query = new URL(req.url, 'http://localhost').searchParams;
  const ua = String(req.headers?.['user-agent'] || '');
  const requested = query.get('platform');
  // Old apps did not send a platform. Preserve iOS compatibility, but never
  // return the iOS gate to an old Android WebView.
  const platform = requested || (/Android/i.test(ua) ? 'android' : 'ios');
  if (platform === 'ios') {
    const minimumBuild = buildNumber(env.MIN_SUPPORTED_APP_BUILD ?? 95);
    const updateUrl = env.IOS_APP_STORE_URL || 'https://apps.apple.com/app/id6783481335';
    return { ok: true, platform, channel: 'store', minimumBuild,
      latestBuild: Math.max(minimumBuild, buildNumber(env.LATEST_APP_BUILD ?? 99)),
      updateUrl, appStoreUrl: updateUrl,
      message: '龟友手账有新版本，请前往 App Store 更新后继续使用。' };
  }
  if (platform === 'android') {
    // Legacy Android packages belong to the pre-release testing channel.
    const channel = query.get('channel') === 'store' ? 'store' : 'beta';
    const prefix = channel === 'store' ? 'ANDROID_STORE' : 'ANDROID_BETA';
    const updateUrl = androidUpdateUrl(env[`${prefix}_UPDATE_URL`]);
    const minimumBuild = requested && updateUrl ? buildNumber(env[`${prefix}_MIN_BUILD`]) : 0;
    return { ok: true, platform, channel, minimumBuild,
      latestBuild: Math.max(minimumBuild, buildNumber(env[`${prefix}_LATEST_BUILD`])),
      updateUrl, appStoreUrl: '',
      message: channel === 'store' ? '龟友手账有新版本，请前往安卓应用商店更新。'
        : '龟友手账安卓测试版有新版本，请下载安装最新测试包。' };
  }
  // Browser and Harmony clients must not inherit either native platform gate.
  return { ok: true, platform, channel: '', minimumBuild: 0, latestBuild: 0,
    updateUrl: '', appStoreUrl: '', message: '' };
}

module.exports = { appUpdatePolicy, androidUpdateUrl };
