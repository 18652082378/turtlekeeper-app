/*
 * Copies every existing local upload to Alibaba Cloud OSS, then (only when
 * --apply is supplied and every copy succeeded) changes media URLs in the
 * single MySQL JSON payload. It never deletes or overwrites local uploads.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const envFile = path.join(root, "server", ".env");
const uploadRoot = path.join(root, "server", "uploads");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.isFile() ? [full] : [];
  });
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".m4v": "video/x-m4v", ".webm": "video/webm", ".mov": "video/quicktime" })[ext] || "application/octet-stream";
}

function replaceMediaUrls(value, publicBase) {
  if (typeof value === "string") {
    try {
      const url = new URL(value, "http://turtlekeeper.local");
      if (!url.pathname.startsWith("/uploads/")) return value;
      const objectKey = url.pathname.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
      return `${publicBase}/${objectKey}`;
    } catch { return value; }
  }
  if (Array.isArray(value)) return value.map(item => replaceMediaUrls(item, publicBase));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceMediaUrls(item, publicBase)]));
  return value;
}

async function main() {
  loadEnv(envFile);
  const region = String(process.env.OSS_REGION || "").trim();
  const bucket = String(process.env.OSS_BUCKET || "").trim();
  const accessKeyId = String(process.env.OSS_ACCESS_KEY_ID || "").trim();
  const accessKeySecret = String(process.env.OSS_ACCESS_KEY_SECRET || "").trim();
  const publicBase = String(process.env.OSS_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  const mysqlHost = String(process.env.MYSQL_HOST || "").trim();
  if (![region, bucket, accessKeyId, accessKeySecret, publicBase, mysqlHost].every(Boolean)) throw new Error("请先在 server/.env 填写 OSS_* 和 MYSQL_HOST 配置。");
  const files = walk(uploadRoot);
  if (!files.length) throw new Error("没有找到 server/uploads 中的文件；已停止，未修改 RDS。");
  const OSS = require("ali-oss");
  const client = new OSS({ region, bucket, accessKeyId, accessKeySecret, authorizationV4: true });
  console.log(`准备上传 ${files.length} 个文件到 OSS（本地文件不会删除）。`);
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const key = path.relative(uploadRoot, file).split(path.sep).join("/");
    await client.put(`uploads/${key}`, file, { headers: { "Content-Type": mimeFor(file) } });
    console.log(`[${index + 1}/${files.length}] uploads/${key}`);
  }
  if (!process.argv.includes("--apply")) {
    console.log("OSS 上传已完成；这是演练模式，RDS 链接尚未修改。确认后请重新执行同一命令并追加 --apply。");
    return;
  }
  const mysql = require("mysql2/promise");
  const connection = await mysql.createConnection({ host: mysqlHost, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE || "turtlekeeper", charset: "utf8mb4" });
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT payload FROM turtlekeeper_app_state WHERE id = 1 FOR UPDATE");
    if (!rows.length) throw new Error("RDS 中未找到应用数据；已回滚。 ");
    const payload = typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload;
    const updated = replaceMediaUrls(payload, publicBase);
    await connection.execute("UPDATE turtlekeeper_app_state SET payload = ? WHERE id = 1", [JSON.stringify(updated)]);
    await connection.commit();
    console.log("OSS 上传和 RDS 媒体链接更新均已完成。本地 uploads 未删除，请保留作为回退。 ");
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally { await connection.end(); }
}

main().catch(error => { console.error(`OSS 迁移失败：${error.message}`); process.exitCode = 1; });
