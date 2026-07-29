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
config.packageClassList = [...plugins];
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log("Registered local iOS plugin: TurtleMediaPickerPlugin");
