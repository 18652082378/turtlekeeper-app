const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "www");
const files = ["index.html", "config.js", "species-data.js", "app.js", "styles.css", "chat-tools.css", "privacy.html", "terms.html", "support.html"];

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
  fs.copyFileSync(path.join(root, file), path.join(outDir, file));
}

copyDir(path.join(root, "assets"), path.join(outDir, "assets"));

console.log(`Web assets copied to ${outDir}`);
