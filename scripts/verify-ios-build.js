const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const version = JSON.parse(read("package.json")).version;
const project = read("ios/App/App.xcodeproj/project.pbxproj");
const versions = [...project.matchAll(/MARKETING_VERSION\s*=\s*([^;]+);/g)].map(match => match[1].trim());
const builds = [...project.matchAll(/CURRENT_PROJECT_VERSION\s*=\s*(\d+);/g)].map(match => Number(match[1]));
assert.ok(versions.length && versions.every(value => value === version), "Debug/Release marketing versions must match package.json");
assert.ok(builds.length && builds.every(value => value === builds[0]), "Debug/Release build numbers must match");
for (const file of ["config.js", "www/config.js"]) {
  assert.equal(Number(read(file).match(/TURTLE_APP_BUILD\s*=\s*(\d+)/)?.[1]), builds[0], `${file} build number differs from Xcode`);
}
for (const file of ["index.html", "app.js", "styles.css", "species-data.js", "assets/account-merge.js"]) {
  assert.equal(read(`www/${file}`), read(file), `${file} is stale in www`);
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
