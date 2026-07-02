const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
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
const DATA_DIR = path.resolve(__dirname, "data");
const DATA_FILE = path.resolve(DATA_DIR, "app-data.json");
const SMS_STATE_FILE = path.resolve(DATA_DIR, "sms-state.json");
const UPLOAD_DIR = path.resolve(__dirname, "uploads");
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 2 * 1024 * 1024);
const MAX_MEDIA_UPLOAD_BYTES = Number(process.env.MAX_MEDIA_UPLOAD_BYTES || 10 * 1024 * 1024);
const REVIEW_ADMIN_PHONE = "18652082378";
const smsCodes = new Map();
const verifiedPhones = new Map();

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
  ".webm": "video/webm",
  ".mov": "video/quicktime"
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
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

function readDatabase() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { users: {}, reviews: [], feedbacks: [], communityPosts: [], marketListings: [], friendships: [], messages: [] };
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return data && typeof data === "object"
      ? {
          users: data.users || {},
          reviews: Array.isArray(data.reviews) ? data.reviews : [],
          feedbacks: Array.isArray(data.feedbacks) ? data.feedbacks : [],
          communityPosts: Array.isArray(data.communityPosts) ? data.communityPosts : [],
          marketListings: Array.isArray(data.marketListings) ? data.marketListings : [],
          friendships: Array.isArray(data.friendships) ? data.friendships : [],
          messages: Array.isArray(data.messages) ? data.messages : []
        }
      : { users: {}, reviews: [], feedbacks: [], communityPosts: [], marketListings: [], friendships: [], messages: [] };
  } catch {
    return { users: {}, reviews: [], feedbacks: [], communityPosts: [], marketListings: [], friendships: [], messages: [] };
  }
}

function writeDatabase(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tempFile, DATA_FILE);
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
  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp)|video\/(?:mp4|webm|quicktime));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, "");
  if (!base64) return null;
  const ext = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : mime.includes("quicktime") ? "mov" : mime.split("/")[1];
  return { buffer: Buffer.from(base64, "base64"), ext, mime, mediaType: mime.startsWith("video/") ? "video" : "image" };
}

async function handleUploadMedia(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const media = parseMediaDataUrl(body.media);
  if (!media) return sendJson(res, 400, { ok: false, message: "仅支持 JPG、PNG、WebP、MP4、WebM 或 MOV" });
  if (media.buffer.length > MAX_MEDIA_UPLOAD_BYTES) return sendJson(res, 413, { ok: false, message: "媒体文件不能超过 10MB" });
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const folder = path.resolve(UPLOAD_DIR, year, month);
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-community.${media.ext}`;
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.resolve(folder, filename), media.buffer);
  return sendJson(res, 200, { ok: true, url: `/uploads/${year}/${month}/${filename}`, mediaType: media.mediaType });
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

function communityFriends(db, viewer) {
  const links = Array.isArray(db.friendships) ? db.friendships : [];
  return links
    .filter(item => item.phones?.includes(viewer.phone))
    .map(item => {
      const phone = item.phones.find(value => value !== viewer.phone);
      const user = db.users?.[phone];
      return user ? {
        id: communityUserId(phone),
        name: user.accountName || maskPhone(phone),
        avatar: user.accountAvatar || "",
        phone: maskPhone(phone),
        createdAt: item.createdAt
      } : null;
    })
    .filter(Boolean);
}

function isCommunityFriend(db, phoneA, phoneB) {
  const key = friendshipKey(phoneA, phoneB);
  return (Array.isArray(db.friendships) ? db.friendships : []).some(item => item.key === key);
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

async function handleCommunityList(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = optionalReviewUser(db, body);
  return sendJson(res, 200, { ok: true, posts: publicCommunityPosts(db, user), friends: user ? communityFriends(db, user) : [] });
}

async function handleCommunityCreate(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const content = trimPublicText(body.content, 1200);
  const mediaUrl = trimPublicText(body.mediaUrl, 800);
  const mediaType = ["image", "video"].includes(body.mediaType) ? body.mediaType : "";
  const location = trimPublicText(body.location, 100);
  const mentions = trimPublicText(body.mentions, 200);
  const visibility = "public";
  if (!content && !mediaUrl) return sendJson(res, 400, { ok: false, message: "请填写内容或选择图片、视频" });
  const post = {
    id: crypto.randomUUID(),
    content,
    mediaUrl,
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

async function handleCommunityAddFriend(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const target = communityUserById(db, body.userId);
  if (!target || target.phone === user.phone) return sendJson(res, 400, { ok: false, message: "无法添加该用户" });
  const key = friendshipKey(user.phone, target.phone);
  db.friendships = Array.isArray(db.friendships) ? db.friendships : [];
  if (!db.friendships.some(item => item.key === key)) db.friendships.push({ key, phones: [user.phone, target.phone], createdAt: new Date().toISOString() });
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, posts: publicCommunityPosts(db, user), friends: communityFriends(db, user) });
}

async function handleCommunityChatList(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const target = communityUserById(db, body.userId);
  if (!target || !isCommunityFriend(db, user.phone, target.phone)) return sendJson(res, 403, { ok: false, message: "请先添加对方为好友" });
  const messages = (Array.isArray(db.messages) ? db.messages : [])
    .filter(item => [item.fromPhone, item.toPhone].includes(user.phone) && [item.fromPhone, item.toPhone].includes(target.phone))
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .map(item => ({ id: item.id, content: item.content, mine: item.fromPhone === user.phone, createdAt: item.createdAt }));
  return sendJson(res, 200, { ok: true, friend: { id: communityUserId(target.phone), name: target.accountName || maskPhone(target.phone), avatar: target.accountAvatar || "" }, messages });
}

async function handleCommunityChatSend(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const target = communityUserById(db, body.userId);
  const content = trimPublicText(body.content, 1000);
  if (!target || !isCommunityFriend(db, user.phone, target.phone)) return sendJson(res, 403, { ok: false, message: "请先添加对方为好友" });
  if (!content) return sendJson(res, 400, { ok: false, message: "请输入消息" });
  db.messages = [...(Array.isArray(db.messages) ? db.messages : []), { id: crypto.randomUUID(), fromPhone: user.phone, toPhone: target.phone, content, createdAt: new Date().toISOString() }].slice(-5000);
  writeDatabase(db);
  const messages = db.messages
    .filter(item => [item.fromPhone, item.toPhone].includes(user.phone) && [item.fromPhone, item.toPhone].includes(target.phone))
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .map(item => ({ id: item.id, content: item.content, mine: item.fromPhone === user.phone, createdAt: item.createdAt }));
  return sendJson(res, 200, { ok: true, friend: { id: communityUserId(target.phone), name: target.accountName || maskPhone(target.phone), avatar: target.accountAvatar || "" }, messages });
}

function publicMarketListings(db, viewer = null) {
  const viewerPhone = viewer?.phone || "";
  return (Array.isArray(db.marketListings) ? db.marketListings : [])
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map(item => {
      const seller = db.users?.[item.sellerPhoneRaw];
      return {
        id: item.id,
        turtleId: item.turtleId || "",
        title: item.title || "",
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
        photoUrl: item.photoUrl || "",
        status: item.status === "sold" ? "sold" : "active",
        sellerId: communityUserId(item.sellerPhoneRaw),
        sellerName: seller?.accountName || item.sellerName || "壳友卖家",
        sellerAvatar: seller?.accountAvatar || item.sellerAvatar || "",
        isOwn: Boolean(viewerPhone && item.sellerPhoneRaw === viewerPhone),
        isFriend: Boolean(viewerPhone && item.sellerPhoneRaw !== viewerPhone && isCommunityFriend(db, viewerPhone, item.sellerPhoneRaw)),
        createdAt: item.createdAt
      };
    });
}

async function handleMarketList(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = optionalReviewUser(db, body);
  return sendJson(res, 200, { ok: true, listings: publicMarketListings(db, user) });
}

async function handleMarketCreate(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const title = trimPublicText(body.title, 40);
  const speciesName = trimPublicText(body.speciesName, 30);
  const price = Number(body.price || 0);
  if (!title || !speciesName || !Number.isFinite(price) || price < 0) return sendJson(res, 400, { ok: false, message: "请填写正确的标题、品种和价格" });
  const listing = {
    id: crypto.randomUUID(),
    turtleId: trimPublicText(body.turtleId, 100),
    title,
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
    photoUrl: trimPublicText(body.photoUrl, 800),
    status: "active",
    sellerPhoneRaw: user.phone,
    sellerName: user.accountName || maskPhone(user.phone),
    sellerAvatar: user.accountAvatar || "",
    createdAt: new Date().toISOString()
  };
  db.marketListings = [listing, ...(Array.isArray(db.marketListings) ? db.marketListings : [])];
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, listings: publicMarketListings(db, user) });
}

async function handleMarketStatus(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  const listing = (Array.isArray(db.marketListings) ? db.marketListings : []).find(item => item.id === String(body.listingId || ""));
  if (!listing) return sendJson(res, 404, { ok: false, message: "商品不存在" });
  if (listing.sellerPhoneRaw !== user.phone && !isAdminUser(user)) return sendJson(res, 403, { ok: false, message: "只能修改自己的商品" });
  listing.status = body.status === "sold" ? "sold" : "active";
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, listings: publicMarketListings(db, user) });
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
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
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
  fs.readFile(target, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });
  try {
    if (req.method === "POST" && url.pathname === "/api/sms/send") return await handleSendSms(req, res);
    if (req.method === "POST" && url.pathname === "/api/sms/verify") return await handleVerifySms(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/register") return await handleRegister(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/login") return await handleLogin(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/load") return await handleLoadAccount(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/save") return await handleSaveAccount(req, res);
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
    if (req.method === "POST" && url.pathname === "/api/community/friend/add") return await handleCommunityAddFriend(req, res);
    if (req.method === "POST" && url.pathname === "/api/community/chat/list") return await handleCommunityChatList(req, res);
    if (req.method === "POST" && url.pathname === "/api/community/chat/send") return await handleCommunityChatSend(req, res);
    if (req.method === "POST" && url.pathname === "/api/market/list") return await handleMarketList(req, res);
    if (req.method === "POST" && url.pathname === "/api/market/create") return await handleMarketCreate(req, res);
    if (req.method === "POST" && url.pathname === "/api/market/status") return await handleMarketStatus(req, res);
    if (req.method === "POST" && url.pathname === "/api/market/delete") return await handleMarketDelete(req, res);
    if (req.method === "GET" && url.pathname.startsWith("/uploads/")) return serveUpload(req, res, url);
    if (req.method === "GET") return serveStatic(req, res, url);
    return sendJson(res, 405, { ok: false, message: "方法不支持" });
  } catch (error) {
    return sendJson(res, 500, { ok: false, message: error.message || "服务异常" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`龟管家服务已启动：http://${HOST}:${PORT}`);
  const mode = process.env.SMS_PROVIDER === "aliyun-pnvs" && aliyunPnvsConfigured()
    ? "阿里云号码认证"
    : aliyunConfigured()
      ? "阿里云短信服务"
      : "本地模拟";
  console.log(`短信模式：${mode}`);
});
