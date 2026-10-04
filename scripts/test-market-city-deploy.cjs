'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { BEFORE, AFTER, patchServer, deploy } = require('./deploy-market-city-override.cjs');
const { serverCommand } = require('./copy-market-city-server-command.cjs');
const workspace = path.resolve(__dirname, '..');
let before = execFileSync('git', ['show', 'HEAD:server/server.js'], { cwd: workspace, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).replaceAll('\r\n', '\n');
const sendRecovery = require('./deploy-chat-send-recovery.cjs');
before = before.replace(sendRecovery.PATCHES[0].after, sendRecovery.PATCHES[0].before);
// A committed city patch must still exercise deployment from the older validator.
before = before.replace(AFTER, BEFORE).replaceAll('const location = verifiedMarketLocation(body, user);', 'const location = verifiedMarketLocation(body);');
const after = patchServer(before);
const currentServer = fs.readFileSync(path.join(workspace, 'server/server.js'), 'utf8');
let expectedServer = currentServer.includes('function marketWantCount(') ? require('./deploy-market-stat-adjustment.cjs').patchServer(after) : after;
if (currentServer.includes('function clearCommunityConversationHistory(')) expectedServer = require('./deploy-chat-delete.cjs').patchServer(expectedServer);
if (currentServer.includes('const clientMessageId = String(body.clientMessageId')) expectedServer = sendRecovery.patchServer(expectedServer);
assert.equal(expectedServer.replaceAll('\r\n', '\n'), currentServer.replaceAll('\r\n', '\n'), 'deployment and local source must implement the same change');
assert.equal(patchServer(after), after, 'reapplying must not duplicate code');
assert.equal(patchServer(before.replaceAll('\n', '\r\n')), after.replaceAll('\n', '\r\n'), 'preserve existing line endings');
assert.throws(() => patchServer(before.replace('const latitude = Number(body.latitude);', 'const latitude = parseFloat(body.latitude);')), /Unreviewed/);
const locationCall = before.includes('function verifiedMarketLocation(body, user)') ? 'const location = verifiedMarketLocation(body, user);' : 'const location = verifiedMarketLocation(body);';
assert.throws(() => patchServer(before.replace(locationCall, 'const location = customLocation(body);')), /two/);
const context = vm.createContext({ trimPublicText: (value, max) => String(value || '').trim().slice(0, max), isAdminUser: user => user?.phone === 'configured-admin' });
vm.runInContext(AFTER, context);
for (const phone of ['17302554044', 'configured-admin']) {
  assert.equal(context.verifiedMarketLocation({ city: '杭州市', locationSource: 'manual' }, { phone }).city, '杭州市');
  assert.equal(context.verifiedMarketLocation({ city: ' ', locationSource: 'manual' }, { phone }), null);
}
assert.equal(context.verifiedMarketLocation({ city: '杭州市', locationSource: 'manual', isAdmin: true, phone: '17302554044' }, { phone: 'ordinary' }), null);
assert.equal(context.verifiedMarketLocation({ city: '杭州市', locationSource: 'manual' }), null);
assert.equal(context.verifiedMarketLocation({ city: '杭州市', locationSource: 'device', latitude: 91, longitude: 118 }, { phone: 'ordinary' }), null);
const generated = serverCommand();
const encoded = generated.split("<<'TURTLE_CITY_PATCH'\n")[1].split('\nTURTLE_CITY_PATCH')[0];
const bytes = Buffer.from(encoded.replaceAll('\n', '\r\n'), 'base64');
const expected = generated.match(/printf '%s  %s\\n' '([a-f0-9]{64})'/)[1];
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected);
assert.deepEqual(zlib.gunzipSync(bytes), fs.readFileSync(path.join(__dirname, 'deploy-market-city-override.cjs')));
assert.match(generated, /--check\nnode deploy-market-city-override\.cjs --apply/);

(async () => {
  const fixtureParent = path.join(workspace, 'output'); fs.mkdirSync(fixtureParent, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(fixtureParent, 'market-city-deploy-test-'));
  try {
    async function scenario(mode, fault = '') {
      const root = path.join(fixture, mode.slice(2) + '-' + (fault || 'ok')); fs.mkdirSync(path.join(root, 'server'), { recursive: true });
      const target = path.join(root, 'server/server.js');
      const original = before + '\n// Existing server customizations stay intact.\n';
      fs.writeFileSync(target, original);
      fs.writeFileSync(path.join(root, 'server/database-sentinel.json'), '{"doNotModify":true}');
      fs.writeFileSync(path.join(root, 'server/.env'), 'PORT=8787\nSECRET_FIXTURE=not-copied\n');
      fs.writeFileSync(path.join(root, 'server/community-daily-push.js'), 'unchanged-community-module');
      let pid = 200, restarts = 0;
      const run = args => {
        if (args[0] === 'jlist') return JSON.stringify([{ name: 'turtlekeeper-api', pid, pm2_env: { status: 'online', exec_mode: 'fork_mode', pm_cwd: root, pm_exec_path: target, watch: false, PORT: 8787 } }]);
        if (args[0] === 'restart') { restarts++; pid++; return ''; }
        throw new Error('unexpected command');
      };
      const policy = { ok: true, minimumBuild: 117, latestBuild: 119, message: 'existing policy' };
      const health = async (_port, route) => route === '/api/account/load' ? { status: 401, json: { ok: false } } :
        { status: 200, json: fault === 'policy' && fs.readFileSync(target, 'utf8').includes('function canManuallySetMarketCity(') ? { ...policy, latestBuild: 999 } : policy };
      const action = () => deploy({ mode, root, platform: 'linux', run, health, wait: async () => {}, attempts: 2, log() {} });
      if (fault) {
        await assert.rejects(action, /health or version-policy/);
        assert.equal(fs.readFileSync(target, 'utf8'), original, 'rollback must restore the exact prior source');
        assert.equal(restarts, 2);
      } else {
        const result = await action();
        assert.equal(result.status, mode === '--check' ? 'checked' : 'installed');
        assert.equal(restarts, mode === '--check' ? 0 : 1);
        assert.equal(fs.readFileSync(target, 'utf8'), mode === '--check' ? original : patchServer(original));
        if (result.backup) assert.equal(fs.readFileSync(path.join(result.backup, 'server.js'), 'utf8'), original);
      }
      assert.equal(fs.readFileSync(path.join(root, 'server/database-sentinel.json'), 'utf8'), '{"doNotModify":true}');
      assert.equal(fs.readFileSync(path.join(root, 'server/.env'), 'utf8'), 'PORT=8787\nSECRET_FIXTURE=not-copied\n');
      assert.equal(fs.readFileSync(path.join(root, 'server/community-daily-push.js'), 'utf8'), 'unchanged-community-module');
    }
    await scenario('--check'); await scenario('--apply'); await scenario('--apply', 'policy');
    console.log('PASS: city permission checks, exact/idempotent patch, unknown source refusal, CRLF preservation, clipboard payload checksum, read-only preflight, backup, code-only deployment and health-failure rollback. Local fixtures only.');
  } finally {
    assert.equal(path.dirname(fixture), fixtureParent);
    assert.ok(path.basename(fixture).startsWith('market-city-deploy-test-'));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
