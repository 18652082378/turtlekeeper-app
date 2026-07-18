"use strict";

// Production recovery helper. Default mode only verifies a backup. Applying a
// restore requires a stopped API process and an explicit confirmation token.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const backupRoot = path.join(root, "server", "backups");
const dataFile = path.join(root, "server", "data", "app-data.json");
const uploadDir = path.join(root, "server", "uploads");
const args = process.argv.slice(2);
const readArg = name => {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || "") : "";
};
const backupName = readArg("--from");
const apply = args.includes("--apply");
const confirmation = readArg("--confirm");

function fail(message) {
  console.error(`恢复未执行：${message}`);
  process.exit(1);
}

function copyDir(source, target) {
  if (!fs.existsSync(source)) return;
  if (typeof fs.cpSync === "function") return fs.cpSync(source, target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source, { withFileTypes: true }).forEach(entry => {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  });
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function safeFile(rootDir, relative) {
  const target = path.resolve(rootDir, relative);
  if (target !== rootDir && !target.startsWith(`${rootDir}${path.sep}`)) fail("备份包含不安全路径");
  return target;
}

function verifyBackup(dir) {
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(path.join(dir, "app-data.json"))) fail("备份中没有 app-data.json");
  JSON.parse(fs.readFileSync(path.join(dir, "app-data.json"), "utf8"));
  if (!fs.existsSync(manifestPath)) return { checked: 1, legacy: true };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.files) || !manifest.files.length) return { checked: 1, legacy: true };
  manifest.files.forEach(item => {
    const relative = String(item?.path || "").replace(/\\/g, "/");
    if (!relative || relative.includes("..")) fail("备份清单路径无效");
    const target = safeFile(dir, relative);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) fail(`备份文件缺失：${relative}`);
    if (Number(item.bytes) !== fs.statSync(target).size || String(item.sha256) !== hashFile(target)) fail(`备份文件校验失败：${relative}`);
  });
  return { checked: manifest.files.length, legacy: false };
}

if (!backupName) {
  console.log("用法：node scripts/restore-server-backup.js --from <备份目录名> [--apply --confirm <备份目录名>]");
  process.exit(1);
}

const backupDir = path.resolve(backupRoot, backupName);
if (!backupDir.startsWith(`${backupRoot}${path.sep}`) || !fs.existsSync(backupDir)) fail("指定备份不存在");
const verification = verifyBackup(backupDir);
console.log(`备份校验通过：${backupName}（${verification.checked} 个文件${verification.legacy ? "，旧版清单" : ""}）`);

if (!apply) {
  console.log("这是只校验模式。确认已停止 API 后，再附加 --apply --confirm " + backupName + " 执行恢复。");
  process.exit(0);
}
if (confirmation !== backupName) fail("确认参数不匹配");

const now = new Date().toISOString().replace(/[:.]/g, "-");
const preRestore = path.join(backupRoot, `${now}-pre-restore`);
fs.mkdirSync(preRestore, { recursive: true });
if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, path.join(preRestore, "app-data.json"));
if (fs.existsSync(uploadDir)) copyDir(uploadDir, path.join(preRestore, "uploads"));
fs.writeFileSync(path.join(preRestore, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), reason: "pre-restore" }, null, 2), "utf8");

fs.mkdirSync(path.dirname(dataFile), { recursive: true });
const dataTemp = `${dataFile}.${process.pid}.restore`;
fs.copyFileSync(path.join(backupDir, "app-data.json"), dataTemp);
fs.renameSync(dataTemp, dataFile);

const uploadTemp = `${uploadDir}.${process.pid}.restore`;
const uploadOld = `${uploadDir}.${process.pid}.previous`;
fs.rmSync(uploadTemp, { recursive: true, force: true });
if (fs.existsSync(path.join(backupDir, "uploads"))) copyDir(path.join(backupDir, "uploads"), uploadTemp);
else fs.mkdirSync(uploadTemp, { recursive: true });
if (fs.existsSync(uploadDir)) fs.renameSync(uploadDir, uploadOld);
fs.renameSync(uploadTemp, uploadDir);
fs.rmSync(uploadOld, { recursive: true, force: true });
console.log(`恢复完成：${backupName}。恢复前快照已保存为 ${path.basename(preRestore)}。请重启 API。`);
