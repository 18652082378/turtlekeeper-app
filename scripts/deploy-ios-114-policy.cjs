'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ROOT = '/www/turtlekeeper-app', SERVICE = 'turtlekeeper-api';
const MESSAGE = "龟友手账 1.1.4 已正式上线。1.1.3 及更早版本已停止支持，请前往 App Store 更新后继续使用。";
const MODULE_PATCHES = [
  [
    "    // 1.1.2 ends at build 121; 1.1.3 starts at 122. Older deployment env\n    // values must not silently disable the published release boundary.\n    const minimumBuild = Math.max(122, buildNumber(env.MIN_SUPPORTED_APP_BUILD ?? 122));",
    "    // 1.1.3 ends at build 124; published 1.1.4 uses build 125. Older env\n    // values must not silently disable this published release boundary.\n    const minimumBuild = Math.max(125, buildNumber(env.MIN_SUPPORTED_APP_BUILD ?? 125));"
  ],
  [
    "      latestBuild: Math.max(minimumBuild, 124, buildNumber(env.LATEST_APP_BUILD ?? 124)),",
    "      latestBuild: Math.max(minimumBuild, 125, buildNumber(env.LATEST_APP_BUILD ?? 125)),"
  ],
  [
    "      message: '龟友手账 1.1.3 已正式上线。1.1.2 及更早版本已停止支持，请前往 App Store 更新后继续使用。' };",
    "      message: '龟友手账 1.1.4 已正式上线。1.1.3 及更早版本已停止支持，请前往 App Store 更新后继续使用。' };"
  ]
];
const LEGACY_BEFORE = "function handleAppVersion(req, res) {\n  const platform = new URL(req.url, \"http://localhost\").searchParams.get(\"platform\") ||\n    (/Android/i.test(String(req.headers?.[\"user-agent\"] || \"\")) ? \"android\" : \"ios\");\n  const policy = {\n    ok: true,\n    minimumBuild: MIN_SUPPORTED_APP_BUILD,\n    latestBuild: LATEST_APP_BUILD,\n    appStoreUrl: IOS_APP_STORE_URL,\n    message: \"龟友手账 1.1.1 已正式上线。当前版本已停止支持，请前往 App Store 更新后继续使用。\"\n  };\n  if (platform === \"ios\") {\n    policy.minimumBuild = Math.max(122, MIN_SUPPORTED_APP_BUILD);\n    policy.latestBuild = Math.max(policy.minimumBuild, 124, LATEST_APP_BUILD);\n    policy.message = \"龟友手账 1.1.3 已正式上线。1.1.2 及更早版本已停止支持，请前往 App Store 更新后继续使用。\";\n  }\n  res.setHeader(\"Cache-Control\", \"no-store\");\n  return sendJson(res, 200, policy);\n}";
const LEGACY_AFTER = "function handleAppVersion(req, res) {\n  const platform = new URL(req.url, \"http://localhost\").searchParams.get(\"platform\") ||\n    (/Android/i.test(String(req.headers?.[\"user-agent\"] || \"\")) ? \"android\" : \"ios\");\n  const policy = {\n    ok: true,\n    minimumBuild: MIN_SUPPORTED_APP_BUILD,\n    latestBuild: LATEST_APP_BUILD,\n    appStoreUrl: IOS_APP_STORE_URL,\n    message: \"龟友手账 1.1.1 已正式上线。当前版本已停止支持，请前往 App Store 更新后继续使用。\"\n  };\n  if (platform === \"ios\") {\n    policy.minimumBuild = Math.max(125, MIN_SUPPORTED_APP_BUILD);\n    policy.latestBuild = Math.max(policy.minimumBuild, 125, LATEST_APP_BUILD);\n    policy.message = \"龟友手账 1.1.4 已正式上线。1.1.3 及更早版本已停止支持，请前往 App Store 更新后继续使用。\";\n  }\n  res.setHeader(\"Cache-Control\", \"no-store\");\n  return sendJson(res, 200, policy);\n}";
const ensure = (ok, message) => { if (!ok) throw Error(message); };
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function patchModule(source) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const patches = MODULE_PATCHES.map(pair => pair.map(text => text.replaceAll('\n', eol)));
  if (!patches.every(([, after]) => source.split(after).length === 2)) {
    for (const [before, after] of patches) {
      ensure(source.split(before).length === 2, 'Unreviewed version-policy module; nothing changed');
      source = source.replace(before, after);
    }
  }
  new vm.Script(source); return source;
}
function patchLegacyServer(source) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const before = LEGACY_BEFORE.replaceAll('\n', eol), after = LEGACY_AFTER.replaceAll('\n', eol);
  if (source.split(after).length !== 2) {
    ensure(source.split(before).length === 2, 'Unreviewed legacy version handler; nothing changed');
    source = source.replace(before, after);
  }
  new vm.Script(source); return source;
}
function regular(file) {
  ensure(fs.realpathSync(file) === file && fs.lstatSync(file).isFile(), 'Expected regular source without symlinks');
}
function plan(root) {
  const server = path.join(root, 'server/server.js'); regular(server);
  const source = fs.readFileSync(server, 'utf8'); new vm.Script(source);
  const modern = 'function handleAppVersion(req, res) {\n  res.setHeader("Cache-Control", "no-store");\n  return sendJson(res, 200, appUpdatePolicy(req));\n}';
  let file, after;
  if (source.replaceAll('\r\n', '\n').includes(modern)) {
    file = path.join(root, 'server/app-update-policy.js'); regular(file); after = patchModule(fs.readFileSync(file, 'utf8'));
  } else { file = server; after = patchLegacyServer(source); }
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
const ROUTES = ['/api/app/version', '/api/app/version?platform=ios&build=124', '/api/app/version?platform=ios&build=125', '/api/app/version?platform=android&channel=beta', '/api/app/version?platform=android&channel=store', '/api/app/version?platform=web', '/api/app/version?platform=harmony'];
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
  ensure(baseline.slice(0, 3).every(policy => policy.minimumBuild <= 125 && policy.latestBuild <= 125), 'A newer production release policy exists; nothing changed');
  const anonymous = () => health(port, '/api/account/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ensure((await anonymous()).status === 401, 'Anonymous authentication check failed');
  log('PASS: reviewed version policy, syntax, API process and platform baselines. iOS builds below 125 will require 1.1.4.');
  if (mode === '--check') return { status: 'checked' };
  const backups = path.join(root, 'server/backups'); fs.mkdirSync(backups, { recursive: true }); ensure(fs.realpathSync(backups) === backups, 'Symlink backup directory rejected');
  const backup = fs.mkdtempSync(path.join(backups, 'ios-114-policy-')); fs.chmodSync(backup, 0o700);
  fs.writeFileSync(path.join(backup, path.basename(patch.file)), patch.before, { mode: 0o600, flag: 'wx' }); log('Backup: ' + backup);
  ensure(digest(fs.readFileSync(patch.file)) === digest(patch.before) && digest(fs.readFileSync(patch.server)) === patch.serverHash && processInfo().pid === original.pid, 'Server changed during preflight');
  const restart = () => run(['restart', SERVICE, '--kill-timeout', '30000']);
  async function verify(oldPid, installed) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const app = processInfo(); ensure(app.pid !== oldPid, 'Old process still running');
        for (let i = 0; i < ROUTES.length; i++) {
          const response = await health(port, ROUTES[i]); ensure(response.status === 200, 'Version endpoint failed');
          if (installed && i < 3) {
            ensure(response.json.ok === true && response.json.minimumBuild === 125 && response.json.latestBuild === 125 && response.json.message === MESSAGE && response.json.appStoreUrl === baseline[i].appStoreUrl, 'iOS update policy not active');
          } else ensure(JSON.stringify(response.json) === JSON.stringify(baseline[i]), 'Another platform policy changed');
        }
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
  log('SUCCESS: iOS 1.1.3 and earlier stopped; minimumBuild=125, latestBuild=125, update prompt=1.1.4. Other platform policies unchanged.');
  return { status: 'installed', backup };
}
module.exports = { MESSAGE, MODULE_PATCHES, LEGACY_BEFORE, LEGACY_AFTER, patchModule, patchLegacyServer, plan, deploy, ROUTES };
if (require.main === module) deploy({ mode: process.argv.length === 3 ? process.argv[2] : '' }).catch(error => { console.error(error.message); process.exitCode = 1; });
