'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ROOT = '/www/turtlekeeper-app', SERVICE = 'turtlekeeper-api';
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
const ensure = (yes, text) => { if (!yes) throw Error(text); };
function patchSource(source, hunks) {
  const crlf = source.includes('\r\n'); let result = source.replace(/\r\n/g, '\n');
  for (const [index, { before, after }] of hunks.entries()) {
    const oldCount = result.split(before).length - 1, newCount = result.split(after).length - 1;
    // Insertions contain their original anchor; removals contain the restored
    // anchor. Prefer the larger matching form so migration can remove a patch.
    if (newCount === 1 && (oldCount === 0 || after.includes(before) && oldCount === 1)) continue;
    ensure(oldCount === 1 && (newCount === 0 || before.includes(after) && newCount === 1), `Unreviewed source at fragment ${index + 1} (original=${oldCount}, installed=${newCount}); nothing changed`);
    result = result.replace(before, after);
  }
  return crlf ? result.replace(/\n/g, '\r\n') : result;
}
function atomicWrite(file, bytes, mode) {
  const tmp = file + '.weather-' + crypto.randomUUID() + '.tmp';
  try { fs.writeFileSync(tmp, bytes, { flag: 'wx', mode }); const fd = fs.openSync(tmp, 'r+'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } fs.renameSync(tmp, file); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
async function request(port, route, options = {}) {
  const r = await fetch(`http://127.0.0.1:${port}${route}`, { ...options, signal: AbortSignal.timeout(3000), redirect: 'error' });
  const text = await r.text(); ensure(text.length < 32768, 'Unexpected health response'); return { status: r.status, json: JSON.parse(text) };
}
async function deploy({ mode, root = ROOT, platform = process.platform, run = args => execFileSync('pm2', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'] }), health = request, wait = ms => new Promise(r => setTimeout(r, ms)), log = console.log } = {}) {
  ensure(platform === 'linux' && ['--check', '--apply'].includes(mode), 'Run --check or --apply on the Linux server');
  ensure(fs.realpathSync(root) === root && fs.realpathSync(path.join(root, 'server')) === path.join(root, 'server'), 'Unexpected project path');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'weather-reminders-server-patch.json'), 'utf8'));
  const modules = Object.entries(manifest.modules).map(([relative, hash]) => {
    ensure(['server/weather-reminders.js', 'server/weatherkit-provider.js', 'server/weather-cities.json'].includes(relative), 'Unexpected module target');
    const payload = fs.readFileSync(path.join(__dirname, '..', relative)), file = path.join(root, relative);
    ensure(digest(payload) === hash, 'Weather module checksum mismatch');
    if (relative.endsWith('.js')) new vm.Script(payload.toString('utf8')); else JSON.parse(payload);
    if (fs.existsSync(file)) ensure(fs.realpathSync(file) === file && fs.lstatSync(file).isFile(), 'Unexpected module path');
    const before = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (before) ensure(digest(before) === hash || relative === 'server/weather-reminders.js' && digest(before) === manifest.legacy?.moduleHash, 'Unreviewed existing weather module');
    return { relative, file, before, after: payload, mode: before ? fs.statSync(file).mode & 0o777 : 0o644 };
  });
  const files = Object.entries(manifest.patches).map(([relative, hunks]) => {
    ensure(['server/server.js', 'privacy.html'].includes(relative), 'Unexpected patch target');
    const file = path.join(root, relative); ensure(fs.realpathSync(file) === file && fs.lstatSync(file).isFile(), 'Target must be a regular file');
    const before = fs.readFileSync(file); let patched;
    try {
      const source = before.toString('utf8');
      // Retire the reviewed QWeather disclosure before inserting Apple Weather.
      const legacyPrivacy = relative === 'privacy.html' && source.includes('和风天气（QWeather，仅在使用温度提醒时）');
      patched = patchSource(legacyPrivacy ? patchSource(source, manifest.legacy.patches[relative].map(h => ({ before: h.after, after: h.before }))) : source, hunks);
    }
    catch (error) {
      const legacy = manifest.legacy?.patches?.[relative];
      try {
        if (!legacy) throw error;
        patched = patchSource(patchSource(before.toString('utf8'), legacy.map(h => ({ before: h.after, after: h.before }))), hunks);
      } catch { throw Error(`${relative}: ${error.message}`); }
    }
    const after = Buffer.from(patched);
    if (relative.endsWith('.js')) new vm.Script(after.toString('utf8'));
    return { file, relative, before, after, mode: fs.statSync(file).mode & 0o777 };
  });
  function info() {
    const rows = JSON.parse(run(['jlist'])).filter(p => p.name === SERVICE); ensure(rows.length === 1, 'Expected one API process');
    const p = rows[0], e = p.pm2_env;
    ensure(p.pid > 0 && e.status === 'online' && e.exec_mode === 'fork_mode' && e.pm_cwd === root && e.pm_exec_path === path.join(root, 'server/server.js') && !e.watch, 'Unexpected API process'); return p;
  }
  const original = info();
  const envFile = path.join(root, 'server/.env');
  const port = Number(original.pm2_env.PORT ?? original.pm2_env.env?.PORT ?? (fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').match(/^\s*PORT\s*=\s*['"]?(\d+)['"]?\s*$/m)?.[1] : undefined) ?? 8787);
  ensure(Number.isInteger(port) && port > 0 && port < 65536, 'Invalid API port');
  const baseline = await health(port, '/api/app/version'); ensure(baseline.status === 200 && baseline.json?.ok, 'Version API unavailable');
  const policy = JSON.stringify(baseline.json);
  const auth = route => health(port, route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ensure((await auth('/api/account/load')).status === 401, 'Authentication health failed');
  log('PASS: reviewed source, payload, syntax, process and existing version policy.');
  if (mode === '--check') return { status: 'checked' };
  const backups = path.join(root, 'server/backups'); fs.mkdirSync(backups, { recursive: true }); ensure(fs.realpathSync(backups) === backups, 'Unexpected backup path');
  const backup = fs.mkdtempSync(path.join(backups, 'weather-reminders-')); fs.chmodSync(backup, 0o700);
  [...files, ...modules].filter(f => f.before).forEach(f => fs.writeFileSync(path.join(backup, f.relative.replaceAll('/', '_')), f.before, { flag: 'wx', mode: 0o600 }));
  const restart = () => run(['restart', SERVICE, '--kill-timeout', '30000']);
  async function verify(pid, installed) {
    for (let i = 0; i < 12; i++) {
      try { const version = await health(port, '/api/app/version'); if (info().pid !== pid && version.status === 200 && JSON.stringify(version.json) === policy && (await auth('/api/account/load')).status === 401 && (!installed || (await auth('/api/weather/settings')).status === 401)) return; } catch {}
      await wait(500);
    }
    throw Error('Restart health check failed');
  }
  let wrote = false;
  try {
    ensure(info().pid === original.pid && [...files, ...modules].every(f => f.before ? fs.existsSync(f.file) && digest(fs.readFileSync(f.file)) === digest(f.before) : !fs.existsSync(f.file)), 'Source/process changed during preflight');
    wrote = true;
    for (const f of [...modules, ...files]) atomicWrite(f.file, f.after, f.mode);
    restart(); await verify(original.pid, true);
  } catch (error) {
    if (wrote) {
      ensure([...files, ...modules].every(f => fs.existsSync(f.file) ? [f.before && digest(f.before), digest(f.after)].includes(digest(fs.readFileSync(f.file))) : !f.before), 'Concurrent change; rollback requires review. Backup: ' + backup);
      let pid = original.pid; try { pid = info().pid; } catch {}
      for (const f of [...files, ...modules]) { if (f.before) atomicWrite(f.file, f.before, f.mode); else if (fs.existsSync(f.file)) fs.unlinkSync(f.file); }
      restart(); await verify(pid, false); log('ROLLED BACK: previous code restored.');
    }
    throw error;
  }
  log('Backup: ' + backup);
  log('SUCCESS: Apple WeatherKit reminder API and scheduler installed; data and version policy preserved. Configure WeatherKit credentials and verify on iPhone before release.');
  return { status: 'installed', backup };
}
module.exports = { patchSource, deploy };
if (require.main === module) deploy({ mode: process.argv.length === 3 ? process.argv[2] : '' }).catch(e => { console.error(e.message); process.exitCode = 1; });
