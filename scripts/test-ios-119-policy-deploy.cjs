'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),zlib=require('node:zlib'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {MESSAGE,MINIMUM,LATEST,patchModule,deploy}=require('./deploy-ios-119-policy.cjs'),{serverCommand}=require('./copy-ios-119-policy-command.cjs');
const workspace=path.resolve(__dirname,'..'),oldModule=fs.readFileSync(path.join(__dirname,'fixtures/app-update-policy-118.js'),'utf8').replaceAll('\r\n','\n'),moduleAfter=patchModule(oldModule);
assert.equal(moduleAfter,fs.readFileSync(path.join(workspace,'server/app-update-policy.js'),'utf8').replaceAll('\r\n','\n'));
assert.equal(patchModule(moduleAfter),moduleAfter);assert.equal(patchModule(oldModule.replaceAll('\n','\r\n')),moduleAfter.replaceAll('\n','\r\n'));
for(const unknown of [oldModule+'\n// unreviewed hotfix\n',oldModule.replace('?? 136','?? 140')])assert.throws(()=>patchModule(unknown),/Unreviewed/);
function policyFrom(code,url,env,headers={}){const c={module:{exports:{}},URL};vm.createContext(c);vm.runInContext(code,c);return JSON.parse(JSON.stringify(c.module.exports.appUpdatePolicy({url,headers},env)));}
const environments=[{}, {MIN_SUPPORTED_APP_BUILD:'117',LATEST_APP_BUILD:'119',ANDROID_STORE_MIN_BUILD:'12',ANDROID_STORE_LATEST_BUILD:'13',ANDROID_STORE_UPDATE_URL:'https://example.com/android/store',ANDROID_BETA_MIN_BUILD:'11',ANDROID_BETA_LATEST_BUILD:'12',ANDROID_BETA_UPDATE_URL:'https://example.com/android/test.apk'}, {MIN_SUPPORTED_APP_BUILD:'140',LATEST_APP_BUILD:'141',ANDROID_BETA_UPDATE_URL:'https://apps.apple.com/app/id1'}];
for(const env of environments){for(const query of ['platform=android&channel=beta','platform=android&channel=store','platform=web','platform=harmony','platform=unknown'])assert.deepEqual(policyFrom(moduleAfter,'/?'+query,env),policyFrom(oldModule,'/?'+query,env));const headers={'user-agent':'Mozilla/5.0 (Linux; Android 15)'};assert.deepEqual(policyFrom(moduleAfter,'/',env,headers),policyFrom(oldModule,'/',env,headers));}
const generated=serverCommand(),encoded=generated.split("<<'TURTLE_IOS119_POLICY'\n")[1].split('\nTURTLE_IOS119_POLICY')[0],bytes=Buffer.from(encoded.replaceAll('\n','\r\n'),'base64');
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),generated.match(/printf '%s  %s\\n' '([a-f0-9]{64})'/)[1]);assert.deepEqual(zlib.gunzipSync(bytes),fs.readFileSync(path.join(__dirname,'deploy-ios-119-policy.cjs')));
assert.ok(Buffer.byteLength(generated)<8000,'Keep the server clipboard command bounded');
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';assert.equal(spawnSync(bash,['-n'],{input:generated,encoding:'utf8'}).status,0);
(async () => {
  const parent = path.join(workspace, 'output'); fs.mkdirSync(parent, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(parent, 'ios-119-policy-test-'));
  try {
    let caseNumber = 0;
    async function scenario(mode, fault = '', installed = false) {
      const root = path.join(fixture, String(caseNumber++)); const dir = path.join(root, 'server'); fs.mkdirSync(dir, { recursive: true });
      const server = path.join(dir, 'server.js');
      const modern = 'function handleAppVersion(req, res) {\n  res.setHeader("Cache-Control", "no-store");\n  return sendJson(res, 200, appUpdatePolicy(req));\n}';
      fs.writeFileSync(server,'const { appUpdatePolicy } = require("./app-update-policy");\n'+modern);
      fs.writeFileSync(path.join(dir, 'app-update-policy.js'), installed ? moduleAfter : oldModule);
      const target = path.join(dir, 'app-update-policy.js'); const before = fs.readFileSync(target);
      fs.writeFileSync(path.join(dir, '.env'), 'PORT=8787\nMIN_SUPPORTED_APP_BUILD=117\nLATEST_APP_BUILD=119\nSECRET_FIXTURE=do-not-copy\n');
      fs.writeFileSync(path.join(dir, 'database-sentinel.json'), '{"unchanged":true}'); fs.writeFileSync(path.join(dir, 'community-daily-push.js'), 'unchanged-module');
      let pid = 100, restarts = 0, readinessProbes=0;
      const run = args => {
        if (args[0] === 'jlist') return JSON.stringify([{ name: 'turtlekeeper-api', pid, pm2_env: { status: 'online', exec_mode: 'fork_mode', pm_cwd: root, pm_exec_path: server, watch: false, PORT: 8787 } }]);
        assert.deepEqual(args, ['restart', 'turtlekeeper-api', '--kill-timeout', '30000']); restarts++; pid++; return '';
      };
      const health = async (_port, route, options={}) => {
        if(fault==='slow-start'&&restarts===1&&++readinessProbes<=15)throw Error('API booting');
        if (route === '/api/account/load') return { status: fault === 'auth' ? 200 : 401, json: { ok: false } };
        const result={status:200,json:policyFrom(fs.readFileSync(target,'utf8'),route,{MIN_SUPPORTED_APP_BUILD:'117',LATEST_APP_BUILD:'119',ANDROID_STORE_MIN_BUILD:'12',ANDROID_STORE_LATEST_BUILD:'13',ANDROID_STORE_UPDATE_URL:'https://example.com/store',ANDROID_BETA_MIN_BUILD:'11',ANDROID_BETA_LATEST_BUILD:'12',ANDROID_BETA_UPDATE_URL:'https://example.com/beta'},options.headers?{'user-agent':options.headers['User-Agent']}: {})};
        if (fault === 'future') result.json.latestBuild = 140;
        if (fault && fault!=='slow-start' && restarts === 1) result.json.latestBuild = 999;
        return result;
      };
      const action = () => deploy({ mode, root, platform: 'linux', run, health, wait: async () => {}, ...(fault==='slow-start'?{}:{attempts:2}), log() {} });
      if (['auth', 'future'].includes(fault)) {
        await assert.rejects(action, fault === 'auth' ? /authentication/ : /newer production/);
        assert.deepEqual(fs.readFileSync(target), before); assert.equal(restarts, 0);
        assert.equal(fs.existsSync(path.join(dir, 'backups')), false);
      }
      else if (fault && fault!=='slow-start') { await assert.rejects(action, /release policy or health.*iOS update policy not active/); assert.deepEqual(fs.readFileSync(target), before); assert.equal(restarts, 2); }
      else {
        const result = await action(); assert.equal(result.status, mode === '--check' ? 'checked' : installed?'unchanged':'installed');
        assert.equal(restarts, mode === '--check'||installed ? 0 : 1);
        if (mode === '--check') assert.deepEqual(fs.readFileSync(target), before);
        else { assert.equal((await health(8787, '/api/app/version')).json.minimumBuild, MINIMUM);assert.equal((await health(8787, '/api/app/version')).json.latestBuild,LATEST);if(!installed)assert.deepEqual(fs.readFileSync(path.join(result.backup, path.basename(target))),before); }
      }
      assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), 'PORT=8787\nMIN_SUPPORTED_APP_BUILD=117\nLATEST_APP_BUILD=119\nSECRET_FIXTURE=do-not-copy\n');
      assert.equal(fs.readFileSync(path.join(dir, 'database-sentinel.json'), 'utf8'), '{"unchanged":true}');
      assert.equal(fs.readFileSync(path.join(dir, 'community-daily-push.js'), 'utf8'), 'unchanged-module');
      assert.equal(fs.readFileSync(server, 'utf8'),'const { appUpdatePolicy } = require("./app-update-policy");\n'+modern);
    }
    await scenario('--apply','slow-start');await scenario('--check');await scenario('--apply');await scenario('--apply','health');await scenario('--apply','',true);await scenario('--apply','future');await scenario('--apply','auth');
    for(const corrupt of [false,true]){
      const folder=fs.mkdtempSync(path.join(fixture,'transport-')),log=path.join(folder,'invocations.txt'),installer=path.join(workspace,'scripts/deploy-ios-119-policy.cjs');
      let command=generated.replace('/tmp/turtlekeeper-ios119-policy.XXXXXX','$PWD/turtlekeeper-ios119-policy.XXXXXX');
      if(corrupt)command=command.replace(generated.match(/printf '%s  %s\\n' '([a-f0-9]{64})'/)[1],'0'.repeat(64));
      const harness='node() { cmp "$1" "$TASK_POLICY_INSTALLER" || return 99; printf "%s\\n" "$2" >> "$TASK_POLICY_LOG"; }\nexport -f node\n'+command;
      const r=spawnSync(bash,['--noprofile','--norc','-c',harness],{cwd:folder,env:{...process.env,TASK_POLICY_INSTALLER:installer,TASK_POLICY_LOG:log},encoding:'utf8'});if(r.error)throw r.error;
      assert.equal(r.status,corrupt?1:0,r.stderr);assert.equal(fs.existsSync(log),!corrupt);if(!corrupt)assert.deepEqual(fs.readFileSync(log,'utf8').trim().split(/\r?\n/),['--check','--apply']);
    }
    console.log('PASS: iOS 1.1.8 gate, 1.1.9 allowance, Android store/beta/legacy-UA and web/Harmony preservation, exact payload/hash, Bash syntax, CRLF, unknown source refusal, read-only preflight, backup, idempotent install, future-policy/auth guards and health-failure rollback.');
  } finally { assert.equal(path.dirname(fixture), parent); assert.ok(path.basename(fixture).startsWith('ios-119-policy-test-')); fs.rmSync(fixture, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
