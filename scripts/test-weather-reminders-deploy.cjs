'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { patchSource, deploy } = require('./deploy-weather-reminders.cjs');
const root = path.resolve(__dirname, '..'), manifest = require('./weather-reminders-server-patch.json');
(async () => {
  const baseline = file => execFileSync('git', ['show', 'HEAD:' + file], { cwd: root, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
  for (const file of Object.keys(manifest.patches)) {
    const patched = patchSource(baseline(file), manifest.patches[file]);
    assert.equal(patched.replace(/\r/g, ''), fs.readFileSync(path.join(root, file), 'utf8').replace(/\r/g, ''));
    assert.equal(patchSource(patched, manifest.patches[file]), patched);
    assert.throws(() => patchSource('unreviewed', manifest.patches[file]), /Unreviewed/);
  }
  for (const legacyInstalled of [false, true]) for (const fail of [false, true]) {
    const dir = fs.mkdtempSync(path.join(root, 'output/weather-reminders/deploy-')); fs.mkdirSync(path.join(dir, 'server'));
    for (const file of Object.keys(manifest.patches)) fs.writeFileSync(path.join(dir, file), legacyInstalled ? patchSource(baseline(file), manifest.legacy.patches[file]) : baseline(file));
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
    else { const result = await deploy({ ...params, mode: '--apply' }); assert.equal(result.status, 'installed'); assert.equal(restarts, 1); assert.equal(fs.existsSync(path.join(dir, 'server/weather-reminders.js')), true); assert.ok(result.backup); }
  }
  fs.writeFileSync(path.join(root, 'output/weather-reminders/deploy-tests.json'), JSON.stringify({ pass: true, checks: ['reviewed patch equivalence', 'idempotence', 'unknown source refusal', 'read-only check', 'install and health verification', 'rollback preserves version policy'] }, null, 2));
  console.log('PASS deployment equivalence, idempotence, review guard, installation and rollback');
})().catch(e => { console.error(e); process.exitCode = 1; });
