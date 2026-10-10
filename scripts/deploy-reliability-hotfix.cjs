// Self-contained production patch. Never reads or writes user records.
const fs = require('fs'), crypto = require('crypto'), vm = require('vm');
const { execFileSync: exec } = require('child_process');
const check = (ok, message) => { if (!ok) throw Error(message); };
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function extract(source, name) {
  const hits = [...source.matchAll(new RegExp('^(?:async )?function ' + name + '\\(', 'gm'))];
  check(hits.length === 1, 'Unexpected function: ' + name);
  const end = source.indexOf('\n}', hits[0].index);
  check(end > hits[0].index, 'Incomplete function: ' + name);
  return source.slice(hits[0].index, end + 2);
}
function patch(source) {
  let s = source.replace(/\r\n/g, '\n');
  let f = extract(s, 'normalizeAccountData');
  const before = f.replace('next.turtlePools.map', 'next.turtlePools.slice(0, 200).map');
  check(['a1797fa584d8f2103f9d60ceac773b1c71fef3dc48b79a4ff29c04be1deb1cf4',
    '03d72399ae227287d2048340a2b5c53a2d9ba84bd4de55e2a7e4939794f63c87'].includes(hash(before)), 'Unknown normalization code; no change');
  s = s.replace(f, () => f.replace('next.turtlePools.slice(0, 200).map', 'next.turtlePools.map'));
  f = extract(s, 'careReminderDue');
  const guard = 'memo.reminderEnabled === false || memo.lastCompletedDate === clock.date || (!memo.repeat && memo.completedAt) || ';
  // Keep the reviewed archive-aware reminder guard when applying this older hotfix.
  if (hash(f) !== 'a4c5392c2fc5317f29f1f9947fd529e5ad41990b4ed4b87a7845155cf17ed937') {
    check(hash(f.replace(guard, '')) === 'ea28fd8579b0dfccaab825e07ab75d12f50e17cd8079a253ca5984e9088bfa7a', 'Unknown reminder code; no change');
    if (!f.includes(guard)) s = s.replace(f, () => f.replace('if (!memo || ', 'if (!memo || ' + guard));
  }
  return s;
}
function verify(source) {
  const ctx = vm.createContext({ crypto, normalizeCustomSpecies: x => x || [],
    TurtleCare: { normalizeRecords: x => x, normalizeItems: x => x, normalizePlans: x => x } });
  for (const name of ['emptyAccountData', 'normalizeAccountData', 'careReminderDue']) vm.runInContext(extract(source, name), ctx);
  const pools = Array.from({ length: 201 }, (_, i) => ({ id: String(i), name: 'pool' + i, type: 'breeder' }));
  const data = ctx.normalizeAccountData({ turtlePools: pools, careRecords: [{ id: 'care' }], carePlans: [{ id: 'plan' }] });
  check(data.turtlePools.length === 201 && data.careRecords.length === 1 && data.carePlans.length === 1, 'Preservation check failed');
  const clock = { date: '2026-09-28', time: '10:00', weekday: '1' };
  for (const extra of [{ reminderEnabled: false }, { completedAt: clock.date }, { repeat: true, lastCompletedDate: clock.date }])
    check(!ctx.careReminderDue({ remindTime: '10:00', ...extra }, clock), 'Reminder check failed');
  check(ctx.careReminderDue({ remindTime: '10:00', repeat: true }, clock), 'Active reminder check failed');
}
async function main() {
  const root = '/www/turtlekeeper-app', file = root + '/server/server.js', service = 'turtlekeeper-api';
  check(process.platform === 'linux' && fs.realpathSync(file) === file, 'Unexpected server path');
  const original = fs.readFileSync(file, 'utf8'), after = patch(original);
  verify(after); exec(process.execPath, ['--check'], { input: after });
  if (original.replace(/\r\n/g, '\n') === after) { console.log('Already patched; source checks passed.'); return; }
  const apps = JSON.parse(exec('pm2', ['jlist'], { encoding: 'utf8' })).filter(x => x.name === service);
  check(apps.length === 1, 'Expected one API process');
  const pm = apps[0].pm2_env;
  check(pm.status === 'online' && pm.exec_mode === 'fork_mode' && pm.pm_cwd === root && pm.pm_exec_path === file, 'Unexpected PM2 configuration');
  const env = { ...pm.env, ...pm };
  if (fs.existsSync(root + '/server/.env')) for (const line of fs.readFileSync(root + '/server/.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  const port = Number(env.PORT || 8787);
  check(Number.isInteger(port) && port > 0 && port < 65536, 'Invalid port');
  async function version() {
    const r = await fetch(`http://127.0.0.1:${port}/api/app/version`, { signal: AbortSignal.timeout(3000) });
    check(r.ok, 'API unavailable'); return JSON.stringify(await r.json());
  }
  const policy = await version(), dir = root + '/server/backups';
  fs.mkdirSync(dir, { recursive: true }); check(fs.realpathSync(dir) === dir, 'Unexpected backup path');
  const backup = dir + '/reliability-' + Date.now() + '.js';
  fs.writeFileSync(backup, original, { flag: 'wx', mode: 0o600 });
  check(fs.readFileSync(file, 'utf8') === original, 'Server changed during checks');
  const pm2 = action => exec('pm2', [action, service], { cwd: root, stdio: 'inherit' });
  try {
    pm2('stop'); fs.writeFileSync(file, after); pm2('restart');
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        check(await version() === policy, 'Version policy changed');
        const r = await fetch(`http://127.0.0.1:${port}/api/account/load`, { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(2000) });
        check(r.status === 401, 'Account endpoint check failed'); ready = true; break;
      }
      catch { await new Promise(r => setTimeout(r, 500)); }
    }
    check(ready, 'Restart verification failed');
  } catch (error) {
    pm2('stop'); fs.writeFileSync(file, original); pm2('restart');
    throw Error('Previous source restored: ' + error.message);
  }
  exec('pm2', ['save'], { cwd: root, stdio: 'inherit' });
  console.log('SUCCESS: pool/reminder patch installed. Backup: ' + backup);
  console.log('Version API verified. Real-device persistence remains to be verified.');
}
module.exports = { patch, verify };
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
