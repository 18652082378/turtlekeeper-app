const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { appUpdatePolicy } = require('../server/app-update-policy');
const env = {
  MIN_SUPPORTED_APP_BUILD: '114', LATEST_APP_BUILD: '115',
  ANDROID_STORE_MIN_BUILD: '12', ANDROID_STORE_LATEST_BUILD: '13',
  ANDROID_STORE_UPDATE_URL: 'https://example.com/android/store',
  ANDROID_BETA_MIN_BUILD: '11', ANDROID_BETA_LATEST_BUILD: '12',
  ANDROID_BETA_UPDATE_URL: 'https://example.com/android/test.apk'
};
const policy = (query, overrides = env, ua = '') => appUpdatePolicy({ url: '/api/app/version?' + query, headers: { 'user-agent': ua } }, overrides);
assert.equal(policy('platform=ios').minimumBuild, 122);
assert.equal(policy('').minimumBuild, 122, 'Legacy iOS receives the published 1.1.3 boundary');
assert.equal(policy('', env, 'Mozilla/5.0 (Linux; Android 15)').minimumBuild, 0, 'Never gate legacy Android with hardcoded Apple actions');
assert.equal(policy('platform=android&channel=store').minimumBuild, 12);
assert.equal(policy('platform=android&channel=beta').minimumBuild, 11);
assert.equal(policy('platform=android&channel=beta', {}).minimumBuild, 0);
for (const updateUrl of ['', 'javascript:alert(1)', 'http://example.com', 'https://apps.apple.com/app/id1']) {
  assert.equal(policy('platform=android&channel=store', { ...env, ANDROID_STORE_UPDATE_URL: updateUrl }).minimumBuild, 0);
}
for (const platform of ['web', 'harmony', 'unknown']) assert.equal(policy('platform=' + platform).minimumBuild, 0);

const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const functions = app.slice(app.indexOf('function appUpdatePlatform()'), app.indexOf('function requireArchiveCapacity('));
async function client({ platform = 'android', channel = 'beta', response, build = 10, configuredBuild = 114, failingInfo = false } = {}) {
  let request = '', renders = 0;
  const callbacks = {};
  const context = vm.createContext({
    URL, AbortController, Date, console, APP_BUILD: configuredBuild, CONFIGURED_SMS_BACKEND: true,
    APP_STORE_URL: 'https://apps.apple.com/app/id6783481335',
    forceUpdateState: { required: false, checking: false },
    window: { TURTLE_API_BASE_URL: 'https://test.invalid', TURTLE_APP_UPDATE_CHANNEL: channel,
      Capacitor: { getPlatform: () => platform, Plugins: { App: { getInfo: () => failingInfo ? Promise.reject(Error('unavailable')) : Promise.resolve({ build: String(build) }) } } },
      setTimeout, clearTimeout, location: {} },
    fetch: async url => { request = url; return { ok: true, json: async () => response }; },
    render: () => renders++, toast: () => {}, escapeHtml: value => String(value),
    $app: { querySelector: selector => ({ addEventListener: (_, callback) => { callbacks[selector] = callback; } }) }
  });
  vm.runInContext(functions, context);
  await context.checkRequiredAppUpdate();
  return { context, request, renders, callbacks };
}
(async () => {
  const releasedPolicy = policy('platform=ios', {});
  assert.equal(releasedPolicy.minimumBuild, 122);
  assert.equal(releasedPolicy.latestBuild, 124);
  assert.match(releasedPolicy.message, /1\.1\.3/);
  assert.match(releasedPolicy.message, /1\.1\.2 及更早版本已停止支持/);
  assert.equal(policy('platform=ios', { MIN_SUPPORTED_APP_BUILD: '117', LATEST_APP_BUILD: '119' }).minimumBuild, 122, 'old production env cannot keep 1.1.2 supported');
  assert.equal(policy('platform=ios', { MIN_SUPPORTED_APP_BUILD: '125', LATEST_APP_BUILD: '126' }).minimumBuild, 125, 'future stricter policy remains configurable');
  assert.equal(policy('platform=ios', { MIN_SUPPORTED_APP_BUILD: '125', LATEST_APP_BUILD: '126' }).latestBuild, 126);
  for (const build of [114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124]) {
    const result = await client({ platform: 'ios', configuredBuild: build, response: releasedPolicy });
    assert.equal(result.context.forceUpdateState.required, build < 122, `iOS build ${build}: stop 1.1.2 and allow all 1.1.3 builds`);
    if (build < 122) {
      assert.match(result.context.forceUpdatePage(), /1\.1\.3/);
      result.context.bindForceUpdateActions(); result.callbacks['[data-open-app-store-update]']();
      assert.equal(result.context.window.location.href, 'https://apps.apple.com/app/id6783481335');
    }
  }
  const legacy = { ok: true, minimumBuild: 114, latestBuild: 115, appStoreUrl: 'https://apps.apple.com/app/id1', message: '请前往 App Store 更新' };
  let result = await client({ response: legacy });
  assert.equal(result.context.forceUpdateState.required, false, 'Old server cannot trap new Android');
  assert.match(result.request, /platform=android&channel=beta&build=10&/);
  result = await client({ response: policy('platform=android&channel=store') });
  assert.equal(result.context.forceUpdateState.required, false, 'Store policy cannot gate self-test package');
  for (const channel of ['beta', 'store']) {
    result = await client({ channel, response: policy('platform=android&channel=' + channel) });
    assert.equal(result.context.forceUpdateState.required, true);
    assert.doesNotMatch(result.context.forceUpdatePage(), /App Store/);
    assert.match(result.context.forceUpdatePage(), channel === 'beta' ? /下载安卓测试版更新/ : /前往安卓应用商店更新/);
    result.context.bindForceUpdateActions(); result.callbacks['[data-open-app-store-update]']();
    assert.equal(result.context.window.location.href, channel === 'beta' ? env.ANDROID_BETA_UPDATE_URL : env.ANDROID_STORE_UPDATE_URL);
  }
  result = await client({ response: policy('platform=android&channel=beta'), build: 11 });
  assert.equal(result.context.forceUpdateState.required, false, 'Minimum boundary is allowed');
  result = await client({ response: { ...policy('platform=android&channel=beta'), updateUrl: legacy.appStoreUrl } });
  assert.equal(result.context.forceUpdateState.required, false);
  result = await client({ platform: 'ios', configuredBuild: 113, response: legacy });
  assert.equal(result.context.forceUpdateState.required, true);
  assert.match(result.context.forceUpdatePage(), /前往 App Store 更新/);
  result = await client({ platform: 'web', response: legacy });
  assert.equal(result.request, '', 'Web page must not use native version gates');
  result = await client({ response: policy('platform=android&channel=beta'), configuredBuild: 11, failingInfo: true });
  assert.match(result.request, /build=11&/);
  console.log('Update policy passed: iOS compatibility, Android store/beta isolation, native build, invalid URLs, old server/client compatibility and web bypass.');
})().catch(error => { console.error(error); process.exitCode = 1; });
