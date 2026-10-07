'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { patchSource, deploy } = require('./deploy-weather-reminders.cjs');
const root = path.resolve(__dirname, '..'), manifest = require('./weather-reminders-server-patch.json');
(async () => {
  const baseline = file => patchSource(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'), manifest.patches[file].map(h => ({ before: h.after, after: h.before })));
  for (const file of Object.keys(manifest.patches)) {
    const patched = patchSource(baseline(file), manifest.patches[file]);
    assert.equal(patched.replace(/\r/g, ''), fs.readFileSync(path.join(root, file), 'utf8').replace(/\r/g, ''));
    assert.equal(patchSource(patched, manifest.patches[file]), patched);
    assert.throws(() => patchSource('unreviewed', manifest.patches[file]), /Unreviewed/);
  }
  assert.equal(patchSource('anchor\n', [{ before: 'anchor\n', after: 'anchor\ninserted\n' }]), 'anchor\ninserted\n');
  assert.equal(patchSource('anchor\ninserted\n', [{ before: 'anchor\ninserted\n', after: 'anchor\n' }]), 'anchor\n');
  assert.throws(() => patchSource('anchor\nanchor\n', [{ before: 'anchor\n', after: 'anchor\ninserted\n' }]), /Unreviewed/);
  assert.throws(() => patchSource('anchor\ninserted\nanchor\n', [{ before: 'anchor\n', after: 'anchor\ninserted\n' }]), /Unreviewed/);
  for (const variant of [false, true]) for (const legacyInstalled of [false, true]) for (const fail of [false, true]) {
    const dir = fs.mkdtempSync(path.join(root, 'output/weather-reminders/deploy-')); fs.mkdirSync(path.join(dir, 'server'));
    for (const file of Object.keys(manifest.patches)) fs.writeFileSync(path.join(dir, file), legacyInstalled ? patchSource(baseline(file), manifest.legacy.patches[file]) : baseline(file));
    if (variant) {
      const server = path.join(dir, 'server/server.js'), privacy = path.join(dir, 'privacy.html');
      let source = fs.readFileSync(server, 'utf8').replace("const { createAlipayPurchases } = require('./alipay-team-purchases');\n", '').replace('"壳友手账成交", ', '');
      // The production screenshot confirms that its imports have no TurtleCare.
      if (!legacyInstalled) source = source.replace("const TurtleCare = require('../assets/care-records');\n", '');
      fs.writeFileSync(server, source);
      fs.writeFileSync(privacy, fs.readFileSync(privacy, 'utf8').replace('用于发送聊天消息与护理提醒', '用于发送聊天消息、护理提醒与社区推荐').split('\n').filter(line => !line.includes('<tr><td>龟友手账 API 服务器</td>')).join('\n'));
    }
    if (legacyInstalled) fs.writeFileSync(path.join(dir, 'server/weather-reminders.js'), manifest.legacy.moduleSource);
    const payloadBefore = fs.readFileSync(path.join(dir, 'server/server.js'), 'utf8');
    let pid = 100, restarts = 0;
    const run = args => {
      if (args[0] === 'restart') { restarts++; pid++; return ''; }
      return JSON.stringify([{ name: 'turtlekeeper-api', pid, pm2_env: { status: 'online', exec_mode: 'fork_mode', pm_cwd: dir, pm_exec_path: path.join(dir, 'server/server.js'), PORT: '8787' } }]);
    };
    const health = async (_, route) => {
      const installed = fs.readFileSync(path.join(dir, 'server/server.js'), 'utf8').includes('attribution: weatherProvider.attribution');
      return route === '/api/app/version' ? { status: 200, json: { ok: true, minimumBuild: installed && fail ? 999 : 125 } } : { status: installed || route === '/api/account/load' ? 401 : 404, json: { ok: false } };
    };
    const params = { root: dir, platform: 'linux', run, health, wait: async () => {}, log: () => {} };
    await deploy({ ...params, mode: '--check' }); assert.equal(restarts, 0); assert.equal(fs.existsSync(path.join(dir, 'server/weather-reminders.js')), legacyInstalled);
    if (fail) { await assert.rejects(deploy({ ...params, mode: '--apply' }), /Restart health/); assert.equal(fs.readFileSync(path.join(dir, 'server/server.js'), 'utf8'), payloadBefore); assert.equal(fs.existsSync(path.join(dir, 'server/weather-reminders.js')), legacyInstalled); if (legacyInstalled) assert.equal(fs.readFileSync(path.join(dir, 'server/weather-reminders.js'), 'utf8'), manifest.legacy.moduleSource); assert.equal(fs.existsSync(path.join(dir, 'server/weatherkit-provider.js')), false); assert.equal(restarts, 2); }
    else {
      const result = await deploy({ ...params, mode: '--apply' }); assert.equal(result.status, 'installed'); assert.equal(restarts, 1); assert.equal(fs.existsSync(path.join(dir, 'server/weather-reminders.js')), true); assert.ok(result.backup);
      const installed = fs.readFileSync(path.join(dir, 'server/server.js'), 'utf8');
      assert.equal(patchSource(installed, manifest.patches['server/server.js']).replace(/\r/g, ''), installed.replace(/\r/g, ''));
      const disclosure = fs.readFileSync(path.join(dir, 'privacy.html'), 'utf8');
      assert.equal(disclosure.includes('和风天气（QWeather'), false); assert.equal(disclosure.split('Apple Weather（WeatherKit').length, 2);
      if (variant) {
        assert.equal(installed.includes("require('./alipay-team-purchases')"), false); assert.ok(disclosure.includes('社区推荐'));
        if (!legacyInstalled) assert.equal(installed.includes('const TurtleCare ='), false);
        assert.equal(disclosure.includes('<tr><td>龟友手账 API 服务器</td>'), false);
      }
      await deploy({ ...params, mode: '--check' });
    }
  }
  const rejected = fs.mkdtempSync(path.join(root, 'output/weather-reminders/deploy-rejected-'));
  fs.mkdirSync(path.join(rejected, 'server'));
  for (const file of Object.keys(manifest.patches)) fs.writeFileSync(path.join(rejected, file), baseline(file));
  const sourceFile = path.join(rejected, 'server/server.js');
  const unknown = fs.readFileSync(sourceFile, 'utf8').replace("const { mediaUrl: validatedMediaUrl } = require('./media-url');", "const { mediaUrl: validatedMediaUrl } = require('./unknown-media-url');");
  fs.writeFileSync(sourceFile, unknown);
  const denied = { root: rejected, platform: 'linux', run: () => { throw Error('Unexpected process mutation'); }, log: () => {} };
  for (const mode of ['--check', '--apply']) await assert.rejects(deploy({ ...denied, mode }), /server\/server.js: Unreviewed source at fragment 1/);
  assert.equal(fs.readFileSync(sourceFile, 'utf8'), unknown);
  assert.equal(fs.existsSync(path.join(rejected, 'server/backups')), false);
  for (const relative of Object.keys(manifest.modules)) assert.equal(fs.existsSync(path.join(rejected, relative)), false);
  fs.writeFileSync(path.join(root, 'output/weather-reminders/deploy-tests.json'), JSON.stringify({ pass: true, checks: ['reviewed patch equivalence', 'idempotence', 'unknown source refusal', 'read-only check', 'install and health verification', 'rollback preserves version policy'] }, null, 2));
  console.log('PASS deployment equivalence, narrow anchors, legacy migration, unrelated source preservation, idempotence, review guard, installation and rollback');
})().catch(e => { console.error(e); process.exitCode = 1; });
