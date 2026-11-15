'use strict';
// Local operator tool. Reads one account's recovery snapshot and never writes
// the application database or displays record contents in the terminal.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function exportRecovery({ snapshots, account, name, destination }) {
  if (!/^1[3-9]\d{9}$/.test(account)) throw new Error('需要完整账号手机号以匹配恢复目录');
  if (!/^\d{4}-\d{2}-\d{2}-\d{6}-\d+-[0-9a-f]{6}\.json$/.test(name)) throw new Error('恢复快照文件名无效');
  const phoneHash = crypto.createHash('sha256').update(account).digest('hex');
  const directory = path.join(fs.realpathSync(snapshots), phoneHash.slice(0, 32));
  const file = path.join(directory, name);
  if (fs.lstatSync(directory).isSymbolicLink() || !fs.lstatSync(file).isFile()) throw new Error('恢复文件类型无效');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (saved.phoneHash !== phoneHash || !saved.account?.data || !Array.isArray(saved.account.data.turtles)) {
    throw new Error('恢复文件与账号不匹配或记录不完整');
  }
  fs.writeFileSync(destination, JSON.stringify({
    backupFormat: 'turtlekeeper-account-v1', createdAt: saved.createdAt,
    sourceRevision: saved.account.dataRevision || '',
    accountName: saved.account.accountName, accountAvatar: saved.account.accountAvatar,
    data: saved.account.data
  }), { flag: 'wx', mode: 0o600 });
}

if (require.main === module) {
  const [name, destination] = process.argv.slice(2);
  try {
    if (!name || !destination) throw new Error('用法：设置 TK_RECOVERY_PHONE 后运行 node scripts/export-account-recovery.cjs <快照文件名> <新导出文件路径>');
    const runtime = process.env.TURTLE_RUNTIME_DIR || path.join(__dirname, '..', 'server');
    exportRecovery({ snapshots: path.join(runtime, 'backups', 'account-snapshots'),
      account: process.env.TK_RECOVERY_PHONE || '', name, destination });
    console.log('已导出单账号恢复副本，可与现有记录核对。');
  } catch (error) {
    console.error(error.code ? '无法读取快照或创建导出文件，请核对目录、权限和文件名' : error.message);
    process.exitCode = 1;
  }
}
module.exports = { exportRecovery };
