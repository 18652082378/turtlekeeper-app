'use strict';
// Linux API-only installer. The mobile/web package carries the application UI.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ROOT = '/www/turtlekeeper-app', SERVICE = 'turtlekeeper-api';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const normal = value => value.toString().replace(/\r\n/g, '\n');
const ensure = (ok, message) => { if (!ok) throw Error(message); };
function once(source, before, after) {
  const beforeCount = source.split(before).length - 1, afterCount = source.split(after).length - 1;
  if (afterCount === 1 && after.includes(before) && beforeCount === 1) return source;
  ensure(beforeCount === 1 && afterCount === 0, 'Unrecognized source anchor; nothing changed');
  return source.replace(before, after);
}
function region(source, start, end, fn) {
  const from = source.indexOf(start), until = source.indexOf(end, from + start.length);
  ensure(from >= 0 && until > from && source.indexOf(start, from + 1) < 0, 'Unrecognized database function; nothing changed');
  return source.slice(0, from) + fn(source.slice(from, until)) + source.slice(until);
}
function dataCompatibility(input) {
  let source = normal(input);
  source = region(source, 'function emptyDatabase()', 'class DatabaseIntegrityError', block => {
    if (block.includes('mediationApplications: []')) return block;
    return once(block, 'return {', 'return { mediationApplications: [],');
  });
  source = region(source, 'function normalizeDatabase(', 'async function initializeMysqlDatabase()', block => {
    const field = 'mediationApplications: Array.isArray(data.mediationApplications) ? data.mediationApplications : []';
    if (block.includes(field)) return block;
    return once(block, 'return {', 'return {\n    ' + field + ',');
  });
  source = region(source, 'async function handleDeleteAccount(', 'function trimPublicText(', block => {
    const cleanup = 'db.mediationApplications = (db.mediationApplications || []).filter(item => item.ownerId !== user.mediationOwnerId);';
    if (block.includes(cleanup)) return block;
    ensure(block.includes('const user = requireReviewUser'), 'Unrecognized account deletion; nothing changed');
    return once(block, 'delete db.users[phone];', cleanup + '\n  delete db.users[phone];');
  });
  new vm.Script(source);
  return source;
}
function validate(pkg) {
  ensure(pkg?.format === 'turtle-mediation-api-v1' && pkg.build === 141 && pkg.version === '1.2.1', 'Unexpected deployment package');
  ensure(typeof pkg.bootstrap === 'string' && pkg.bootstrap.length < 12000 && typeof pkg.route === 'string' && pkg.route.length < 1000, 'Invalid API patch');
  ensure(pkg.module?.name === 'server/mediation-service.js' && typeof pkg.module.base64 === 'string', 'Unexpected API module');
  const bytes = Buffer.from(pkg.module.base64, 'base64');
  ensure(bytes.length < 100000 && bytes.toString('base64') === pkg.module.base64 && hash(bytes) === pkg.module.sha256, 'API module checksum mismatch');
  new vm.Script(bytes.toString('utf8'));
  return bytes;
}
function patchServer(input, pkg) {
  validate(pkg);
  const original = normal(input);
  for (const name of ['isAdminUser', 'isMarketProhibitedSpecies', 'recordAdminAudit', 'readJson', 'readDatabase', 'writeDatabase', 'requireReviewUser', 'sendJson']) {
    ensure(new RegExp('function\\s+' + name + '\\s*\\(').test(original), 'Required server helper missing: ' + name);
  }
  let source = dataCompatibility(original);
  const importLine = "const { createMediationService } = require('./mediation-service');";
  if (!source.includes(importLine)) source = once(source, 'function loadEnvFile(', importLine + '\n\nfunction loadEnvFile(');
  const serverLine = 'const server = http.createServer(async (req, res) => {';
  if (source.includes('async function handleMediationRequest(')) ensure(source.includes(pkg.bootstrap), 'Existing mediation handler differs; nothing changed');
  else source = once(source, serverLine, pkg.bootstrap + serverLine);
  const options = 'if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });\n  try {';
  if (!source.includes(pkg.route)) source = once(source, options, options + '\n' + pkg.route);
  new vm.Script(source);
  return input.toString().includes('\r\n') ? source.replace(/\n/g, '\r\n') : source;
}
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
  const moduleBytes = validate(pkg), file = path.join(root, 'server/server.js'), moduleFile = path.join(root, pkg.module.name);
  const before = regular(file), after = Buffer.from(patchServer(before, pkg)), stat = fs.statSync(file);
  const metadata = { mode: stat.mode & 0o777, uid: stat.uid, gid: stat.gid };
  const previousModule = fs.existsSync(moduleFile) ? regular(moduleFile) : null;
  if (previousModule) ensure(hash(Buffer.from(normal(previousModule))) === pkg.module.sha256, 'Unreviewed existing mediation module; nothing changed');
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
  const policyRoutes = ['/api/app/version?platform=ios&build=136', '/api/app/version?platform=ios&build=141', '/api/app/version?platform=android&channel=store', '/api/app/version?platform=android&channel=beta', '/api/app/version?platform=web'];
  const policy = [];
  for (const route of policyRoutes) { const response = await health(port, route); ensure(response.status === 200 && response.json?.ok, 'Existing version API failed'); policy.push(JSON.stringify(response.json)); }
  const auth = route => health(port, route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ensure((await auth('/api/account/load')).status === 401, 'Existing account authentication failed');
  log('PASS: API source, module checksum, syntax, PM2 process and iOS/Android/web policy baselines.');
  if (mode === '--check') return { status: 'checked' };
  const changed = hash(before) !== hash(after) || !previousModule;
  if (!changed && (await auth('/api/mediation/list')).status === 401) { log('ALREADY INSTALLED: mediation application API.'); return { status: 'installed' }; }
  const backups = path.join(root, 'server/backups'); fs.mkdirSync(backups, { recursive: true }); ensure(fs.realpathSync(backups) === backups, 'Unexpected backup directory');
  const backup = fs.mkdtempSync(path.join(backups, 'mediation-141-')); fs.chmodSync(backup, 0o700);
  fs.writeFileSync(path.join(backup, 'server.js'), before, { flag: 'wx', mode: 0o600 });
  if (previousModule) fs.writeFileSync(path.join(backup, 'mediation-service.js'), previousModule, { flag: 'wx', mode: 0o600 });
  log('Source backup: ' + backup);
  const restart = () => run(['restart', SERVICE, '--kill-timeout', '30000']);
  async function verify(pid, installed) {
    let reason = 'API startup pending';
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        ensure(info().pid !== pid, 'API restart not complete');
        for (const [index, route] of policyRoutes.entries()) { const response = await health(port, route); ensure(response.status === 200 && JSON.stringify(response.json) === policy[index], 'Version policy changed'); }
        ensure((await auth('/api/account/load')).status === 401, 'Account authentication not ready');
        if (installed) for (const action of ['create', 'list', 'detail', 'withdraw', 'update']) ensure((await auth('/api/mediation/' + action)).status === 401, 'Mediation endpoint not ready: ' + action);
        return;
      } catch (error) { reason = error.message; }
      if (attempt === 0) log('Waiting for API readiness: ' + reason);
      await wait(1000);
    }
    throw Error('API health check failed: ' + reason);
  }
  let wrote = false;
  try {
    ensure(info().pid === processBefore.pid && hash(regular(file)) === hash(before) && (previousModule ? hash(regular(moduleFile)) === hash(previousModule) : !fs.existsSync(moduleFile)), 'Source/process changed during preflight');
    wrote = true; atomicWrite(moduleFile, moduleBytes, metadata); atomicWrite(file, after, metadata);
    restart(); await verify(processBefore.pid, true);
  } catch (error) {
    if (wrote) {
      ensure([hash(before), hash(after)].includes(hash(regular(file))) && (!fs.existsSync(moduleFile) || [previousModule && hash(previousModule), hash(moduleBytes)].includes(hash(regular(moduleFile)))), 'Concurrent source changes preserved; manual recovery required. Backup: ' + backup);
      let pid = processBefore.pid; try { pid = info().pid; } catch { /* Use original PID for retry. */ }
      // Preserve this collection even if an application was submitted during
      // the failed startup window. Never roll a user's database back.
      const rollback = Buffer.from(dataCompatibility(before));
      atomicWrite(file, rollback, metadata);
      if (previousModule) atomicWrite(moduleFile, previousModule, metadata); else if (fs.existsSync(moduleFile)) fs.unlinkSync(moduleFile);
      try { restart(); await verify(pid, false); }
      catch (rollbackError) { throw Error(`Install failed: ${error.message}. Recovery needs attention: ${rollbackError.message}. Backup: ${backup}`); }
      throw Error(`Install failed: ${error.message}. Previous API restored with application-storage compatibility. Backup: ${backup}`);
    }
    throw error;
  }
  log('SUCCESS: mediation application API installed and verified; existing accounts, uploads, environment and platform update policies preserved.');
  log('Install iOS 1.2.1 (141) to use the new application screens. Website HTML was not replaced.');
  return { status: 'installed', backup };
}
module.exports = { validate, patchServer, dataCompatibility, deploy, hash };
if (require.main === module) {
  const [mode, root = ROOT, manifest = path.resolve(__dirname, '../deploy/mediation-141/server.json'), ...extra] = process.argv.slice(2);
  if (extra.length) throw Error('Use: --check|--apply root package-json');
  deploy({ mode, root, pkg: JSON.parse(fs.readFileSync(manifest, 'utf8')) }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
