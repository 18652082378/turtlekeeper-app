const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const ensure = (ok, message) => { if (!ok) throw Error(message); };
function extract(source, name) {
  const matches = [...source.matchAll(new RegExp('^(?:async )?function ' + name + '\\(', 'gm'))];
  ensure(matches.length === 1, 'Ambiguous function: ' + name);
  const start = matches[0].index, end = source.indexOf('\n}', start);
  ensure(end >= 0, 'Missing function end: ' + name);
  return source.slice(start, end + 2);
}
function patchSource(source, manifest) {
  source = source.replace(/\r\n/g, '\n');
  ensure(source.includes('const REVIEW_ADMIN_PHONE = process.env.ADMIN_PHONE || "18652082378";'), 'Admin configuration needs review');
  for (const guard of manifest.guards) ensure(hash(extract(source, guard.name)) === guard.hash, 'Changed dependency: ' + guard.name);
  for (const patch of manifest.patches) {
    const old = extract(source, patch.name);
    ensure(hash(old) === patch.before || old === patch.after, 'Unreviewed live function: ' + patch.name);
    source = source.replace(old, () => patch.after);
  }
  return source;
}
async function main() {
  ensure(process.platform === 'linux', 'Run on the Linux production server');
  ensure(process.argv.length === 3 && ['--check', '--apply'].includes(process.argv[2]), 'Use --check or --apply');
  const root = '/www/turtlekeeper-app', service = 'turtlekeeper-api';
  const target = path.join(root, 'server/server.js');
  ensure(fs.realpathSync(target) === target, 'Symlink target rejected');
  const apps = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  const selected = apps.filter(app => app.name === service);
  ensure(selected.length === 1, 'Expected one API process');
  const pm = selected[0].pm2_env;
  ensure(pm.status === 'online' && pm.exec_mode === 'fork_mode' && pm.pm_cwd === root && pm.pm_exec_path === target, 'Unexpected API process configuration');
  // Match the application's env precedence without printing or changing secrets.
  const env = { ...pm.env, ...pm };
  const envFile = path.join(root, 'server/.env');
  if (fs.existsSync(envFile)) for (const raw of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim(), eq = line.indexOf('=');
    if (!line || line.startsWith('#') || eq < 0) continue;
    const key = line.slice(0, eq).trim(); let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (env[key] === undefined) env[key] = value;
  }
  ensure((env.ADMIN_PHONE || '18652082378') === '18652082378', 'Configured admin differs; stopped');
  const port = Number(env.PORT || 8787);
  ensure(Number.isInteger(port) && port > 0 && port < 65536, 'Invalid port');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'patches.json'), 'utf8'));
  const before = fs.readFileSync(target, 'utf8'), after = patchSource(before, manifest);
  execFileSync(process.execPath, ['--check'], { input: after, stdio: ['pipe', 'inherit', 'inherit'] });
  const version = async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/app/version`, { signal: AbortSignal.timeout(3000) });
    ensure(response.ok, 'Version endpoint failed'); return response.json();
  };
  const previousPolicy = await version();
  console.log('Preflight passed: reviewed functions, admin account, syntax, running API.');
  if (process.argv[2] === '--check') return;
  if (before.replace(/\r\n/g, '\n') === after) { console.log('Already installed; no restart needed.'); return; }
  const backupRoot = path.join(root, 'server/backups');
  fs.mkdirSync(backupRoot, { recursive: true });
  ensure(fs.realpathSync(backupRoot) === backupRoot, 'Symlink backup directory rejected');
  const backup = fs.mkdtempSync(path.join(backupRoot, 'admin-devices-'));
  fs.chmodSync(backup, 0o700);
  fs.copyFileSync(target, path.join(backup, 'server.js'));
  const run = args => execFileSync('pm2', args, { cwd: root, stdio: 'inherit' });
  let stopped = false;
  try {
    ensure(fs.readFileSync(target, 'utf8') === before, 'Source changed since preflight');
    run(['stop', service]); stopped = true;
    fs.writeFileSync(target, after);
    run(['restart', service]);
    let healthy = false;
    for (let i = 0; i < 20; i++) {
      try {
        const policy = await version();
        ensure(JSON.stringify(policy) === JSON.stringify(previousPolicy), 'Version policy changed');
        const response = await fetch(`http://127.0.0.1:${port}/api/account/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(2000) });
        ensure(response.status === 401, 'Authentication health check failed');
        healthy = true; break;
      } catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    ensure(healthy, 'Post-deployment health check failed');
    console.log('SUCCESS: admin three-device code installed; version policy preserved. Backup: ' + backup);
  } catch (error) {
    if (stopped) {
      run(['stop', service]);
      fs.copyFileSync(path.join(backup, 'server.js'), target);
      run(['restart', service]);
      console.error('Previous source restored. Backup: ' + backup);
    }
    throw error;
  }
}
module.exports = { patchSource };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
