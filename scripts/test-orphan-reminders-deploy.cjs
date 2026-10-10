'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {patchSource,deploy}=require('./deploy-orphan-reminders.cjs');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'orphan-reminders-server-patch.json'),'utf8'));
const installed=fs.readFileSync(path.join(__dirname,'../server/server.js'),'utf8').replace(/\r\n/g,'\n');
let original=installed;
for(const h of [...manifest.hunks].reverse()){assert.equal(original.split(h.after).length,2);original=original.replace(h.after,h.before);}
assert.equal(patchSource(original,manifest.hunks),installed);
assert.equal(patchSource(installed,manifest.hunks),installed);
assert.equal(patchSource(original.replace(/\n/g,'\r\n'),manifest.hunks),installed.replace(/\n/g,'\r\n'));
assert.throws(()=>patchSource(original.replace(manifest.hunks[0].before,'unreviewed'),manifest.hunks),/Unreviewed/);
(async()=>{
  for(const scenario of ['check','apply','rollback']){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'turtle-orphan-deploy-'));
    fs.mkdirSync(path.join(root,'server'));fs.writeFileSync(path.join(root,'server/server.js'),original);
    const preserved = { 'server/.env': 'WEATHERKIT_KEY_ID=test-key\nSMS_PROVIDER=aliyun\n', 'server/data.json': '{"users":{"example":{"data":{"turtles":[],"memos":[{"id":"unchanged"}]}}}}' };
    for (const [file, bytes] of Object.entries(preserved)) fs.writeFileSync(path.join(root,file),bytes);

    let restarts=0,t=0;
    const policy={ok:true,minimumBuild:125,latestBuild:131};
    const run=args=>{
      if(args[0]==='jlist')return JSON.stringify([{name:'turtlekeeper-api',pid:100+restarts,pm2_env:{status:'online',exec_mode:'fork_mode',pm_cwd:root,pm_exec_path:path.join(root,'server/server.js'),watch:false,PORT:8787}}]);
      if(args[0]==='restart'){restarts++;return ''} throw Error('Unexpected PM2 operation');
    };
    const health=async(port,route)=>{
      assert.equal(port,8787);
      if(scenario==='rollback'&&restarts===1)throw Error('simulated restart failure');
      if(route==='/api/app/version')return {status:200,json:policy};
      return {status:route==='/api/account/password/reset'?400:401,json:{ok:false}};
    };
    const invoke=()=>deploy({mode:scenario==='check'?'--check':'--apply',root,platform:'linux',run,health,nowMs:()=>t,wait:async ms=>{t+=ms;},log:()=>{}});
    if(scenario==='rollback'){
      await assert.rejects(invoke(),/Restart health check failed/);assert.equal(restarts,2);
      assert.equal(fs.readFileSync(path.join(root,'server/server.js'),'utf8'),original);
      assert.equal(fs.existsSync(path.join(root,'server/orphan-reminders.js')),false);
    }else{
      const result=await invoke();assert.equal(result.status,scenario==='check'?'checked':'installed');
      assert.equal(restarts,scenario==='check'?0:1);
      assert.equal(fs.readFileSync(path.join(root,'server/server.js'),'utf8'),scenario==='check'?original:installed);
    }
    for (const [file, bytes] of Object.entries(preserved)) assert.equal(fs.readFileSync(path.join(root,file),'utf8'),bytes,'credentials and business data preserved');
  }
  console.log('PASS deployment: reviewed exact patch, idempotence, CRLF, refusal of unknown source, preflight, apply and failed restart rollback; version policy preserved.');
})().catch(e=>{console.error(e);process.exitCode=1});
