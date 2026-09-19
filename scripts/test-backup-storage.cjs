const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const { createBackupStorage } = require('../server/backup-storage');
const suite = fs.mkdtempSync(path.join(os.tmpdir(), 'turtle-backup-policy-'));
let n = 0;
function fixture(options = {}) {
  const root = path.join(suite, String(++n)), directory = path.join(root, 'backups'), uploads = path.join(root, 'uploads');
  fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(uploads);
  fs.writeFileSync(path.join(uploads, 'photo.jpg'), 'original media');
  const manager = createBackupStorage({ directory, uploads, readData: () => ({ users: { synthetic: {} } }),
    now: () => new Date(2026, 8, 19, 12), available: () => 100 * 1024 ** 3, ...options });
  return { root, directory, uploads, manager };
}
function seed(f, name, size = 20, valid = true) {
  const dir = path.join(f.directory, name); fs.mkdirSync(dir);
  const data = Buffer.from(' '.repeat(size)); fs.writeFileSync(path.join(dir, 'app-data.json'), data);
  if (valid) fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ files: [{ path: 'app-data.json', bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') }] }));
  const date = new Date(2026, 7, 1); fs.utimesSync(dir, date, date);
  return dir;
}
{
  const f = fixture();
  const first = seed(f, '2026-09-16-010000-daily');
  const second = seed(f, '2026-09-17-010000-daily');
  const third = seed(f, '2026-09-18-010000-daily');
  const failed = seed(f, '2026-09-15-010000-daily', 20, false);
  const partial = seed(f, '2026-09-14-010000-startup.partial', 20, false);
  const manual = seed(f, 'mysql-record-cutover');
  const recovery = seed(f, 'account-snapshots');
  const reset = seed(f, '2026-08-01-010000-pre-production-reset');
  f.manager.maintain();
  assert(!fs.existsSync(first)); assert(!fs.existsSync(failed)); assert(!fs.existsSync(partial));
  for (const file of [second, third, manual, recovery, reset]) assert(fs.existsSync(file), 'protected backup retained');
  assert.equal(f.manager.hasDate('2026-09-19'), false);
  const saved = f.manager.create('daily');
  assert.equal(f.manager.hasDate('2026-09-19'), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(saved, 'app-data.json'))), { users: { synthetic: {} } });
  assert.equal(fs.readFileSync(path.join(saved, 'uploads/photo.jpg'), 'utf8'), 'original media');
  assert(!fs.existsSync(saved + '.partial'));
}
{
  const f = fixture({ limits: { maxBytes: 3 * 1024 * 1024, reserveBytes: 500 } });
  // A partial directory is not evidence of a successful backup on that date.
  seed(f, '2026-09-19-000000-daily', 20, false);
  assert.equal(f.manager.hasDate('2026-09-19'), false);
  const saved = f.manager.create(); assert(saved);
}
{
  const f = fixture({ available: () => 100, limits: { reserveBytes: 500 }, warn: () => {} });
  seed(f, '2026-09-17-010000-daily'); seed(f, '2026-09-18-010000-daily');
  assert.throws(() => f.manager.create(), /磁盘空间不足/);
  assert.equal(fs.readdirSync(f.directory).length, 2);
}
{
  const f = fixture({ limits: { maxBytes: 1000 } });
  seed(f, '2026-09-17-010000-daily'); seed(f, '2026-09-18-010000-daily');
  assert.throws(() => f.manager.create(), /容量达到上限/);
  assert.equal(fs.readdirSync(f.directory).length, 2, 'never sacrifice the last two good copies');
}
{
  const f = fixture({ copyFile: () => { throw new Error('injected EIO'); } });
  seed(f, '2026-09-17-010000-daily'); seed(f, '2026-09-18-010000-daily');
  assert.throws(() => f.manager.create(), /injected EIO/);
  assert(!fs.readdirSync(f.directory).some(name => name.endsWith('.partial')));
  assert.equal(f.manager.hasDate('2026-09-19'), false);
  assert.equal(fs.readFileSync(path.join(f.uploads, 'photo.jpg'), 'utf8'), 'original media');
}
{
  let calls = 0;
  const f = fixture({ available: () => ++calls <= 2 ? 100 * 1024 ** 3 : 0 });
  assert.throws(() => f.manager.create(), /磁盘空间不足/);
  assert.equal(fs.readdirSync(f.directory).length, 0, 'capacity loss during copying cleans partial');
}
{
  const f = fixture({ env: { BACKUP_RETENTION_DAYS: 'NaN', BACKUP_MAX_GB: 'NaN', BACKUP_MIN_FREE_GB: '-1' } });
  assert(f.manager.create(), 'invalid environment falls back to bounded defaults');
}
{
  const f = fixture({ env: { BACKUP_RETENTION_DAYS: '365', BACKUP_MAX_COUNT: '3' } });
  for (const day of [15, 16, 17, 18]) seed(f, `2026-09-${day}-010000-daily`);
  f.manager.maintain();
  assert.equal(fs.readdirSync(f.directory).length, 3, 'count limit applies to unexpired backups');
  assert(!fs.existsSync(path.join(f.directory, '2026-09-15-010000-daily')));
}
{
  const f = fixture({ env: { BACKUP_RETENTION_DAYS: '365', BACKUP_MAX_COUNT: '10' }, limits: { maxBytes: 600 } });
  for (const day of [15, 16, 17, 18]) seed(f, `2026-09-${day}-010000-daily`, 80);
  const rows = f.manager.maintain();
  assert(rows.reduce((n, r) => n + r.bytes, 0) <= 600, 'byte budget retires older complete backups');
  assert(rows.some(r => r.name.startsWith('2026-09-17')));
  assert(rows.some(r => r.name.startsWith('2026-09-18')));
}
console.log('PASS: retention, protected snapshots/migrations, last two backups, budget, reserve, failed-copy cleanup, partial detection and valid creation. Fixtures: ' + suite);
