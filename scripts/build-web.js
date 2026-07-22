const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "www");
const files = ["index.html", "official.html", "config.js", "species-data.js", "app.js", "styles.css", "chat-tools.css", "dark-surface-audit.css", "privacy.html", "terms.html", "support.html"];

function readIosBuildNumber() {
  const projectFile = path.join(root, "ios", "App", "App.xcodeproj", "project.pbxproj");
  if (!fs.existsSync(projectFile)) return null;
  const match = fs.readFileSync(projectFile, "utf8").match(/CURRENT_PROJECT_VERSION\s*=\s*(\d+)\s*;/);
  return match ? Number(match[1]) : null;
}

const iosBuildNumber = readIosBuildNumber();

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, item.name);
    const to = path.join(dest, item.name);
    if (item.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of files) {
  if (!fs.existsSync(path.join(root, file))) continue;
  if (file === "config.js" && iosBuildNumber) {
    const config = fs.readFileSync(path.join(root, file), "utf8").replace(
      /window\.TURTLE_APP_BUILD\s*=\s*\d+\s*;/,
      `window.TURTLE_APP_BUILD = ${iosBuildNumber};`
    );
    fs.writeFileSync(path.join(outDir, file), config);
  } else {
    fs.copyFileSync(path.join(root, file), path.join(outDir, file));
  }
}

copyDir(path.join(root, "assets"), path.join(outDir, "assets"));

console.log(`Web assets copied to ${outDir}`);
