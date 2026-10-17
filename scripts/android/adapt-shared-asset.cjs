'use strict';
// The only approved differences between shared page source and Android assets.
module.exports = function adaptSharedAsset(name, text, { androidBuild, androidVersion, updateChannel }) {
  text = text.replaceAll('壳友手账', '龟友手账');
  if (name === 'config.js') {
    text = text.replace(/window\.TURTLE_APP_BUILD\s*=\s*\d+;/, `window.TURTLE_APP_BUILD = ${androidBuild};`)
      .replace(/window\.TURTLE_APP_VERSION\s*=\s*["'][^"']+["'];/, `window.TURTLE_APP_VERSION = ${JSON.stringify(androidVersion)};`)
      .replace(/window\.TURTLE_APP_STORE_URL\s*=.*;/, '')
      .replace('// iOS 的构建号。每次提交新构建时与 Xcode 的 CURRENT_PROJECT_VERSION 保持一致。', '// Android versionCode, generated from android/app/build.gradle.');
    text += `\nwindow.TURTLE_APP_PLATFORM = "android";\nwindow.TURTLE_APP_UPDATE_CHANNEL = ${JSON.stringify(updateChannel)};\nwindow.TURTLE_ANDROID_PUSH_PROVIDER = "aliyun";\n`;
  }
  // This is a backend account identity, not a user-facing application title.
  if (name === 'app.js') {
    // Capacitor Android recognizes camera capture only for these wildcard MIME
    // values. Keep iOS's existing capture/format negotiation unchanged.
    text = text.replace('accept="image/jpeg,image/png,image/webp" capture="environment"', 'accept="image/*" capture="environment"')
      .replace('accept="video/mp4,video/webm,video/quicktime,video/x-m4v" capture="environment"', 'accept="video/*" capture="environment"');
    // Batch cards keep the active count without the redundant batch prefix.
    const batchCountText = '批次 · 在养 ${summary.count} 只';
    if (text.split(batchCountText).length !== 2) throw new Error('Expected one batch count label in Android app assets');
    text = text.replace(batchCountText, '在养 ${summary.count} 只');
    text = text.replace('const RESERVED_PLATFORM_NICKNAME = "龟友手账";', 'const RESERVED_PLATFORM_NICKNAME = "壳友手账";');
    // Folding also changes viewport height. Use the real Android IME state,
    // rather than mistaking an unfolded/resized focused form for a keyboard.
    text = text.replace('composerViewport.keyboardOpen);', '(window.TURTLE_ANDROID_KEYBOARD_VISIBLE ?? composerViewport.keyboardOpen));');
    text = text.replace('Boolean(editable && (touchDevice || coveredHeight > 120))', '(window.TURTLE_ANDROID_KEYBOARD_VISIBLE ?? Boolean(editable && (touchDevice || coveredHeight > 120)))');
  }
  return text;
};
