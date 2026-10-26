'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ROOT = '/www/turtlekeeper-app', SERVICE = 'turtlekeeper-api';
const MINIMUM=137,LATEST=139;
const MESSAGE="龟友手账 1.1.9 已正式上线。1.1.8 及更早版本已停止支持，请前往 App Store 更新后继续使用。";
const BEFORE_HASH='762564c999903e2b762841bdedc2229242f327b910f65220cbfb705c3c9a00c6',AFTER_HASH='90e93031aa0495e39f997238305f66fe4f5f3652c777aca84bfe4291b084bb67';
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function patchModule(source){
 const eol=source.includes('\r\n')?'\r\n':'\n',normal=source.replaceAll('\r\n','\n');
 if(digest(normal)===AFTER_HASH)return source;
 ensure(digest(normal)===BEFORE_HASH,'Unreviewed version-policy module; nothing changed');
 const after=normal.replace('    // App Store version 1.1.8 ships the 1.1.8 package at build 136.','    // App Store 1.1.8 ends at build 136; 1.1.9 starts at 137 (current store package: 139).')
 .replace('Math.max(136, buildNumber(env.MIN_SUPPORTED_APP_BUILD ?? 136))','Math.max(137, buildNumber(env.MIN_SUPPORTED_APP_BUILD ?? 137))')
 .replace('Math.max(minimumBuild, 136, buildNumber(env.LATEST_APP_BUILD ?? 136))','Math.max(minimumBuild, 139, buildNumber(env.LATEST_APP_BUILD ?? 139))')
 .replace('龟友手账 1.1.8 已正式上线。当前版本已停止支持，请前往 App Store 更新后继续使用。',MESSAGE);
 ensure(digest(after)===AFTER_HASH,'Unexpected release policy patch');new vm.Script(after);return after.replaceAll('\n',eol);
}
function regular(file) {
  ensure(fs.realpathSync(file) === file && fs.lstatSync(file).isFile(), 'Expected regular source without symlinks');
}
function plan(root) {
  const server = path.join(root, 'server/server.js'); regular(server);
  const source = fs.readFileSync(server, 'utf8'); new vm.Script(source);
  const modern = 'function handleAppVersion(req, res) {\n  res.setHeader("Cache-Control", "no-store");\n  return sendJson(res, 200, appUpdatePolicy(req));\n}';
  ensure(source.replaceAll('\r\n','\n').includes(modern) && source.includes('require("./app-update-policy")'),'Unexpected version handler; nothing changed');
  const file=path.join(root,'server/app-update-policy.js');regular(file);const after=patchModule(fs.readFileSync(file,'utf8'));
  return { file, before: fs.readFileSync(file), after: Buffer.from(after), mode: fs.statSync(file).mode & 0o777, server, serverHash: digest(fs.readFileSync(server)) };
}
function atomicWrite(file, bytes, mode) {
  const temp = file + '.policy-' + crypto.randomUUID() + '.tmp'; let descriptor;
  try {
    descriptor = fs.openSync(temp, 'wx', mode); fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
    fs.renameSync(temp, file);
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
const command = args => {
  try { return execFileSync('pm2', args, { cwd: ROOT, encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw Error('PM2 command failed: ' + args[0]); }
};
async function request(port, route, options = {}) {
  const response = await fetch('http://127.0.0.1:' + port + route, { ...options, redirect: 'error', signal: AbortSignal.timeout(3000) });
  const text = await response.text(); ensure(text.length < 32768, 'Unexpected health response size');
  return { status: response.status, json: JSON.parse(text) };
}
const ROUTES = ['/api/app/version', '/api/app/version?platform=ios&build=136', '/api/app/version?platform=ios&build=137', '/api/app/version?platform=ios&build=139', '/api/app/version?platform=android&channel=beta', '/api/app/version?platform=android&channel=store', '/api/app/version?platform=web', '/api/app/version?platform=harmony', '/api/app/version?platform=unknown'];
const ANDROID_UA={'User-Agent':'Mozilla/5.0 (Linux; Android 15)'};
const iosMatches=p=>p.ok===true&&p.minimumBuild===MINIMUM&&p.latestBuild===LATEST&&p.message===MESSAGE;
async function deploy({ mode, root = ROOT, platform = process.platform, run = command, health = request, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 12, log = console.log } = {}) {
  ensure(platform === 'linux', 'Run this on the Linux server'); ensure(['--check', '--apply'].includes(mode), 'Use --check or --apply');
  ensure(fs.realpathSync(root) === root && fs.realpathSync(path.join(root, 'server')) === path.join(root, 'server'), 'Unexpected project directory');
  const patch = plan(root);
  function processInfo() {
    const entries = JSON.parse(run(['jlist'])).filter(item => item.name === SERVICE); ensure(entries.length === 1, 'Expected one API process');
    const app = entries[0], env = app.pm2_env;
    ensure(app.pid > 0 && env.status === 'online' && env.exec_mode === 'fork_mode' && env.pm_cwd === root && env.pm_exec_path === patch.server && !env.watch, 'Unexpected API process configuration');
    return app;
  }
  const original = processInfo(); let portValue = original.pm2_env.PORT ?? original.pm2_env.env?.PORT;
  const envFile = path.join(root, 'server/.env');
  if (portValue === undefined && fs.existsSync(envFile)) portValue = fs.readFileSync(envFile, 'utf8').match(/^\s*PORT\s*=\s*['"]?(\d+)['"]?\s*$/m)?.[1];
  const port = Number(portValue || 8787); ensure(Number.isInteger(port) && port > 0 && port < 65536, 'Invalid API port');
  const baseline = [];
  for (const route of ROUTES) { const response = await health(port, route); ensure(response.status === 200 && response.json?.ok === true, 'Version API unavailable'); baseline.push(response.json); }
  // Do not silently lower a future release policy or mislabel its update prompt.
  ensure(baseline.slice(0, 4).every(policy => policy.minimumBuild <= MINIMUM && policy.latestBuild <= LATEST), 'A newer production release policy exists; nothing changed');
  const androidBaseline=await health(port,'/api/app/version',{headers:ANDROID_UA});
  ensure(androidBaseline.status===200&&androidBaseline.json?.platform==='android','Legacy Android baseline failed');
  ensure(baseline.slice(0,4).every(p=>p.platform==='ios'&&p.appStoreUrl==='https://apps.apple.com/app/id6783481335'),'Unexpected iOS platform/store baseline');
  const anonymous = () => health(port, '/api/account/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ensure((await anonymous()).status === 401, 'Anonymous authentication check failed');
  log('PASS: reviewed version policy, syntax, API process and platform baselines. iOS 1.1.8 and older (build <=136) will require App Store 1.1.9; Android policies remain unchanged.');
  if (mode === '--check') return { status: 'checked' };
  if(patch.before.equals(patch.after)){ensure(baseline.slice(0,4).every(iosMatches),'Source/running policy mismatch; stopped');log('ALREADY ACTIVE: iOS 1.1.9 required; Android policies unchanged.');return {status:'unchanged'};}
  const backups = path.join(root, 'server/backups'); fs.mkdirSync(backups, { recursive: true }); ensure(fs.realpathSync(backups) === backups, 'Symlink backup directory rejected');
  const backup = fs.mkdtempSync(path.join(backups, 'ios-119-policy-')); fs.chmodSync(backup, 0o700);
  fs.writeFileSync(path.join(backup, path.basename(patch.file)), patch.before, { mode: 0o600, flag: 'wx' }); log('Backup: ' + backup);
  ensure(digest(fs.readFileSync(patch.file)) === digest(patch.before) && digest(fs.readFileSync(patch.server)) === patch.serverHash && processInfo().pid === original.pid, 'Server changed during preflight');
  const restart = () => run(['restart', SERVICE, '--kill-timeout', '30000']);
  async function verify(oldPid, installed) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const app = processInfo(); ensure(app.pid !== oldPid, 'Old process still running');
        for (let i = 0; i < ROUTES.length; i++) {
          const response = await health(port, ROUTES[i]); ensure(response.status === 200, 'Version endpoint failed');
          if (installed && i < 4) {
            ensure(iosMatches(response.json) && response.json.appStoreUrl === baseline[i].appStoreUrl, 'iOS update policy not active');
          } else ensure(JSON.stringify(response.json) === JSON.stringify(baseline[i]), 'Another platform policy changed');
        }
        ensure(JSON.stringify(await health(port,'/api/app/version',{headers:ANDROID_UA}))===JSON.stringify(androidBaseline),'Legacy Android policy changed');
        ensure((await anonymous()).status === 401, 'Anonymous authentication check failed'); return;
      } catch {}
      await wait(500);
    }
    throw Error('Post-restart release policy or health check failed');
  }
  let written = false;
  try {
    atomicWrite(patch.file, patch.after, patch.mode); written = true; ensure(digest(fs.readFileSync(patch.file)) === digest(patch.after), 'Installed checksum mismatch');
    restart(); await verify(original.pid, true);
  } catch (error) {
    if (written) {
      try {
        ensure([digest(patch.before), digest(patch.after)].includes(digest(fs.readFileSync(patch.file))), 'Concurrent source change; rollback refused');
        atomicWrite(patch.file, patch.before, patch.mode); let pid = original.pid; try { pid = processInfo().pid; } catch {}
        restart(); await verify(pid, false); log('ROLLED BACK: exact previous policy restored and API verified.');
      } catch (rollbackError) { throw Error(error.message + '; rollback needs attention: ' + rollbackError.message + '. Backup: ' + backup); }
    }
    throw error;
  }
  log('SUCCESS: iOS 1.1.8 and older stopped; minimumBuild=137, latestBuild=139, update prompt=1.1.9. Android/web/Harmony policies unchanged.');
  return { status: 'installed', backup };
}
module.exports = { MESSAGE, MINIMUM, LATEST, BEFORE_HASH, AFTER_HASH, patchModule, plan, deploy, ROUTES };
if (require.main === module) deploy({ mode: process.argv.length === 3 ? process.argv[2] : '' }).catch(error => { console.error(error.message); process.exitCode = 1; });
