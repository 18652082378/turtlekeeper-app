'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { spawnSync } = require('node:child_process');
const { deploy, validate, patchServer, dataCompatibility, hash } = require('./deploy-mediation-applications.cjs');
const { buildPackage } = require('./build-mediation-server-package.cjs');
const { buildCommand } = require('./copy-mediation-server-command.cjs');
const root = path.resolve(__dirname, '..'), pkg = JSON.parse(fs.readFileSync(path.join(root, 'deploy/mediation-141/server.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8').replace(/\r\n/g, '\n');
function withoutFeature(text) {
  return text.replace("const { createMediationService } = require('./mediation-service');\n", '').replace(' mediationApplications: [],', '')
    .replace(',\n    mediationApplications: Array.isArray(data.mediationApplications) ? data.mediationApplications : []', '')
    .replace('  db.mediationApplications = (db.mediationApplications || []).filter(item => item.ownerId !== user.mediationOwnerId);\n', '')
    .replace(pkg.bootstrap, '').replace(pkg.route + '\n', '');
}
const original = withoutFeature(source), installed = patchServer(original, pkg);
assert.deepEqual(buildPackage(), pkg, 'Package must be reproducible from the reviewed sources');
validate(pkg);
assert.equal(patchServer(source, pkg), source);
assert.equal(patchServer(installed, pkg), installed);
assert.equal(patchServer(original.replace(/\n/g, '\r\n'), pkg), installed.replace(/\n/g, '\r\n'));
assert.throws(() => patchServer(original.replace('function normalizeDatabase(', 'function unsupportedDatabase('), pkg), /Unrecognized/);
assert.throws(() => validate({ ...pkg, module: { ...pkg.module, sha256: '0'.repeat(64) } }), /checksum/);
const historical = fs.readFileSync(path.join(root, 'scripts/fixtures/reviewed-server-20260929.js'), 'utf8');
assert.match(patchServer(historical, pkg), /async function handleMediationRequest/);
const revision = 'a'.repeat(40), command = buildCommand(revision);
assert.equal((command.match(/MEDIATION_141/g) || []).length, 2);
assert.match(command, new RegExp(revision)); assert.doesNotMatch(command, /@main|git reset|sudo|ssh |Password|password=/);
fs.mkdirSync(path.join(root, 'output'), { recursive: true });
const commandFile = path.join(root, 'output/test-mediation-server-command.sh'); fs.writeFileSync(commandFile, command);
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
if (process.platform !== 'win32' || fs.existsSync(bash)) {
  for (const file of [commandFile, path.join(root, 'scripts/upload-ios-141.sh')]) { const result = spawnSync(bash, ['-n', file], { windowsHide: true, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); }
}
(async () => {
  for (const scenario of ['check', 'install', 'idempotent', 'rollback', 'unknown-module', 'unknown-source', 'delayed-ready']) {
    const target = fs.mkdtempSync(path.join(root, 'output/mediation-deploy-'));
    fs.mkdirSync(path.join(target, 'server'));
    const entry = path.join(target, 'server/server.js'), module = path.join(target, 'server/mediation-service.js');
    fs.writeFileSync(entry, scenario === 'unknown-source' ? original.replace('function normalizeDatabase(', 'function unexpectedDatabase(') : original);
    if (scenario === 'unknown-module') fs.writeFileSync(module, 'unreviewed existing module');
    const protectedPaths = ['server/.env', 'server/data/app-data.json', 'server/uploads/test.txt', 'server/app-update-policy.js', 'index.html'];
    for (const file of protectedPaths) { fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true }); fs.writeFileSync(path.join(target, file), 'protected-' + file); }
    let pid = 100, restarts = 0, waits = 0, failedChecks = 0;
    const run = args => {
      if (args[0] === 'jlist') return JSON.stringify([{ name: 'turtlekeeper-api', pid, pm2_env: { status: 'online', exec_mode: 'fork_mode', watch: false, pm_cwd: target, pm_exec_path: entry, PORT: 8787 } }]);
      assert.deepEqual(args, ['restart', 'turtlekeeper-api', '--kill-timeout', '30000']); pid++; restarts++; return '';
    };
    const health = async (_port, route) => {
      if (route.startsWith('/api/app/version')) return { status: 200, json: { ok: true, route, minimumBuild: route.includes('ios') ? 137 : 0, latestBuild: route.includes('ios') ? 139 : 0 } };
      if (scenario === 'rollback' && restarts === 1 && route.startsWith('/api/mediation/')) return { status: 503, json: { ok: false } };
      if (scenario === 'delayed-ready' && restarts === 1 && failedChecks++ < 3) throw Error('synthetic startup delay');
      return { status: route.startsWith('/api/mediation/') && !fs.readFileSync(entry, 'utf8').includes('async function handleMediationRequest(') ? 405 : 401, json: { ok: false } };
    };
    const options = { pkg, root: target, platform: 'linux', run, health, wait: async () => { waits++; }, log: () => {} };
    if (scenario === 'unknown-module' || scenario === 'unknown-source') {
      const before = hash(fs.readFileSync(entry)); await assert.rejects(deploy({ ...options, mode: '--apply' })); assert.equal(hash(fs.readFileSync(entry)), before); assert.equal(restarts, 0);
    } else if (scenario === 'check') {
      assert.equal((await deploy({ ...options, mode: '--check' })).status, 'checked'); assert.equal(fs.readFileSync(entry, 'utf8'), original); assert.equal(fs.existsSync(module), false); assert.equal(restarts, 0);
    } else if (scenario === 'rollback') {
      await assert.rejects(deploy({ ...options, mode: '--apply' }), /Previous API restored with application-storage compatibility/);
      assert.equal(fs.readFileSync(entry, 'utf8'), dataCompatibility(original)); assert.equal(fs.existsSync(module), false); assert.equal(restarts, 2);
    } else {
      assert.equal((await deploy({ ...options, mode: '--apply' })).status, 'installed'); assert.equal(fs.readFileSync(entry, 'utf8'), installed); assert.equal(hash(fs.readFileSync(module)), pkg.module.sha256);
      if (scenario === 'idempotent') { await deploy({ ...options, mode: '--apply' }); assert.equal(restarts, 1); }
      if (scenario === 'delayed-ready') assert.ok(waits > 0);
    }
    for (const file of protectedPaths) assert.equal(fs.readFileSync(path.join(target, file), 'utf8'), 'protected-' + file);
  }
  console.log('PASS mediation release installer: historical/current server anchors, reproducible checksums, Bash syntax, read-only preflight, apply/idempotence, delayed readiness, unknown-source refusal, recovery preserving application storage, and existing data/environment/update policies unchanged.');
})().catch(error => { console.error(error); process.exitCode = 1; });
