const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const GiB = 1024 ** 3;
const managedName = /^\d{4}-\d{2}-\d{2}-\d{6}-(?:daily|startup|scheduled)(?:\.partial)?$/;
function positive(value, fallback, minimum = 1) {
  const n = Number(value);
  return Number.isFinite(n) && n >= minimum ? n : fallback;
}

function createBackupStorage({ directory, uploads, readData, env = process.env, now = () => new Date(), limits = {},
  available = target => { const s = fs.statfsSync(target); return Number(s.bavail) * Number(s.bsize); },
  copyFile = fs.copyFileSync, warn = message => console.warn(message) }) {
  const root = path.resolve(directory);
  const retentionDays = positive(env.BACKUP_RETENTION_DAYS, 7);
  const maxBytes = limits.maxBytes ?? positive(env.BACKUP_MAX_GB, 10) * GiB;
  const reserveBytes = limits.reserveBytes ?? positive(env.BACKUP_MIN_FREE_GB, 5) * GiB;
  const maxCount = Math.floor(positive(env.BACKUP_MAX_COUNT, 3, 2));
  function ensureRoot() {
    fs.mkdirSync(root, { recursive: true });
    if (fs.lstatSync(root).isSymbolicLink()) throw new Error('备份根目录不能是符号链接');
  }
  function target(name) {
    if (!managedName.test(name)) throw new Error('非自动备份目录，拒绝操作');
    const result = path.resolve(root, name);
    if (path.dirname(result) !== root) throw new Error('备份路径越界');
    return result;
  }
  function sizeOf(dir) {
    let bytes = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) bytes += sizeOf(file);
      else if (e.isFile()) bytes += fs.statSync(file).size;
    }
    return bytes;
  }
  function complete(dir) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      if (!Array.isArray(manifest.files) || !manifest.files.some(f => f.path === 'app-data.json')) return false;
      return manifest.files.every(f => {
        if (typeof f.path !== 'string' || f.path.split(/[\\/]/).some(p => !p || p === '..')) return false;
        const file = path.resolve(dir, f.path);
        if (!file.startsWith(dir + path.sep)) return false;
        const s = fs.lstatSync(file);
        return s.isFile() && s.size === f.bytes && /^[a-f0-9]{64}$/.test(f.sha256 || '');
      });
    } catch { return false; }
  }
  function inventory() {
    ensureRoot();
    return fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && managedName.test(e.name))
      .map(e => { const dir = target(e.name); return { name: e.name, dir, bytes: sizeOf(dir),
        complete: !e.name.endsWith('.partial') && complete(dir), mtime: fs.statSync(dir).mtimeMs }; })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  function remove(row) {
    // Only direct, non-symlink, automatically named children can be removed.
    const dir = target(row.name);
    const s = fs.lstatSync(dir);
    if (!s.isDirectory() || s.isSymbolicLink()) throw new Error('备份目录类型改变，停止清理');
    fs.rmSync(dir, { recursive: true, force: false });
  }
  function maintain() {
    let rows = inventory();
    const protectedNames = new Set(rows.filter(r => r.complete).slice(-2).map(r => r.name));
    const cutoff = now().getTime() - retentionDays * 86400000;
    // Never purge migration/manual/account snapshots. Failed backups from a
    // previous day can be discarded only when two complete copies remain.
    for (const row of [...rows]) {
      if (!row.complete && protectedNames.size === 2 && row.mtime < now().getTime() - 86400000) {
        remove(row); rows = rows.filter(r => r !== row);
      }
    }
    for (const row of [...rows]) {
      if (!row.complete || protectedNames.has(row.name)) continue;
      const bytes = rows.reduce((n, r) => n + r.bytes, 0);
      const count = rows.filter(r => r.complete).length;
      if (row.mtime < cutoff || bytes > maxBytes || count > maxCount) {
        remove(row); rows = rows.filter(r => r !== row);
      }
    }
    const free = available(root);
    if (free < reserveBytes) warn('磁盘空间告警：可用空间低于备份保留底线，请清理或扩容');
    return rows;
  }
  function hasDate(day) { return inventory().some(r => r.complete && r.name.startsWith(day + '-')); }
  function requireFree(bytes) {
    const free = available(root);
    if (!Number.isFinite(free) || free < reserveBytes + bytes) throw new Error('磁盘空间不足：已跳过自动备份，保留业务写入空间');
  }
  function uploadFiles() {
    const files = [];
    function visit(dir, rel = '') {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, e.name), name = path.posix.join(rel, e.name);
        if (e.isSymbolicLink()) throw new Error('上传目录含符号链接，停止自动备份');
        if (e.isDirectory()) visit(file, name);
        else if (e.isFile()) files.push({ source: file, path: 'uploads/' + name, bytes: fs.statSync(file).size });
      }
    }
    if (fs.existsSync(uploads)) {
      if (fs.lstatSync(uploads).isSymbolicLink()) throw new Error('上传目录不能是符号链接');
      visit(uploads);
    }
    return files;
  }
  function hash(file) {
    const fd = fs.openSync(file, 'r'), digest = crypto.createHash('sha256'), buffer = Buffer.alloc(1024 * 1024);
    try { let count; while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) digest.update(buffer.subarray(0, count)); }
    finally { fs.closeSync(fd); }
    return digest.digest('hex');
  }
  function create(reason = 'scheduled') {
    if (!['daily', 'startup', 'scheduled'].includes(reason)) throw new Error('不支持的自动备份类型');
    let rows = maintain();
    const data = readData();
    if (data === null) return '';
    const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    JSON.parse(json);
    const files = uploadFiles();
    const dataBytes = Buffer.byteLength(json);
    const estimated = files.reduce((n, f) => n + f.bytes, dataBytes);
    const overhead = Math.max(1024 * 1024, (files.length + 1) * 1024);
    const newBytes = estimated + overhead;
    const protectedNames = new Set(rows.filter(r => r.complete).slice(-2).map(r => r.name));
    // Reserve space before copying, while retaining two existing good copies.
    for (const row of [...rows]) {
      if (row.complete && !protectedNames.has(row.name) &&
        (rows.reduce((n, r) => n + r.bytes, newBytes) > maxBytes || available(root) < reserveBytes + newBytes)) {
        remove(row); rows = rows.filter(r => r !== row);
      }
    }
    const retainedBytes = rows.reduce((n, r) => n + r.bytes, 0);
    if (retainedBytes + newBytes > maxBytes) throw new Error('备份容量达到上限：保留最近完整备份，跳过本次备份；请归档或扩容');
    requireFree(newBytes);
    const date = now(), pad = n => String(n).padStart(2, '0');
    const name = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${reason}`;
    const final = target(name), partial = target(name + '.partial');
    if (fs.existsSync(final)) {
      if (complete(final)) return final;
      throw new Error('同名备份不完整，请检查后重试');
    }
    fs.mkdirSync(partial); // An existing partial directory is never overwritten.
    try {
      fs.writeFileSync(path.join(partial, 'app-data.json'), json);
      let copiedBytes = dataBytes;
      for (const file of files) {
        const size = fs.statSync(file.source).size;
        if (retainedBytes + copiedBytes + size + overhead > maxBytes) throw new Error('备份过程中容量达到上限');
        requireFree(size + overhead);
        const dest = path.join(partial, file.path);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        copyFile(file.source, dest);
        copiedBytes += fs.statSync(dest).size;
      }
      requireFree(overhead);
      if (retainedBytes + sizeOf(partial) + overhead > maxBytes) throw new Error('备份过程中容量达到上限');
      const manifestFiles = [{ path: 'app-data.json' }, ...files].map(f => {
        const file = path.join(partial, f.path);
        return { path: f.path, bytes: fs.statSync(file).size, sha256: hash(file) };
      });
      fs.writeFileSync(path.join(partial, 'manifest.json'), JSON.stringify({ createdAt: date.toISOString(), reason,
        includes: ['app-data.json', ...(files.length ? ['uploads'] : [])], files: manifestFiles }, null, 2));
      fs.renameSync(partial, final);
    } catch (error) { remove({ name: name + '.partial' }); throw error; }
    maintain();
    return final;
  }
  return { maintain, hasDate, create };
}
module.exports = { createBackupStorage };
