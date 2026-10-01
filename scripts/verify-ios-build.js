const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const plist = require("plist");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
require('./verify-notification-extension.cjs').verifyNotificationExtension(root, read);
const version = JSON.parse(read("package.json")).version;
const project = read("ios/App/App.xcodeproj/project.pbxproj");
const versions = [...project.matchAll(/MARKETING_VERSION\s*=\s*([^;]+);/g)].map(match => match[1].trim());
const builds = [...project.matchAll(/CURRENT_PROJECT_VERSION\s*=\s*(\d+);/g)].map(match => Number(match[1]));
// The approved artwork reads 龟中介; the installed app name remains 龟友手账.
// Check the actual Xcode catalog, rather than a separate Android/logo source.
const iconDir = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
const iconCatalog = JSON.parse(read(`${iconDir}/Contents.json`));
assert.equal(iconCatalog.images.length, 1, 'Review every iOS icon variant before release');
const iconFile = iconCatalog.images[0].filename;
assert.equal(iconFile, 'AppIcon-512@2x.png', 'Unexpected iOS icon catalog file');
const iconBytes = fs.readFileSync(path.join(root, iconDir, iconFile));
assert.equal(crypto.createHash('sha256').update(iconBytes).digest('hex'),
  '1ae4a693bc40e73853b1f6c82b214288bf14b3d8b7582fd0de3dadf091c6631d',
  'iOS icon differs from the visually approved 龟中介 artwork');
assert.equal(iconBytes.readUInt32BE(16), 1024, 'iOS icon must be 1024px wide');
assert.equal(iconBytes.readUInt32BE(20), 1024, 'iOS icon must be 1024px high');
assert.equal(iconBytes[25], 2, 'iOS icon must be RGB without alpha');
assert.match(read('ios/App/App/Info.plist'), /<key>CFBundleDisplayName<\/key>\s*<string>龟友手账<\/string>/, 'Keep the installed app name 龟友手账');
assert.ok(versions.length && versions.every(value => value === version), "Debug/Release marketing versions must match package.json");
assert.ok(builds.length && builds.every(value => value === builds[0]), "Debug/Release build numbers must match");
for (const file of ["config.js", "www/config.js"]) {
  assert.equal(Number(read(file).match(/TURTLE_APP_BUILD\s*=\s*(\d+)/)?.[1]), builds[0], `${file} build number differs from Xcode`);
}
function filesUnder(folder) {
  return fs.readdirSync(path.join(root, folder), { withFileTypes: true }).flatMap(item => {
    const file = `${folder}/${item.name}`;
    return item.isDirectory() ? filesUnder(file) : [file];
  });
}
// Check all shipped web files, not a hand-picked subset that misses new UI
// modules, policy pages or binary assets. Hash comparisons keep errors concise.
const bundledSources = ["index.html", "official.html", "config.js", "species-data.js", "app.js", "styles.css", "chat-tools.css", "dark-surface-audit.css", "privacy.html", "terms.html", "support.html", ...filesUnder("assets")].sort();
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
for (const file of bundledSources) {
  assert.equal(hash(`www/${file}`), hash(file), `Stale web asset: ${file}`);
}
assert.equal(filesUnder('www').map(file => file.slice(4)).sort().join('\n'), bundledSources.join('\n'), 'www contains missing or unexpected release files');
for (const match of read('index.html').matchAll(/(?:src|href)=["']\.\/([^"']+)/g)) {
  const file = match[1].split(/[?#]/)[0];
  assert.ok(bundledSources.includes(file), `Entry references an unbundled asset: ${file}`);
}
assert.ok(read('index.html').includes('./assets/team-space.js'), 'Team page script is missing from the app');
const purchases = read('ios/App/App/TurtlePurchasesPlugin.swift');
for (const product of ['keyoushouzhang.team.monthly', 'keyoushouzhang.team.yearly']) {
  assert.ok(purchases.includes(product) && read('server/apple-team-purchases.js').includes(product), `Missing product: ${product}`);
}
assert.ok(project.includes('TurtlePurchasesPlugin.swift in Sources'), 'StoreKit plugin is not compiled by Xcode');
assert.ok(project.includes('com.apple.InAppPurchase = { enabled = 1; }'), 'In-App Purchase capability is missing');
assert.ok(read('scripts/configure-ios-local-plugins.js').includes('plugins.add("TurtlePurchasesPlugin")'), 'StoreKit plugin registration is missing');
const localPlugins = fs.readdirSync(path.join(root, 'ios/App/App')).filter(file => /^Turtle\w+Plugin\.swift$/.test(file)).map(file => file.replace(/\.swift$/, ''));
for (const plugin of localPlugins) {
  assert.ok(project.includes(`${plugin}.swift in Sources`), `${plugin} is not compiled by Xcode`);
  assert.ok(read('scripts/configure-ios-local-plugins.js').includes(`plugins.add("${plugin}")`), `${plugin} is missing from the local plugin configurator`);
}
// Apple lists contentModificationDateKey under FileTimestamp. This plugin
// inspects only its own app-container cache, matching the C617.1 reason.
const privacy = plist.parse(read('ios/App/App/PrivacyInfo.xcprivacy'));
const timestamp = privacy.NSPrivacyAccessedAPITypes?.find(item => item.NSPrivacyAccessedAPIType === 'NSPrivacyAccessedAPICategoryFileTimestamp');
assert.ok(timestamp?.NSPrivacyAccessedAPITypeReasons?.includes('C617.1'), 'File timestamp privacy reason C617.1 is missing');
const privacyReference = project.match(/([A-F0-9]+) \/\* PrivacyInfo\.xcprivacy \*\/ = \{isa = PBXFileReference;[^\n]*path = PrivacyInfo\.xcprivacy;/)?.[1];
const privacyBuild = privacyReference && project.match(new RegExp(`([A-F0-9]+) /\\* PrivacyInfo\\.xcprivacy in Resources \\*/ = \\{isa = PBXBuildFile; fileRef = ${privacyReference} `))?.[1];
const resourcesPhase = project.slice(project.indexOf('/* Begin PBXResourcesBuildPhase section */'), project.indexOf('/* End PBXResourcesBuildPhase section */'));
assert.ok(privacyBuild && resourcesPhase.includes(`${privacyBuild} /* PrivacyInfo.xcprivacy in Resources */`), 'PrivacyInfo.xcprivacy is missing from Xcode Resources');
for (const workflow of ['.github/workflows/ios-check.yml', 'codemagic.yaml']) {
  assert.match(read(workflow), /npx cap sync ios[\s\S]*node scripts\/configure-ios-local-plugins\.js[\s\S]*node scripts\/verify-ios-build\.js --native/, `iOS workflow ${workflow} must configure plugins and verify native assets after sync`);
}
assert.match(read('codemagic.yaml'), /node scripts\/verify-ios-signing\.cjs\s*\r?\n\s*xcode-project use-profiles --archive-method app-store\s*\r?\n\s*node scripts\/verify-ios-signing\.cjs --applied[\s\S]*- name: Build IPA/, 'Codemagic must validate both installed and applied signing profiles before Build IPA');
if (process.argv.includes('--native')) {
  const native = JSON.parse(read('ios/App/App/capacitor.config.json'));
  for (const plugin of localPlugins) assert.ok(native.packageClassList.includes(plugin), `Synced iOS plugin registration is missing: ${plugin}`);
  for (const file of bundledSources) {
    assert.equal(hash(`ios/App/App/public/${file}`), hash(`www/${file}`), `Stale native asset: ${file}`);
  }
}
// Validate the bundled files themselves; adding a species must not break a
// cloud build because an old hard-coded image count was left behind.
const images = fs.readdirSync(path.join(root, "assets/species")).filter(file => file.endsWith(".jpg"));
assert.ok(images.length > 0, "No bundled species images");
for (const file of [...images, "manifest.json"]) {
  assert.ok(fs.readFileSync(path.join(root, "assets/species", file)).equals(
    fs.readFileSync(path.join(root, "www/assets/species", file))), `Missing or stale species asset: ${file}`);
}
console.log(`Verified iOS ${version} (${builds[0]}): ${bundledSources.length} matching web assets, ${images.length} bundled species photos, ${localPlugins.length} local plugins and the app privacy manifest. Xcode compilation/signing is not performed by this check.`);
