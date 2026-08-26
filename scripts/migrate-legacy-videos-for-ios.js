/*
 * Repairs already-published community/market videos for iOS WebKit.
 *
 * The script is deliberately dry-run by default. With --apply it keeps each
 * original media file, makes a H.264/AAC MP4 plus JPEG first-frame cover, and
 * updates only the references in the single RDS JSON payload in one transaction.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const envFile = path.join(root, "server", ".env");
const uploadRoot = path.join(root, "server", "uploads");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function uploadRelative(url) {
  try {
    const parsed = new URL(String(url || ""), "http://turtlekeeper.local");
    if (!parsed.pathname.startsWith("/uploads/")) return "";
    const relative = decodeURIComponent(parsed.pathname.slice("/uploads/".length));
    if (!relative || relative.split("/").some(part => !part || part === "." || part === "..")) return "";
    return relative;
  } catch { return ""; }
}

function isVideoPath(relative) {
  return /\.(mp4|mov|m4v|webm)$/i.test(relative);
}

function run(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(stderr.slice(-1000) || `${binary} exited ${code}`)));
  });
}

function collectMediaUrls(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach(item => collectMediaUrls(item, found));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if ((key === "url" || key === "mediaUrl" || key === "photoUrl") && typeof item === "string") {
        const relative = uploadRelative(item);
        if (relative && isVideoPath(relative)) found.add(relative);
      }
      collectMediaUrls(item, found);
    }
  }
  return found;
}

function replaceVideoReferences(value, converted) {
  if (Array.isArray(value)) return value.map(item => replaceVideoReferences(item, converted));
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [key, item] of Object.entries(value)) next[key] = replaceVideoReferences(item, converted);
  const source = uploadRelative(next.url || next.mediaUrl || next.photoUrl || "");
  const replacement = converted.get(source);
  if (!replacement) return next;
  if (typeof next.url === "string") next.url = replacement.videoUrl;
  if (typeof next.mediaUrl === "string") next.mediaUrl = replacement.videoUrl;
  if (typeof next.photoUrl === "string" && isVideoPath(source)) next.photoUrl = replacement.videoUrl;
  next.posterUrl = replacement.posterUrl;
  if (Object.prototype.hasOwnProperty.call(next, "mediaPosterUrl")) next.mediaPosterUrl = replacement.posterUrl;
  return next;
}

async function main() {
  loadEnv(envFile);
  const mysqlHost = String(process.env.MYSQL_HOST || "").trim();
  if (!mysqlHost) throw new Error("请先在 server/.env 设置 MYSQL_HOST；未修改任何数据。");
  const apply = process.argv.includes("--apply");
  const ffmpeg = String(process.env.FFMPEG_PATH || "ffmpeg").trim();
  const mysql = require("mysql2/promise");
  const connection = await mysql.createConnection({ host: mysqlHost, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE || "turtlekeeper", charset: "utf8mb4" });
  try {
    const [rows] = await connection.query("SELECT payload FROM turtlekeeper_app_state WHERE id = 1");
    if (!rows.length) throw new Error("RDS 中没有应用数据；未修改任何数据。");
    const payload = typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload;
    const videos = [...collectMediaUrls(payload)];
    if (!videos.length) return console.log("没有找到需要处理的本地上传视频。");
    console.log(`找到 ${videos.length} 个视频。${apply ? "开始生成 iOS 兼容文件。" : "演练模式：不会写文件或更新 RDS。"}`);
    const converted = new Map();
    for (const relative of videos) {
      const input = path.resolve(uploadRoot, relative);
      if (!input.startsWith(uploadRoot + path.sep) || !fs.existsSync(input)) {
        console.warn(`跳过：原文件不存在 ${relative}`);
        continue;
      }
      const directory = path.dirname(input);
      const base = path.basename(input, path.extname(input));
      const outputName = `${base}-ios.mp4`;
      const posterName = `${base}-ios.jpg`;
      const output = path.join(directory, outputName);
      const poster = path.join(directory, posterName);
      const outputRelative = path.join(path.dirname(relative), outputName).split(path.sep).join("/");
      const posterRelative = path.join(path.dirname(relative), posterName).split(path.sep).join("/");
      console.log(`${relative} -> ${outputRelative}`);
      if (apply) {
        if (!fs.existsSync(output)) await run(ffmpeg, ["-y", "-i", input, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0", "-vf", "scale='min(1080,iw)':-2", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output]);
        if (!fs.existsSync(poster)) await run(ffmpeg, ["-y", "-ss", "0.1", "-i", output, "-frames:v", "1", "-q:v", "3", poster]);
      }
      converted.set(relative, { videoUrl: `/uploads/${outputRelative}`, posterUrl: `/uploads/${posterRelative}` });
    }
    if (!apply) return console.log("确认视频清单无误后，执行 npm run migrate:ios-video -- --apply");
    if (!converted.size) throw new Error("没有可更新的视频；RDS 未修改。");
    const updated = replaceVideoReferences(payload, converted);
    const backupDir = path.join(root, "server", "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, `before-ios-video-migration-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.json`);
    fs.writeFileSync(backup, JSON.stringify(payload, null, 2), "utf8");
    await connection.beginTransaction();
    await connection.execute("UPDATE turtlekeeper_app_state SET payload = ? WHERE id = 1", [JSON.stringify(updated)]);
    await connection.commit();
    console.log(`已完成 ${converted.size} 个视频。原文件未删除；RDS 备份：${backup}`);
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(error => { console.error(`iOS 视频迁移失败：${error.message}`); process.exitCode = 1; });
