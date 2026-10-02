'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), zlib = require('node:zlib'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { MESSAGE, MODULE_PATCHES, LEGACY_BEFORE, LEGACY_AFTER, patchModule, patchLegacyServer, deploy } = require('./deploy-ios-113-policy.cjs');
const { serverCommand } = require('./copy-ios-113-policy-command.cjs');
const workspace = path.resolve(__dirname, '..');
let oldModule = execFileSync('git', ['show', 'HEAD:server/app-update-policy.js'], { cwd: workspace, encoding: 'utf8' }).replaceAll('\r\n', '\n');
if (MODULE_PATCHES.every(([, after]) => oldModule.includes(after))) for (const [before, after] of MODULE_PATCHES) oldModule = oldModule.replace(after, before);
const moduleAfter = patchModule(oldModule);
assert.equal(moduleAfter, fs.readFileSync(path.join(workspace, 'server/app-update-policy.js'), 'utf8').replaceAll('\r\n', '\n'));
assert.equal(patchModule(moduleAfter), moduleAfter); assert.equal(patchLegacyServer(LEGACY_AFTER), LEGACY_AFTER);
assert.equal(patchModule(oldModule.replaceAll('\n', '\r\n')), moduleAfter.replaceAll('\n', '\r\n'));
assert.equal(patchLegacyServer(LEGACY_BEFORE.replaceAll('\n', '\r\n')), LEGACY_AFTER.replaceAll('\n', '\r\n'));
assert.throws(() => patchModule(oldModule.replace('?? 117', '?? 118')), /Unreviewed/);
assert.throws(() => patchLegacyServer(LEGACY_BEFORE.replace('minimumBuild: MIN_SUPPORTED_APP_BUILD', 'minimumBuild: 118')), /Unreviewed/);
const generated = serverCommand(), encoded = generated.split("<<'TURTLE_IOS113_POLICY'\n")[1].split('\nTURTLE_IOS113_POLICY')[0];
const bytes = Buffer.from(encoded.replaceAll('\n', '\r\n'), 'base64');
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), generated.match(/printf '%s  %s\\n' '([a-f0-9]{64})'/)[1]);
assert.deepEqual(zlib.gunzipSync(bytes), fs.readFileSync(path.join(__dirname, 'deploy-ios-113-policy.cjs')));
function legacyResult(source, url, ua = '') {
  let result, cache;
  const context = { URL, MIN_SUPPORTED_APP_BUILD: 117, LATEST_APP_BUILD: 119, IOS_APP_STORE_URL: 'https://apps.apple.com/app/id6783481335', sendJson: (_res, status, json) => result = { status, json } };
  vm.createContext(context); vm.runInContext(source, context);
  context.handleAppVersion({ url, headers: { 'user-agent': ua } }, { setHeader: (key, value) => cache = [key, value] });
  return { ...JSON.parse(JSON.stringify(result)), cache };
}
assert.equal(legacyResult(LEGACY_AFTER, '/api/app/version?build=121').json.minimumBuild, 122);
assert.equal(legacyResult(LEGACY_AFTER, '/api/app/version?build=124').json.message, MESSAGE);
assert.equal(legacyResult(LEGACY_AFTER, '/api/app/version', 'Android').json.minimumBuild, 117, 'legacy Android does not inherit the new iOS gate');
for (const platform of ['android', 'web', 'harmony']) assert.deepEqual(legacyResult(LEGACY_AFTER, '/api/app/version?platform=' + platform).json, legacyResult(LEGACY_BEFORE, '/api/app/version?platform=' + platform).json);
function policyResult(file, url) {
  const context = { module: { exports: {} }, URL }; vm.createContext(context); vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  return { status: 200, json: JSON.parse(JSON.stringify(context.module.exports.appUpdatePolicy({ url, headers: {} }, { MIN_SUPPORTED_APP_BUILD: '117', LATEST_APP_BUILD: '119' }))) };
}
(async () => {
  const parent = path.join(workspace, 'output'); fs.mkdirSync(parent, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(parent, 'ios-113-policy-test-'));
  try {
    let caseNumber = 0;
    async function scenario(kind, mode, fault = '', installed = false) {
      const root = path.join(fixture, String(caseNumber++)); const dir = path.join(root, 'server'); fs.mkdirSync(dir, { recursive: true });
      const server = path.join(dir, 'server.js');
      const modern = 'function handleAppVersion(req, res) {\n  res.setHeader("Cache-Control", "no-store");\n  return sendJson(res, 200, appUpdatePolicy(req));\n}';
      fs.writeFileSync(server, kind === 'legacy' ? (installed ? LEGACY_AFTER : LEGACY_BEFORE) : modern);
      if (kind === 'module') fs.writeFileSync(path.join(dir, 'app-update-policy.js'), installed ? moduleAfter : oldModule);
      const target = kind === 'legacy' ? server : path.join(dir, 'app-update-policy.js'); const before = fs.readFileSync(target);
      fs.writeFileSync(path.join(dir, '.env'), 'PORT=8787\nMIN_SUPPORTED_APP_BUILD=117\nLATEST_APP_BUILD=119\nSECRET_FIXTURE=do-not-copy\n');
      fs.writeFileSync(path.join(dir, 'database-sentinel.json'), '{"unchanged":true}'); fs.writeFileSync(path.join(dir, 'community-daily-push.js'), 'unchanged-module');
      let pid = 100, restarts = 0;
      const run = args => {
        if (args[0] === 'jlist') return JSON.stringify([{ name: 'turtlekeeper-api', pid, pm2_env: { status: 'online', exec_mode: 'fork_mode', pm_cwd: root, pm_exec_path: server, watch: false, PORT: 8787 } }]);
        assert.deepEqual(args, ['restart', 'turtlekeeper-api', '--kill-timeout', '30000']); restarts++; pid++; return '';
      };
      const health = async (_port, route) => {
        if (route === '/api/account/load') return { status: 401, json: { ok: false } };
        const result = kind === 'legacy' ? legacyResult(fs.readFileSync(server, 'utf8'), route) : policyResult(target, route);
        if (fault && restarts === 1) result.json.latestBuild = 999;
        return result;
      };
      const action = () => deploy({ mode, root, platform: 'linux', run, health, wait: async () => {}, attempts: 2, log() {} });
      if (fault) { await assert.rejects(action, /release policy or health/); assert.deepEqual(fs.readFileSync(target), before); assert.equal(restarts, 2); }
      else {
        const result = await action(); assert.equal(result.status, mode === '--check' ? 'checked' : 'installed');
        assert.equal(restarts, mode === '--check' ? 0 : 1);
        if (mode === '--check') assert.deepEqual(fs.readFileSync(target), before);
        else { assert.equal((await health(8787, '/api/app/version')).json.minimumBuild, 122); assert.deepEqual(fs.readFileSync(path.join(result.backup, path.basename(target))), before); }
      }
      assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), 'PORT=8787\nMIN_SUPPORTED_APP_BUILD=117\nLATEST_APP_BUILD=119\nSECRET_FIXTURE=do-not-copy\n');
      assert.equal(fs.readFileSync(path.join(dir, 'database-sentinel.json'), 'utf8'), '{"unchanged":true}');
      assert.equal(fs.readFileSync(path.join(dir, 'community-daily-push.js'), 'utf8'), 'unchanged-module');
      if (kind === 'module') assert.equal(fs.readFileSync(server, 'utf8'), modern);
    }
    for (const kind of ['legacy', 'module']) {
      await scenario(kind, '--check'); await scenario(kind, '--apply'); await scenario(kind, '--apply', 'health'); await scenario(kind, '--apply', '', true);
    }
    console.log('PASS: legacy and modular release policy, old-env floor, Android/web/Harmony preservation, exact payload/hash, CRLF, unknown source refusal, read-only check, backup, repeat install and health-failure rollback. Isolated fixtures only.');
  } finally { assert.equal(path.dirname(fixture), parent); assert.ok(path.basename(fixture).startsWith('ios-113-policy-test-')); fs.rmSync(fixture, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
