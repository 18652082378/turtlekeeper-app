const fs = require("fs");
const path = require("path");

const configPath = path.resolve(__dirname, "..", "ios", "App", "App", "capacitor.config.json");
if (!fs.existsSync(configPath)) {
  console.error(`iOS Capacitor configuration not found: ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const plugins = new Set(Array.isArray(config.packageClassList) ? config.packageClassList : []);
plugins.add("TurtleMediaPickerPlugin");
plugins.add("TurtleAppReviewPlugin");
plugins.add("TurtlePurchasesPlugin");
config.packageClassList = [...plugins];
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log("Registered local iOS plugins: TurtleMediaPickerPlugin, TurtleAppReviewPlugin, TurtlePurchasesPlugin");

// Capacitor sync on Windows writes Windows separators into Swift string paths.
// Keep the generated package portable when the source is opened on a Mac.
const swiftPackagePath = path.resolve(__dirname, "..", "ios", "App", "CapApp-SPM", "Package.swift");
if (fs.existsSync(swiftPackagePath)) {
  const source = fs.readFileSync(swiftPackagePath, "utf8");
  const portable = source.replace(/path: "([^"]+)"/g, (_match, value) => `path: "${value.replace(/\\/g, "/")}"`);
  if (portable !== source) fs.writeFileSync(swiftPackagePath, portable);
}
