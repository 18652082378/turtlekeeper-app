'use strict';
// Targeted API patch; preserves all user data, environment and update policies.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const legacy = require('./deploy-mediation-applications.cjs');
const ROOT = '/www/turtlekeeper-app', SERVICE = 'turtlekeeper-api';
const { hash, dataCompatibility } = legacy;
const normal = value => value.toString().replace(/\r\n/g, '\n');
const ensure = (ok, message) => { if (!ok) throw Error(message); };
function validate(pkg) {
  ensure(pkg?.format === 'turtle-market-alerts-api-v1' && pkg.build === 142 && pkg.version === '1.2.2', 'Unexpected deployment package');
  legacy.validate(pkg.mediation);
  ensure(pkg.modules?.length === 3 && pkg.patches?.length === 11, 'Incomplete market alert package');
  const names = ['server/market-alerts.js', 'server/community-daily-push.js', 'server/mediation-service.js'];
  return pkg.modules.map((module, index) => {
    ensure(module.name === names[index] && typeof module.base64 === 'string' && Array.isArray(module.previousHashes), 'Unexpected API module');
    const bytes = Buffer.from(module.base64, 'base64');
    ensure(bytes.length < 100000 && bytes.toString('base64') === module.base64 && hash(bytes) === module.sha256, 'API module checksum mismatch');
    new vm.Script(bytes.toString()); return bytes;
  });
}
function patchServer(input, pkg) {
  validate(pkg); let source = normal(legacy.patchServer(input, pkg.mediation));
  for (const { before, after } of pkg.patches) {
    ensure(typeof before === 'string' && before.length && typeof after === 'string' && after.length < 20000, 'Invalid source patch');
    if (source.split(after).length === 2) continue;
    ensure(source.split(before).length === 2, 'Unrecognized market alert source anchor; nothing changed');
    source = source.replace(before, after);
  }
  new vm.Script(source); return input.toString().includes('\r\n') ? source.replace(/\n/g, '\r\n') : source;
}
module.exports = { validate, patchServer, dataCompatibility, hash };
function regular(file) {
  ensure(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, 'Expected regular source file: ' + path.basename(file));
  return fs.readFileSync(file);
}
function atomicWrite(file, bytes, metadata) {
  const temporary = file + '.mediation-' + crypto.randomUUID() + '.tmp'; let fd;
  try {
    fd = fs.openSync(temporary, 'wx', metadata.mode);
    if (process.platform !== 'win32' && metadata.uid !== undefined) fs.fchownSync(fd, metadata.uid, metadata.gid);
    fs.fchmodSync(fd, metadata.mode); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file);
  } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
async function request(port, route, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, { ...options, signal: AbortSignal.timeout(3000), redirect: 'error' });
  const text = await response.text(); ensure(text.length < 32768, 'Unexpected API health response');
  return { status: response.status, json: JSON.parse(text) };
}
async function deploy({ pkg, mode = '--check', root = ROOT, platform = process.platform,
  run = args => execFileSync('pm2', args, { cwd: root, encoding: 'utf8', maxBuffer: 8e6, timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'] }),
  health = request, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), log = console.log } = {}) {
  ensure(platform === 'linux' && ['--check', '--apply'].includes(mode), 'Run --check or --apply in the Linux server Shell');
  ensure(fs.realpathSync(root) === root && fs.realpathSync(path.join(root, 'server')) === path.join(root, 'server'), 'Unexpected project directory');
  const moduleBytes = validate(pkg), file = path.join(root, 'server/server.js');
  const modules = pkg.modules.map((entry, index) => ({ ...entry, file: path.join(root, entry.name), bytes: moduleBytes[index] }));
  const before = regular(file), after = Buffer.from(patchServer(before, pkg)), stat = fs.statSync(file);
  const metadata = { mode: stat.mode & 0o777, uid: stat.uid, gid: stat.gid };
  for (const entry of modules) {
    entry.previous = fs.existsSync(entry.file) ? regular(entry.file) : null;
    if (entry.previous) ensure([entry.sha256, ...entry.previousHashes].includes(hash(Buffer.from(normal(entry.previous)))), 'Unreviewed existing API module: ' + entry.name + '; nothing changed');
    if (entry.name.endsWith('community-daily-push.js')) ensure(entry.previous, 'Daily recommendation service missing; nothing changed');
  }
  function info() {
    const apps = JSON.parse(run(['jlist'])).filter(item => item.name === SERVICE);
    ensure(apps.length === 1, 'Expected one API process');
    const app = apps[0], env = app.pm2_env;
    ensure(app.pid > 0 && env.status === 'online' && env.exec_mode === 'fork_mode' && env.pm_cwd === root && env.pm_exec_path === file && !env.watch, 'Unexpected API process');
    return app;
  }
  const processBefore = info(), env = processBefore.pm2_env, envFile = path.join(root, 'server/.env');
  const port = Number(env.PORT ?? env.env?.PORT ?? (fs.existsSync(envFile) ? regular(envFile).toString().match(/^\s*PORT\s*=\s*['"]?(\d+)['"]?\s*$/m)?.[1] : undefined) ?? 8787);
  ensure(Number.isInteger(port) && port > 0 && port < 65536, 'Invalid API port');
  const policyRoutes = ['/api/app/version?platform=ios&build=136', '/api/app/version?platform=ios&build=142', '/api/app/version?platform=android&channel=store', '/api/app/version?platform=android&channel=beta', '/api/app/version?platform=web'];
  const policy = [];
  for (const route of policyRoutes) { const response = await health(port, route); ensure(response.status === 200 && response.json?.ok, 'Existing version API failed'); policy.push(JSON.stringify(response.json)); }
  const auth = route => health(port, route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ensure((await auth('/api/account/load')).status === 401, 'Existing account authentication failed');
  log('PASS: API source, module checksum, syntax, PM2 process and iOS/Android/web policy baselines.');
  if (mode === '--check') return { status: 'checked' };
  const changed = hash(before) !== hash(after) || modules.some(entry => !entry.previous || hash(entry.previous) !== hash(entry.bytes));
  if (!changed && (await auth('/api/market/alerts/preference')).status === 401) { log('ALREADY INSTALLED: marketplace species alerts API.'); return { status: 'installed' }; }
  const backups = path.join(root, 'server/backups'); fs.mkdirSync(backups, { recursive: true }); ensure(fs.realpathSync(backups) === backups, 'Unexpected backup directory');
  const backup = fs.mkdtempSync(path.join(backups, 'market-alerts-142-')); fs.chmodSync(backup, 0o700);
  fs.writeFileSync(path.join(backup, 'server.js'), before, { flag: 'wx', mode: 0o600 });
  for (const entry of modules) if (entry.previous) fs.writeFileSync(path.join(backup, path.basename(entry.file)), entry.previous, { flag: 'wx', mode: 0o600 });
  log('Source backup: ' + backup);
  const restart = () => run(['restart', SERVICE, '--kill-timeout', '30000']);
  async function verify(pid, installed) {
    let reason = 'API startup pending';
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        ensure(info().pid !== pid, 'API restart not complete');
        for (const [index, route] of policyRoutes.entries()) { const response = await health(port, route); ensure(response.status === 200 && JSON.stringify(response.json) === policy[index], 'Version policy changed'); }
        ensure((await auth('/api/account/load')).status === 401, 'Account authentication not ready');
        if (installed) for (const route of ['/api/market/alerts/preference', '/api/market/alerts/open', '/api/mediation/list']) ensure((await auth(route)).status === 401, 'Application endpoint not ready: ' + route);
        return;
      } catch (error) { reason = error.message; }
      if (attempt === 0) log('Waiting for API readiness: ' + reason);
      await wait(1000);
    }
    throw Error('API health check failed: ' + reason);
  }
  let wrote = false;
  try {
    ensure(info().pid === processBefore.pid && hash(regular(file)) === hash(before) && modules.every(entry => entry.previous ? hash(regular(entry.file)) === hash(entry.previous) : !fs.existsSync(entry.file)), 'Source/process changed during preflight');
    wrote = true; for (const entry of modules) atomicWrite(entry.file, entry.bytes, metadata); atomicWrite(file, after, metadata);
    restart(); await verify(processBefore.pid, true);
  } catch (error) {
    if (wrote) {
      ensure([hash(before), hash(after)].includes(hash(regular(file))) && modules.every(entry => !fs.existsSync(entry.file) || [entry.previous && hash(entry.previous), hash(entry.bytes)].includes(hash(regular(entry.file)))), 'Concurrent source changes preserved; manual recovery required. Backup: ' + backup);
      let pid = processBefore.pid; try { pid = info().pid; } catch { /* Use original PID for retry. */ }
      // Preserve this collection even if an application was submitted during
      // the failed startup window. Never roll a user's database back.
      const rollback = Buffer.from(dataCompatibility(before));
      atomicWrite(file, rollback, metadata);
      for (const entry of modules) { if (entry.previous) atomicWrite(entry.file, entry.previous, metadata); else if (fs.existsSync(entry.file)) fs.unlinkSync(entry.file); }
      try { restart(); await verify(pid, false); }
      catch (rollbackError) { throw Error(`Install failed: ${error.message}. Recovery needs attention: ${rollbackError.message}. Backup: ${backup}`); }
      throw Error(`Install failed: ${error.message}. Previous API restored with application-storage compatibility. Backup: ${backup}`);
    }
    throw error;
  }
  log('SUCCESS: marketplace species alerts API installed and verified; existing accounts, uploads, environment and platform update policies preserved.');
  log('Install iOS 1.2.2 (142) to use the new application screens. Website HTML was not replaced.');
  return { status: 'installed', backup };
}
module.exports = { validate, patchServer, dataCompatibility, deploy, hash };
if (require.main === module) {
  const [mode, root = ROOT, manifest = path.resolve(__dirname, '../deploy/market-alerts-142/server.json'), ...extra] = process.argv.slice(2);
  if (extra.length) throw Error('Use: --check|--apply root package-json');
  deploy({ mode, root, pkg: JSON.parse(fs.readFileSync(manifest, 'utf8')) }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
