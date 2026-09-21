const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
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
for (const file of ["index.html", "app.js", "styles.css", "species-data.js", "assets/account-merge.js", "assets/team-space.js", "assets/team-space.css"]) {
  assert.equal(read(`www/${file}`), read(file), `${file} is stale in www`);
}
assert.ok(read('index.html').includes('./assets/team-space.js'), 'Team page script is missing from the app');
const purchases = read('ios/App/App/TurtlePurchasesPlugin.swift');
for (const product of ['keyoushouzhang.team.monthly', 'keyoushouzhang.team.yearly']) {
  assert.ok(purchases.includes(product) && read('server/apple-team-purchases.js').includes(product), `Missing product: ${product}`);
}
assert.ok(project.includes('TurtlePurchasesPlugin.swift in Sources'), 'StoreKit plugin is not compiled by Xcode');
assert.ok(project.includes('com.apple.InAppPurchase = { enabled = 1; }'), 'In-App Purchase capability is missing');
assert.ok(read('scripts/configure-ios-local-plugins.js').includes('plugins.add("TurtlePurchasesPlugin")'), 'StoreKit plugin registration is missing');
if (process.argv.includes('--native')) {
  const native = JSON.parse(read('ios/App/App/capacitor.config.json'));
  assert.ok(native.packageClassList.includes('TurtlePurchasesPlugin'), 'Synced iOS plugin registration is missing');
  for (const file of ['index.html', 'app.js', 'config.js', 'assets/team-space.js', 'assets/team-space.css']) {
    assert.equal(read(`ios/App/App/public/${file}`), read(`www/${file}`), `Stale native asset: ${file}`);
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
console.log(`Verified iOS ${version} (${builds[0]}): matching source/build versions and ${images.length} bundled species photos.`);
