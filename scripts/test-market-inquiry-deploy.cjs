'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {patchSource,deploy}=require('./deploy-market-inquiry.cjs');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'market-inquiry-server-patch.json'),'utf8'));
const rootRepo=path.resolve(__dirname,'..'),installed={},original={};
for(const [file,hunks] of Object.entries(manifest.patches)){
 installed[file]=fs.readFileSync(path.join(rootRepo,file),'utf8').replace(/\r\n/g,'\n');
 original[file]=installed[file];
 for(const h of [...hunks].reverse())original[file]=original[file].replace(h.after,h.before);
 assert.equal(patchSource(original[file],hunks),installed[file]);
 assert.equal(patchSource(installed[file],hunks),installed[file]);
 assert.equal(patchSource(original[file].replace(/\n/g,'\r\n'),hunks),installed[file].replace(/\n/g,'\r\n'));
 assert.throws(()=>patchSource(original[file].replace(hunks[0].before,'unreviewed'),hunks),/Unreviewed/);
}
(async()=>{
 for(const scenario of ['check','apply','rollback','existing-module','unknown-module','unknown-ranking']){
  const root=fs.mkdtempSync(path.join(rootRepo,'output/market-inquiry-deploy-'));
  fs.mkdirSync(path.join(root,'server'));fs.mkdirSync(path.join(root,'assets'));
  for(const [file,text] of Object.entries(original))fs.writeFileSync(path.join(root,file),text);
  const moduleFile=path.join(root,'assets/market-inquiry.js'),payload=fs.readFileSync(path.join(rootRepo,'assets/market-inquiry.js'),'utf8');
  if(scenario==='existing-module')fs.writeFileSync(moduleFile,payload.replace(/\n/g,'\r\n'));
  if(scenario==='unknown-module')fs.writeFileSync(moduleFile,'unreviewed');
  if(scenario==='unknown-ranking')fs.appendFileSync(path.join(root,'server/market-ranking.js'),'\n'); // unrelated additions are preserved
  if(scenario==='unknown-ranking')fs.writeFileSync(path.join(root,'server/market-ranking.js'),original['server/market-ranking.js'].replace(manifest.patches['server/market-ranking.js'][0].before,'unreviewed'));
  const preserved={'server/.env':'WEATHERKIT_KEY_ID=fake-test\nSMS_PROVIDER=mock\n','server/data.json':'{"users":{"example":{"data":{"turtles":[{"id":"unchanged"}]}}}}'};
  for(const [f,bytes]of Object.entries(preserved))fs.writeFileSync(path.join(root,f),bytes);
  let restarts=0,t=0;
  const policy={ok:true,minimumBuild:125,latestBuild:133};
  const run=args=>{
   if(args[0]==='jlist')return JSON.stringify([{name:'turtlekeeper-api',pid:100+restarts,pm2_env:{status:'online',exec_mode:'fork_mode',pm_cwd:root,pm_exec_path:path.join(root,'server/server.js'),watch:false,PORT:8787}}]);
   if(args[0]==='restart'){restarts++;return '';}throw Error('Unexpected PM2 operation');
  };
  const health=async(port,route)=>{
   if(scenario==='rollback'&&restarts===1)throw Error('Simulated health failure');
   return route==='/api/app/version'?{status:200,json:policy}:{status:401,json:{ok:false}};
  };
  const invoke=mode=>deploy({mode,root,platform:'linux',run,health,nowMs:()=>t,wait:async ms=>t+=ms,log:()=>{}});
  if(scenario.startsWith('unknown')) {
   await assert.rejects(invoke('--apply'),/Unreviewed/);assert.equal(restarts,0);
   assert.equal(fs.readFileSync(path.join(root,'server/server.js'),'utf8'),original['server/server.js']);
  }else if(scenario==='rollback'){
   await assert.rejects(invoke('--apply'),/Restart health check failed/);assert.equal(restarts,2);
   for(const file of Object.keys(original))assert.equal(fs.readFileSync(path.join(root,file),'utf8'),original[file]);
   assert.equal(fs.existsSync(moduleFile),false,'rollback removes only newly installed helper');
  }else{
   const result=await invoke(scenario==='check'?'--check':'--apply');
   assert.equal(result.status,scenario==='check'?'checked':'installed');
   for(const file of Object.keys(original))assert.equal(fs.readFileSync(path.join(root,file),'utf8'),scenario==='check'?original[file]:installed[file]);
   if(scenario!=='check'){
    assert.equal(fs.readFileSync(moduleFile,'utf8'),payload);
    await invoke('--check');
   }else assert.equal(fs.existsSync(moduleFile),false);
  }
  for(const [f,bytes]of Object.entries(preserved))assert.equal(fs.readFileSync(path.join(root,f),'utf8'),bytes);
 }
 console.log('PASS consultation deployment: reviewed legacy/new source, idempotent patch/CRLF, module checksums, no-write preflight, apply, unknown source refusal, restart rollback, credentials/data/version policy preserved.');
})().catch(e=>{console.error(e);process.exitCode=1;});
