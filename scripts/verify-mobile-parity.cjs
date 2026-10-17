'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const adapt = require('./android/adapt-shared-asset.cjs');
function verify({ root = path.resolve(__dirname, '..'), read = file => fs.readFileSync(path.join(root, file)) } = {}) {
  const text = file => read(file).toString('utf8');
  const gradle = text('android/app/build.gradle');
  const androidBuild = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
  const androidVersion = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
  const androidRoot = 'android/app/src/main/assets/public/', iosRoot = 'ios/App/App/public/';
  const updateChannel = text(androidRoot + 'config.js').match(/TURTLE_APP_UPDATE_CHANNEL\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(androidBuild && androidVersion && ['store', 'beta'].includes(updateChannel), 'Invalid Android bundle metadata');
  function files(folder) { return fs.readdirSync(path.join(root, folder), { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(folder + '/' + e.name) : [folder + '/' + e.name]); }
  const shared = [...require('./web-asset-manifest.cjs'), ...files('assets')];
  const hash = data => crypto.createHash('sha256').update(data).digest('hex');
  for (const file of shared) {
    const source = read(file);
    assert.equal(hash(read(iosRoot + file)), hash(source), 'Stale iOS shared asset: ' + file);
    let expected = source;
    if (/\.(?:js|html)$/.test(file) && !file.startsWith('assets/')) {
      let transformed = adapt(file, source.toString('utf8'), { androidBuild, androidVersion, updateChannel });
      if (file === 'index.html') transformed = transformed.replace('</head>', '<link rel="preload" href="android-fonts/NotoSansSC-VF.ttf" as="font" type="font/ttf" crossorigin>\n<link rel="stylesheet" href="android-layout.css">\n</head>')
        .replace('</body>', '<script src="android-runtime.js"></script>\n</body>');
      expected = Buffer.from(transformed);
    }
    assert.equal(hash(read(androidRoot + file)), hash(expected), 'Stale Android shared asset: ' + file);
  }
  for (const [source, shipped] of [['scripts/android/layout.css', 'android-layout.css'], ['scripts/android/runtime.js', 'android-runtime.js']]) {
    assert.equal(hash(read(source)), hash(read(androidRoot + shipped)), 'Stale Android adaptation: ' + shipped);
    assert.ok(!text(iosRoot + 'index.html').includes(shipped), 'Android adaptation leaked into iOS');
  }
  for (const file of files('scripts/android/fonts')) {
    assert.equal(hash(read(file)), hash(read(androidRoot + 'android-fonts/' + file.slice('scripts/android/fonts/'.length))), 'Stale Android font: ' + file);
  }
  const config = JSON.parse(text('capacitor.config.json'));
  assert.ok(config.android.includePlugins.includes('@capacitor/app'));
  assert.ok(!config.android.includePlugins.includes('@capacitor/push-notifications'), 'Android must use Aliyun instead of Firebase');
  const ios = JSON.parse(text('ios/App/App/capacitor.config.json'));
  assert.ok(ios.packageClassList.includes('PushNotificationsPlugin'), 'iOS push registration must remain available');
  const result = { sharedAssets: shared.length, androidBuild, androidVersion, updateChannel };
  console.log('PASS mobile parity: ' + shared.length + ' shared files match both packaged apps; only declared Android adaptations differ.');
  return result;
}
module.exports = { verify };
if (require.main === module) { try { verify(); } catch (e) { console.error(e.message); process.exitCode = 1; } }
