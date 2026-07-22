// 所有按本地日期生成的服务器数据（如上传目录）统一使用中国标准时间。
process.env.TZ = "Asia/Shanghai";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const http2 = require("http2");
const path = require("path");
const { URL } = require("url");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const STATIC_ROOT = path.resolve(__dirname, "..");
const SPECIES_CATALOG_FILE = path.resolve(STATIC_ROOT, "species-data.js");
const DATA_DIR = path.resolve(__dirname, "data");
const DATA_FILE = path.resolve(DATA_DIR, "app-data.json");
const SMS_STATE_FILE = path.resolve(DATA_DIR, "sms-state.json");
const UPLOAD_DIR = path.resolve(__dirname, "uploads");
const BACKUP_DIR = path.resolve(__dirname, "backups");
const BACKUP_RETENTION_DAYS = Math.max(7, Math.floor(Number(process.env.BACKUP_RETENTION_DAYS || 30)));
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 2 * 1024 * 1024);
const REVIEW_ADMIN_PHONE = process.env.ADMIN_PHONE || "18652082378";
const POLICY_VERSION = "2026-07-17";
// 每次 App Store 新版已发布后，将 MIN_SUPPORTED_APP_BUILD 调整为新的 Xcode 构建号即可强制更新。
const MIN_SUPPORTED_APP_BUILD = Math.max(0, Math.floor(Number(process.env.MIN_SUPPORTED_APP_BUILD || 12)));
const LATEST_APP_BUILD = Math.max(MIN_SUPPORTED_APP_BUILD, Math.floor(Number(process.env.LATEST_APP_BUILD || MIN_SUPPORTED_APP_BUILD)));
const IOS_APP_STORE_URL = process.env.IOS_APP_STORE_URL || "https://apps.apple.com/app/id6783481335";
// Apple Push Notification service (APNs) credentials are configured only on the server.
const APNS_TEAM_ID = String(process.env.APNS_TEAM_ID || "").trim();
const APNS_KEY_ID = String(process.env.APNS_KEY_ID || "").trim();
const APNS_BUNDLE_ID = String(process.env.APNS_BUNDLE_ID || "com.turtlekeeper.app").trim();
const APNS_HOST = String(process.env.APNS_HOST || "api.push.apple.com").trim();
const APNS_KEY_PATH = String(process.env.APNS_KEY_PATH || "").trim();
const APNS_KEY_BASE64 = String(process.env.APNS_KEY_BASE64 || "").trim();
const MARKET_SALE_METHODS = ["自有客户成交", "闲鱼成交", "壳友手账成交"];

function loadMarketSpeciesCatalog() {
  try {
    // species-data.js is a local, version-controlled browser catalog rather than JSON.
    // Evaluate it only with an isolated `window` object and read its catalog result.
    const source = fs.readFileSync(SPECIES_CATALOG_FILE, "utf8");
    const items = Function("window", `"use strict";\n${source}\nreturn window.TURTLE_SPECIES;`)({});
    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.error("读取品种库失败，龟集市发布将暂时关闭：", error.message);
    return [];
  }
}

const MARKET_SPECIES_CATALOG = loadMarketSpeciesCatalog();
const MARKET_SPECIES_BY_CODE = new Map(MARKET_SPECIES_CATALOG.map(item => [String(item.code || "").toUpperCase(), item]));
const MARKET_SPECIES_BY_NAME = new Map(MARKET_SPECIES_CATALOG.map(item => [String(item.name || "").trim(), item]));

// 平台自动禁售名单：不采用人工审核。名单覆盖国家重点保护海龟、闭壳龟及
// 平台暂不提供合规凭证核验的高风险陆龟/水龟；新增或调整品种时只需维护此处代码。
const MARKET_PROHIBITED_SPECIES_CODES = new Set([
  "ABQ", "ALD", "ANG", "BWG", "CBQ", "CSG", "DBG", "DHG", "EBQ", "GBG", "GJG", "HBQ", "HET", "HJG", "HNT", "HYG",
  "JDG", "JQG", "JTG", "JYG", "KBT", "KNG", "LHG", "LJG", "LKG", "MBG", "MDG", "MJG", "MLG", "MNG", "PDG", "PGG", "PHG",
  "PTG", "QBT", "QYG", "RTG", "SBQ", "SDG", "SGG", "SHG", "SLG", "SSG", "STG", "XGG", "XPG", "YBG", "YHG", "YLG", "YNT",
  "YSG", "YTG", "ZRG"
]);

function resolveMarketSpecies(speciesCode, speciesName) {
  const code = String(speciesCode || "").trim().toUpperCase();
  const name = String(speciesName || "").trim();
  return MARKET_SPECIES_BY_CODE.get(code) || MARKET_SPECIES_BY_NAME.get(name) || null;
}

function isMarketProhibitedSpecies(speciesCode, speciesName) {
  const species = resolveMarketSpecies(speciesCode, speciesName);
  return Boolean(species && MARKET_PROHIBITED_SPECIES_CODES.has(String(species.code || "").toUpperCase()));
}

function marketSpeciesRestrictionMessage() {
  return "该品种属于龟集市平台禁售范围，无法发布";
}
const smsCodes = new Map();
const verifiedPhones = new Map();
let lastServerBackupDate = "";
let apnsPrivateKey = null;
let apnsJwtCache = { token: "", createdAt: 0 };

function persistSmsState() {
  const now = Date.now();
  for (const [phone, item] of smsCodes) {
    if (!item || now > Number(item.expiresAt || 0)) smsCodes.delete(phone);
  }
  for (const [phone, expiresAt] of verifiedPhones) {
    if (now > Number(expiresAt || 0)) verifiedPhones.delete(phone);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempFile = `${SMS_STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify({
    codes: Object.fromEntries(smsCodes),
    verifiedPhones: Object.fromEntries(verifiedPhones)
  }), "utf8");
  fs.renameSync(tempFile, SMS_STATE_FILE);
}

function loadSmsState() {
  try {
    if (!fs.existsSync(SMS_STATE_FILE)) return;
    const saved = JSON.parse(fs.readFileSync(SMS_STATE_FILE, "utf8"));
    for (const [phone, item] of Object.entries(saved.codes || {})) smsCodes.set(phone, item);
    for (const [phone, expiresAt] of Object.entries(saved.verifiedPhones || {})) verifiedPhones.set(phone, Number(expiresAt));
    persistSmsState();
  } catch (error) {
    console.warn("读取短信验证状态失败，将使用新的验证状态", error.message);
  }
}

loadSmsState();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".mov": "video/quicktime"
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Phone, X-Auth-Token, X-Media-Duration"
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 25 * 1024 * 1024) reject(new Error("请求内容过大"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("请求格式不正确"));
      }
    });
    req.on("error", reject);
  });
}

function emptyAccountData() {
  return {
    turtles: [],
    keptSpecies: [],
    memos: [],
    ledgerRecords: [],
    breedingRecords: [],
    satisfactionRating: 5,
    satisfactionReviews: [],
    feedbackItems: [],
    marketFavoriteIds: [],
    marketHistoryIds: [],
    turtlePools: [],
    syncEnabled: true,
    subscriptionPlan: "free",
    subscriptionCycle: "",
    subscriptionStartedAt: "",
    subscriptionExpiresAt: "",
    professionalOutput: "",
    activityLogs: [],
    themeColor: "teal"
  };
}

function normalizeAccountData(data = {}) {
  const next = { ...emptyAccountData(), ...(data || {}) };
  return {
    turtles: Array.isArray(next.turtles) ? next.turtles : [],
    keptSpecies: Array.isArray(next.keptSpecies) ? next.keptSpecies : [],
    memos: Array.isArray(next.memos) ? next.memos : [],
    ledgerRecords: Array.isArray(next.ledgerRecords) ? next.ledgerRecords : [],
    breedingRecords: Array.isArray(next.breedingRecords) ? next.breedingRecords : [],
    satisfactionRating: Number(next.satisfactionRating || 5),
    satisfactionReviews: Array.isArray(next.satisfactionReviews) ? next.satisfactionReviews : [],
    feedbackItems: Array.isArray(next.feedbackItems) ? next.feedbackItems : [],
    marketFavoriteIds: Array.isArray(next.marketFavoriteIds) ? next.marketFavoriteIds.map(String).slice(0, 500) : [],
    marketHistoryIds: Array.isArray(next.marketHistoryIds) ? next.marketHistoryIds.map(String).slice(0, 100) : [],
    turtlePools: Array.isArray(next.turtlePools) ? next.turtlePools.slice(0, 200).map(pool => ({
      ...pool,
      id: String(pool?.id || crypto.randomUUID()),
      name: String(pool?.name || "").trim().slice(0, 24),
      type: ["hatchling", "juvenile", "breeder"].includes(pool?.type) ? pool.type : "",
      length: String(pool?.length ?? "").slice(0, 16),
      width: String(pool?.width ?? "").slice(0, 16),
      height: String(pool?.height ?? "").slice(0, 16),
      count: Math.max(0, Math.floor(Number.isFinite(Number(pool?.count)) ? Number(pool.count) : 0)),
      note: String(pool?.note || "").trim().slice(0, 200),
      createdAt: String(pool?.createdAt || ""),
      updatedAt: String(pool?.updatedAt || "")
    })).filter(pool => pool.name && pool.type) : [],
    syncEnabled: Boolean(next.syncEnabled),
    subscriptionPlan: ["free", "member", "pro"].includes(next.subscriptionPlan) ? next.subscriptionPlan : "free",
    subscriptionCycle: next.subscriptionCycle || "",
    subscriptionStartedAt: next.subscriptionStartedAt || "",
    subscriptionExpiresAt: next.subscriptionExpiresAt || "",
    professionalOutput: next.professionalOutput || "",
    activityLogs: Array.isArray(next.activityLogs) ? next.activityLogs : [],
    themeColor: next.themeColor || "teal"
  };
}

function emptyDatabase() {
  return { users: {}, reviews: [], feedbacks: [], communityPosts: [], marketListings: [], friendships: [], messages: [], follows: [], reports: [] };
}

function readDatabase() {
  try {
    if (!fs.existsSync(DATA_FILE)) return emptyDatabase();
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return data && typeof data === "object"
      ? {
          users: data.users || {},
          reviews: Array.isArray(data.reviews) ? data.reviews : [],
          feedbacks: Array.isArray(data.feedbacks) ? data.feedbacks : [],
          communityPosts: Array.isArray(data.communityPosts) ? data.communityPosts : [],
          marketListings: Array.isArray(data.marketListings) ? data.marketListings : [],
          friendships: Array.isArray(data.friendships) ? data.friendships : [],
          messages: Array.isArray(data.messages) ? data.messages : [],
          follows: Array.isArray(data.follows) ? data.follows : [],
          reports: Array.isArray(data.reports) ? data.reports : []
        }
      : emptyDatabase();
  } catch {
    return emptyDatabase();
  }
}

function writeDatabase(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tempFile, DATA_FILE);
}

function backupDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function backupTimeKey(date = new Date()) {
  return `${backupDateKey(date)}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
}

function pruneServerBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const expiresAt = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  fs.readdirSync(BACKUP_DIR, { withFileTypes: true }).forEach(entry => {
    if (!entry.isDirectory()) return;
    const target = path.resolve(BACKUP_DIR, entry.name);
    const stat = fs.statSync(target);
    if (stat.mtimeMs < expiresAt) fs.rmSync(target, { recursive: true, force: true });
  });
}

function hasBackupForDate(day = backupDateKey()) {
  if (!fs.existsSync(BACKUP_DIR)) return false;
  return fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
    .some(entry => entry.isDirectory() && entry.name.startsWith(`${day}-`));
}

function copyBackupDirectory(source, target) {
  if (typeof fs.cpSync === "function") {
    fs.cpSync(source, target, { recursive: true, force: true });
    return;
  }
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source, { withFileTypes: true }).forEach(entry => {
    const from = path.resolve(source, entry.name);
    const to = path.resolve(target, entry.name);
    if (entry.isDirectory()) copyBackupDirectory(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  });
}

function backupFileManifest(root, directory = root) {
  if (!fs.existsSync(directory)) return [];
  const rows = [];
  fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
    if (entry.name === "manifest.json" && directory === root) return;
    const file = path.resolve(directory, entry.name);
    if (entry.isDirectory()) {
      rows.push(...backupFileManifest(root, file));
      return;
    }
    if (!entry.isFile()) return;
    rows.push({
      path: path.relative(root, file).split(path.sep).join("/"),
      bytes: fs.statSync(file).size,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
    });
  });
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

function createServerBackup(reason = "scheduled") {
  if (!fs.existsSync(DATA_FILE)) return "";
  const now = new Date();
  const safeReason = String(reason || "scheduled").replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "scheduled";
  const targetDir = path.resolve(BACKUP_DIR, `${backupTimeKey(now)}-${safeReason}`);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(DATA_FILE, path.resolve(targetDir, "app-data.json"));
  if (fs.existsSync(UPLOAD_DIR)) copyBackupDirectory(UPLOAD_DIR, path.resolve(targetDir, "uploads"));
  fs.writeFileSync(path.resolve(targetDir, "manifest.json"), JSON.stringify({
    createdAt: now.toISOString(),
    reason: safeReason,
    includes: ["app-data.json", fs.existsSync(UPLOAD_DIR) ? "uploads" : ""]
      .filter(Boolean),
    files: backupFileManifest(targetDir)
  }, null, 2), "utf8");
  pruneServerBackups();
  return targetDir;
}

function runScheduledBackup() {
  const today = backupDateKey();
  if (today === lastServerBackupDate) return;
  try {
    if (!hasBackupForDate(today)) createServerBackup("daily");
    lastServerBackupDate = today;
  } catch (error) {
    console.error("自动备份失败：", error.message);
  }
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  if (!user?.passwordSalt || !user?.passwordHash) return false;
  const { hash } = hashPassword(password, user.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.passwordHash, "hex"));
}

function makeAuthToken() {
  return crypto.randomBytes(32).toString("hex");
}

function rememberVerifiedPhone(phone) {
  verifiedPhones.set(phone, Date.now() + 10 * 60 * 1000);
  persistSmsState();
}

function hasVerifiedPhone(phone) {
  const expiresAt = verifiedPhones.get(phone);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    verifiedPhones.delete(phone);
    persistSmsState();
    return false;
  }
  return true;
}

function publicUser(user, token = "") {
  return {
    phone: user.phone,
    accountName: user.accountName || maskPhone(user.phone),
    accountAvatar: user.accountAvatar || "",
    data: normalizeAccountData(user.data || {}),
    termsAcceptedAt: user.termsAcceptedAt || "",
    termsVersion: user.termsVersion || "",
    isCommunityAdmin: isAdminUser(user),
    token
  };
}

function maskPhone(phone) {
  return phone ? `${phone.slice(0, 3)}****${phone.slice(7)}` : "未登录用户";
}

function authenticate(db, phone, token) {
  const user = db.users[phone];
  if (!user || !token) return null;
  const tokenHash = hashValue(token);
  const tokens = Array.isArray(user.tokens) ? user.tokens : [];
  return tokens.some(item => item.hash === tokenHash) ? user : null;
}

function validPhone(phone) {
  return /^1[3-9]\d{9}$/.test(String(phone || ""));
}

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function storeCode(phone, code) {
  const salt = crypto.randomBytes(16).toString("hex");
  smsCodes.set(phone, {
    codeHash: hashValue(`${salt}:${phone}:${code}`),
    salt,
    expiresAt: Date.now() + 5 * 60 * 1000,
    lastSentAt: Date.now()
  });
  persistSmsState();
}

function forgetCode(phone) {
  smsCodes.delete(phone);
  persistSmsState();
}

function storedCodeMatches(phone, item, code) {
  if (!item?.codeHash || !item?.salt) return false;
  return item.codeHash === hashValue(`${item.salt}:${phone}:${code}`);
}

function percentEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

function aliyunSignedUrl(params, endpoint = "dysmsapi.aliyuncs.com") {
  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  const allParams = {
    ...params,
    AccessKeyId: accessKeyId,
    Format: "JSON",
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2017-05-25"
  };
  const canonical = Object.keys(allParams)
    .sort()
    .map(key => `${percentEncode(key)}=${percentEncode(allParams[key])}`)
    .join("&");
  const stringToSign = `GET&%2F&${percentEncode(canonical)}`;
  const signature = crypto
    .createHmac("sha1", `${accessKeySecret}&`)
    .update(stringToSign)
    .digest("base64");
  return `https://${endpoint}/?Signature=${percentEncode(signature)}&${canonical}`;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, response => {
        let raw = "";
        response.on("data", chunk => (raw += chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error("短信服务返回格式不正确"));
          }
        });
      })
      .on("error", reject);
  });
}

function normalizeApnsDeviceToken(value) {
  const token = String(value || "").trim().replace(/[<>{}\s-]/g, "").toLowerCase();
  return /^[a-f0-9]{32,512}$/.test(token) ? token : "";
}

function normalizedPushDevices(devices) {
  const seen = new Set();
  return (Array.isArray(devices) ? devices : [])
    .map(item => ({
      token: normalizeApnsDeviceToken(item?.token || item),
      platform: item?.platform === "ios" ? "ios" : "ios",
      updatedAt: String(item?.updatedAt || "")
    }))
    .filter(item => item.token && !seen.has(item.token) && Boolean(seen.add(item.token)))
    .slice(0, 8);
}

function apnsConfigured() {
  return Boolean(APNS_TEAM_ID && APNS_KEY_ID && APNS_BUNDLE_ID && (APNS_KEY_PATH || APNS_KEY_BASE64));
}

function getApnsPrivateKey() {
  if (apnsPrivateKey) return apnsPrivateKey;
  let key = "";
  if (APNS_KEY_BASE64) key = Buffer.from(APNS_KEY_BASE64, "base64").toString("utf8");
  else if (APNS_KEY_PATH) key = fs.readFileSync(path.resolve(APNS_KEY_PATH), "utf8");
  if (!key.includes("BEGIN PRIVATE KEY")) throw new Error("APNs 私钥格式无效");
  apnsPrivateKey = crypto.createPrivateKey(key);
  return apnsPrivateKey;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function apnsAuthorizationToken() {
  const now = Date.now();
  if (apnsJwtCache.token && now - apnsJwtCache.createdAt < 50 * 60 * 1000) return apnsJwtCache.token;
  const encodedHeader = base64Url(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }));
  const encodedClaims = base64Url(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(now / 1000) }));
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: getApnsPrivateKey(),
    dsaEncoding: "ieee-p1363"
  });
  const token = `${signingInput}.${signature.toString("base64url")}`;
  apnsJwtCache = { token, createdAt: now };
  return token;
}

function sendApnsNotification(deviceToken, payload) {
  return new Promise(resolve => {
    if (!apnsConfigured()) return resolve({ ok: false, skipped: true });
    const token = normalizeApnsDeviceToken(deviceToken);
    if (!token) return resolve({ ok: false, invalid: true, reason: "BadDeviceToken" });
    let client;
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      try { client?.close(); } catch {}
      resolve(result);
    };
    try {
      client = http2.connect(`https://${APNS_HOST}`);
      client.once("error", error => finish({ ok: false, reason: error.message || "APNs connection error" }));
      const request = client.request({
        ":method": "POST",
        ":path": `/3/device/${token}`,
        authorization: `bearer ${apnsAuthorizationToken()}`,
        "apns-topic": APNS_BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10"
      });
      let status = 0;
      let responseBody = "";
      request.setEncoding("utf8");
      request.on("response", headers => { status = Number(headers[":status"] || 0); });
      request.on("data", chunk => { responseBody += chunk; });
      request.on("end", () => {
        let reason = "";
        try { reason = JSON.parse(responseBody || "{}").reason || ""; } catch {}
        const invalid = status === 410 || ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(reason);
        finish({ ok: status >= 200 && status < 300, invalid, reason, status });
      });
      request.on("error", error => finish({ ok: false, reason: error.message || "APNs request error" }));
      request.end(JSON.stringify(payload));
    } catch (error) {
      finish({ ok: false, reason: error.message || "APNs setup error" });
    }
  });
}

function removeInvalidPushDevice(phone, deviceToken) {
  const token = normalizeApnsDeviceToken(deviceToken);
  if (!token || !phone) return;
  const db = readDatabase();
  const user = db.users?.[phone];
  if (!user) return;
  const devices = normalizedPushDevices(user.pushDevices);
  const next = devices.filter(item => item.token !== token);
  if (next.length === devices.length) return;
  user.pushDevices = next;
  user.updatedAt = new Date().toISOString();
  writeDatabase(db);
}

async function notifyCommunityMessage(db, message, sender, recipient) {
  if (!apnsConfigured() || !recipient) return;
  const devices = normalizedPushDevices(recipient.pushDevices);
  if (!devices.length) return;
  const unreadCount = (Array.isArray(db.messages) ? db.messages : [])
    .filter(item => item.toPhone === recipient.phone && !item.readAt)
    .length;
  const preview = communityMessagePreview(message) || "发来一条新消息";
  const payload = {
    aps: {
      alert: {
        title: sender?.accountName || maskPhone(sender?.phone || "") || "壳友",
        body: preview.slice(0, 120)
      },
      badge: Math.min(99, Math.max(1, unreadCount)),
      sound: "default"
    },
    senderId: communityUserId(sender?.phone || ""),
    route: "communityChat"
  };
  const results = await Promise.all(devices.map(item => sendApnsNotification(item.token, payload)));
  results.forEach((result, index) => {
    if (result.invalid) removeInvalidPushDevice(recipient.phone, devices[index].token);
    else if (!result.ok && !result.skipped) console.warn("APNs push failed:", result.reason || result.status || "unknown");
  });
}

function aliyunConfigured() {
  return Boolean(
    process.env.ALIYUN_ACCESS_KEY_ID &&
      process.env.ALIYUN_ACCESS_KEY_SECRET &&
      process.env.ALIYUN_SMS_SIGN_NAME &&
      process.env.ALIYUN_SMS_TEMPLATE_CODE
  );
}

function aliyunPnvsConfigured() {
  return Boolean(
    process.env.ALIYUN_ACCESS_KEY_ID &&
      process.env.ALIYUN_ACCESS_KEY_SECRET &&
      process.env.ALIYUN_SMS_SIGN_NAME &&
      process.env.ALIYUN_SMS_TEMPLATE_CODE
  );
}

async function sendAliyunSms(phone, code) {
  const paramKey = process.env.ALIYUN_SMS_TEMPLATE_PARAM_KEY || "code";
  const url = aliyunSignedUrl({
    Action: "SendSms",
    PhoneNumbers: phone,
    SignName: process.env.ALIYUN_SMS_SIGN_NAME,
    TemplateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE,
    TemplateParam: JSON.stringify({ [paramKey]: code })
  });
  const result = await requestJson(url);
  if (result.Code !== "OK") {
    throw new Error(result.Message || "短信发送失败");
  }
  return result;
}

function pnvsCommonParams(phone) {
  const params = {
    PhoneNumber: phone,
    CountryCode: process.env.ALIYUN_SMS_COUNTRY_CODE || "86"
  };
  if (process.env.ALIYUN_SMS_SCHEME_NAME) params.SchemeName = process.env.ALIYUN_SMS_SCHEME_NAME;
  return params;
}

async function sendAliyunPnvsSms(phone) {
  const paramKey = process.env.ALIYUN_SMS_TEMPLATE_PARAM_KEY || "code";
  const minutes = process.env.ALIYUN_SMS_TEMPLATE_MINUTES || "5";
  const templateParam = process.env.ALIYUN_SMS_TEMPLATE_PARAM_JSON
    ? process.env.ALIYUN_SMS_TEMPLATE_PARAM_JSON
    : JSON.stringify({ [paramKey]: "##code##", min: minutes });
  const url = aliyunSignedUrl(
    {
      Action: "SendSmsVerifyCode",
      ...pnvsCommonParams(phone),
      SignName: process.env.ALIYUN_SMS_SIGN_NAME,
      TemplateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE,
      TemplateParam: templateParam,
      CodeType: Number(process.env.ALIYUN_SMS_CODE_TYPE || 1),
      CodeLength: Number(process.env.ALIYUN_SMS_CODE_LENGTH || 6),
      ValidTime: Number(process.env.ALIYUN_SMS_VALID_TIME || 300),
      DuplicatePolicy: Number(process.env.ALIYUN_SMS_DUPLICATE_POLICY || 1),
      Interval: Number(process.env.ALIYUN_SMS_INTERVAL || 60),
      ReturnVerifyCode: process.env.ALIYUN_SMS_RETURN_VERIFY_CODE === "true",
      AutoRetry: Number(process.env.ALIYUN_SMS_AUTO_RETRY || 1)
    },
    "dypnsapi.aliyuncs.com"
  );
  const result = await requestJson(url);
  if (result.Code !== "OK" || result.Success === false) {
    throw new Error(result.Message || "号码认证短信发送失败");
  }
  return result;
}

async function checkAliyunPnvsSms(phone, code) {
  const url = aliyunSignedUrl(
    {
      Action: "CheckSmsVerifyCode",
      ...pnvsCommonParams(phone),
      VerifyCode: code,
      CaseAuthPolicy: Number(process.env.ALIYUN_SMS_CASE_AUTH_POLICY || 1)
    },
    "dypnsapi.aliyuncs.com"
  );
  const result = await requestJson(url);
  if (result.Code !== "OK" || result.Success === false) {
    throw new Error(result.Message || "号码认证验证码核验失败");
  }
  return result.Model && result.Model.VerifyResult === "PASS";
}

async function handleSendSms(req, res) {
  const body = await readJson(req);
  const phone = String(body.phone || "").trim();
  if (!validPhone(phone)) return sendJson(res, 400, { ok: false, message: "手机号格式不正确" });
  if (body.purpose === "register") {
    const db = readDatabase();
    if (db.users[phone]) return sendJson(res, 409, { ok: false, message: "手机号已注册，请直接登录" });
  }
  const previous = smsCodes.get(phone);
  if (previous && Date.now() - previous.lastSentAt < 60 * 1000) {
    return sendJson(res, 429, { ok: false, message: "验证码发送太频繁，请稍后再试" });
  }

  const code = makeCode();
  if (process.env.SMS_PROVIDER === "aliyun-pnvs" && aliyunPnvsConfigured() && process.env.SMS_MOCK !== "true") {
    await sendAliyunPnvsSms(phone);
    storeCode(phone, "__aliyun_pnvs__");
    return sendJson(res, 200, { ok: true, mode: "aliyun-pnvs", expiresIn: Number(process.env.ALIYUN_SMS_VALID_TIME || 300) });
  }

  if (process.env.SMS_PROVIDER === "aliyun" && aliyunConfigured() && process.env.SMS_MOCK !== "true") {
    await sendAliyunSms(phone, code);
    storeCode(phone, code);
    return sendJson(res, 200, { ok: true, mode: "aliyun", expiresIn: 300 });
  }

  storeCode(phone, code);
  return sendJson(res, 200, { ok: true, mode: "mock", code, expiresIn: 300 });
}

async function handleVerifySms(req, res) {
  const body = await readJson(req);
  const phone = String(body.phone || "").trim();
  const code = String(body.code || "").trim();
  if (process.env.SMS_PROVIDER === "aliyun-pnvs" && aliyunPnvsConfigured() && process.env.SMS_MOCK !== "true") {
    if (!validPhone(phone)) return sendJson(res, 400, { ok: false, message: "手机号格式不正确" });
    if (!code) return sendJson(res, 400, { ok: false, message: "请输入验证码" });
    const passed = await checkAliyunPnvsSms(phone, code);
    if (!passed) return sendJson(res, 400, { ok: false, message: "验证码不正确" });
    forgetCode(phone);
    rememberVerifiedPhone(phone);
    return sendJson(res, 200, { ok: true });
  }

  const item = smsCodes.get(phone);
  if (!item) return sendJson(res, 400, { ok: false, message: "请先获取验证码" });
  if (Date.now() > item.expiresAt) {
    forgetCode(phone);
    return sendJson(res, 400, { ok: false, message: "验证码已过期" });
  }
  if (!storedCodeMatches(phone, item, code)) return sendJson(res, 400, { ok: false, message: "验证码不正确" });
  forgetCode(phone);
  rememberVerifiedPhone(phone);
  return sendJson(res, 200, { ok: true });
}

async function verifyRegistrationCode(phone, code) {
  if (hasVerifiedPhone(phone)) return;
  if (!code) throw new Error("请输入验证码");

  const item = smsCodes.get(phone);
  if (!item) throw new Error("请先获取验证码");
  if (Date.now() > Number(item.expiresAt || 0)) {
    forgetCode(phone);
    throw new Error("验证码已过期，请重新获取");
  }

  if (process.env.SMS_PROVIDER === "aliyun-pnvs" && aliyunPnvsConfigured() && process.env.SMS_MOCK !== "true") {
    const passed = await checkAliyunPnvsSms(phone, code);
    if (!passed) throw new Error("验证码不正确");
    return;
  }

  if (!storedCodeMatches(phone, item, code)) throw new Error("验证码不正确");
}

async function handleRegister(req, res) {
  const body = await readJson(req);
  const phone = String(body.phone || "").trim();
  const password = String(body.password || "");
  const code = String(body.code || "").trim();
  if (!validPhone(phone)) return sendJson(res, 400, { ok: false, message: "手机号格式不正确" });
  if (password.length < 6) return sendJson(res, 400, { ok: false, message: "密码至少需要 6 位" });
  if (body.termsAccepted !== true) return sendJson(res, 400, { ok: false, message: "请先阅读并同意服务规则和隐私政策" });

  const db = readDatabase();
  if (db.users[phone]) return sendJson(res, 409, { ok: false, message: "手机号已注册，请直接登录" });
  try {
    await verifyRegistrationCode(phone, code);
  } catch (error) {
    return sendJson(res, 400, { ok: false, message: error.message || "验证码核对失败" });
  }

  const passwordInfo = hashPassword(password);
  const token = makeAuthToken();
  const now = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    phone,
    passwordSalt: passwordInfo.salt,
    passwordHash: passwordInfo.hash,
    accountName: String(body.accountName || "").trim() || maskPhone(phone),
    accountAvatar: "",
    data: normalizeAccountData(body.data || {}),
    termsAcceptedAt: now,
    termsVersion: POLICY_VERSION,
    tokens: [{ hash: hashValue(token), createdAt: now }],
    createdAt: now,
    updatedAt: now
  };
  db.users[phone] = user;
  writeDatabase(db);
  verifiedPhones.delete(phone);
  forgetCode(phone);
  return sendJson(res, 200, { ok: true, user: publicUser(user, token) });
}

async function handleLogin(req, res) {
  const body = await readJson(req);
  const phone = String(body.phone || "").trim();
  const password = String(body.password || "");
  if (!validPhone(phone)) return sendJson(res, 400, { ok: false, message: "手机号格式不正确" });
  const db = readDatabase();
  const user = db.users[phone];
  if (!user || !verifyPassword(password, user)) {
    return sendJson(res, 401, { ok: false, message: "手机号或密码不正确" });
  }
  const token = makeAuthToken();
  const now = new Date().toISOString();
  user.tokens = [...(Array.isArray(user.tokens) ? user.tokens : []), { hash: hashValue(token), createdAt: now }].slice(-5);
  user.updatedAt = now;
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, user: publicUser(user, token) });
}

async function handleLoadAccount(req, res) {
  const body = await readJson(req);
  const phone = String(body.phone || "").trim();
  const token = String(body.token || "");
  const db = readDatabase();
  const user = authenticate(db, phone, token);
  if (!user) return sendJson(res, 401, { ok: false, message: "登录已过期，请重新登录" });
  return sendJson(res, 200, { ok: true, user: publicUser(user, token) });
}

async function handleSaveAccount(req, res) {
  const body = await readJson(req);
  const phone = String(body.phone || "").trim();
  const token = String(body.token || "");
  const db = readDatabase();
  const user = authenticate(db, phone, token);
  if (!user) return sendJson(res, 401, { ok: false, message: "登录已过期，请重新登录" });
  user.accountName = String(body.accountName || "").trim() || user.accountName || maskPhone(phone);
  user.accountAvatar = String(body.accountAvatar || "");
  user.data = normalizeAccountData(body.data || {});
  user.updatedAt = new Date().toISOString();
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, user: publicUser(user, token) });
}

async function handleAcceptTerms(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  if (body.accepted !== true) return sendJson(res, 400, { ok: false, message: "请先确认已阅读服务规则和隐私政策" });
  user.termsAcceptedAt = new Date().toISOString();
  user.termsVersion = POLICY_VERSION;
  user.updatedAt = user.termsAcceptedAt;
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, user: publicUser(user, String(body.token || "")) });
}

function trimPublicText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function publicReviewAuthor(user) {
  return {
    name: user.accountName || maskPhone(user.phone),
    phone: maskPhone(user.phone),
    avatar: user.accountAvatar || ""
  };
}

function isAdminUser(user) {
  return user?.phone === REVIEW_ADMIN_PHONE;
}

function publicReviews(db, viewer) {
  const admin = isAdminUser(viewer);
  return (Array.isArray(db.reviews) ? db.reviews : [])
    .filter(review => admin || review.authorPhoneRaw === viewer?.phone)
    .map(review => ({
      id: review.id,
      rating: Number(review.rating || 5),
      comment: review.comment || "",
      authorName: review.authorName || "壳友",
      authorPhone: review.authorPhone || "",
      authorAvatar: review.authorAvatar || "",
      createdAt: review.createdAt,
      canDelete: admin || review.authorPhoneRaw === viewer?.phone,
      comments: (Array.isArray(review.comments) ? review.comments : []).map(item => ({
        id: item.id,
        content: item.content || "",
        authorName: item.authorName || "壳友",
        authorPhone: item.authorPhone || "",
        authorAvatar: item.authorAvatar || "",
        createdAt: item.createdAt,
        canDelete: admin || item.authorPhoneRaw === viewer?.phone
      }))
    }));
}

function requireReviewUser(db, body, res) {
  const phone = String(body.phone || "").trim();
  const token = String(body.token || "");
  const user = authenticate(db, phone, token);
  if (!user) {
    sendJson(res, 401, { ok: false, message: "请先登录账号" });
    return null;
  }
  return user;
}

function optionalReviewUser(db, body) {
  const phone = String(body.phone || "").trim();
  const token = String(body.token || "");
  return phone && token ? authenticate(db, phone, token) : null;
}

async function handlePushDeviceRegister(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const deviceToken = normalizeApnsDeviceToken(body.deviceToken);
  if (!deviceToken) return sendJson(res, 400, { ok: false, message: "通知设备信息无效" });
  const now = new Date().toISOString();
  // A physical iPhone may be used by a different account after logout. Keep the
  // token with exactly one user so messages are never delivered to the old one.
  Object.values(db.users || {}).forEach(account => {
    const devices = normalizedPushDevices(account.pushDevices);
    account.pushDevices = devices.filter(item => item.token !== deviceToken);
  });
  user.pushDevices = [
    ...normalizedPushDevices(user.pushDevices),
    { token: deviceToken, platform: "ios", updatedAt: now }
  ].filter((item, index, list) => list.findIndex(other => other.token === item.token) === index).slice(-8);
  user.updatedAt = now;
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, registered: true });
}

async function handlePushDeviceUnregister(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const deviceToken = normalizeApnsDeviceToken(body.deviceToken);
  if (deviceToken) user.pushDevices = normalizedPushDevices(user.pushDevices).filter(item => item.token !== deviceToken);
  user.updatedAt = new Date().toISOString();
  writeDatabase(db);
  return sendJson(res, 200, { ok: true });
}

async function handlePushNotificationTest(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  if (!isAdminUser(user)) return sendJson(res, 403, { ok: false, message: "仅平台管理员可发送推送测试" });
  if (!apnsConfigured()) {
    return sendJson(res, 503, { ok: false, message: "服务器尚未完成 Apple 推送密钥配置" });
  }
  const devices = normalizedPushDevices(user.pushDevices);
  if (!devices.length) {
    return sendJson(res, 400, { ok: false, message: "当前设备尚未注册通知。请使用真机登录并允许通知后重试" });
  }
  const payload = {
    aps: {
      alert: { title: "壳友手账", body: "这是一条推送通知实机测试消息。" },
      badge: 1,
      sound: "default"
    },
    route: "messages",
    test: "push"
  };
  const delayMs = Math.min(10_000, Math.max(0, Number(body.delayMs || 0)));
  const deliver = async () => {
    const results = await Promise.all(devices.map(item => sendApnsNotification(item.token, payload)));
    results.forEach((result, index) => {
      if (result.invalid) removeInvalidPushDevice(user.phone, devices[index].token);
    });
    const delivered = results.filter(item => item.ok).length;
    if (!delivered) {
      const reason = results.find(item => item.reason)?.reason || "Apple 推送服务未接受请求";
      console.warn("APNs test push failed:", reason);
    } else {
      console.log(`APNs test push accepted for ${delivered} device(s).`);
    }
    return { delivered, results };
  };
  if (delayMs) {
    setTimeout(() => { void deliver(); }, delayMs);
    return sendJson(res, 200, {
      ok: true,
      message: `测试通知将在 ${Math.ceil(delayMs / 1000)} 秒后发送，请立即把 App 切到后台。`
    });
  }
  const result = await deliver();
  if (!result.delivered) {
    const reason = result.results.find(item => item.reason)?.reason || "Apple 推送服务未接受请求";
    return sendJson(res, 502, { ok: false, message: `测试通知未送达：${reason}` });
  }
  return sendJson(res, 200, { ok: true, message: `已向 ${result.delivered} 台本机设备发送测试通知。` });
}

function parseImageDataUrl(value) {
  const dataUrl = String(value || "");
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const type = match[1].toLowerCase();
  const ext = type === "jpeg" || type === "jpg" ? "jpg" : type;
  const base64 = match[2].replace(/\s/g, "");
  if (!base64) return null;
  const buffer = Buffer.from(base64, "base64");
  const mime = mimeTypes[`.${ext}`] || "application/octet-stream";
  return { buffer, ext, mime };
}

function cleanUploadKind(value) {
  return String(value || "image")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24) || "image";
}

async function handleUploadImage(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;

  const image = parseImageDataUrl(body.image);
  if (!image) return sendJson(res, 400, { ok: false, message: "图片格式不正确" });
  if (image.buffer.length > MAX_UPLOAD_BYTES) {
    return sendJson(res, 413, { ok: false, message: "图片太大，请重新选择较小图片" });
  }

  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const kind = cleanUploadKind(body.kind);
  const folder = path.resolve(UPLOAD_DIR, year, month);
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${kind}.${image.ext}`;
  const target = path.resolve(folder, filename);

  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(target, image.buffer);

  return sendJson(res, 200, {
    ok: true,
    url: `/uploads/${year}/${month}/${filename}`
  });
}

function parseMediaDataUrl(value) {
  const dataUrl = String(value || "");
  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp)|video\/(?:mp4|webm|quicktime|x-m4v));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, "");
  if (!base64) return null;
  const ext = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : mime.includes("quicktime") ? "mov" : mime.includes("x-m4v") ? "m4v" : mime.split("/")[1];
  return { buffer: Buffer.from(base64, "base64"), ext, mime, mediaType: mime.startsWith("video/") ? "video" : "image" };
}

async function handleUploadMedia(req, res) {
  const requestType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (requestType && requestType !== "application/json") return await handleUploadMediaStream(req, res, requestType);
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const media = parseMediaDataUrl(body.media);
  if (!media) return sendJson(res, 400, { ok: false, message: "仅支持 JPG、PNG、WebP、MP4、WebM 或 MOV" });
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const folder = path.resolve(UPLOAD_DIR, year, month);
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-community.${media.ext}`;
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.resolve(folder, filename), media.buffer);
  return sendJson(res, 200, { ok: true, url: `/uploads/${year}/${month}/${filename}`, mediaType: media.mediaType });
}

function streamMediaInfo(mime) {
  const types = {
    "image/jpeg": { ext: "jpg", mediaType: "image" },
    "image/png": { ext: "png", mediaType: "image" },
    "image/webp": { ext: "webp", mediaType: "image" },
    "video/mp4": { ext: "mp4", mediaType: "video" },
    "video/x-m4v": { ext: "m4v", mediaType: "video" },
    "video/webm": { ext: "webm", mediaType: "video" },
    "video/quicktime": { ext: "mov", mediaType: "video" }
  };
  return types[mime] || null;
}

function handleUploadMediaStream(req, res, mime) {
  return new Promise(resolve => {
    const db = readDatabase();
    const user = requireReviewUser(db, {
      phone: req.headers["x-auth-phone"],
      token: req.headers["x-auth-token"]
    }, res);
    if (!user) {
      req.resume();
      resolve();
      return;
    }
    const media = streamMediaInfo(mime);
    if (!media) {
      req.resume();
      sendJson(res, 400, { ok: false, message: "仅支持 JPG、PNG、WebP、MP4、WebM 或 MOV" });
      resolve();
      return;
    }
    const duration = Number(req.headers["x-media-duration"] || 0);
    if (media.mediaType === "video" && (!Number.isFinite(duration) || duration <= 0 || duration > 30)) {
      req.resume();
      sendJson(res, 400, { ok: false, message: "视频时长不能超过30秒" });
      resolve();
      return;
    }
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const folder = path.resolve(UPLOAD_DIR, year, month);
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-media.${media.ext}`;
    const target = path.resolve(folder, filename);
    fs.mkdirSync(folder, { recursive: true });
    const output = fs.createWriteStream(target, { flags: "wx" });
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      if (!output.destroyed) output.destroy();
      fs.rm(target, { force: true }, () => {});
      if (!res.headersSent) sendJson(res, 500, { ok: false, message: "视频上传失败，请重试" });
      resolve();
    };
    req.on("aborted", fail);
    req.on("error", fail);
    output.on("error", fail);
    output.on("finish", () => {
      if (!res.headersSent) sendJson(res, 200, {
        ok: true,
        url: `/uploads/${year}/${month}/${filename}`,
        mediaType: media.mediaType
      });
      finish();
    });
    req.pipe(output);
  });
}

async function handleListReviews(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  return sendJson(res, 200, { ok: true, reviews: publicReviews(db, user), isAdmin: isAdminUser(user) });
}

async function handleCreateReview(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const rating = Math.max(1, Math.min(5, Number(body.rating || 5)));
  const comment = trimPublicText(body.comment, 800);
  if (!comment) return sendJson(res, 400, { ok: false, message: "请填写评价内容" });
  const author = publicReviewAuthor(user);
  const review = {
    id: crypto.randomUUID(),
    rating,
    comment,
    authorName: author.name,
    authorPhone: author.phone,
    authorPhoneRaw: user.phone,
    authorAvatar: author.avatar,
    comments: [],
    createdAt: new Date().toISOString()
  };
  db.reviews = [review, ...(Array.isArray(db.reviews) ? db.reviews : [])];
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, review, reviews: publicReviews(db, user) });
}

async function handleCreateReviewComment(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const reviewId = String(body.reviewId || "");
  const content = trimPublicText(body.content, 500);
  if (!content) return sendJson(res, 400, { ok: false, message: "请填写评论内容" });
  const reviews = Array.isArray(db.reviews) ? db.reviews : [];
  const review = reviews.find(item => item.id === reviewId);
  if (!review) return sendJson(res, 404, { ok: false, message: "评价不存在" });
  if (!isAdminUser(user) && review.authorPhoneRaw !== user.phone) return sendJson(res, 403, { ok: false, message: "没有权限评论这条评价" });
  const author = publicReviewAuthor(user);
  review.comments = [
    {
      id: crypto.randomUUID(),
      content,
      authorName: author.name,
      authorPhone: author.phone,
      authorPhoneRaw: user.phone,
      authorAvatar: author.avatar,
      createdAt: new Date().toISOString()
    },
    ...(Array.isArray(review.comments) ? review.comments : [])
  ];
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, reviews: publicReviews(db, user) });
}

async function handleDeleteReview(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const reviewId = String(body.reviewId || "");
  const reviews = Array.isArray(db.reviews) ? db.reviews : [];
  const review = reviews.find(item => item.id === reviewId);
  if (!review) return sendJson(res, 404, { ok: false, message: "评价不存在" });
  if (!isAdminUser(user) && review.authorPhoneRaw !== user.phone) return sendJson(res, 403, { ok: false, message: "没有权限删除这条评价" });
  db.reviews = reviews.filter(item => item.id !== reviewId);
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, reviews: publicReviews(db, user) });
}

async function handleDeleteReviewComment(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const reviewId = String(body.reviewId || "");
  const commentId = String(body.commentId || "");
  const review = (Array.isArray(db.reviews) ? db.reviews : []).find(item => item.id === reviewId);
  if (!review) return sendJson(res, 404, { ok: false, message: "评价不存在" });
  const comment = (Array.isArray(review.comments) ? review.comments : []).find(item => item.id === commentId);
  if (!comment) return sendJson(res, 404, { ok: false, message: "评论不存在" });
  if (!isAdminUser(user) && comment.authorPhoneRaw !== user.phone) return sendJson(res, 403, { ok: false, message: "没有权限删除这条评论" });
  review.comments = (Array.isArray(review.comments) ? review.comments : []).filter(item => item.id !== commentId);
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, reviews: publicReviews(db, user) });
}

function publicFeedbackAuthor(user) {
  return {
    name: user.accountName || maskPhone(user.phone),
    phone: maskPhone(user.phone),
    avatar: user.accountAvatar || ""
  };
}

function publicFeedbackItems(db, viewer) {
  const admin = isAdminUser(viewer);
  return (Array.isArray(db.feedbacks) ? db.feedbacks : []).map(item => {
    const likes = Array.isArray(item.likes) ? item.likes : [];
    return {
      id: item.id,
      type: item.type || "反馈",
      content: item.content || "",
      authorName: item.authorName || "壳友",
      authorPhone: item.authorPhone || "",
      authorAvatar: item.authorAvatar || "",
      createdAt: item.createdAt,
      likeCount: likes.length,
      liked: likes.includes(viewer?.phone),
      canDelete: admin || item.authorPhoneRaw === viewer?.phone,
      comments: (Array.isArray(item.comments) ? item.comments : []).map(comment => ({
        id: comment.id,
        content: comment.content || "",
        authorName: comment.authorName || "壳友",
        authorPhone: comment.authorPhone || "",
        authorAvatar: comment.authorAvatar || "",
        createdAt: comment.createdAt,
        canDelete: admin || comment.authorPhoneRaw === viewer?.phone
      }))
    };
  });
}

async function handleListFeedback(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  return sendJson(res, 200, { ok: true, feedbacks: publicFeedbackItems(db, user), isAdmin: isAdminUser(user) });
}

async function handleCreateFeedback(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const type = trimPublicText(body.type, 30) || "反馈";
  const content = trimPublicText(body.content, 1200);
  if (!content) return sendJson(res, 400, { ok: false, message: "请填写反馈内容" });
  const author = publicFeedbackAuthor(user);
  const feedback = {
    id: crypto.randomUUID(),
    type,
    content,
    authorName: author.name,
    authorPhone: author.phone,
    authorPhoneRaw: user.phone,
    authorAvatar: author.avatar,
    likes: [],
    comments: [],
    createdAt: new Date().toISOString()
  };
  db.feedbacks = [feedback, ...(Array.isArray(db.feedbacks) ? db.feedbacks : [])];
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, feedbacks: publicFeedbackItems(db, user) });
}

async function handleToggleFeedbackLike(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const feedbackId = String(body.feedbackId || "");
  const feedback = (Array.isArray(db.feedbacks) ? db.feedbacks : []).find(item => item.id === feedbackId);
  if (!feedback) return sendJson(res, 404, { ok: false, message: "反馈不存在" });
  const likes = Array.isArray(feedback.likes) ? feedback.likes : [];
  feedback.likes = likes.includes(user.phone) ? likes.filter(phone => phone !== user.phone) : [...likes, user.phone];
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, feedbacks: publicFeedbackItems(db, user) });
}

async function handleCreateFeedbackComment(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const feedbackId = String(body.feedbackId || "");
  const content = trimPublicText(body.content, 600);
  if (!content) return sendJson(res, 400, { ok: false, message: "请填写评论内容" });
  const feedback = (Array.isArray(db.feedbacks) ? db.feedbacks : []).find(item => item.id === feedbackId);
  if (!feedback) return sendJson(res, 404, { ok: false, message: "反馈不存在" });
  const author = publicFeedbackAuthor(user);
  feedback.comments = [
    ...(Array.isArray(feedback.comments) ? feedback.comments : []),
    {
      id: crypto.randomUUID(),
      content,
      authorName: author.name,
      authorPhone: author.phone,
      authorPhoneRaw: user.phone,
      authorAvatar: author.avatar,
      createdAt: new Date().toISOString()
    }
  ];
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, feedbacks: publicFeedbackItems(db, user) });
}

async function handleDeleteFeedback(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const feedbackId = String(body.feedbackId || "");
  const feedbacks = Array.isArray(db.feedbacks) ? db.feedbacks : [];
  const feedback = feedbacks.find(item => item.id === feedbackId);
  if (!feedback) return sendJson(res, 404, { ok: false, message: "反馈不存在" });
  if (!isAdminUser(user) && feedback.authorPhoneRaw !== user.phone) return sendJson(res, 403, { ok: false, message: "没有权限删除这条反馈" });
  db.feedbacks = feedbacks.filter(item => item.id !== feedbackId);
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, feedbacks: publicFeedbackItems(db, user) });
}

async function handleDeleteFeedbackComment(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const feedbackId = String(body.feedbackId || "");
  const commentId = String(body.commentId || "");
  const feedback = (Array.isArray(db.feedbacks) ? db.feedbacks : []).find(item => item.id === feedbackId);
  if (!feedback) return sendJson(res, 404, { ok: false, message: "反馈不存在" });
  const comment = (Array.isArray(feedback.comments) ? feedback.comments : []).find(item => item.id === commentId);
  if (!comment) return sendJson(res, 404, { ok: false, message: "评论不存在" });
  if (!isAdminUser(user) && comment.authorPhoneRaw !== user.phone) return sendJson(res, 403, { ok: false, message: "没有权限删除这条评论" });
  feedback.comments = (Array.isArray(feedback.comments) ? feedback.comments : []).filter(item => item.id !== commentId);
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, feedbacks: publicFeedbackItems(db, user) });
}

function communityUserId(phone) {
  return hashValue(`community:${phone}`).slice(0, 20);
}

function communityUserById(db, id) {
  return Object.values(db.users || {}).find(user => communityUserId(user.phone) === String(id || ""));
}

function friendshipKey(phoneA, phoneB) {
  return [String(phoneA), String(phoneB)].sort().join(":");
}

function communityMessagePreview(message) {
  if (!message) return "";
  const content = String(message.content || message.text || message.message || "").trim();
  if (content) return content;
  if (message.marketListing?.title || message.marketListing?.speciesName) {
    return `咨询商品：${message.marketListing.title || message.marketListing.speciesName}`;
  }
  return message.mediaUrl ? (message.mediaType === "video" ? "[视频]" : "[图片]") : "";
}

function marketChatListingSnapshot(db, listingId, sellerPhone = "") {
  const listing = (Array.isArray(db.marketListings) ? db.marketListings : [])
    .find(item => item.id === String(listingId || ""));
  if (!listing || (sellerPhone && listing.sellerPhoneRaw !== sellerPhone)) return null;
  const status = ["active", "inactive", "sold"].includes(listing.status) ? listing.status : "active";
  const seller = db.users?.[listing.sellerPhoneRaw];
  const mediaItems = (Array.isArray(listing.mediaItems) ? listing.mediaItems : [])
    .slice(0, 9)
    .map(media => ({
      url: String(media?.url || ""),
      posterUrl: String(media?.posterUrl || media?.poster || ""),
      type: media?.type === "video" ? "video" : "image"
    }))
    .filter(media => media.url);
  const primaryMedia = mediaItems[0] || {
    url: String(listing.photoUrl || ""),
    posterUrl: "",
    type: "image"
  };
  return {
    id: listing.id,
    turtleId: listing.turtleId || "",
    title: listing.title || listing.speciesName || "龟集市商品",
    speciesCode: listing.speciesCode || "",
    speciesName: listing.speciesName || "",
    stage: listing.stage || "hatchling",
    gender: listing.gender || "未知",
    weight: listing.weight || "",
    shellLength: listing.shellLength || "",
    price: Math.max(0, Number(listing.price || 0)),
    negotiable: Boolean(listing.negotiable),
    city: listing.city || "",
    delivery: listing.delivery || "",
    description: listing.description || "",
    viewCount: Math.max(0, Number(listing.viewCount || 0)),
    wantCount: (Array.isArray(listing.wantedPhones) ? listing.wantedPhones : []).length,
    mediaUrl: primaryMedia.url || "",
    mediaPosterUrl: primaryMedia.posterUrl || "",
    mediaType: primaryMedia.type === "video" ? "video" : "image",
    photoUrl: listing.photoUrl || primaryMedia.url || "",
    mediaItems,
    status,
    unavailable: status !== "active",
    unavailableReason: status === "sold" ? "sold" : "offline",
    sellerId: communityUserId(listing.sellerPhoneRaw),
    sellerName: seller?.accountName || listing.sellerName || "壳友卖家",
    sellerAvatar: seller?.accountAvatar || listing.sellerAvatar || ""
  };
}

function resolveCommunityChatListing(db, snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const listingId = String(snapshot.id || "");
  if (!listingId) return { ...snapshot, unavailable: true, unavailableReason: "removed", status: "removed" };
  const current = marketChatListingSnapshot(db, listingId);
  if (current) return current;
  return {
    ...snapshot,
    status: "removed",
    unavailable: true,
    unavailableReason: "removed"
  };
}

function communityConversationMessages(db, phoneA, phoneB) {
  return (Array.isArray(db.messages) ? db.messages : [])
    .filter(item => [item.fromPhone, item.toPhone].includes(phoneA) && [item.fromPhone, item.toPhone].includes(phoneB))
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .map(item => {
      const rawContent = String(item.content || item.text || item.message || "").trim();
      const marketListing = resolveCommunityChatListing(db, item.marketListing);
      return {
        id: item.id,
        content: communityMessagePreview(item),
        rawContent,
        mediaUrl: item.mediaUrl || "",
        posterUrl: item.posterUrl || "",
        mediaType: item.mediaType === "video" ? "video" : "image",
        mine: item.fromPhone === phoneA,
        createdAt: item.createdAt,
        marketListing,
        marketReferenceOnly: Boolean(marketListing && !rawContent && !item.mediaUrl)
      };
    });
}

function latestConversationMarketListing(messages = []) {
  return [...messages].reverse().find(item => item.marketListing)?.marketListing || null;
}

function communityFriends(db, viewer) {
  const links = Array.isArray(db.friendships) ? db.friendships : [];
  const messages = Array.isArray(db.messages) ? db.messages : [];
  const contactPhones = new Set();
  links
    .filter(item => item.phones?.includes(viewer.phone))
    .forEach(item => item.phones.filter(phone => phone !== viewer.phone).forEach(phone => contactPhones.add(phone)));
  messages.forEach(message => {
    if (message.fromPhone === viewer.phone && message.toPhone) contactPhones.add(message.toPhone);
    if (message.toPhone === viewer.phone && message.fromPhone) contactPhones.add(message.fromPhone);
  });
  return [...contactPhones]
    .map(phone => {
      const user = db.users?.[phone];
      const lastMessage = messages
        .filter(message => (message.fromPhone === phone && message.toPhone === viewer.phone) || (message.fromPhone === viewer.phone && message.toPhone === phone))
        .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))[0];
      return user ? {
        id: communityUserId(phone),
        name: user.accountName || maskPhone(phone),
        avatar: user.accountAvatar || "",
        phone: maskPhone(phone),
        unreadCount: messages.filter(message => message.fromPhone === phone && message.toPhone === viewer.phone && !message.readAt).length,
        lastMessage: communityMessagePreview(lastMessage),
        lastMessageAt: lastMessage?.createdAt || "",
        createdAt: links.find(item => item.phones?.includes(viewer.phone) && item.phones?.includes(phone))?.createdAt || lastMessage?.createdAt || ""
      } : null;
    })
    .filter(Boolean)
    .sort((left, right) => new Date(right.lastMessageAt || right.createdAt || 0) - new Date(left.lastMessageAt || left.createdAt || 0));
}

function isFollowingCommunityUser(db, followerPhone, targetPhone) {
  return (Array.isArray(db.follows) ? db.follows : []).some(item => item.followerPhone === followerPhone && item.targetPhone === targetPhone);
}

function followedCommunityUsers(db, viewer) {
  return (Array.isArray(db.follows) ? db.follows : [])
    .filter(item => item.followerPhone === viewer.phone)
    .slice()
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
    .map(item => {
      const user = db.users?.[item.targetPhone];
      if (!user) return null;
      return {
        id: communityUserId(item.targetPhone),
        name: user.accountName || maskPhone(item.targetPhone),
        avatar: user.accountAvatar || "",
        postCount: (Array.isArray(db.communityPosts) ? db.communityPosts : []).filter(post => post.authorPhoneRaw === item.targetPhone).length,
        listingCount: (Array.isArray(db.marketListings) ? db.marketListings : []).filter(listing => listing.sellerPhoneRaw === item.targetPhone && listing.status !== "sold").length,
        followedAt: item.createdAt
      };
    })
    .filter(Boolean);
}

function isCommunityFriend(db, phoneA, phoneB) {
  const key = friendshipKey(phoneA, phoneB);
  return (Array.isArray(db.friendships) ? db.friendships : []).some(item => item.key === key);
}

function hasCommunityConversation(db, phoneA, phoneB) {
  return (Array.isArray(db.messages) ? db.messages : []).some(item =>
    (item.fromPhone === phoneA && item.toPhone === phoneB) ||
    (item.fromPhone === phoneB && item.toPhone === phoneA)
  );
}

function publicCommunityPosts(db, viewer = null) {
  const viewerPhone = viewer?.phone || "";
  return (Array.isArray(db.communityPosts) ? db.communityPosts : [])
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map(item => {
      const author = db.users?.[item.authorPhoneRaw];
      const likes = Array.isArray(item.likes) ? item.likes : [];
      return {
        id: item.id,
        content: item.content || "",
        mediaUrl: item.mediaUrl || "",
        mediaType: item.mediaType || "",
        location: item.location || "",
        mentions: item.mentions || "",
        visibility: item.visibility || "public",
        authorId: communityUserId(item.authorPhoneRaw),
        authorName: author?.accountName || item.authorName || "壳友",
        authorAvatar: author?.accountAvatar || item.authorAvatar || "",
        createdAt: item.createdAt,
        likeCount: likes.length,
        liked: Boolean(viewerPhone && likes.includes(viewerPhone)),
        isOwn: Boolean(viewerPhone && item.authorPhoneRaw === viewerPhone),
        followed: Boolean(viewerPhone && item.authorPhoneRaw !== viewerPhone && isFollowingCommunityUser(db, viewerPhone, item.authorPhoneRaw)),
        isFriend: Boolean(viewerPhone && item.authorPhoneRaw !== viewerPhone && isCommunityFriend(db, viewerPhone, item.authorPhoneRaw)),
        comments: (Array.isArray(item.comments) ? item.comments : []).map(comment => ({
          id: comment.id,
          content: comment.content || "",
          authorName: db.users?.[comment.authorPhoneRaw]?.accountName || comment.authorName || "壳友",
          authorAvatar: db.users?.[comment.authorPhoneRaw]?.accountAvatar || comment.authorAvatar || "",
          createdAt: comment.createdAt
        }))
      };
    });
}

function communityProfileStats(db, user) {
  if (!user?.phone) return { receivedLikes: 0, followerCount: 0 };
  const receivedLikes = (Array.isArray(db.communityPosts) ? db.communityPosts : [])
    .filter(post => post.authorPhoneRaw === user.phone)
    .reduce((total, post) => total + (Array.isArray(post.likes) ? post.likes.length : 0), 0);
  const followerCount = (Array.isArray(db.follows) ? db.follows : [])
    .filter(item => item.targetPhone === user.phone)
    .length;
  return { receivedLikes, followerCount };
}

async function handleCommunityList(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = optionalReviewUser(db, body);
  return sendJson(res, 200, {
    ok: true,
    posts: publicCommunityPosts(db, user),
    friends: user ? communityFriends(db, user) : [],
    profileStats: communityProfileStats(db, user),
    isAdmin: isAdminUser(user)
  });
}

async function handleCommunityCreate(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const content = trimPublicText(body.content, 1200);
  const mediaUrl = trimPublicText(body.mediaUrl, 800);
  const posterUrl = trimPublicText(body.posterUrl, 800);
  const mediaType = ["image", "video"].includes(body.mediaType) ? body.mediaType : "";
  const location = trimPublicText(body.location, 100);
  const mentions = trimPublicText(body.mentions, 200);
  const visibility = "public";
  if (!content && !mediaUrl) return sendJson(res, 400, { ok: false, message: "请填写内容或选择图片、视频" });
  const post = {
    id: crypto.randomUUID(),
    content,
    mediaUrl,
    posterUrl,
    mediaType,
    location,
    mentions,
    visibility,
    authorPhoneRaw: user.phone,
    authorName: user.accountName || maskPhone(user.phone),
    authorAvatar: user.accountAvatar || "",
    likes: [],
    comments: [],
    createdAt: new Date().toISOString()
  };
  db.communityPosts = [post, ...(Array.isArray(db.communityPosts) ? db.communityPosts : [])];
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, posts: publicCommunityPosts(db, user), friends: communityFriends(db, user) });
}

async function handleCommunityLike(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const post = (Array.isArray(db.communityPosts) ? db.communityPosts : []).find(item => item.id === String(body.postId || ""));
  if (!post) return sendJson(res, 404, { ok: false, message: "动态不存在" });
  const likes = Array.isArray(post.likes) ? post.likes : [];
  post.likes = likes.includes(user.phone) ? likes.filter(phone => phone !== user.phone) : [...likes, user.phone];
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, posts: publicCommunityPosts(db, user) });
}

async function handleCommunityComment(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const post = (Array.isArray(db.communityPosts) ? db.communityPosts : []).find(item => item.id === String(body.postId || ""));
  const content = trimPublicText(body.content, 500);
  if (!post) return sendJson(res, 404, { ok: false, message: "动态不存在" });
  if (!content) return sendJson(res, 400, { ok: false, message: "请输入评论" });
  post.comments = [...(Array.isArray(post.comments) ? post.comments : []), {
    id: crypto.randomUUID(),
    content,
    authorPhoneRaw: user.phone,
    authorName: user.accountName || maskPhone(user.phone),
    authorAvatar: user.accountAvatar || "",
    createdAt: new Date().toISOString()
  }];
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, posts: publicCommunityPosts(db, user) });
}

async function handleCommunityDelete(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const postId = String(body.postId || "");
  const post = (Array.isArray(db.communityPosts) ? db.communityPosts : []).find(item => item.id === postId);
  if (!post) return sendJson(res, 404, { ok: false, message: "动态不存在" });
  if (post.authorPhoneRaw !== user.phone && !isAdminUser(user)) return sendJson(res, 403, { ok: false, message: "只能删除自己的动态" });
  db.communityPosts = db.communityPosts.filter(item => item.id !== postId);
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, posts: publicCommunityPosts(db, user) });
}

const CONTENT_REPORT_REASONS = {
  illegal_wildlife: "疑似违法野生动物或来源不明",
  fraud: "虚假信息、诈骗或误导交易",
  animal_welfare: "健康、运输或动物福利风险",
  infringement: "侵权或泄露个人信息",
  abuse: "辱骂、骚扰或不当内容",
  other: "其他问题"
};

function reportedContent(db, targetType, targetId) {
  const type = targetType === "market" ? "market" : "community";
  if (type === "market") {
    const item = (Array.isArray(db.marketListings) ? db.marketListings : []).find(listing => listing.id === targetId);
    return item ? {
      type,
      id: item.id,
      ownerPhone: item.sellerPhoneRaw,
      title: item.title || item.speciesName || "龟集市商品"
    } : null;
  }
  const item = (Array.isArray(db.communityPosts) ? db.communityPosts : []).find(post => post.id === targetId);
  return item ? {
    type,
    id: item.id,
    ownerPhone: item.authorPhoneRaw,
    title: trimPublicText(item.content || (item.mediaUrl ? "含图片或视频的壳友圈动态" : "壳友圈动态"), 120)
  } : null;
}

function publicContentReports(db) {
  return (Array.isArray(db.reports) ? db.reports : [])
    .slice()
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
    .slice(0, 300)
    .map(report => {
      const target = reportedContent(db, report.targetType, report.targetId);
      const reporter = db.users?.[report.reporterPhone];
      return {
        id: report.id,
        targetType: report.targetType === "market" ? "market" : "community",
        targetId: report.targetId,
        targetTitle: report.targetTitle || target?.title || "内容已删除",
        targetExists: Boolean(target),
        reason: report.reason,
        reasonLabel: CONTENT_REPORT_REASONS[report.reason] || CONTENT_REPORT_REASONS.other,
        detail: report.detail || "",
        status: ["pending", "resolved", "removed"].includes(report.status) ? report.status : "pending",
        reporterName: reporter?.accountName || maskPhone(report.reporterPhone),
        createdAt: report.createdAt,
        processedAt: report.processedAt || ""
      };
    });
}

async function handleContentReportCreate(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const targetType = body.targetType === "market" ? "market" : "community";
  const targetId = trimPublicText(body.targetId, 100);
  const reason = trimPublicText(body.reason, 40);
  const detail = trimPublicText(body.detail, 500);
  if (!targetId || !CONTENT_REPORT_REASONS[reason]) return sendJson(res, 400, { ok: false, message: "请选择有效的举报原因" });
  const target = reportedContent(db, targetType, targetId);
  if (!target) return sendJson(res, 404, { ok: false, message: "举报内容不存在或已删除" });
  if (target.ownerPhone === user.phone) return sendJson(res, 400, { ok: false, message: "不能举报自己发布的内容" });
  db.reports = Array.isArray(db.reports) ? db.reports : [];
  const duplicate = db.reports.find(item => item.reporterPhone === user.phone && item.targetType === targetType && item.targetId === targetId && item.status === "pending");
  if (duplicate) return sendJson(res, 409, { ok: false, message: "该内容已提交举报，请等待审核" });
  db.reports.unshift({
    id: crypto.randomUUID(),
    targetType,
    targetId,
    targetTitle: target.title,
    targetOwnerPhone: target.ownerPhone,
    reporterPhone: user.phone,
    reason,
    detail,
    status: "pending",
    createdAt: new Date().toISOString(),
    processedAt: "",
    processedBy: ""
  });
  db.reports = db.reports.slice(0, 2000);
  writeDatabase(db);
  return sendJson(res, 200, { ok: true });
}

async function handleContentReportList(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  if (!isAdminUser(user)) return sendJson(res, 403, { ok: false, message: "无权查看举报审核" });
  return sendJson(res, 200, { ok: true, reports: publicContentReports(db) });
}

async function handleContentReportAction(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  if (!isAdminUser(user)) return sendJson(res, 403, { ok: false, message: "无权处理举报" });
  const report = (Array.isArray(db.reports) ? db.reports : []).find(item => item.id === String(body.reportId || ""));
  if (!report) return sendJson(res, 404, { ok: false, message: "举报记录不存在" });
  const action = body.action === "remove" ? "remove" : "resolve";
  if (action === "remove") {
    if (report.targetType === "market") {
      const listing = (Array.isArray(db.marketListings) ? db.marketListings : []).find(item => item.id === report.targetId);
      if (listing) {
        listing.status = "inactive";
        listing.offlineAt = new Date().toISOString();
        listing.offlineReason = "report";
      }
    } else {
      db.communityPosts = (Array.isArray(db.communityPosts) ? db.communityPosts : []).filter(item => item.id !== report.targetId);
    }
  }
  report.status = action === "remove" ? "removed" : "resolved";
  report.processedAt = new Date().toISOString();
  report.processedBy = user.phone;
  writeDatabase(db);
  return sendJson(res, 200, {
    ok: true,
    reports: publicContentReports(db),
    posts: publicCommunityPosts(db, user),
    listings: publicMarketListings(db, user)
  });
}

async function handleCommunityFollowToggle(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const target = communityUserById(db, body.userId);
  if (!target || target.phone === user.phone) return sendJson(res, 400, { ok: false, message: "无法关注该用户" });
  db.follows = Array.isArray(db.follows) ? db.follows : [];
  const followed = isFollowingCommunityUser(db, user.phone, target.phone);
  db.follows = followed
    ? db.follows.filter(item => !(item.followerPhone === user.phone && item.targetPhone === target.phone))
    : [...db.follows, { followerPhone: user.phone, targetPhone: target.phone, createdAt: new Date().toISOString() }];
  writeDatabase(db);
  return sendJson(res, 200, {
    ok: true,
    followed: !followed,
    posts: publicCommunityPosts(db, user),
    listings: publicMarketListings(db, user),
    following: followedCommunityUsers(db, user)
  });
}

async function handleCommunityFollowingList(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const following = followedCommunityUsers(db, user);
  const followedIds = new Set(following.map(item => item.id));
  return sendJson(res, 200, {
    ok: true,
    following,
    posts: publicCommunityPosts(db, user).filter(item => followedIds.has(item.authorId)),
    listings: publicMarketListings(db, user).filter(item => followedIds.has(item.sellerId))
  });
}

async function handleCommunityUserProfile(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const viewer = optionalReviewUser(db, body);
  const target = communityUserById(db, body.userId);
  if (!target) return sendJson(res, 404, { ok: false, message: "壳友不存在或已注销" });
  const targetId = communityUserId(target.phone);
  const posts = publicCommunityPosts(db, viewer).filter(item => item.authorId === targetId);
  const listings = publicMarketListings(db, viewer).filter(item => item.sellerId === targetId && item.status === "active");
  return sendJson(res, 200, {
    ok: true,
    user: {
      id: targetId,
      name: target.accountName || maskPhone(target.phone),
      avatar: target.accountAvatar || "",
      postCount: posts.length,
      listingCount: listings.length,
      followed: Boolean(viewer && viewer.phone !== target.phone && isFollowingCommunityUser(db, viewer.phone, target.phone)),
      isOwn: Boolean(viewer && viewer.phone === target.phone)
    },
    posts,
    listings
  });
}

async function handleCommunityChatList(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const target = communityUserById(db, body.userId);
  if (!target || target.phone === user.phone) return sendJson(res, 400, { ok: false, message: "无法与该用户聊天" });
  db.messages = Array.isArray(db.messages) ? db.messages : [];
  let readStateChanged = false;
  const readAt = new Date().toISOString();
  db.messages.forEach(item => {
    if (item.fromPhone === target.phone && item.toPhone === user.phone && !item.readAt) {
      item.readAt = readAt;
      readStateChanged = true;
    }
  });
  if (readStateChanged) writeDatabase(db);
  const messages = communityConversationMessages(db, user.phone, target.phone);
  return sendJson(res, 200, {
    ok: true,
    friend: { id: communityUserId(target.phone), name: target.accountName || maskPhone(target.phone), avatar: target.accountAvatar || "" },
    messages,
    marketListing: latestConversationMarketListing(messages)
  });
}

async function handleCommunityChatSend(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const target = communityUserById(db, body.userId);
  const content = trimPublicText(body.content, 1000);
  const mediaUrl = trimPublicText(body.mediaUrl, 800);
  const posterUrl = trimPublicText(body.posterUrl, 800);
  const mediaType = mediaUrl && body.mediaType === "video" ? "video" : "image";
  const marketListingId = trimPublicText(body.marketListingId, 100);
  if (!target || target.phone === user.phone) return sendJson(res, 400, { ok: false, message: "无法与该用户聊天" });
  const marketListing = marketListingId ? marketChatListingSnapshot(db, marketListingId, target.phone) : null;
  if (marketListingId && !marketListing) return sendJson(res, 400, { ok: false, message: "商品信息无效" });
  if (!content && !mediaUrl && !marketListing) return sendJson(res, 400, { ok: false, message: "请输入消息" });
  const message = {
    id: crypto.randomUUID(),
    fromPhone: user.phone,
    toPhone: target.phone,
    content,
    mediaUrl,
    posterUrl,
    mediaType,
    marketListing,
    readAt: "",
    createdAt: new Date().toISOString()
  };
  db.messages = [...(Array.isArray(db.messages) ? db.messages : []), message].slice(-5000);
  writeDatabase(db);
  // Send asynchronously so a temporary APNs issue never delays the chat itself.
  void notifyCommunityMessage(db, message, user, target);
  const messages = communityConversationMessages(db, user.phone, target.phone);
  return sendJson(res, 200, {
    ok: true,
    friend: { id: communityUserId(target.phone), name: target.accountName || maskPhone(target.phone), avatar: target.accountAvatar || "" },
    messages,
    marketListing: latestConversationMarketListing(messages)
  });
}

async function handleCommunityUnread(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const unreadCount = (Array.isArray(db.messages) ? db.messages : [])
    .filter(item => item.toPhone === user.phone && !item.readAt)
    .length;
  return sendJson(res, 200, { ok: true, unreadCount, friends: communityFriends(db, user) });
}

const MARKET_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function marketListingView(db, item, viewer = null) {
  const viewerPhone = viewer?.phone || "";
  const seller = db.users?.[item.sellerPhoneRaw];
  return {
    id: item.id,
    turtleId: item.turtleId || "",
    title: item.title || "",
    speciesCode: item.speciesCode || "",
    speciesName: item.speciesName || "",
    stage: item.stage || "hatchling",
    gender: item.gender || "未知",
    weight: item.weight || "",
    shellLength: item.shellLength || "",
    price: Number(item.price || 0),
    negotiable: Boolean(item.negotiable),
    city: item.city || "",
    delivery: item.delivery || "",
    description: item.description || "",
    viewCount: Math.max(0, Number(item.viewCount || 0)),
    wantCount: (Array.isArray(item.wantedPhones) ? item.wantedPhones : []).length,
    photoUrl: item.photoUrl || "",
    mediaItems: (Array.isArray(item.mediaItems) ? item.mediaItems : []).slice(0, 9).map(media => ({
      url: media.url || "",
      posterUrl: media.posterUrl || media.poster || "",
      type: media.type === "video" ? "video" : "image"
    })),
    status: ["active", "inactive", "sold"].includes(item.status) ? item.status : "active",
    refreshedAt: item.refreshedAt || item.createdAt || "",
    offlineAt: item.offlineAt || "",
    offlineReason: item.offlineReason || "",
    sellerId: communityUserId(item.sellerPhoneRaw),
    sellerName: seller?.accountName || item.sellerName || "壳友卖家",
    sellerAvatar: seller?.accountAvatar || item.sellerAvatar || "",
    isOwn: Boolean(viewerPhone && item.sellerPhoneRaw === viewerPhone),
    sellerFollowed: Boolean(viewerPhone && item.sellerPhoneRaw !== viewerPhone && isFollowingCommunityUser(db, viewerPhone, item.sellerPhoneRaw)),
    isFriend: Boolean(viewerPhone && item.sellerPhoneRaw !== viewerPhone && isCommunityFriend(db, viewerPhone, item.sellerPhoneRaw)),
    createdAt: item.createdAt
  };
}

function autoOfflineStaleMarketListings(db, now = Date.now()) {
  let changed = false;
  (Array.isArray(db.marketListings) ? db.marketListings : []).forEach(listing => {
    if ((listing.status || "active") !== "active") return;
    const refreshedAt = Date.parse(listing.refreshedAt || listing.createdAt || "");
    if (!Number.isFinite(refreshedAt) || now - refreshedAt < MARKET_REFRESH_WINDOW_MS) return;
    listing.status = "inactive";
    listing.offlineReason = "stale";
    listing.offlineAt = new Date(now).toISOString();
    changed = true;
  });
  return changed;
}

function autoOfflineRestrictedMarketListings(db, now = Date.now()) {
  let changed = false;
  (Array.isArray(db.marketListings) ? db.marketListings : []).forEach(listing => {
    if ((listing.status || "active") !== "active") return;
    if (!isMarketProhibitedSpecies(listing.speciesCode, listing.speciesName)) return;
    listing.status = "inactive";
    listing.offlineReason = "restricted_species";
    listing.offlineAt = new Date(now).toISOString();
    changed = true;
  });
  return changed;
}

function publicMarketListings(db, viewer = null) {
  return (Array.isArray(db.marketListings) ? db.marketListings : [])
    .filter(item => (item.status || "active") === "active")
    .slice()
    .sort((a, b) => new Date(b.refreshedAt || b.createdAt || 0) - new Date(a.refreshedAt || a.createdAt || 0))
    .map(item => marketListingView(db, item, viewer));
}

function ownMarketListings(db, user) {
  if (!user) return [];
  return (Array.isArray(db.marketListings) ? db.marketListings : [])
    .filter(item => item.sellerPhoneRaw === user.phone && item.status !== "sold")
    .slice()
    .sort((a, b) => new Date(b.refreshedAt || b.createdAt || 0) - new Date(a.refreshedAt || a.createdAt || 0))
    .map(item => marketListingView(db, item, user));
}

async function handleMarketList(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = optionalReviewUser(db, body);
  let accountData = null;
  let changed = autoOfflineStaleMarketListings(db);
  if (autoOfflineRestrictedMarketListings(db)) changed = true;
  if (user) {
    user.data = normalizeAccountData(user.data || {});
    (Array.isArray(db.marketListings) ? db.marketListings : [])
      .filter(item => item.sellerPhoneRaw === user.phone && item.status === "sold")
      .forEach(listing => {
        const records = user.data.ledgerRecords || [];
        const linked = records.find(item => item.marketListingId === listing.id)
          || (listing.turtleId ? records.find(item => item.type === "sold" && item.turtleId === listing.turtleId) : null);
        if (linked) return;
        syncMarketListingToLedger(user, listing, "sold");
        changed = true;
      });
    if (changed) {
      user.updatedAt = new Date().toISOString();
      writeDatabase(db);
      accountData = normalizeAccountData(user.data || {});
    }
  }
  if (changed && !user) writeDatabase(db);
  const keyword = trimPublicText(body.keyword, 80).toLowerCase();
  const stage = ["hatchling", "juvenile", "adult"].includes(body.stage) ? body.stage : "all";
  const regionCities = [...new Set((Array.isArray(body.regionCities) ? body.regionCities : [])
    .map(city => trimPublicText(city, 24))
    .filter(Boolean))].slice(0, 60);
  const requestedSavedIds = [...new Set((Array.isArray(body.savedListingIds) ? body.savedListingIds : [])
    .map(id => trimPublicText(id, 100))
    .filter(Boolean))].slice(0, 500);
  const allListings = publicMarketListings(db, user).filter(item => {
    if (stage !== "all" && item.stage !== stage) return false;
    if (regionCities.length && !regionCities.includes(String(item.city || "").trim())) return false;
    if (!keyword) return true;
    return `${item.title || ""} ${item.speciesName || ""} ${item.city || ""}`.toLowerCase().includes(keyword);
  });
  const offset = Math.max(0, Math.floor(Number(body.offset || 0)));
  const requestedLimit = body.all === true ? Math.max(8, allListings.length) : Number(body.limit || 8);
  const limit = Math.min(200, Math.max(1, Math.floor(requestedLimit)));
  const listings = allListings.slice(offset, offset + limit);
  const savedIds = user ? new Set([
    ...(Array.isArray(user.data?.marketHistoryIds) ? user.data.marketHistoryIds : []),
    ...(Array.isArray(user.data?.marketFavoriteIds) ? user.data.marketFavoriteIds : [])
  ].map(String)) : new Set();
  const savedListings = requestedSavedIds.length && savedIds.size
    ? (Array.isArray(db.marketListings) ? db.marketListings : [])
      .filter(item => requestedSavedIds.includes(String(item.id || "")) && savedIds.has(String(item.id || "")))
      .map(item => marketListingView(db, item, user))
    : [];
  const nextOffset = offset + listings.length;
  return sendJson(res, 200, {
    ok: true,
    listings,
    savedListings,
    hasMore: nextOffset < allListings.length,
    nextOffset,
    total: allListings.length,
    myListings: ownMarketListings(db, user),
    accountData
  });
}

async function handleMarketCreate(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const title = trimPublicText(body.title, 40);
  const species = resolveMarketSpecies(body.speciesCode, body.speciesName);
  if (!species) return sendJson(res, 400, { ok: false, message: "请从品种库中选择品种" });
  if (isMarketProhibitedSpecies(species.code, species.name)) return sendJson(res, 400, { ok: false, message: marketSpeciesRestrictionMessage() });
  const speciesName = species.name;
  const mediaItems = (Array.isArray(body.mediaItems) ? body.mediaItems : [])
    .slice(0, 9)
    .map(media => ({
      url: trimPublicText(media?.url, 800),
      posterUrl: trimPublicText(media?.posterUrl || media?.poster, 800),
      type: media?.type === "video" ? "video" : "image"
    }))
    .filter(media => media.url);
  const price = Number(body.price || 0);
  if (!title || !speciesName || !Number.isFinite(price) || price < 0) return sendJson(res, 400, { ok: false, message: "请填写正确的标题、品种和价格" });
  const listing = {
    id: crypto.randomUUID(),
    turtleId: trimPublicText(body.turtleId, 100),
    title,
    speciesCode: species.code,
    speciesName,
    stage: ["hatchling", "juvenile", "adult"].includes(body.stage) ? body.stage : "hatchling",
    gender: ["公", "母", "未知"].includes(body.gender) ? body.gender : "未知",
    weight: trimPublicText(body.weight, 20),
    shellLength: trimPublicText(body.shellLength, 20),
    price,
    negotiable: Boolean(body.negotiable),
    city: trimPublicText(body.city, 24),
    delivery: ["可快递", "仅自提", "可面交"].includes(body.delivery) ? body.delivery : "双方协商",
    description: trimPublicText(body.description, 600),
    photoUrl: mediaItems[0]?.url || trimPublicText(body.photoUrl, 800),
    mediaItems,
    viewCount: 0,
    wantedPhones: [],
    status: "active",
    sellerPhoneRaw: user.phone,
    sellerName: user.accountName || maskPhone(user.phone),
    sellerAvatar: user.accountAvatar || "",
    createdAt: new Date().toISOString(),
    refreshedAt: new Date().toISOString(),
    offlineAt: "",
    offlineReason: ""
  };
  db.marketListings = [listing, ...(Array.isArray(db.marketListings) ? db.marketListings : [])];
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, listings: publicMarketListings(db, user), myListings: ownMarketListings(db, user) });
}

function marketRecordDate() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(item => [item.type, item.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function marketLedgerPhoto(listing) {
  const mediaItems = Array.isArray(listing.mediaItems) ? listing.mediaItems : [];
  const image = mediaItems.find(item => item?.type !== "video" && item?.url)?.url;
  return image || (!mediaItems.length ? (listing.photoUrl || "") : "");
}

function marketLedgerSnapshot(listing, turtle = null) {
  if (turtle) return { ...turtle };
  return {
    id: listing.turtleId || "",
    code: listing.title || listing.speciesName || "龟集市商品",
    speciesCode: listing.speciesCode || "",
    speciesName: listing.speciesName || "未填写品种",
    gender: listing.gender || "未知",
    weight: listing.weight || "",
    carapaceLength: listing.shellLength || "",
    status: "已转让",
    health: "",
    source: "龟集市",
    price: Number(listing.price || 0),
    photo: marketLedgerPhoto(listing),
    createdAt: listing.createdAt || new Date().toISOString(),
    measureHistory: []
  };
}

function syncMarketListingToLedger(owner, listing, status) {
  owner.data = normalizeAccountData(owner.data || {});
  const records = Array.isArray(owner.data.ledgerRecords) ? owner.data.ledgerRecords : [];
  const turtles = Array.isArray(owner.data.turtles) ? owner.data.turtles : [];
  const soldPriceValue = Number(listing.soldPrice);
  const soldPrice = Number.isFinite(soldPriceValue) && soldPriceValue >= 0 ? soldPriceValue : Number(listing.price || 0);
  const saleMethod = MARKET_SALE_METHODS.includes(listing.saleMethod) ? listing.saleMethod : "未填写";
  const linkedTurtle = listing.turtleId ? turtles.find(item => item.id === listing.turtleId) : null;
  const linkedRecord = records.find(item => item.marketListingId === listing.id)
    || (listing.turtleId ? records.find(item => item.type === "sold" && item.turtleId === listing.turtleId) : null);

  if (status === "sold") {
    let record = linkedRecord;
    if (!record) {
      const snapshot = marketLedgerSnapshot(listing, linkedTurtle);
      record = {
        id: listing.ledgerRecordId || crypto.randomUUID(),
        type: "sold",
        turtleId: listing.turtleId || "",
        title: linkedTurtle
          ? `${linkedTurtle.code || "未命名"} · ${linkedTurtle.speciesName || "未填写品种"}`
          : (listing.title || listing.speciesName || "龟集市商品"),
        amount: soldPrice,
        recordDate: marketRecordDate(),
        weight: listing.weight || linkedTurtle?.weight || "",
        carapaceLength: listing.shellLength || linkedTurtle?.carapaceLength || "",
        carapaceWidth: linkedTurtle?.carapaceWidth || "",
        shellHeight: linkedTurtle?.shellHeight || "",
        plastronLength: linkedTurtle?.plastronLength || "",
        note: `成交方式：${saleMethod}；由龟集市标记已售自动生成`,
        saleMethod,
        photo: marketLedgerPhoto(listing) || linkedTurtle?.photo || "",
        turtleSnapshot: snapshot,
        marketListingId: listing.id,
        autoMarketRecord: true,
        createdAt: new Date().toISOString()
      };
      owner.data.ledgerRecords = [record, ...records];
    } else {
      if (!record.marketListingId) record.marketListingId = listing.id;
      if (record.autoMarketRecord) {
        record.amount = soldPrice;
        record.saleMethod = saleMethod;
        record.note = `成交方式：${saleMethod}；由龟集市标记已售自动生成`;
      }
    }
    listing.ledgerRecordId = record.id;
    if (listing.turtleId && linkedTurtle) {
      owner.data.turtles = turtles.filter(item => item.id !== listing.turtleId);
    }
    owner.data.activityLogs = [{
      id: crypto.randomUUID(),
      text: `龟集市已售自动记账：${record.title}，${saleMethod}，成交价 ${Number(record.amount || 0).toFixed(2)} 元`,
      type: "账本",
      createdAt: new Date().toISOString()
    }, ...(owner.data.activityLogs || [])];
    return record;
  }

  const autoRecord = records.find(item => item.marketListingId === listing.id && item.autoMarketRecord);
  if (autoRecord) {
    owner.data.ledgerRecords = records.filter(item => item.id !== autoRecord.id);
    const snapshot = autoRecord.turtleSnapshot;
    if (listing.turtleId && snapshot && !turtles.some(item => item.id === listing.turtleId)) {
      owner.data.turtles = [{ ...snapshot }, ...turtles];
    }
  }
  owner.data.activityLogs = [{
    id: crypto.randomUUID(),
    text: `龟集市恢复在售：${listing.title || listing.speciesName || "商品"}`,
    type: "账本",
    createdAt: new Date().toISOString()
  }, ...(owner.data.activityLogs || [])];
  return null;
}

async function handleMarketRefresh(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const listing = (Array.isArray(db.marketListings) ? db.marketListings : []).find(item => item.id === String(body.listingId || ""));
  if (!listing) return sendJson(res, 404, { ok: false, message: "商品不存在" });
  if (listing.sellerPhoneRaw !== user.phone && !isAdminUser(user)) return sendJson(res, 403, { ok: false, message: "只能刷新自己的商品" });
  if (listing.status === "sold") return sendJson(res, 400, { ok: false, message: "已售商品不能刷新" });
  if (isMarketProhibitedSpecies(listing.speciesCode, listing.speciesName)) return sendJson(res, 400, { ok: false, message: marketSpeciesRestrictionMessage() });
  listing.status = "active";
  listing.refreshedAt = new Date().toISOString();
  listing.offlineAt = "";
  listing.offlineReason = "";
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, listings: publicMarketListings(db, user), myListings: ownMarketListings(db, user), refreshedAt: listing.refreshedAt });
}

async function handleMarketOffline(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const listing = (Array.isArray(db.marketListings) ? db.marketListings : []).find(item => item.id === String(body.listingId || ""));
  if (!listing) return sendJson(res, 404, { ok: false, message: "商品不存在" });
  if (listing.sellerPhoneRaw !== user.phone && !isAdminUser(user)) return sendJson(res, 403, { ok: false, message: "只能下架自己的商品" });
  if (listing.status === "sold") return sendJson(res, 400, { ok: false, message: "已售商品不能下架" });
  listing.status = "inactive";
  listing.offlineReason = "manual";
  listing.offlineAt = new Date().toISOString();
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, listings: publicMarketListings(db, user), myListings: ownMarketListings(db, user) });
}

async function handleMarketUpdate(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const listing = (Array.isArray(db.marketListings) ? db.marketListings : []).find(item => item.id === String(body.listingId || ""));
  if (!listing) return sendJson(res, 404, { ok: false, message: "商品不存在" });
  if (listing.sellerPhoneRaw !== user.phone && !isAdminUser(user)) return sendJson(res, 403, { ok: false, message: "只能编辑自己的商品" });
  if (listing.status === "sold") return sendJson(res, 400, { ok: false, message: "已售商品不能编辑" });
  const title = trimPublicText(body.title, 40);
  const species = resolveMarketSpecies(body.speciesCode, body.speciesName);
  if (!species) return sendJson(res, 400, { ok: false, message: "请从品种库中选择品种" });
  if (isMarketProhibitedSpecies(species.code, species.name)) return sendJson(res, 400, { ok: false, message: marketSpeciesRestrictionMessage() });
  const speciesName = species.name;
  const price = Number(body.price || 0);
  const mediaItems = (Array.isArray(body.mediaItems) ? body.mediaItems : [])
    .slice(0, 9)
    .map(media => ({
      url: trimPublicText(media?.url, 800),
      posterUrl: trimPublicText(media?.posterUrl || media?.poster, 800),
      type: media?.type === "video" ? "video" : "image"
    }))
    .filter(media => media.url);
  if (!title || !speciesName || !Number.isFinite(price) || price < 0 || !mediaItems.length) {
    return sendJson(res, 400, { ok: false, message: "请填写正确的商品信息并保留至少一项实拍媒体" });
  }
  Object.assign(listing, {
    turtleId: trimPublicText(body.turtleId, 100),
    title,
    speciesCode: species.code,
    speciesName,
    stage: ["hatchling", "juvenile", "adult"].includes(body.stage) ? body.stage : "hatchling",
    gender: ["公", "母", "未知"].includes(body.gender) ? body.gender : "未知",
    weight: trimPublicText(body.weight, 20),
    shellLength: trimPublicText(body.shellLength, 20),
    price,
    negotiable: Boolean(body.negotiable),
    city: trimPublicText(body.city, 24),
    delivery: ["可快递", "仅自提", "可面交"].includes(body.delivery) ? body.delivery : "双方协商",
    description: trimPublicText(body.description, 600),
    photoUrl: mediaItems[0].url,
    mediaItems,
    status: "active",
    refreshedAt: new Date().toISOString(),
    offlineAt: "",
    offlineReason: ""
  });
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, listings: publicMarketListings(db, user), myListings: ownMarketListings(db, user) });
}

async function handleMarketStatus(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const listing = (Array.isArray(db.marketListings) ? db.marketListings : []).find(item => item.id === String(body.listingId || ""));
  if (!listing) return sendJson(res, 404, { ok: false, message: "商品不存在" });
  if (listing.sellerPhoneRaw !== user.phone && !isAdminUser(user)) return sendJson(res, 403, { ok: false, message: "只能修改自己的商品" });
  const status = body.status === "sold" ? "sold" : "active";
  const saleMethod = trimPublicText(body.saleMethod, 20);
  const salePrice = Number(body.salePrice);
  if (status === "sold" && !MARKET_SALE_METHODS.includes(saleMethod)) {
    return sendJson(res, 400, { ok: false, message: "请选择成交方式" });
  }
  if (status === "sold" && (!Number.isFinite(salePrice) || salePrice < 0)) {
    return sendJson(res, 400, { ok: false, message: "请填写正确的成交价格" });
  }
  if (status === "active" && isMarketProhibitedSpecies(listing.speciesCode, listing.speciesName)) {
    return sendJson(res, 400, { ok: false, message: marketSpeciesRestrictionMessage() });
  }
  const previousStatus = listing.status === "sold" ? "sold" : "active";
  listing.status = status;
  if (status === "sold") {
    listing.saleMethod = saleMethod;
    listing.soldPrice = salePrice;
    listing.soldAt = new Date().toISOString();
  } else {
    listing.saleMethod = "";
    listing.soldPrice = "";
    listing.soldAt = "";
    listing.refreshedAt = new Date().toISOString();
    listing.offlineAt = "";
    listing.offlineReason = "";
  }
  const owner = db.users?.[listing.sellerPhoneRaw] || (listing.sellerPhoneRaw === user.phone ? user : null);
  let ledgerRecord = null;
  if (owner && previousStatus !== status) {
    ledgerRecord = syncMarketListingToLedger(owner, listing, status);
    owner.updatedAt = new Date().toISOString();
  }
  writeDatabase(db);
  return sendJson(res, 200, {
    ok: true,
    listings: publicMarketListings(db, user),
    myListings: ownMarketListings(db, user),
    ledgerRecord,
    accountData: owner?.phone === user.phone ? normalizeAccountData(owner.data || {}) : null
  });
}

async function handleMarketView(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const listing = (Array.isArray(db.marketListings) ? db.marketListings : [])
    .find(item => item.id === String(body.listingId || ""));
  if (!listing) return sendJson(res, 404, { ok: false, message: "商品不存在" });
  listing.viewCount = Math.max(0, Number(listing.viewCount || 0)) + 1;
  writeDatabase(db);
  return sendJson(res, 200, {
    ok: true,
    listingId: listing.id,
    viewCount: listing.viewCount,
    wantCount: (Array.isArray(listing.wantedPhones) ? listing.wantedPhones : []).length
  });
}

async function handleMarketWant(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const listing = (Array.isArray(db.marketListings) ? db.marketListings : [])
    .find(item => item.id === String(body.listingId || ""));
  if (!listing) return sendJson(res, 404, { ok: false, message: "商品不存在" });
  listing.wantedPhones = Array.isArray(listing.wantedPhones) ? listing.wantedPhones : [];
  if (listing.sellerPhoneRaw !== user.phone && !listing.wantedPhones.includes(user.phone)) {
    listing.wantedPhones.push(user.phone);
    writeDatabase(db);
  }
  return sendJson(res, 200, {
    ok: true,
    listingId: listing.id,
    viewCount: Math.max(0, Number(listing.viewCount || 0)),
    wantCount: listing.wantedPhones.length
  });
}

async function handleMarketDelete(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const listingId = String(body.listingId || "");
  const listing = (Array.isArray(db.marketListings) ? db.marketListings : []).find(item => item.id === listingId);
  if (!listing) return sendJson(res, 404, { ok: false, message: "商品不存在" });
  if (listing.sellerPhoneRaw !== user.phone && !isAdminUser(user)) return sendJson(res, 403, { ok: false, message: "只能删除自己的商品" });
  db.marketListings = db.marketListings.filter(item => item.id !== listingId);
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, listings: publicMarketListings(db, user) });
}

function serveStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const target = path.resolve(STATIC_ROOT, `.${pathname}`);
  if (!target.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(target, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(target).toLowerCase();
    const contentType = pathname === "/.well-known/apple-app-site-association"
      ? "application/json"
      : (mimeTypes[ext] || "application/octet-stream");
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
}

function handleAppVersion(req, res) {
  return sendJson(res, 200, {
    ok: true,
    minimumBuild: MIN_SUPPORTED_APP_BUILD,
    latestBuild: LATEST_APP_BUILD,
    appStoreUrl: IOS_APP_STORE_URL,
    message: "壳友手账已更新，请先更新到最新版本后再继续使用。"
  });
}

function serveUpload(req, res, url) {
  const pathname = decodeURIComponent(url.pathname).replace(/^\/uploads\/?/, "");
  const target = path.resolve(UPLOAD_DIR, pathname);
  const relative = path.relative(UPLOAD_DIR, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(target, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(target).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    const cacheControl = [".html", ".js", ".css", ".json"].includes(ext)
      ? "no-cache"
      : "public, max-age=31536000, immutable";
    const headers = {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "Access-Control-Allow-Origin": "*",
      "Accept-Ranges": "bytes"
    };
    const fileSize = stats.size;
    const range = String(req.headers.range || "").match(/^bytes=(\d*)-(\d*)$/i);
    if (range && fileSize > 0) {
      let start = range[1] ? Number(range[1]) : 0;
      let end = range[2] ? Number(range[2]) : fileSize - 1;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= fileSize || end < start) {
        res.writeHead(416, { ...headers, "Content-Range": `bytes */${fileSize}` });
        res.end();
        return;
      }
      end = Math.min(end, fileSize - 1);
      const length = end - start + 1;
      res.writeHead(206, {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": length
      });
      if (req.method === "HEAD") return res.end();
      const stream = fs.createReadStream(target, { start, end });
      stream.on("error", () => res.destroy());
      stream.pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, "Content-Length": fileSize });
    if (req.method === "HEAD") return res.end();
    const stream = fs.createReadStream(target);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });
  try {
    if (req.method === "GET" && url.pathname === "/api/app/version") return handleAppVersion(req, res);
    if (req.method === "POST" && url.pathname === "/api/sms/send") return await handleSendSms(req, res);
    if (req.method === "POST" && url.pathname === "/api/sms/verify") return await handleVerifySms(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/register") return await handleRegister(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/login") return await handleLogin(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/load") return await handleLoadAccount(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/save") return await handleSaveAccount(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/terms/accept") return await handleAcceptTerms(req, res);
    if (req.method === "POST" && url.pathname === "/api/notifications/device/register") return await handlePushDeviceRegister(req, res);
    if (req.method === "POST" && url.pathname === "/api/notifications/device/unregister") return await handlePushDeviceUnregister(req, res);
    if (req.method === "POST" && url.pathname === "/api/notifications/test") return await handlePushNotificationTest(req, res);
    if (req.method === "POST" && url.pathname === "/api/upload/image") return await handleUploadImage(req, res);
    if (req.method === "POST" && url.pathname === "/api/upload/media") return await handleUploadMedia(req, res);
    if (req.method === "POST" && url.pathname === "/api/reviews/list") return await handleListReviews(req, res);
    if (req.method === "POST" && url.pathname === "/api/reviews/create") return await handleCreateReview(req, res);
    if (req.method === "POST" && url.pathname === "/api/reviews/comment") return await handleCreateReviewComment(req, res);
    if (req.method === "POST" && url.pathname === "/api/reviews/delete") return await handleDeleteReview(req, res);
    if (req.method === "POST" && url.pathname === "/api/reviews/comment/delete") return await handleDeleteReviewComment(req, res);
    if (req.method === "POST" && url.pathname === "/api/feedback/list") return await handleListFeedback(req, res);
    if (req.method === "POST" && url.pathname === "/api/feedback/create") return await handleCreateFeedback(req, res);
    if (req.method === "POST" && url.pathname === "/api/feedback/like") return await handleToggleFeedbackLike(req, res);
    if (req.method === "POST" && url.pathname === "/api/feedback/comment") return await handleCreateFeedbackComment(req, res);
    if (req.method === "POST" && url.pathname === "/api/feedback/delete") return await handleDeleteFeedback(req, res);
    if (req.method === "POST" && url.pathname === "/api/feedback/comment/delete") return await handleDeleteFeedbackComment(req, res);
    if (req.method === "POST" && url.pathname === "/api/community/list") return await handleCommunityList(req, res);
    if (req.method === "POST" && url.pathname === "/api/community/create") return await handleCommunityCreate(req, res);
    if (req.method === "POST" && url.pathname === "/api/community/like") return await handleCommunityLike(req, res);
    if (req.method === "POST" && url.pathname === "/api/community/comment") return await handleCommunityComment(req, res);
    if (req.method === "POST" && url.pathname === "/api/community/delete") return await handleCommunityDelete(req, res);
    if (req.method === "POST" && url.pathname === "/api/content-reports/create") return await handleContentReportCreate(req, res);
    if (req.method === "POST" && url.pathname === "/api/content-reports/list") return await handleContentReportList(req, res);
    if (req.method === "POST" && url.pathname === "/api/content-reports/action") return await handleContentReportAction(req, res);
    if (req.method === "POST" && url.pathname === "/api/community/follow/toggle") return await handleCommunityFollowToggle(req, res);
    if (req.method === "POST" && url.pathname === "/api/community/following/list") return await handleCommunityFollowingList(req, res);
    if (req.method === "POST" && url.pathname === "/api/community/user/profile") return await handleCommunityUserProfile(req, res);
    if (req.method === "POST" && url.pathname === "/api/community/unread") return await handleCommunityUnread(req, res);
    if (req.method === "POST" && url.pathname === "/api/community/chat/list") return await handleCommunityChatList(req, res);
    if (req.method === "POST" && url.pathname === "/api/community/chat/send") return await handleCommunityChatSend(req, res);
    if (req.method === "POST" && url.pathname === "/api/market/list") return await handleMarketList(req, res);
    if (req.method === "POST" && url.pathname === "/api/market/view") return await handleMarketView(req, res);
    if (req.method === "POST" && url.pathname === "/api/market/want") return await handleMarketWant(req, res);
    if (req.method === "POST" && url.pathname === "/api/market/create") return await handleMarketCreate(req, res);
    if (req.method === "POST" && url.pathname === "/api/market/refresh") return await handleMarketRefresh(req, res);
    if (req.method === "POST" && url.pathname === "/api/market/offline") return await handleMarketOffline(req, res);
    if (req.method === "POST" && url.pathname === "/api/market/update") return await handleMarketUpdate(req, res);
    if (req.method === "POST" && url.pathname === "/api/market/status") return await handleMarketStatus(req, res);
    if (req.method === "POST" && url.pathname === "/api/market/delete") return await handleMarketDelete(req, res);
    if (["GET", "HEAD"].includes(req.method) && url.pathname.startsWith("/uploads/")) return serveUpload(req, res, url);
    if (req.method === "GET") return serveStatic(req, res, url);
    return sendJson(res, 405, { ok: false, message: "方法不支持" });
  } catch (error) {
    return sendJson(res, 500, { ok: false, message: error.message || "服务异常" });
  }
});

setInterval(() => {
  const db = readDatabase();
  let changed = autoOfflineStaleMarketListings(db);
  if (autoOfflineRestrictedMarketListings(db)) changed = true;
  if (changed) writeDatabase(db);
}, 60 * 60 * 1000).unref();

try {
  if (!hasBackupForDate()) createServerBackup("startup");
  lastServerBackupDate = backupDateKey();
} catch (error) {
  console.error("启动备份失败：", error.message);
}
setInterval(runScheduledBackup, 60 * 60 * 1000).unref();

server.listen(PORT, HOST, () => {
  console.log(`龟管家服务已启动：http://${HOST}:${PORT}`);
  const mode = process.env.SMS_PROVIDER === "aliyun-pnvs" && aliyunPnvsConfigured()
    ? "阿里云号码认证"
    : aliyunConfigured()
      ? "阿里云短信服务"
      : "本地模拟";
  console.log(`短信模式：${mode}`);
});
