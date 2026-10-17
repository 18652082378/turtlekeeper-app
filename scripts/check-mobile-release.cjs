'use strict';
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
// Prefer the reproducible local browser cache if one was installed there.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(path.join(root, '.browser-tests'))) process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.browser-tests');
function run(script, args = [], extra = {}) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, env: { ...process.env, ...extra }, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(script + ' failed (' + result.status + ')');
}
const args = process.argv.slice(2);
if (args.some(a => !['--prepared', '--prepare-only'].includes(a)) || args.length > 1) throw Error('Use --prepared or --prepare-only');
if (!args.includes('--prepared')) {
  run('scripts/prepare-android.cjs', [], { TURTLE_ANDROID_UPDATE_CHANNEL: process.env.TURTLE_ANDROID_UPDATE_CHANNEL || 'store' });
  run('node_modules/@capacitor/cli/bin/capacitor', ['copy', 'ios']);
  run('scripts/configure-ios-local-plugins.js');
}
run('scripts/verify-mobile-parity.cjs');
run('scripts/test-mobile-parity.cjs');
run('scripts/verify-ios-build.js', ['--native']);
if (!args.includes('--prepare-only')) {
  const failures = [];
  // Run both even when the first fails, so one report shows both platforms.
  for (const [platform, engine] of [['ios', 'webkit'], ['android', 'chromium']]) {
    try { run('scripts/test-mobile-layout.cjs', [], { MOBILE_UI_PLATFORM: platform, BROWSER_ENGINE: engine, ANDROID_STRICT: platform === 'android' ? '1' : '0' }); }
    catch (e) { failures.push(e.message); }
  }
  try { run('scripts/test-android-ui.cjs', [], { ANDROID_EXTENDED: '1', ANDROID_TYPOGRAPHY: '1', ANDROID_CARDS: '1', ANDROID_LEDGER: '1' }); }
  catch (e) { failures.push(e.message); }
  for (const platform of ['ios', 'android']) {
    try { run('scripts/test-visual-placeholders-ui.cjs', [], { MOBILE_UI_PLATFORM: platform, BROWSER_ENGINE: platform === 'ios' ? 'webkit' : 'chromium' }); }
    catch (e) { failures.push(e.message); }
    try { run('scripts/test-breeding-covers-ui.cjs', [], { MOBILE_UI_PLATFORM: platform, BROWSER_ENGINE: platform === 'ios' ? 'webkit' : 'chromium' }); }
    catch (e) { failures.push(e.message); }
    try { run('scripts/test-home-filter-stats-ui.cjs', [], { MOBILE_UI_PLATFORM: platform, BROWSER_ENGINE: platform === 'ios' ? 'webkit' : 'chromium' }); }
    catch (e) { failures.push(e.message); }
    try { run('scripts/test-android-ledger-toolbar.cjs', [], { MOBILE_UI_PLATFORM: platform, BROWSER_ENGINE: platform === 'ios' ? 'webkit' : 'chromium' }); }
    catch (e) { failures.push(e.message); }
  }
  for (const script of ['scripts/test-android-fixed-navigation.cjs', 'scripts/test-android-native-boundaries.cjs', 'scripts/test-file-export.js', 'scripts/test-android-push-client.cjs', 'scripts/test-android-push.cjs', 'scripts/test-app-update-policy.cjs']) {
    try { run(script); } catch (e) { failures.push(e.message); }
  }
  if (failures.length) throw Error('Mobile release checks failed:\n' + failures.join('\n'));
  console.log('PASS mobile release checks: current shared resources, iOS/WebKit and Android/Chromium layouts, push and update isolation. Native-device testing is still required.');
}
