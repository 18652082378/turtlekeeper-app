'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ROOT = '/www/turtlekeeper-app';
const SERVICE = 'turtlekeeper-api';
const BEFORE = `function verifiedMarketLocation(body) {
  const city = trimPublicText(body.city, 24);
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (body.locationSource !== "device" || !city || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { city, latitude, longitude };
}`;
const AFTER = `function canManuallySetMarketCity(user) {
  return Boolean(user && (user.phone === "17302554044" || isAdminUser(user)));
}

function verifiedMarketLocation(body, user) {
  const city = trimPublicText(body.city, 24);
  if (body.locationSource === "manual" && canManuallySetMarketCity(user)) {
    return city ? { city } : null;
  }
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (body.locationSource !== "device" || !city || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { city, latitude, longitude };
}`;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function ensure(ok, message) { if (!ok) throw new Error(message); }
function patchServer(source) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const before = BEFORE.replaceAll('\n', eol), after = AFTER.replaceAll('\n', eol);
  const oldCall = 'const location = verifiedMarketLocation(body);';
  const newCall = 'const location = verifiedMarketLocation(body, user);';
  const installed = source.includes(after);
  ensure(installed || source.split(before).length === 2, 'Unreviewed location validator; nothing changed');
  ensure(installed || !source.includes('function canManuallySetMarketCity('), 'Unexpected city helper; nothing changed');
  ensure(source.split(installed ? newCall : oldCall).length === 3, 'Expected exactly two create/update location calls');
  for (const name of ['handleMarketCreate', 'handleMarketUpdate']) {
    const start = source.indexOf('async function ' + name + '(');
    ensure(start >= 0, 'Missing handler: ' + name);
    const end = source.indexOf(eol + 'async function ', start + 1);
    const handler = source.slice(start, end < 0 ? undefined : end);
    const call = handler.indexOf(installed ? newCall : oldCall);
    const auth = handler.indexOf('const user = requireReviewUser(db, body, res);');
    ensure(call >= 0 && auth >= 0 && auth < call && handler.includes('if (!user) return;'), 'Authenticated location caller changed: ' + name);
  }
  const result = installed ? source : source.replace(before, after).replaceAll(oldCall, newCall);
  new vm.Script(result, { filename: 'server.js' });
  const check = vm.createContext({ trimPublicText: (value, max) => String(value || '').trim().slice(0, max), isAdminUser: user => user?.phone === 'configured-admin' });
  vm.runInContext(AFTER, check);
  ensure(check.verifiedMarketLocation({ locationSource: 'manual', city: '杭州市' }, { phone: '17302554044' })?.city === '杭州市', 'Designated account check failed');
  ensure(check.verifiedMarketLocation({ locationSource: 'manual', city: '上海市' }, { phone: 'configured-admin' })?.city === '上海市', 'Configured administrator check failed');
  ensure(check.verifiedMarketLocation({ locationSource: 'manual', city: '南京市', phone: '17302554044', isAdmin: true }, { phone: 'ordinary-user' }) === null, 'Ordinary account must not inherit manual city permission');
  ensure(check.verifiedMarketLocation({ locationSource: 'device', city: '南京市', latitude: 32, longitude: 118 }, { phone: 'ordinary-user' })?.city === '南京市', 'Existing device location must remain supported');
  return result;
}
function atomicWrite(file, bytes, mode) {
  const temporary = file + '.city-' + crypto.randomUUID() + '.tmp';
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', mode);
    fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
const command = args => {
  try { return execFileSync('pm2', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error('PM2 command failed: ' + args[0]); }
};
async function request(port, route, options = {}) {
  const response = await fetch('http://127.0.0.1:' + port + route, { ...options, redirect: 'error', signal: AbortSignal.timeout(3000) });
  const text = await response.text();
  ensure(text.length < 32768, 'Unexpected health response size');
  return { status: response.status, json: JSON.parse(text) };
}
async function deploy({ mode, root = ROOT, platform = process.platform, run = command, health = request,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 12, log = console.log } = {}) {
  ensure(platform === 'linux', 'Run --check/--apply on the Linux server');
  ensure(['--check', '--apply'].includes(mode), 'Use --check or --apply');
  ensure(fs.realpathSync(root) === root, 'Unexpected project directory');
  const dir = path.join(root, 'server'), file = path.join(dir, 'server.js');
  ensure(fs.realpathSync(dir) === dir && fs.realpathSync(file) === file && fs.lstatSync(file).isFile(), 'Expected a regular server.js without symlinks');
  const before = fs.readFileSync(file), after = Buffer.from(patchServer(before.toString('utf8')));
  const modeBits = fs.statSync(file).mode & 0o777;
  function processInfo() {
    const entries = JSON.parse(run(['jlist'])).filter(item => item.name === SERVICE);
    ensure(entries.length === 1, 'Expected one API process');
    const app = entries[0], env = app.pm2_env;
    ensure(app.pid > 0 && env.status === 'online' && env.exec_mode === 'fork_mode' && env.pm_cwd === root && env.pm_exec_path === file && !env.watch, 'Unexpected API process configuration');
    return app;
  }
  const originalProcess = processInfo();
  let portValue = originalProcess.pm2_env.PORT ?? originalProcess.pm2_env.env?.PORT;
  const envFile = path.join(dir, '.env');
  if (portValue === undefined && fs.existsSync(envFile)) {
    portValue = fs.readFileSync(envFile, 'utf8').match(/^\s*PORT\s*=\s*['"]?(\d+)['"]?\s*$/m)?.[1];
  }
  const port = Number(portValue || 8787);
  ensure(Number.isInteger(port) && port > 0 && port < 65536, 'Invalid API port');
  const baseline = await health(port, '/api/app/version');
  ensure(baseline.status === 200 && baseline.json?.ok === true, 'Version API unavailable');
  const policy = JSON.stringify(baseline.json);
  const anonymous = () => health(port, '/api/account/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ensure((await anonymous()).status === 401, 'Anonymous authentication check failed');
  log('PASS: location validator, authenticated callers, syntax, permissions, API process and existing version policy.');
  if (mode === '--check') return { status: 'checked', before: digest(before), after: digest(after) };
  const backups = path.join(dir, 'backups'); fs.mkdirSync(backups, { recursive: true });
  ensure(fs.realpathSync(backups) === backups, 'Symlink backup directory rejected');
  const backup = fs.mkdtempSync(path.join(backups, 'market-city-'));
  fs.chmodSync(backup, 0o700);
  fs.writeFileSync(path.join(backup, 'server.js'), before, { mode: 0o600, flag: 'wx' });
  log('Backup: ' + backup);
  ensure(digest(fs.readFileSync(file)) === digest(before) && processInfo().pid === originalProcess.pid, 'Server changed during preflight');
  const restart = () => run(['restart', SERVICE, '--kill-timeout', '30000']);
  async function verifyActive(oldPid) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const current = processInfo(), version = await health(port, '/api/app/version');
        if (current.pid !== oldPid && version.status === 200 && JSON.stringify(version.json) === policy && (await anonymous()).status === 401) return;
      } catch {}
      await wait(500);
    }
    throw new Error('Post-restart health or version-policy check failed');
  }
  let written = false, restarted = false;
  try {
    atomicWrite(file, after, modeBits); written = true;
    ensure(digest(fs.readFileSync(file)) === digest(after), 'Installed code checksum mismatch');
    restarted = true; restart(); await verifyActive(originalProcess.pid);
  } catch (error) {
    if (written || restarted) {
      try {
        ensure([digest(before), digest(after)].includes(digest(fs.readFileSync(file))), 'Concurrent source change; automatic rollback refused');
        atomicWrite(file, before, modeBits);
        let oldPid = originalProcess.pid; try { oldPid = processInfo().pid; } catch {}
        restart(); await verifyActive(oldPid);
        log('ROLLED BACK: previous source restored and API verified.');
      } catch (rollbackError) { throw new Error(error.message + '; rollback needs attention: ' + rollbackError.message + '. Backup: ' + backup); }
    }
    throw error;
  }
  log('SUCCESS: manual sale city enabled for account 17302554044 and the configured administrator. Existing data and version policy preserved.');
  log('Code and anonymous health checks only; authenticated production and iPhone acceptance remain unverified.');
  return { status: 'installed', backup, after: digest(after) };
}
module.exports = { BEFORE, AFTER, patchServer, deploy };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 1) { console.error('Use --check or --apply'); process.exitCode = 1; }
  else deploy({ mode: args[0] }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
