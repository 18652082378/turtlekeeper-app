/* Creates a timestamped, immutable cutover backup after the API has stopped. */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const runtime = path.resolve(process.env.TURTLE_RUNTIME_DIR || path.join(root, "server"));
const source = path.join(runtime, "data", "app-data.json");
const now = new Date().toISOString().replace(/[:.]/g, "-");
const targetDir = path.join(runtime, "backups", `mysql-cutover-${now}`);

if (!fs.existsSync(source)) throw new Error(`找不到线上数据文件：${source}`);
fs.mkdirSync(targetDir, { recursive: true });
const target = path.join(targetDir, "app-data.json");
fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
const hash = crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
fs.writeFileSync(path.join(targetDir, "manifest.json"), JSON.stringify({
  createdAt: new Date().toISOString(),
  source,
  file: "app-data.json",
  bytes: fs.statSync(target).size,
  sha256: hash
}, null, 2), "utf8");
console.log(`已创建切换备份：${targetDir}`);
console.log(`SHA-256：${hash}`);
