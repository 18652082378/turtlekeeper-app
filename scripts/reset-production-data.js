"use strict";

// One-time production launch reset.  It intentionally only touches runtime
// business data under server/data and server/uploads.  Source code, bundled
// images, server configuration, APNs keys and existing backups are untouched.
//
// The command is deliberately two-step:
//   node scripts/reset-production-data.js --dry-run
//   node scripts/reset-production-data.js --confirm CLEAR_ALL_TEST_DATA
// Stop the API first so no concurrent request can write data during the reset.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "server", "data");
const dataFile = path.join(dataDir, "app-data.json");
const smsStateFile = path.join(dataDir, "sms-state.json");
const uploadDir = path.join(root, "server", "uploads");
const backupRoot = path.join(root, "server", "backups");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const confirmationIndex = args.indexOf("--confirm");
const confirmation = confirmationIndex >= 0 ? String(args[confirmationIndex + 1] || "") : "";
const confirmationPhrase = "CLEAR_ALL_TEST_DATA";

function fail(message) {
  console.error(`未执行清空：${message}`);
  process.exit(1);
}

function backupTimeKey(date = new Date()) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ];
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()].map(item => String(item).padStart(2, "0")).join("");
  return `${parts.join("-")}-${time}`;
}

function emptyDatabase() {
  return {
    users: {},
    reviews: [],
    feedbacks: [],
    communityPosts: [],
    marketListings: [],
    friendships: [],
    messages: [],
    follows: [],
    reports: [],
    careReminderDeliveries: {}
  };
}

function countFiles(directory) {
  if (!fs.existsSync(directory)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) count += countFiles(target);
    else if (entry.isFile()) count += 1;
  }
  return count;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function backupManifest(rootDir, directory = rootDir) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (directory === rootDir && entry.name === "manifest.json") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...backupManifest(rootDir, target));
    } else if (entry.isFile()) {
      files.push({
        path: path.relative(rootDir, target).split(path.sep).join("/"),
        bytes: fs.statSync(target).size,
        sha256: sha256(target)
      });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function writeAtomically(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  const descriptor = fs.openSync(temporary, "w");
  try {
    fs.writeFileSync(descriptor, value, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
}

function readCurrentDatabase() {
  if (!fs.existsSync(dataFile)) return emptyDatabase();
  try {
    const database = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    if (!database || typeof database !== "object" || Array.isArray(database)) throw new Error("根节点不是对象");
    return database;
  } catch (error) {
    fail(`app-data.json 无法解析，为防止覆盖已有数据，已中止（${error.message}）`);
  }
}

function summary(database) {
  return {
    accounts: Object.keys(database.users || {}).length,
    turtles: Object.values(database.users || {}).reduce((total, user) => total + (Array.isArray(user?.data?.turtles) ? user.data.turtles.length : 0), 0),
    ledgerRecords: Object.values(database.users || {}).reduce((total, user) => total + (Array.isArray(user?.data?.ledgerRecords) ? user.data.ledgerRecords.length : 0), 0),
    marketListings: Array.isArray(database.marketListings) ? database.marketListings.length : 0,
    communityPosts: Array.isArray(database.communityPosts) ? database.communityPosts.length : 0,
    messages: Array.isArray(database.messages) ? database.messages.length : 0,
    uploadFiles: countFiles(uploadDir)
  };
}

const database = readCurrentDatabase();
const currentSummary = summary(database);
console.log("待清空数据：", JSON.stringify(currentSummary));

if (dryRun) {
  console.log("演练完成：未修改任何文件。执行时会先创建完整备份，再清空线上业务数据。");
  process.exit(0);
}

if (confirmation !== confirmationPhrase) {
  fail(`请先执行 --dry-run；确认清空请使用：--confirm ${confirmationPhrase}`);
}

const backupName = `${backupTimeKey()}-pre-production-reset`;
const backupDir = path.join(backupRoot, backupName);
const backupUploads = path.join(backupDir, "uploads");
let uploadsMoved = false;
let databaseReset = false;
let smsReset = false;

try {
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: false });
  if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, path.join(backupDir, "app-data.json"));
  else writeAtomically(path.join(backupDir, "app-data.json"), `${JSON.stringify(emptyDatabase(), null, 2)}\n`);
  if (fs.existsSync(smsStateFile)) fs.copyFileSync(smsStateFile, path.join(backupDir, "sms-state.json"));

  // Moving the media folder keeps every test photo/video recoverable without
  // leaving a duplicate copy on the live server.
  if (fs.existsSync(uploadDir)) {
    fs.renameSync(uploadDir, backupUploads);
    uploadsMoved = true;
  }

  writeAtomically(dataFile, `${JSON.stringify(emptyDatabase(), null, 2)}\n`);
  databaseReset = true;
  writeAtomically(smsStateFile, "{\n  \"codes\": {},\n  \"verifiedPhones\": {}\n}\n");
  smsReset = true;
  fs.mkdirSync(uploadDir, { recursive: true });

  const manifest = {
    createdAt: new Date().toISOString(),
    reason: "pre-production-reset",
    cleared: currentSummary,
    includes: backupManifest(backupDir)
  };
  writeAtomically(path.join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`已清空线上测试数据。完整可恢复备份：server/backups/${backupName}`);
} catch (error) {
  // Best-effort rollback: the action should never leave a half-cleared server.
  try {
    if (databaseReset && fs.existsSync(path.join(backupDir, "app-data.json"))) {
      writeAtomically(dataFile, fs.readFileSync(path.join(backupDir, "app-data.json"), "utf8"));
    }
    if (smsReset && fs.existsSync(path.join(backupDir, "sms-state.json"))) {
      writeAtomically(smsStateFile, fs.readFileSync(path.join(backupDir, "sms-state.json"), "utf8"));
    }
    if (uploadsMoved && fs.existsSync(backupUploads)) {
      // The API must be stopped while this tool runs, so this can only remove
      // the empty directory created by this script before restoring the media.
      fs.rmSync(uploadDir, { recursive: true, force: true });
      fs.renameSync(backupUploads, uploadDir);
    }
  } catch (rollbackError) {
    console.error(`回滚失败：${rollbackError.message}`);
  }
  fail(`执行过程中发生错误，已尝试自动回滚（${error.message}）`);
}
