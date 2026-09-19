// Apply only the reviewed backup code from a fetched Git ref. Do not replace
// unrelated production fixes, environment files, databases or media.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const hash = value => crypto.createHash('sha256').update(value.replace(/\r\n/g, '\n').trim()).digest('hex');
function patchServer(source, incoming) {
  const endMarker = 'function runScheduledBackup() {';
  const nextStart = incoming.indexOf('const backupStorage = createBackupStorage({');
  const nextEnd = incoming.indexOf(endMarker, nextStart);
  if (nextStart < 0 || nextEnd < 0) throw new Error('Incoming backup integration missing');
  const nextBlock = incoming.slice(nextStart, nextEnd);
  const oldStart = source.indexOf('function pruneServerBackups() {');
  if (oldStart >= 0) {
    const oldEnd = source.indexOf(endMarker, oldStart);
    if (oldEnd < 0 || hash(source.slice(oldStart, oldEnd)) !== '4ecfb2d887db9d3a6b2fa2dbf82ac2620dfc0ae4a3b2ac5fc27f09403f831cdd') {
      throw new Error('服务器备份代码与已审核版本不同，停止；未修改任何文件');
    }
    source = source.slice(0, oldStart) + nextBlock + source.slice(oldEnd);
  } else {
    const start = source.indexOf('const backupStorage = createBackupStorage({');
    const end = source.indexOf(endMarker, start);
    if (start < 0 || hash(source.slice(start, end)) !== hash(nextBlock)) throw new Error('未知备份代码，停止更新');
  }
  const importLine = "const { createBackupStorage } = require('./backup-storage');";
  if (!source.includes(importLine)) {
    const anchor = "const { createApplePurchases } = require('./apple-team-purchases');";
    if (!source.includes(anchor)) throw new Error('找不到安全的模块导入位置');
    source = source.replace(anchor, anchor + '\n' + importLine);
  }
  source = source.replace(/^const BACKUP_RETENTION_DAYS = .*\r?\n/m, '');
  for (const line of ['    if (!hasBackupForDate(today)) createServerBackup("daily");', '    if (!hasBackupForDate()) createServerBackup("startup");']) {
    if (!source.includes(line)) throw new Error('备份调度代码与预期不同');
    if (!source.includes('    backupStorage.maintain();\n' + line)) source = source.replace(line, '    backupStorage.maintain();\n' + line);
  }
  new vm.Script(source);
  return source;
}
function main() {
  const apply = process.argv.includes('--apply');
  if (!apply && !process.argv.includes('--check')) throw new Error('使用 --check 预检或 --apply 应用');
  const root = process.cwd();
  const readGit = file => execFileSync('git', ['show', 'origin/main:' + file], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const entry = path.join(root, 'server/server.js'), moduleFile = path.join(root, 'server/backup-storage.js');
  const original = fs.readFileSync(entry, 'utf8');
  const incoming = readGit('server/server.js'), moduleSource = readGit('server/backup-storage.js');
  const updated = patchServer(original, incoming);
  new vm.Script(moduleSource);
  if (fs.existsSync(moduleFile) && hash(fs.readFileSync(moduleFile, 'utf8')) !== hash(moduleSource)) throw new Error('服务器存在不同的 backup-storage.js，请先核对');
  console.log('预检通过：仅更新自动备份实现，保留现有更新门槛、接口和配置。');
  if (!apply) return;
  if (updated === original && fs.existsSync(moduleFile)) { console.log('代码已经更新，无需重复安装。'); return; }
  const backup = path.join(root, 'server/backups', 'backup-policy-code-' + Date.now());
  fs.mkdirSync(backup, { recursive: true });
  fs.copyFileSync(entry, path.join(backup, 'server.js'));
  const stageModule = moduleFile + '.' + process.pid + '.tmp', stageEntry = entry + '.' + process.pid + '.tmp';
  fs.writeFileSync(stageModule, moduleSource, { flag: 'wx' });
  fs.writeFileSync(stageEntry, updated, { flag: 'wx', mode: fs.statSync(entry).mode });
  fs.renameSync(stageModule, moduleFile);
  fs.renameSync(stageEntry, entry);
  console.log('备份代码已更新；原代码保存在 ' + backup + '。重启 API 后生效。');
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { patchServer };
