"use strict";

// Safe recovery drill: it copies the current local data to a temporary folder,
// backs it up, corrupts only that temporary copy, then restores and verifies it.
// It never writes to server/data, server/uploads or server/backups.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourceData = path.join(root, "server", "data", "app-data.json");
const sourceUploads = path.join(root, "server", "uploads");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(source, target) {
  if (!fs.existsSync(source)) return;
  if (typeof fs.cpSync === "function") {
    fs.cpSync(source, target, { recursive: true, force: true });
    return;
  }
  ensureDir(target);
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

function manifestFor(rootDir, directory = rootDir) {
  if (!fs.existsSync(directory)) return [];
  const rows = [];
  fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
    if (entry.name === "manifest.json" && directory === rootDir) return;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...manifestFor(rootDir, target));
    else if (entry.isFile()) rows.push({
      path: path.relative(rootDir, target).split(path.sep).join("/"),
      bytes: fs.statSync(target).size,
      sha256: hashFile(target)
    });
  });
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} 校验不一致`);
}

function createBackup(liveDir, backupDir) {
  ensureDir(backupDir);
  fs.copyFileSync(path.join(liveDir, "app-data.json"), path.join(backupDir, "app-data.json"));
  if (fs.existsSync(path.join(liveDir, "uploads"))) copyDir(path.join(liveDir, "uploads"), path.join(backupDir, "uploads"));
  const files = manifestFor(backupDir);
  fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify({
    createdAt: new Date().toISOString(),
    reason: "recovery-drill",
    files
  }, null, 2), "utf8");
  return files;
}

function restoreBackup(backupDir, restoredDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(backupDir, "manifest.json"), "utf8"));
  const backupFiles = manifestFor(backupDir);
  assertEqual(backupFiles, manifest.files, "备份完整性");
  ensureDir(restoredDir);
  fs.copyFileSync(path.join(backupDir, "app-data.json"), path.join(restoredDir, "app-data.json"));
  if (fs.existsSync(path.join(backupDir, "uploads"))) copyDir(path.join(backupDir, "uploads"), path.join(restoredDir, "uploads"));
  const restoredFiles = manifestFor(restoredDir);
  assertEqual(restoredFiles, manifest.files, "恢复结果");
  JSON.parse(fs.readFileSync(path.join(restoredDir, "app-data.json"), "utf8"));
  return restoredFiles.length;
}

function main() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "turtlekeeper-backup-restore-"));
  try {
    const liveDir = path.join(scratch, "live");
    const backupDir = path.join(scratch, "backup");
    const restoredDir = path.join(scratch, "restored");
    ensureDir(liveDir);
    if (fs.existsSync(sourceData)) fs.copyFileSync(sourceData, path.join(liveDir, "app-data.json"));
    else fs.writeFileSync(path.join(liveDir, "app-data.json"), JSON.stringify({ users: {}, marketListings: [] }), "utf8");
    if (fs.existsSync(sourceUploads)) copyDir(sourceUploads, path.join(liveDir, "uploads"));
    else {
      ensureDir(path.join(liveDir, "uploads"));
      fs.writeFileSync(path.join(liveDir, "uploads", "recovery-drill.txt"), "backup restore verification", "utf8");
    }

    const originalFiles = manifestFor(liveDir);
    const backupFiles = createBackup(liveDir, backupDir);
    assertEqual(backupFiles, originalFiles, "备份快照");

    // Deliberately alter only the temporary source to prove the restore is real.
    fs.writeFileSync(path.join(liveDir, "app-data.json"), "{\"corrupted\":true}", "utf8");
    fs.rmSync(path.join(liveDir, "uploads"), { recursive: true, force: true });

    const recoveredCount = restoreBackup(backupDir, restoredDir);
    console.log(`备份恢复演练通过：已校验 ${recoveredCount} 个文件；未修改线上或本地正式数据。`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main();
