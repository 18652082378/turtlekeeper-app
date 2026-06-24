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
const REVIEW_ADMIN_PHONE = "18652082378";
const smsCodes = new Map();
const verifiedPhones = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
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
    activityLogs: Array.isArray(next.activityLogs) ? next.activityLogs : [],
    themeColor: next.themeColor || "teal"
  };
}

function readDatabase() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { users: {}, reviews: [] };
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return data && typeof data === "object"
      ? { users: data.users || {}, reviews: Array.isArray(data.reviews) ? data.reviews : [] }
      : { users: {}, reviews: [] };
  } catch {
    return { users: {}, reviews: [] };
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
}

function hasVerifiedPhone(phone) {
  const expiresAt = verifiedPhones.get(phone);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    verifiedPhones.delete(phone);
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
  smsCodes.set(phone, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000,
    lastSentAt: Date.now()
  });
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
    smsCodes.delete(phone);
    rememberVerifiedPhone(phone);
    return sendJson(res, 200, { ok: true });
  }

  const item = smsCodes.get(phone);
  if (!item) return sendJson(res, 400, { ok: false, message: "请先获取验证码" });
  if (Date.now() > item.expiresAt) {
    smsCodes.delete(phone);
    return sendJson(res, 400, { ok: false, message: "验证码已过期" });
  }
  if (item.code !== code) return sendJson(res, 400, { ok: false, message: "验证码不正确" });
  smsCodes.delete(phone);
  rememberVerifiedPhone(phone);
  return sendJson(res, 200, { ok: true });
}

async function handleRegister(req, res) {
  const body = await readJson(req);
  const phone = String(body.phone || "").trim();
  const password = String(body.password || "");
  if (!validPhone(phone)) return sendJson(res, 400, { ok: false, message: "手机号格式不正确" });
  if (password.length < 6) return sendJson(res, 400, { ok: false, message: "密码至少需要 6 位" });
  if (!hasVerifiedPhone(phone)) return sendJson(res, 400, { ok: false, message: "请先完成短信验证码核对" });

  const db = readDatabase();
  if (db.users[phone]) return sendJson(res, 409, { ok: false, message: "手机号已注册，请直接登录" });

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
    phone: maskPhone(user.phone)
  };
}

function publicReviews(db) {
  return (Array.isArray(db.reviews) ? db.reviews : []).map(review => ({
    id: review.id,
    rating: Number(review.rating || 5),
    comment: review.comment || "",
    authorName: review.authorName || "壳友",
    authorPhone: review.authorPhone || "",
    createdAt: review.createdAt,
    comments: (Array.isArray(review.comments) ? review.comments : []).map(item => ({
      id: item.id,
      content: item.content || "",
      authorName: item.authorName || "壳友",
      authorPhone: item.authorPhone || "",
      createdAt: item.createdAt
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

async function handleListReviews(req, res) {
  const db = readDatabase();
  return sendJson(res, 200, { ok: true, reviews: publicReviews(db) });
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
    comments: [],
    createdAt: new Date().toISOString()
  };
  db.reviews = [review, ...(Array.isArray(db.reviews) ? db.reviews : [])];
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, review, reviews: publicReviews(db) });
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
  const author = publicReviewAuthor(user);
  review.comments = [
    {
      id: crypto.randomUUID(),
      content,
      authorName: author.name,
      authorPhone: author.phone,
      createdAt: new Date().toISOString()
    },
    ...(Array.isArray(review.comments) ? review.comments : [])
  ];
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, reviews: publicReviews(db) });
}

async function handleDeleteReview(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  if (user.phone !== REVIEW_ADMIN_PHONE) return sendJson(res, 403, { ok: false, message: "只有管理员可以删除" });
  const reviewId = String(body.reviewId || "");
  db.reviews = (Array.isArray(db.reviews) ? db.reviews : []).filter(item => item.id !== reviewId);
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, reviews: publicReviews(db) });
}

async function handleDeleteReviewComment(req, res) {
  const body = await readJson(req);
  const db = readDatabase();
  const user = requireReviewUser(db, body, res);
  if (!user) return;
  if (user.phone !== REVIEW_ADMIN_PHONE) return sendJson(res, 403, { ok: false, message: "只有管理员可以删除" });
  const reviewId = String(body.reviewId || "");
  const commentId = String(body.commentId || "");
  const review = (Array.isArray(db.reviews) ? db.reviews : []).find(item => item.id === reviewId);
  if (!review) return sendJson(res, 404, { ok: false, message: "评价不存在" });
  review.comments = (Array.isArray(review.comments) ? review.comments : []).filter(item => item.id !== commentId);
  writeDatabase(db);
  return sendJson(res, 200, { ok: true, reviews: publicReviews(db) });
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
    if (req.method === "POST" && url.pathname === "/api/reviews/list") return await handleListReviews(req, res);
    if (req.method === "POST" && url.pathname === "/api/reviews/create") return await handleCreateReview(req, res);
    if (req.method === "POST" && url.pathname === "/api/reviews/comment") return await handleCreateReviewComment(req, res);
    if (req.method === "POST" && url.pathname === "/api/reviews/delete") return await handleDeleteReview(req, res);
    if (req.method === "POST" && url.pathname === "/api/reviews/comment/delete") return await handleDeleteReviewComment(req, res);
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
