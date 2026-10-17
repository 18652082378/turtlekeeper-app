// Android-only packaging: preserve shared source and the existing iOS name.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
const androidBuild = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
const androidVersion = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
const updateChannel = process.env.TURTLE_ANDROID_UPDATE_CHANNEL || 'beta';
if (!androidBuild || !androidVersion || !['beta', 'store'].includes(updateChannel)) throw new Error('Invalid Android versionCode or update channel');
execFileSync(process.execPath, [path.join(root, 'scripts/build-web.js')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [path.join(root, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'android'], { cwd: root, stdio: 'inherit' });
const publicDir = path.join(root, 'android/app/src/main/assets/public');
for (const name of fs.readdirSync(publicDir)) {
  if (!/\.(html|js)$/.test(name)) continue;
  const file = path.join(publicDir, name);
  const text = require('./android/adapt-shared-asset.cjs')(name, fs.readFileSync(file, 'utf8'), { androidBuild, androidVersion, updateChannel });
  fs.writeFileSync(file, text);
}
const configPath = path.join(root, 'android/app/src/main/assets/capacitor.config.json');
// Apply platform overrides last; shared web/iOS output remains untouched.
for (const name of ['layout.css', 'runtime.js']) {
  fs.copyFileSync(path.join(__dirname, 'android', name), path.join(publicDir, 'android-' + name));
}
const indexPath = path.join(publicDir, 'index.html');
fs.cpSync(path.join(__dirname, 'android/fonts'), path.join(publicDir, 'android-fonts'), { recursive: true });
fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8')
  .replace('</head>', '<link rel="preload" href="android-fonts/NotoSansSC-VF.ttf" as="font" type="font/ttf" crossorigin>\n<link rel="stylesheet" href="android-layout.css">\n</head>')
  .replace('</body>', '<script src="android-runtime.js"></script>\n</body>'));
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.appName = '龟友手账';
// MainActivity owns all window insets, including folding taskbars and IME.
config.plugins.SystemBars = { insetsHandling: 'disable' };
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
const strings = path.join(root, 'android/app/src/main/res/values/strings.xml');
fs.writeFileSync(strings, fs.readFileSync(strings, 'utf8').replace(/(<string name="(?:app_name|title_activity_main)">)[^<]*/g, '$1龟友手账'));
console.log('Android assets prepared: 龟友手账 (com.turtlekeeper.app)');
