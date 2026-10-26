'use strict';
// Isolated HTTP regression: virtual PM2 lifecycles, no real PM2 or production calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),assert=require('node:assert/strict');
const {deploy,patchModule,MINIMUM,LATEST}=require('./deploy-ios-119-policy.cjs');
const workspace=path.resolve(__dirname,'..');
const before=fs.readFileSync(path.join(__dirname,'fixtures/app-update-policy-118.js'),'utf8').replaceAll('\r\n','\n');
const after=patchModule(before);
assert.equal(MINIMUM,137);assert.equal(LATEST,139);
const modern='const { appUpdatePolicy } = require("./app-update-policy");\nfunction handleAppVersion(req, res) {\n  res.setHeader("Cache-Control", "no-store");\n  return sendJson(res, 200, appUpdatePolicy(req));\n}\n';
const policyEnv={MIN_SUPPORTED_APP_BUILD:'117',LATEST_APP_BUILD:'119',ANDROID_STORE_MIN_BUILD:'12',ANDROID_STORE_LATEST_BUILD:'13',ANDROID_STORE_UPDATE_URL:'https://example.invalid/store',ANDROID_BETA_MIN_BUILD:'11',ANDROID_BETA_LATEST_BUILD:'12',ANDROID_BETA_UPDATE_URL:'https://example.invalid/beta'};
function factory(source){
  const context={module:{exports:{}},URL};vm.createContext(context);vm.runInContext(source,context);
  return req=>JSON.parse(JSON.stringify(context.module.exports.appUpdatePolicy(req,policyEnv)));
}
async function scenario(fault){
  const output=path.resolve(workspace,'output');fs.mkdirSync(output,{recursive:true});
  const root=fs.mkdtempSync(path.join(fs.realpathSync(output),'ios-119-readiness-'));
  const folder=path.join(root,'server');fs.mkdirSync(folder);
  const policyFile=path.join(folder,'app-update-policy.js'),serverFile=path.join(folder,'server.js');
  fs.writeFileSync(policyFile,before);fs.writeFileSync(serverFile,modern);
  const protectedFiles={'.env':'SECRET_FIXTURE=keep-private\n','database-sentinel.json':'{"preserved":true}\n','community-daily-push.js':'// unrelated source\n'};
  for(const [name,text]of Object.entries(protectedFiles))fs.writeFileSync(path.join(folder,name),text);
  let restarts=0,ticks=15,phase='ready',cached=factory(before),loads=1;
  const waits=[],logs=[],calls=[],responses=[],cacheAtRestart=[];
  const server=http.createServer((req,res)=>{
    req.resume();res.setHeader('Content-Type','application/json');
    if(phase!=='ready'||(fault==='http'&&restarts===1)){
      res.writeHead(503);res.end(JSON.stringify({ok:false,message:'Synthetic startup unavailable'}));return;
    }
    if(req.method==='POST'&&req.url==='/api/account/load'){
      res.writeHead(401);res.end(JSON.stringify({ok:false,message:'Synthetic authentication required'}));return;
    }
    const result=cached({url:req.url,headers:req.headers});
    if(fault==='policy'&&restarts===1&&result.platform==='ios')result.latestBuild=999;
    res.writeHead(200);res.end(JSON.stringify(result));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port,origin='http://127.0.0.1:'+port;
  const run=args=>{
    calls.push([...args]);
    if(args.length===1&&args[0]==='jlist')return JSON.stringify([{name:'turtlekeeper-api',pid:100+restarts,pm2_env:{status:phase==='boot'&&ticks<3?'launching':'online',exec_mode:'fork_mode',pm_cwd:root,pm_exec_path:serverFile,watch:false,PORT:port}}]);
    assert.deepEqual([...args],['restart','turtlekeeper-api','--kill-timeout','30000'],'A real PM2 command must never run');
    // The running factory retains its old module even after the file is replaced.
    cacheAtRestart.push({cached:cached({url:'/?platform=ios',headers:{}}).minimumBuild,disk:factory(fs.readFileSync(policyFile,'utf8'))({url:'/?platform=ios',headers:{}}).minimumBuild});
    restarts++;ticks=0;phase='boot';return '';
  };
  const wait=async ms=>{
    waits.push({restart:restarts,tick:ticks,ms});
    if(phase==='boot'&&++ticks>=15){cached=factory(fs.readFileSync(policyFile,'utf8'));loads++;phase='ready';}
  };
  const health=async(p,route,options={})=>{
    assert.equal(p,port);assert.ok(route.startsWith('/api/'));
    const url=new URL(route,origin);assert.equal(url.origin,origin,'Only loopback HTTP is allowed');
    const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(2000)});
    const result={status:response.status,json:await response.json()};responses.push({restart:restarts,tick:ticks,route,...result});return result;
  };
  try{
    let error,result;
    try{result=await deploy({mode:'--apply',root,platform:'linux',run,health,wait,attempts:25,log:line=>logs.push(line)});}catch(e){error=e;}
    if(!fault){
      if(error)throw error;
      assert.equal(result.status,'installed');assert.equal(restarts,1);assert.equal(fs.readFileSync(policyFile,'utf8'),after);
      assert.ok(waits.filter(x=>x.restart===1).length>=15,'Readiness must survive more than 12 boot polls');
      assert.deepEqual(cacheAtRestart,[{cached:136,disk:137}]);
      assert.equal((await health(port,'/api/app/version')).json.minimumBuild,137);
      assert.equal((await health(port,'/api/app/version')).json.latestBuild,139);
      assert.deepEqual(fs.readFileSync(path.join(result.backup,'app-update-policy.js'),'utf8'),before);
    }else{
      assert.ok(error,'The injected post-restart failure must reject deployment');
      assert.match(error.message,/Post-restart release policy or health check failed:/);
      assert.doesNotMatch(error.message,/rollback needs attention/,'Delayed rollback readiness must recover');
      assert.match(error.message,fault==='policy'?/iOS update policy not active:.*latest=999/:/Version endpoint HTTP 503:/,'Concrete final failure must remain visible');
      assert.equal(restarts,2);assert.equal(fs.readFileSync(policyFile,'utf8'),before);
      assert.ok(logs.some(x=>x.startsWith('ROLLED BACK:')));
      assert.ok(waits.filter(x=>x.restart===2).length>=15,'Rollback must survive more than 12 boot polls');
      assert.deepEqual(cacheAtRestart,[{cached:136,disk:137},{cached:137,disk:136}]);
      const restored=await health(port,'/api/app/version');assert.equal(restored.json.minimumBuild,136);assert.equal(restored.json.latestBuild,136);
    }
    assert.equal(loads,restarts+1,'Factories load once per process lifecycle, not per HTTP request');
    assert.ok(logs.some(x=>x.includes('Unexpected API process configuration')),'PM2 launching must be exercised');
    assert.ok(responses.some(x=>x.status===503),'HTTP startup unavailability must be exercised');
    assert.equal((await health(port,'/api/app/version?platform=android&channel=store')).json.minimumBuild,12);
    assert.equal((await health(port,'/api/app/version?platform=android&channel=beta')).json.minimumBuild,11);
    assert.equal((await health(port,'/api/app/version?platform=web')).json.minimumBuild,0);
    assert.equal((await health(port,'/api/account/load',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    assert.equal(fs.readFileSync(serverFile,'utf8'),modern);
    for(const [name,text]of Object.entries(protectedFiles))assert.equal(fs.readFileSync(path.join(folder,name),'utf8'),text);
    assert.ok(calls.every(args=>args[0]==='jlist'||args[0]==='restart'));
    return {fault:fault||'none',restarts,waits:waits.length,httpResponses:responses.length};
  }finally{
    await new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections?.();});
    assert.equal(path.dirname(root),fs.realpathSync(output));assert.ok(path.basename(root).startsWith('ios-119-readiness-'));
    fs.rmSync(root,{recursive:true,force:true,maxRetries:6,retryDelay:100});
  }
}
(async()=>{
  const cases=[];for(const fault of ['', 'policy', 'http'])cases.push(await scenario(fault));
  console.log('PASS: real loopback HTTP, cached policy per simulated process, >12 boot ticks, delayed rollback readiness, concrete failure retention and unchanged Android/auth/data. No real PM2 or external requests.');
  console.log(JSON.stringify(cases));
})().catch(e=>{console.error(e);process.exitCode=1;});
