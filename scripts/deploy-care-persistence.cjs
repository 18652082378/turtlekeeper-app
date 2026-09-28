// Narrow production hotfix: reviewed account functions + their care dependency.
// Does not replace env, database, version policy, sessions, or unrelated routes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const ensure = (okay, message) => { if (!okay) throw Error(message); };
function extract(source, name) {
  const matches = [...source.matchAll(new RegExp('^(?:async )?function ' + name + '\\(', 'gm'))];
  ensure(matches.length === 1, 'Unexpected function: ' + name);
  const start = matches[0].index, end = source.indexOf('\n}', start);
  ensure(end > start, 'Missing function end: ' + name);
  return source.slice(start, end + 2);
}
function patchSource(source, manifest) {
  source = source.replace(/\r\n/g, '\n');
  for (const patch of manifest.patches) {
    const before = extract(source, patch.name);
    ensure(hash(before) === patch.before || before === patch.after, 'Unreviewed server function; nothing changed: ' + patch.name);
    source = source.replace(before, () => patch.after);
  }
  const dependency = "const TurtleCare = require('../assets/care-records');";
  if (!source.includes(dependency)) {
    ensure(!source.includes('TurtleCare ='), 'Unexpected care dependency');
    source = dependency + '\n' + source;
  }
  return source;
}
function verifyFunctions(source, careSource) {
  const care = { exports: {} };
  vm.runInNewContext(careSource, { module: care });
  const context = { TurtleCare: care.exports, crypto, normalizeCustomSpecies: items => items || [] };
  vm.createContext(context);
  for (const name of ['emptyAccountData', 'normalizeAccountData', 'accountDataHasContent', 'accountRecordCounts']) vm.runInContext(extract(source, name), context);
  const data = { careRecords: [{ id: 'probe', title: '喂食', itemId: 'feeding', date: '2026-09-27', note: '保存核对', turtleRefs: [{ id: 't1', code: '龟一', speciesName: '果核蛋龟' }], sourceMemoId: 'reminder' }],
    careCustomItems: [{ id: 'custom', title: '清理滤棉' }], carePlans: [{ id: 'plan', name: '全池喂食', turtleRefs: [{ id: 't1' }] }] };
  const saved = context.normalizeAccountData(data), loaded = context.normalizeAccountData(JSON.parse(JSON.stringify(saved)));
  ensure(loaded.careRecords[0]?.note === '保存核对' && loaded.careRecords[0]?.turtleRefs[0]?.id === 't1'
    && loaded.careRecords[0]?.sourceMemoId === 'reminder' && loaded.careCustomItems.length === 1 && loaded.carePlans.length === 1,
    'Care round-trip verification failed');
  ensure(context.accountDataHasContent(data) && context.accountRecordCounts(data).careRecords === 1, 'Care data guard verification failed');
}
async function main() {
  ensure(process.platform === 'linux', 'Run on the production Linux server');
  ensure(['--check', '--apply'].includes(process.argv[2]), 'Use --check or --apply');
  const root = '/www/turtlekeeper-app', service = 'turtlekeeper-api';
  const target = path.join(root, 'server/server.js'), asset = path.join(root, 'assets/care-records.js');
  ensure(fs.realpathSync(target) === target && fs.realpathSync(path.dirname(asset)) === path.dirname(asset), 'Symlink target rejected');
  if (fs.existsSync(asset)) ensure(fs.realpathSync(asset) === asset, 'Symlink care module rejected');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'care-persistence-patches.json'), 'utf8'));
  const careSource = Buffer.from(manifest.careBase64, 'base64').toString('utf8');
  ensure(hash(careSource) === manifest.careHash, 'Care module checksum mismatch');
  const before = fs.readFileSync(target, 'utf8'), oldCare = fs.existsSync(asset) ? fs.readFileSync(asset, 'utf8') : null;
  ensure(oldCare === null || manifest.acceptedCareHashes.includes(hash(oldCare.replace(/\r\n/g, '\n'))), 'Unreviewed care module; nothing changed');
  const after = patchSource(before, manifest);
  execFileSync(process.execPath, ['--check'], { input: after });
  execFileSync(process.execPath, ['--check'], { input: careSource });
  verifyFunctions(after, careSource);
  const apps = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  const selected = apps.filter(app => app.name === service);
  ensure(selected.length === 1, 'Expected one API process');
  const pm = selected[0].pm2_env;
  ensure(pm.status === 'online' && pm.exec_mode === 'fork_mode' && pm.pm_cwd === root && pm.pm_exec_path === target, 'Unexpected API process configuration');
  const env = { ...pm.env, ...pm };
  const envFile = path.join(root, 'server/.env');
  if (fs.existsSync(envFile)) for (const raw of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim(), eq = line.indexOf('=');
    if (!line || line.startsWith('#') || eq < 0) continue;
    const key = line.slice(0, eq).trim(); let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (env[key] === undefined) env[key] = value;
  }
  const port = Number(env.PORT || 8787);
  ensure(Number.isInteger(port) && port > 0 && port < 65536, 'Invalid port');
  const version = async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/app/version`, { signal: AbortSignal.timeout(3000) });
    ensure(response.ok, 'Version endpoint unavailable'); return response.json();
  };
  const oldVersion = await version();
  console.log('PASS: reviewed source, care round trip, API process and version policy.');
  if (process.argv[2] === '--check') return;
  if (before.replace(/\r\n/g, '\n') === after && oldCare?.replace(/\r\n/g, '\n') === careSource) { console.log('Already installed.'); return; }
  const backupRoot = path.join(root, 'server/backups');
  fs.mkdirSync(backupRoot, { recursive: true });
  ensure(fs.realpathSync(backupRoot) === backupRoot, 'Symlink backup folder rejected');
  const backup = fs.mkdtempSync(path.join(backupRoot, 'care-persistence-'));
  fs.chmodSync(backup, 0o700);
  fs.copyFileSync(target, path.join(backup, 'server.js'));
  if (oldCare !== null) fs.copyFileSync(asset, path.join(backup, 'care-records.js'));
  const run = args => execFileSync('pm2', args, { cwd: root, stdio: 'inherit' });
  let stopped = false;
  try {
    ensure(fs.readFileSync(target, 'utf8') === before, 'Server source changed since preflight');
    ensure((fs.existsSync(asset) ? fs.readFileSync(asset, 'utf8') : null) === oldCare, 'Care module changed since preflight');
    run(['stop', service]); stopped = true;
    fs.writeFileSync(asset, careSource);
    fs.writeFileSync(target, after);
    run(['restart', service]);
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      try {
        ensure(JSON.stringify(await version()) === JSON.stringify(oldVersion), 'Version policy changed');
        const response = await fetch(`http://127.0.0.1:${port}/api/account/load`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(2000) });
        ensure(response.status === 401, 'Account route health check failed');
        healthy = true; break;
      } catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    ensure(healthy, 'API health check failed');
    console.log('SUCCESS: care persistence installed; version policy preserved. Backup: ' + backup);
  } catch (error) {
    if (stopped) {
      run(['stop', service]);
      fs.copyFileSync(path.join(backup, 'server.js'), target);
      if (oldCare === null) { if (fs.existsSync(asset)) fs.unlinkSync(asset); }
      else fs.copyFileSync(path.join(backup, 'care-records.js'), asset);
      run(['restart', service]);
      console.error('Rolled back source. Backup: ' + backup);
    }
    throw error;
  }
}
module.exports = { extract, patchSource, verifyFunctions };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
