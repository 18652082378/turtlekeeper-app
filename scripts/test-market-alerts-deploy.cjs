'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { validate, patchServer, deploy, hash, dataCompatibility } = require('./deploy-market-alerts.cjs');
const { buildPackage } = require('./build-market-alerts-server-package.cjs');
const { buildCommand } = require('./copy-market-alerts-server-command.cjs');
const root = path.resolve(__dirname, '..'), pkg = JSON.parse(fs.readFileSync(path.join(root, 'deploy/market-alerts-142/server.json')));
const source = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8').replace(/\r\n/g, '\n');
let original = source; for (const patch of [...pkg.patches].reverse()) original = original.replace(patch.after, patch.before);
assert.deepEqual(buildPackage(), pkg); validate(pkg);
assert.equal(patchServer(original, pkg), source); assert.equal(patchServer(source, pkg), source);
assert.equal(patchServer(original.replace(/\n/g, '\r\n'), pkg), source.replace(/\n/g, '\r\n'));
assert.throws(() => patchServer(original.replace('async function sendDeviceNotification(', 'async function unknownSend(').replace('  const addressedPayload =', '  const renamedPayload ='), pkg), /anchor/);
assert.throws(() => validate({ ...pkg, modules: pkg.modules.map((x, i) => i ? x : { ...x, sha256: '0'.repeat(64) }) }), /checksum/);
const command = buildCommand('a'.repeat(40)); assert.match(command, /MARKET_ALERTS_142/); assert.doesNotMatch(command, /@main|ssh |git reset|sudo|password=/);
fs.mkdirSync(path.join(root, 'output'), { recursive: true }); const commandFile = path.join(root, 'output/test-market-alerts-command.sh'); fs.writeFileSync(commandFile, command);
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
if (process.platform !== 'win32' || fs.existsSync(bash)) for (const file of [commandFile, path.join(root, 'scripts/upload-ios-142.sh')]) { const result = spawnSync(bash, ['-n', file], { windowsHide: true, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); }
(async () => {
  for (const scenario of ['check', 'install', 'idempotent', 'rollback', 'unknown-module', 'unknown-source', 'delayed-ready', 'no-mediation']) {
    const target = fs.mkdtempSync(path.join(root, 'output/market-alerts-deploy-')); fs.mkdirSync(path.join(target, 'server')); fs.mkdirSync(path.join(target, 'assets'));
    const entry = path.join(target, 'server/server.js'); let input = original;
    if (scenario === 'unknown-source') input = input.replace('  const addressedPayload =', '  const changedPayload =');
    if (scenario === 'no-mediation') input = input.replace(pkg.mediation.bootstrap, '').replace(pkg.mediation.route + '\n', '');
    fs.writeFileSync(entry, input); fs.copyFileSync(path.join(root, 'assets/turtle-batches.js'), path.join(target, 'assets/turtle-batches.js'));
    // An older reviewed daily module is needed for the safe source upgrade.
    let daily = Buffer.from(pkg.modules[1].base64, 'base64').toString();
    daily = daily.replace(', canRecommend = () => true, reserveRecommendation = () => {}', '')
      .replace(/        const campaign = `community:\$\{day\}:\$\{delivery.postId\}`;\n/, '')
      .replace(' || !canRecommend(db, user, day, campaign)', '').replace('          reserveRecommendation(user, day, campaign);\n', '');
    const from = daily.indexOf('          db = read(); delivery = db.communityDailyDeliveries[day];\n          const currentUser'), until = daily.indexOf('          await send(', from);
    daily = daily.slice(0, from) + '          const payload = recommendationPayload(post);\n' + daily.slice(until);
    assert.equal(hash(Buffer.from(daily)), pkg.modules[1].previousHashes[0], 'Reviewed old daily source is reconstructible without Git history');
    fs.writeFileSync(path.join(target, 'server/community-daily-push.js'), daily);
    if (scenario === 'unknown-module') fs.writeFileSync(path.join(target, 'server/market-alerts.js'), 'unreviewed');
    const protectedPaths = ['server/.env', 'server/data/app-data.json', 'server/app-update-policy.js', 'index.html'];
    for (const name of protectedPaths) { fs.mkdirSync(path.dirname(path.join(target, name)), { recursive: true }); fs.writeFileSync(path.join(target, name), 'protected:' + name); }
    let pid = 100, restarts = 0, waits = 0, readiness = 0;
    const run = args => { if (args[0] === 'jlist') return JSON.stringify([{ name: 'turtlekeeper-api', pid, pm2_env: { status: 'online', exec_mode: 'fork_mode', watch: false, pm_cwd: target, pm_exec_path: entry, PORT: 8787 } }]); assert.deepEqual(args, ['restart', 'turtlekeeper-api', '--kill-timeout', '30000']); restarts++; pid++; return ''; };
    const health = async (_port, route) => {
      if (route.startsWith('/api/app/version')) return { status: 200, json: { ok: true, route, minimumBuild: route.includes('ios') ? 137 : 0, latestBuild: route.includes('ios') ? 139 : 0 } };
      if (scenario === 'rollback' && restarts === 1 && route.startsWith('/api/market/alerts/')) return { status: 503, json: { ok: false } };
      if (scenario === 'delayed-ready' && restarts === 1 && readiness++ < 3) throw Error('startup pending');
      return { status: route.startsWith('/api/market/alerts/') && !fs.readFileSync(entry, 'utf8').includes('async function handleMarketAlertRequest(') ? 405 : 401, json: { ok: false } };
    };
    const options = { pkg, root: target, platform: 'linux', run, health, wait: async () => waits++, log: () => {} };
    if (scenario.startsWith('unknown')) { await assert.rejects(deploy({ ...options, mode: '--apply' })); assert.equal(fs.readFileSync(entry, 'utf8'), input); assert.equal(restarts, 0); }
    else if (scenario === 'check') { await deploy({ ...options, mode: '--check' }); assert.equal(fs.readFileSync(entry, 'utf8'), input); assert.equal(restarts, 0); }
    else if (scenario === 'rollback') { await assert.rejects(deploy({ ...options, mode: '--apply' }), /Previous API restored/); assert.equal(fs.readFileSync(entry, 'utf8'), dataCompatibility(input)); assert.equal(fs.readFileSync(path.join(target, 'server/community-daily-push.js'), 'utf8'), daily); assert.equal(fs.existsSync(path.join(target, 'server/market-alerts.js')), false); assert.equal(restarts, 2); }
    else { await deploy({ ...options, mode: '--apply' }); assert.equal(fs.readFileSync(entry, 'utf8'), patchServer(input, pkg)); for (const module of pkg.modules) assert.equal(hash(fs.readFileSync(path.join(target, module.name))), module.sha256); if (scenario === 'idempotent') { await deploy({ ...options, mode: '--apply' }); assert.equal(restarts, 1); } if (scenario === 'delayed-ready') assert.ok(waits >= 3); }
    for (const name of protectedPaths) assert.equal(fs.readFileSync(path.join(target, name), 'utf8'), 'protected:' + name);
  }
  console.log('PASS market alert deploy: exact reviewed patches/modules, history independence, checksum/Bash syntax, preflight, idempotence, delayed readiness, older mediation upgrade, unknown-source refusal, rollback and preserved user data/update policies.');
})().catch(error => { console.error(error); process.exitCode = 1; });
