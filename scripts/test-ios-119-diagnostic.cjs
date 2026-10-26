'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {serverCommand}=require('./copy-ios-119-diagnostic-command.cjs');
const root='/www/turtlekeeper-app',source=fs.readFileSync(path.join(__dirname,'diagnose-ios-119-policy.cjs'),'utf8'),old=fs.readFileSync(path.join(__dirname,'fixtures/app-update-policy-118.js'),'utf8');
(async()=>{
  const logs=[],commands=[],requests=[];
  const c={module:{exports:{}},console:{log:(...args)=>logs.push(args.join(' ')),error:()=>{}},process:{exitCode:0},AbortSignal:{timeout:()=>undefined},
    require(name){
      if(name==='node:path')return path.posix;
      if(name==='node:crypto')return crypto;
      if(name==='node:fs')return {
        existsSync:()=>true,
        readFileSync(file){if(file===root+'/server/.env')return 'PORT=8787\nSECRET=DO_NOT_DISCLOSE';assert.equal(file,root+'/server/app-update-policy.js');return old;}
      };
      if(name==='node:child_process')return {execFileSync(cmd,args){commands.push([cmd,...args]);if(cmd==='pm2'){assert.deepEqual(Array.from(args),['jlist']);return JSON.stringify([{name:'turtlekeeper-api',pid:42,pm2_env:{PORT:8787,status:'online',exec_mode:'fork_mode',watch:false,pm_cwd:root,pm_exec_path:root+'/server/server.js',SECRET:'DO_NOT_DISCLOSE',MIN_SUPPORTED_APP_BUILD:'117',LATEST_APP_BUILD:'119',pm_uptime:Date.now()}}]);}assert.equal(cmd,'ss');assert.deepEqual(Array.from(args),['-ltnp']);return 'LISTEN 0 511 127.0.0.1:8787 0.0.0.0:* users:(("node",pid=42,fd=20))\n';}};
      throw Error('Unexpected module '+name);
    },
    async fetch(url,options){requests.push({url,options});const p=new URL(url);const auth=p.pathname==='/api/account/load';return {status:auth?401:200,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(auth?{ok:false,message:'请先登录'}:{ok:true,platform:options.headers['User-Agent']?'android':p.searchParams.get('platform')||'ios',minimumBuild:136,latestBuild:136})};}
  };
  vm.createContext(c);vm.runInContext(source,c);await c.main();
  assert.deepEqual(commands,[['pm2','jlist'],['ss','-ltnp']]);assert.equal(requests.length,12);
  assert.equal(requests.filter(x=>x.options.method==='POST').length,1);
  const auth=requests.find(x=>x.options.method==='POST');assert.ok(auth.url.endsWith('/api/account/load'));assert.equal(auth.options.body,'{}');
  assert.ok(logs.some(line=>line.startsWith('DISK ')));assert.ok(logs.some(line=>line.startsWith('LISTENER ')&&line.includes('42')));assert.ok(logs.some(line=>line.startsWith('PUBLIC ')));assert.ok(!logs.join('\n').includes('DO_NOT_DISCLOSE'));
  const command=serverCommand();assert.ok(command.includes('\nmain().catch('));
  const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';const syntax=spawnSync(bash,['-n'],{input:command,encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr);
  console.log('PASS: read-only diagnostic inspects selected PM2 fields, disk policy, listener PID and 12 health requests; no restart/source write or secret output, and pasted Bash syntax is valid.');
})().catch(e=>{console.error(e);process.exitCode=1;});
