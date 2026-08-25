/*
 * One-way import of the existing local JSON database into RDS MySQL.
 * It deliberately refuses to replace a non-empty MySQL database unless
 * --force is supplied, so an accidental second run cannot erase newer data.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const envFile = path.join(root, "server", ".env");

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

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

async function main() {
  loadEnv(envFile);
  const mysqlUrl = String(process.env.MYSQL_URL || "").trim();
  const mysqlHost = String(process.env.MYSQL_HOST || "").trim();
  if (!mysqlUrl && !mysqlHost) throw new Error("请先在 server/.env 中设置 MYSQL_HOST（或 MYSQL_URL）；不要把数据库密码提交到 Git。");
  const sourceFlag = process.argv.find(arg => arg.startsWith("--source="));
  const source = path.resolve(sourceFlag ? sourceFlag.slice("--source=".length) : path.join(root, "server", "data", "app-data.json"));
  if (!fs.existsSync(source)) throw new Error(`找不到待迁移文件：${source}`);
  const sourceData = JSON.parse(fs.readFileSync(source, "utf8"));
  if (!sourceData || typeof sourceData !== "object" || Array.isArray(sourceData)) throw new Error("源 JSON 的根节点无效，已拒绝迁移。");
  const sourceFingerprint = canonicalJson(sourceData);
  const payload = JSON.stringify(sourceData);
  const mysql = require("mysql2/promise");
  const connection = await mysql.createConnection(mysqlUrl || {
    host: mysqlHost,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: String(process.env.MYSQL_USER || "").trim(),
    password: String(process.env.MYSQL_PASSWORD || ""),
    database: String(process.env.MYSQL_DATABASE || "turtlekeeper").trim(),
    charset: "utf8mb4"
  });
  try {
    await connection.query("CREATE TABLE IF NOT EXISTS turtlekeeper_app_state (id TINYINT UNSIGNED NOT NULL PRIMARY KEY, payload JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    await connection.beginTransaction();
    const [rows] = await connection.query("SELECT id FROM turtlekeeper_app_state WHERE id = 1");
    if (rows.length && !process.argv.includes("--force")) {
      throw new Error("RDS 中已有数据；如确认要用本地 JSON 覆盖它，请明确添加 --force。");
    }
    await connection.execute("INSERT INTO turtlekeeper_app_state (id, payload) VALUES (1, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)", [payload]);
    const [imported] = await connection.query("SELECT payload FROM turtlekeeper_app_state WHERE id = 1");
    if (!imported.length) throw new Error("写入后未能读取 RDS 数据，事务已回滚。");
    const importedData = typeof imported[0].payload === "string" ? JSON.parse(imported[0].payload) : imported[0].payload;
    if (canonicalJson(importedData) !== sourceFingerprint) {
      throw new Error("RDS 数据校验不一致，事务已回滚；原 JSON 文件未被修改。");
    }
    await connection.commit();
    console.log(`迁移完成：${source}`);
    console.log("RDS 数据校验通过：导入内容与源 JSON 完全一致。");
    console.log("请先验证应用启动日志；确认无误前不要删除原 JSON 文件。");
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(`迁移失败：${error.message}`);
  process.exitCode = 1;
});
