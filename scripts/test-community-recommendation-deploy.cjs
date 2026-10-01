'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { deploy, formattingHash, FORMATTED_HASHES } = require('./deploy-community-recommendation.cjs');
const { patchServer } = require('./server-120-hotfix.cjs');
const { patchMain, BASE_HASH, TARGET_HASH, OLD, NEW } = require('./community-admin-recommendation-patch.cjs');
const { verifyNotificationExtension } = require('./verify-notification-extension.cjs');
const root = path.resolve(__dirname, '..');
const main = Buffer.from(patchServer(fs.readFileSync(path.join(root, 'scripts/fixtures/reviewed-server-20260929.js'), 'utf8')));
const before = fs.readFileSync(path.join(root, 'scripts/fixtures/reviewed-community-daily-push-20261001.js'));
const legacyTitleModule = Buffer.from(before.toString('utf8').replace('龟友圈有新分享', '壳友圈有新分享'));
const after = fs.readFileSync(path.join(root, 'server/community-daily-push.js'));
const patchedMain = Buffer.from(patchMain(main.toString('utf8')));
const previousRichModule = Buffer.from(after.toString('utf8')
  .replace('// Optional keyword hint only. Explicit administrator approval is authoritative;\n// this heuristic must never veto approval or dispatch.', '// A conservative pre-filter, NOT an image/ad classifier. Human review is mandatory.')
  .replace('    && post.dailyPushReview?.hash === reviewHash(post)', '    && !advertisingRisk(post)\n    && post.dailyPushReview?.hash === reviewHash(post)'));
const outcomes = [];
const checksum = value => crypto.createHash('sha256').update(value).digest('hex');
async function check(name, run) {
  try { await run(); outcomes.push({ name, pass: true }); }
  catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
}
async function scenario(options = {}, test) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'turtle-recommend-deploy-'));
  const dir = path.join(temp, 'server'), payload = path.join(temp, 'payload');
  fs.mkdirSync(dir); fs.mkdirSync(payload);
  fs.writeFileSync(path.join(dir, 'server.js'), options.alreadyInstalled ? patchedMain : main);
  const moduleBefore = options.moduleBefore || (options.alreadyInstalled ? after : options.previousRich ? previousRichModule : before);
  fs.writeFileSync(path.join(dir, 'community-daily-push.js'), moduleBefore);
  fs.writeFileSync(path.join(dir, '.env'), 'PORT=8787\nTEST_FIXTURE=only-synthetic\n');
  fs.writeFileSync(path.join(dir, 'test-data.json'), 'test data must stay');
  fs.writeFileSync(path.join(payload, 'community-daily-push.js'), after);
  let pid = 10, restarts = 0, saves = 0;
  const log = [];
  const settings = { root: temp, payload, platform: 'linux', mode: '--apply', attempts: 3, wait: async () => {}, log: text => log.push(text),
    atomicWrite(file, bytes, mode) {
      if (options.partialWriteFailure && file.endsWith('community-daily-push.js') && bytes.equals(after)) throw Error('synthetic module write failure');
      const staging = file + '.test-temp';
      fs.writeFileSync(staging, bytes, { mode }); fs.renameSync(staging, file);
    },
    run(args) {
      if (args[0] === 'jlist') return JSON.stringify([{ name: 'turtlekeeper-api', pid, pm2_env: { status: 'online', exec_mode: 'fork_mode', pm_cwd: temp, pm_exec_path: path.join(dir, 'server.js'), watch: false, PORT: 8787 } }]);
      if (args[0] === 'restart') { restarts++; pid++; if (options.restartFailure && restarts === 1) throw Error('restart failed'); return ''; }
      if (args[0] === 'save') { saves++; if (options.saveFailure) throw Error('save failed'); return ''; }
      throw Error('Unexpected PM2 operation');
    },
    async get(port, route) {
      assert.equal(port, 8787);
      if (options.healthFailure && restarts === 1) throw Error('API unavailable');
      return route === '/api/app/version' ? { status: 200, json: { ok: true, minimumBuild: 117, latestBuild: 119 } } : { status: 401, json: { ok: false } };
    }
  };
  const f = { settings, dir, payload, log, moduleBefore, expectPatched: !!options.alreadyInstalled, get restarts() { return restarts; }, get saves() { return saves; } };
  const unchanged = ['.env', 'test-data.json'].map(file => [file, checksum(fs.readFileSync(path.join(dir, file)))]);
  try {
    await test(f);
    for (const [file, hash] of unchanged) assert.equal(checksum(fs.readFileSync(path.join(dir, file))), hash, 'Do not change ' + file);
    assert.ok(fs.readFileSync(path.join(dir, 'server.js')).equals(f.expectPatched ? patchedMain : main), 'Main API must be patched or restored as expected');
  } finally {
    assert.equal(path.dirname(temp), os.tmpdir()); assert.ok(path.basename(temp).startsWith('turtle-recommend-deploy-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
(async () => {
  const formattedOld = Buffer.from('\uFEFF\r\n' + before.toString('utf8').replace(/\r\n?/g, '\n').split('\n').map(line => '\t' + line + '  ').join('\r\n\r\n') + '\r\n');
  await check('reviewed legacy and rich versions have the expected formatting hashes', () => {
    assert.deepEqual([before, previousRichModule, after, legacyTitleModule].map(formattingHash), FORMATTED_HASHES);
    assert.equal(formattingHash(formattedOld), formattingHash(before));
  });
  await check('BOM, CRLF, extra indentation and blank lines deploy with the exact original backup', () => scenario({ moduleBefore: formattedOld }, async f => {
    const result = await deploy(f.settings); f.expectPatched = true;
    assert.ok(fs.readFileSync(path.join(result.backup, 'community-daily-push.js')).equals(formattedOld));
    assert.ok(f.log.some(text => text.includes('formatting/legacy-title')));
  }));
  await check('screenshot legacy title variant installs only when all other source lines match', () => scenario({ moduleBefore: legacyTitleModule }, async f => {
    const result = await deploy(f.settings); f.expectPatched = true;
    assert.ok(fs.readFileSync(path.join(result.backup, 'community-daily-push.js')).equals(legacyTitleModule));
    assert.ok(fs.readFileSync(path.join(f.dir, 'community-daily-push.js')).equals(after));
  }));
  await check('formatting-only legacy source is restored byte for byte on failed health check', () => scenario({ moduleBefore: formattedOld, healthFailure: true }, async f => {
    await assert.rejects(deploy(f.settings)); assert.equal(f.restarts, 2);
    assert.ok(fs.readFileSync(path.join(f.dir, 'community-daily-push.js')).equals(formattedOld));
  }));
  for (const [name, changed] of [
    ['notification string', before.toString('utf8').replace('龟友圈有新分享', '未经审查的推送标题')],
    ['daily time restriction', before.toString('utf8').replace('hour < 9', 'hour < 8')],
    ['advertising expression', before.toString('utf8').replace('https?:|www', 'http:|www')],
    ['commented eligibility guard', before.toString('utf8').replace('    && !advertisingRisk(post)', '    // && !advertisingRisk(post)')]
  ]) await check('actual change to ' + name + ' is rejected without touching code', () => scenario({ moduleBefore: Buffer.from(changed) }, async f => {
    await assert.rejects(deploy(f.settings), /Unreviewed.*SHA256=.*formattingSHA256=/);
    assert.equal(f.restarts, 0); assert.ok(!fs.existsSync(path.join(f.dir, 'backups')));
    assert.ok(fs.readFileSync(path.join(f.dir, 'community-daily-push.js')).equals(f.moduleBefore));
  }));
  await check('production main patch changes exactly the keyword veto, is idempotent and rejects unknown source', () => {
    assert.equal(checksum(main), BASE_HASH); assert.equal(checksum(patchedMain), TARGET_HASH);
    assert.equal(patchedMain.toString('utf8'), main.toString('utf8').replace(OLD, NEW));
    assert.equal(patchMain(patchedMain.toString('utf8')), patchedMain.toString('utf8'));
    assert.throws(() => patchMain(main.toString('utf8') + '\n'), /reviewed/);
    assert.equal(checksum(previousRichModule), 'f104a92402e1b3f2f2fa649c63db27a9ae46138d30a5f1bdf87aa8e6a2b5a466');
  });
  await check('check-only validates without changing files or restarting', () => scenario({}, async f => {
    await deploy({ ...f.settings, mode: '--check' }); assert.equal(f.restarts, 0); assert.ok(!fs.existsSync(path.join(f.dir, 'backups')));
    assert.ok(fs.readFileSync(path.join(f.dir, 'community-daily-push.js')).equals(before));
  }));
  await check('administrator API and recommendation module are installed, backed up and restarted', () => scenario({}, async f => {
    const result = await deploy(f.settings); assert.equal(result.status, 'installed');
    f.expectPatched = true;
    assert.ok(fs.readFileSync(path.join(result.backup, 'server.js')).equals(main));
    assert.ok(fs.readFileSync(path.join(result.backup, 'community-daily-push.js')).equals(before));
    assert.ok(fs.readFileSync(path.join(f.dir, 'community-daily-push.js')).equals(after)); assert.equal(f.restarts, 1); assert.equal(f.saves, 1);
  }));
  await check('matching disk code still restarts a potentially stale runtime', () => scenario({ alreadyInstalled: true }, async f => {
    await deploy(f.settings); assert.equal(f.restarts, 1);
  }));
  await check('previous title/image deployment upgrades to administrator keyword override', () => scenario({ previousRich: true }, async f => {
    const result = await deploy(f.settings); f.expectPatched = true;
    assert.ok(fs.readFileSync(path.join(result.backup, 'community-daily-push.js')).equals(previousRichModule));
    assert.ok(fs.readFileSync(path.join(f.dir, 'community-daily-push.js')).equals(after));
  }));
  for (const [name, file] of [['unknown main', 'server.js'], ['unknown recommendation module', 'community-daily-push.js']]) await check(name + ' is rejected without restart', () => scenario({}, async f => {
    const target = path.join(f.dir, file), original = fs.readFileSync(target);
    fs.writeFileSync(target, 'unreviewed');
    try { await assert.rejects(deploy(f.settings), /reviewed|Unreviewed/); assert.equal(f.restarts, 0); }
    finally { fs.writeFileSync(target, original); }
  }));
  await check('corrupt payload is rejected without restart', () => scenario({}, async f => {
    fs.appendFileSync(path.join(f.payload, 'community-daily-push.js'), 'corrupt'); await assert.rejects(deploy(f.settings), /checksum/); assert.equal(f.restarts, 0);
  }));
  for (const key of ['restartFailure', 'healthFailure']) await check(key + ' restores both code files and verifies rollback', () => scenario({ [key]: true }, async f => {
    await assert.rejects(deploy(f.settings)); assert.equal(f.restarts, 2);
    assert.ok(fs.readFileSync(path.join(f.dir, 'community-daily-push.js')).equals(before)); assert.ok(f.log.some(text => text.startsWith('ROLLED BACK')));
  }));
  await check('module write failure restores already changed main API before restart', () => scenario({ partialWriteFailure: true }, async f => {
    await assert.rejects(deploy(f.settings), /synthetic module write failure/); assert.equal(f.restarts, 0);
    assert.ok(fs.readFileSync(path.join(f.dir, 'community-daily-push.js')).equals(before));
    assert.ok(f.log.some(text => text.startsWith('ROLLED BACK')));
  }));
  await check('pm2 save failure keeps healthy installed code and reports a warning', () => scenario({ saveFailure: true }, async f => {
    await deploy(f.settings); f.expectPatched = true; assert.equal(f.restarts, 1); assert.ok(f.log.some(text => text.startsWith('WARNING')));
  }));
  await check('notification extension is built, embedded and matches app version', () => verifyNotificationExtension(root));
  for (const [name, file, change] of [
    ['missing embed phase', 'ios/App/App.xcodeproj/project.pbxproj', text => text.replace('F61001000000000000000009 /* Embed App Extensions */,', '')],
    ['missing extension source build entry', 'ios/App/App.xcodeproj/project.pbxproj', text => text.replace('files = (F61001000000000000000001 /* NotificationService.swift in Sources */, );', 'files = ();')],
    ['wrong extension identity', 'ios/App/App.xcodeproj/project.pbxproj', text => text.replaceAll('com.turtlekeeper.app.NotificationService', 'com.other.app.NotificationService')],
    ['wrong extension service identifier', 'ios/App/TurtleNotificationService/Info.plist', text => text.replace('com.apple.usernotifications.service', 'wrong.extension')],
    ['unrelated attachment host', 'ios/App/TurtleNotificationService/Info.plist', text => text.replace('media.turtleworld.cn', 'example.com')]
  ]) await check(name + ' is rejected by release validation', () => {
    const read = current => { const text = fs.readFileSync(path.join(root, current), 'utf8'); return current === file ? change(text) : text; };
    assert.throws(() => verifyNotificationExtension(root, read));
  });
  fs.writeFileSync(path.join(root, 'output/community-recommendation-deploy-20261001.json'), JSON.stringify({ realLinuxPm2Tested: false, xcodeCompiled: false, nativeDeviceTested: false, outcomes }, null, 2));
  console.log(JSON.stringify(outcomes, null, 2)); assert.ok(outcomes.every(item => item.pass));
})().catch(error => { console.error(error); process.exitCode = 1; });
