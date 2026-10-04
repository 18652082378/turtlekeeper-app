'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { PATCHES, patchServer, deploy } = require('./deploy-chat-send-recovery.cjs');
const { serverCommand } = require('./copy-chat-send-server-command.cjs');
const workspace = path.resolve(__dirname, '..');
let before = execFileSync('git', ['show', 'HEAD:server/server.js'], { cwd: workspace, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).replaceAll('\r\n', '\n');
// Exercise installation even when HEAD already contains this release.
if (before.includes('const clientMessageId = String(body.clientMessageId')) {
  for (const entry of PATCHES) {
    assert.equal(before.split(entry.after).length, 2, 'reviewed installed function: ' + entry.name);
    before = before.replace(entry.after, entry.before);
  }
}
const after = patchServer(before);
assert.equal(after.replaceAll('\r\n', '\n'), fs.readFileSync(path.join(workspace, 'server/server.js'), 'utf8').replaceAll('\r\n', '\n'), 'deployed chat patch exactly matches local source and preserves other modules');
assert.equal(patchServer(after), after);
assert.equal(patchServer(before.replaceAll('\n', '\r\n')), after.replaceAll('\n', '\r\n'));
assert.throws(() => patchServer(before.replace('const content = trimPublicText(body.content, 1000);', 'const content = customText(body);')), /Unreviewed/);
assert.throws(() => patchServer(after.replace('function communityConversationState(user)', 'function customConversationState(user)')), /Unreviewed/);
let legacy = before;
for (const p of require('./deploy-chat-send-recovery.cjs').COMPAT_PATCHES) { assert.equal(legacy.split(p.after).length, 2); legacy = legacy.replace(p.after, p.before); }
assert.equal(patchServer(legacy), after, 'older chat deletion functions receive the reviewed compatibility patch');
const generated = serverCommand();
const encoded = generated.split("<<'TURTLE_CHAT_SEND_PATCH'\n")[1].split('\nTURTLE_CHAT_SEND_PATCH')[0];
const bytes = Buffer.from(encoded.replaceAll('\n', '\r\n'), 'base64');
const expected = generated.match(/printf '%s  %s\\n' '([a-f0-9]{64})'/)[1];
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected);
assert.deepEqual(zlib.gunzipSync(bytes), fs.readFileSync(path.join(__dirname, 'deploy-chat-send-recovery.cjs')));
assert.match(generated, /--check\nnode deploy-chat-send-recovery\.cjs --apply/);

(async () => {
  const fixtureParent = path.join(workspace, 'output'); fs.mkdirSync(fixtureParent, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(fixtureParent, 'chat-send-deploy-test-'));
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
        { status: 200, json: fault === 'policy' && fs.readFileSync(target, 'utf8').includes('const clientMessageId = String(body.clientMessageId') ? { ...policy, latestBuild: 999 } : policy };
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
    console.log('PASS: exact/idempotent chat patch, preservation of existing server modules, unknown source refusal, CRLF preservation, clipboard payload checksum, read-only preflight, backup, code-only deployment and health-failure rollback. Local fixtures only.');
  } finally {
    assert.equal(path.dirname(fixture), fixtureParent);
    assert.ok(path.basename(fixture).startsWith('chat-send-deploy-test-'));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
