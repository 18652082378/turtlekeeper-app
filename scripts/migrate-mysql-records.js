// Dry-run by default. Stop the API before --apply; never uses client backups
// as the migration source. The current RDS data is the authoritative source.
const fs = require('node:fs');
const path = require('node:path');
const storage = require('../server/mysql-record-store');
function loadEnv() {
  const file = path.resolve(__dirname, '../server/.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}
function backup(data, label) {
  const folder = path.resolve(process.env.TURTLE_RUNTIME_DIR || path.join(__dirname, '../server'), 'backups', 'mysql-record-cutover');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${label}-${Date.now()}-${require('node:crypto').randomBytes(4).toString('hex')}.json`);
  const text = JSON.stringify(data);
  const fd = fs.openSync(file, 'wx');
  try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (storage.canonical(JSON.parse(fs.readFileSync(file, 'utf8'))) !== storage.canonical(data)) throw new Error('备份校验失败，未迁移');
  console.log(`完整备份：${file}`);
}
async function main() {
  loadEnv();
  if (!(process.env.MYSQL_HOST || process.env.MYSQL_URL)) throw new Error('缺少 MySQL 配置，未执行任何操作');
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection(process.env.MYSQL_URL || {
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE || 'turtlekeeper', charset: 'utf8mb4'
  });
  const apply = process.argv.includes('--apply'), rollback = process.argv.includes('--rollback'), exporting = process.argv.includes('--export');
  try {
    if (apply) await storage.acquireWriter(connection);
    const metadata = await storage.mode(connection);
    if (metadata?.active_mode === 'records') {
      await connection.beginTransaction();
      const data = (await storage.load(connection)).database;
      await connection.commit();
      console.log(`当前为分记录存储，账号 ${Object.keys(data.users).length} 个，版本 ${metadata.revision}`);
      if (exporting || (rollback && apply)) backup(data, rollback ? 'before-rollback' : 'records-export');
      if (!rollback) return console.log('新表可完整重建业务数据；未覆盖任何记录。');
      if (!apply) return console.log('回滚演练通过。停止 API 后加 --rollback --apply；将以最新记录重建旧表，不能直接运行旧代码。');
      await storage.rollbackToLegacy(connection, data, metadata.revision);
      console.log('旧表已重建为最新数据。设置 MYSQL_STORAGE_MODE=legacy 后启动本次新版服务；新表保留，不自动清空。');
      return;
    }
    if (rollback) throw new Error('当前未启用分记录模式，无需回滚');
    const [rows] = await connection.query('SELECT payload FROM turtlekeeper_app_state WHERE id = 1');
    if (!rows.length) throw new Error('没有找到现有 RDS 数据，拒绝创建空迁移');
    const data = typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
    if (!data?.users || typeof data.users !== 'object') throw new Error('RDS 账号目录无效');
    let records = 0, maxBytes = 0;
    for (const [scope, value] of storage.scopes(data)) {
      const packed = storage.pack(scope, value);
      if (storage.canonical(storage.unpack(packed).value) !== storage.canonical(value)) throw new Error('拆分还原核对失败');
      records += packed.size; for (const text of packed.values()) maxBytes = Math.max(maxBytes, Buffer.byteLength(text));
    }
    console.log(`迁移预检：${Object.keys(data.users).length} 个账号，拆为 ${records} 条记录，最大单条 ${(maxBytes / 1024).toFixed(1)} KiB。原始指纹 ${storage.hash(storage.canonical(data))}`);
    if (exporting) backup(data, 'legacy-export');
    if (!apply) return console.log('演练完成，未修改数据库。停止 API 后，使用 --apply 执行带完整备份和事务校验的迁移。');
    backup(data, 'before-migration');
    await storage.migrate(connection, data);
    console.log('迁移完成，新旧数据逐字段一致，旧表保留。设置 MYSQL_STORAGE_MODE=records 后启动单实例 API。');
  } catch (error) { await connection.rollback().catch(() => {}); throw error; }
  finally { await connection.end(); }
}
main().catch(error => { console.error(`未完成：${error.message}`); process.exitCode = 1; });
