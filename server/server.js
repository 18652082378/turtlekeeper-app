const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8787);
const STATIC_ROOT = path.resolve(__dirname, "..");
const smsCodes = new Map();

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
      if (raw.length > 1024 * 1024) reject(new Error("请求内容过大"));
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

function aliyunSignedUrl(params) {
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
  return `https://dysmsapi.aliyuncs.com/?Signature=${percentEncode(signature)}&${canonical}`;
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

async function handleSendSms(req, res) {
  const body = await readJson(req);
  const phone = String(body.phone || "").trim();
  if (!validPhone(phone)) return sendJson(res, 400, { ok: false, message: "手机号格式不正确" });
  const previous = smsCodes.get(phone);
  if (previous && Date.now() - previous.lastSentAt < 60 * 1000) {
    return sendJson(res, 429, { ok: false, message: "验证码发送太频繁，请稍后再试" });
  }

  const code = makeCode();
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
  const item = smsCodes.get(phone);
  if (!item) return sendJson(res, 400, { ok: false, message: "请先获取验证码" });
  if (Date.now() > item.expiresAt) {
    smsCodes.delete(phone);
    return sendJson(res, 400, { ok: false, message: "验证码已过期" });
  }
  if (item.code !== code) return sendJson(res, 400, { ok: false, message: "验证码不正确" });
  smsCodes.delete(phone);
  return sendJson(res, 200, { ok: true });
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
    if (req.method === "GET") return serveStatic(req, res, url);
    return sendJson(res, 405, { ok: false, message: "方法不支持" });
  } catch (error) {
    return sendJson(res, 500, { ok: false, message: error.message || "服务异常" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`龟管家服务已启动：http://127.0.0.1:${PORT}`);
  console.log(aliyunConfigured() ? "短信模式：阿里云" : "短信模式：本地模拟");
});
