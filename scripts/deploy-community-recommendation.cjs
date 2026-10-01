'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { BASE_HASH, TARGET_HASH, patchMain } = require('./community-admin-recommendation-patch.cjs');
const ROOT = '/www/turtlekeeper-app';
const SERVICE = 'turtlekeeper-api';
const MAIN_HASH = BASE_HASH;
const OLD_HASHES = ['8a5b224eaf1ce2e8293a23eee68e91def5a43e43412f908fb7c44895911bc0c6', '0298d7f9f7de8cf82726dd58cc1e645d7da8faa8f5e9d83a79864883e9b724a0', 'f104a92402e1b3f2f2fa649c63db27a9ae46138d30a5f1bdf87aa8e6a2b5a466'];
const NEW_HASH = 'b931d91c7324037aaf040770d1cd69c97ecd67e34d0bff59c97d1cecebcb919f';
// Reviewed sources contain no multiline string/template literals. Ignore only
// transport formatting, preserving every nonblank source line and its order.
const FORMATTED_HASHES = [
  '7d3dd96aa214c54dc07912e2717af56d8a4d93600dead054a2bb2352a839c3b6',
  '56e8996a15803aaf66155adb23317e98a763aaf043afb9a894d19e5b13eb5efb',
  '3b11ba8110024d76f0f8ce818dddb75676774d999fc420cf2fdb697f392ec51d',
  // Legacy fixed title spelling visible in the supplied server screenshot.
  // Every other source line must still match the reviewed original module.
  '027d5ff1027c406bfb74ca05a74bb5e082eb06d982c12783dc711404a1b1166f'
];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function formattingHash(bytes) {
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return hash(text.split('\n').map(line => line.replace(/^[\t ]+|[\t ]+$/g, '')).filter(line => line !== '').join('\n'));
}
const ensure = (value, message) => { if (!value) throw Error(message); };
function regular(file) { ensure(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file, 'Regular file required: ' + file); }
function atomic(file, bytes, mode) {
  const temp = `${file}.recommendation-${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temp, bytes, { flag: 'wx', mode }); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function command(args) {
  try { return execFileSync('pm2', args, { cwd: ROOT, encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw Error('PM2 command failed: ' + args[0]); }
}
async function request(port, route, options) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(3000) });
  return { status: response.status, json: await response.json() };
}
async function deploy({ mode, root = ROOT, payload = __dirname, platform = process.platform, run = command, get = request,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)), log = console.log, attempts = 20, atomicWrite = atomic } = {}) {
  ensure(platform === 'linux', 'Run this on the Linux server');
  ensure(['--check', '--apply'].includes(mode), 'Use --check or --apply');
  const dir = path.join(root, 'server');
  ensure(fs.realpathSync(root) === root && fs.realpathSync(dir) === dir, 'Unexpected server directory');
  const main = path.join(dir, 'server.js'), target = path.join(dir, 'community-daily-push.js');
  const file = path.join(payload, 'community-daily-push.js');
  for (const value of [main, target, file]) regular(value);
  const mainBefore = fs.readFileSync(main), mainAfter = Buffer.from(patchMain(mainBefore.toString('utf8')));
  const before = fs.readFileSync(target), after = fs.readFileSync(file);
  const exactModule = [...OLD_HASHES, NEW_HASH].includes(hash(before));
  ensure(exactModule || FORMATTED_HASHES.includes(formattingHash(before)),
    `Unreviewed recommendation module; nothing changed. SHA256=${hash(before)}; formattingSHA256=${formattingHash(before)}`);
  ensure(hash(after) === NEW_HASH, 'Payload checksum mismatch');
  execFileSync(process.execPath, ['--check'], { input: before, stdio: ['pipe', 'pipe', 'pipe'] });
  execFileSync(process.execPath, ['--check'], { input: after, stdio: ['pipe', 'pipe', 'pipe'] });
  execFileSync(process.execPath, ['--check'], { input: mainAfter, stdio: ['pipe', 'pipe', 'pipe'] });
  function info() {
    const rows = JSON.parse(run(['jlist'])).filter(item => item.name === SERVICE);
    ensure(rows.length === 1, 'Expected one API process');
    const app = rows[0], env = app.pm2_env;
    ensure(app.pid > 0 && env.status === 'online' && env.exec_mode === 'fork_mode' && !env.watch && env.pm_cwd === root && env.pm_exec_path === main, 'Unexpected API process configuration');
    return app;
  }
  const processBefore = info();
  let configuredPort = processBefore.pm2_env.PORT ?? processBefore.pm2_env.env?.PORT;
  const envFile = path.join(dir, '.env');
  if (configuredPort === undefined && fs.existsSync(envFile)) {
    configuredPort = fs.readFileSync(envFile, 'utf8').match(/^\s*PORT\s*=\s*([^\r\n]*)/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  const port = Number(configuredPort || 8787); ensure(Number.isInteger(port) && port > 0 && port < 65536, 'Invalid API port');
  const auth = () => get(port, '/api/account/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const version = await get(port, '/api/app/version');
  ensure(version.status === 200 && version.json?.ok === true && (await auth()).status === 401, 'Preflight API check failed');
  const policy = JSON.stringify(version.json);
  log('PASS: exact release-120 server, recommendation module, payload, syntax, process and API.');
  if (!exactModule) log('PASS: existing module matches reviewed formatting/legacy-title variants. Original bytes will be backed up.');
  if (mode === '--check') return { status: 'checked' };
  const backups = path.join(dir, 'backups'); fs.mkdirSync(backups, { recursive: true });
  ensure(fs.realpathSync(backups) === backups, 'Unexpected backup directory');
  const backup = fs.mkdtempSync(path.join(backups, 'community-recommendation-')); fs.chmodSync(backup, 0o700);
  fs.writeFileSync(path.join(backup, 'community-daily-push.js'), before, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(path.join(backup, 'server.js'), mainBefore, { mode: 0o600, flag: 'wx' });
  log('Backup: ' + backup);
  const changes = [
    { file: main, before: mainBefore, after: mainAfter, digest: TARGET_HASH, mode: fs.statSync(main).mode & 0o777 },
    { file: target, before, after, digest: NEW_HASH, mode: fs.statSync(target).mode & 0o777 }
  ];
  const restart = () => run(['restart', SERVICE, '--kill-timeout', '30000']);
  async function healthy(previousPid) {
    let count = 0, lastPid = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const current = info(); ensure(current.pid !== previousPid, 'Old process is still running');
        const response = await get(port, '/api/app/version');
        ensure(response.status === 200 && JSON.stringify(response.json) === policy && (await auth()).status === 401, 'API/policy check failed');
        count = lastPid === current.pid ? count + 1 : 1; lastPid = current.pid;
        if (count === 2) return;
      } catch { count = 0; lastPid = null; }
      await wait(500);
    }
    throw Error('Post-restart API health check failed');
  }
  ensure(hash(fs.readFileSync(main)) === hash(mainBefore) && hash(fs.readFileSync(target)) === hash(before) && info().pid === processBefore.pid, 'Server changed during preflight');
  const changed = [];
  let restarted = false;
  try {
    // Restart even if disk already matches: the old process may still have
    // cached the previous module. No real-user push is used as a health probe.
    for (const change of changes) {
      ensure(hash(fs.readFileSync(change.file)) === hash(change.before), 'Concurrent source change');
      atomicWrite(change.file, change.after, change.mode); changed.push(change);
      ensure(hash(fs.readFileSync(change.file)) === change.digest, 'Installed checksum mismatch');
    }
    restarted = true; restart(); await healthy(processBefore.pid);
  } catch (error) {
    if (changed.length) {
      try {
        for (const change of changed) ensure(hash(fs.readFileSync(change.file)) === change.digest, 'Concurrent code change; automatic rollback refused');
        for (const change of [...changed].reverse()) atomicWrite(change.file, change.before, change.mode);
        if (restarted) {
          let rollbackPid = processBefore.pid; try { rollbackPid = info().pid; } catch {}
          restart(); await healthy(rollbackPid);
        }
        log('ROLLED BACK: previous administrator API and recommendation module restored. Backup: ' + backup);
      } catch (rollbackError) { throw Error(`${error.message}; rollback needs attention: ${rollbackError.message}. Backup: ${backup}`); }
    }
    throw error;
  }
  try { run(['save']); } catch { log('WARNING: API passed, but pm2 save failed. Check the process list then run pm2 save.'); }
  log('SUCCESS: administrator approval overrides keyword hints; reviewed-post title and image payload installed. Real iPhone notification acceptance still required.');
  return { status: 'installed', backup };
}
module.exports = { deploy, MAIN_HASH, OLD_HASHES, NEW_HASH, FORMATTED_HASHES, formattingHash };
if (require.main === module) {
  if (process.argv.length !== 3) { console.error('Use --check or --apply'); process.exitCode = 1; }
  else deploy({ mode: process.argv[2] }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
