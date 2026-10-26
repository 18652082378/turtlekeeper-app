'use strict';
// Read-only diagnostic. Never writes source, restarts PM2 or prints secrets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root='/www/turtlekeeper-app';
const numeric=value=>{const n=Number.parseInt(String(value),10);return Number.isFinite(n)?n:null;};
async function inspect({base,route,headers={},method='GET'}){
  try{
    const response=await fetch(base+route,{method,headers:{...headers,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{}),redirect:'error',signal:AbortSignal.timeout(5000)});
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{}
    return {route,androidUA:Boolean(headers['User-Agent']),status:response.status,json:Boolean(data),...(data?{ok:data.ok,platform:data.platform,channel:data.channel,minimum:data.minimumBuild,latest:data.latestBuild,message:data.message}:{contentType:response.headers.get('content-type')})};
  }catch(error){return {route,error:error.message};}
}
async function main(){
  const apps=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6,timeout:15000})).filter(x=>x.name==='turtlekeeper-api');
  console.log('PM2',JSON.stringify(apps.map(a=>({pid:a.pid,status:a.pm2_env?.status,mode:a.pm2_env?.exec_mode,watch:a.pm2_env?.watch,cwdMatches:a.pm2_env?.pm_cwd===root,scriptMatches:a.pm2_env?.pm_exec_path===path.join(root,'server/server.js'),restarts:a.pm2_env?.restart_time,uptimeMs:Date.now()-Number(a.pm2_env?.pm_uptime)}))));
  if(apps.length!==1)throw Error('Expected one API process');
  const env=apps[0].pm2_env;
  let port=env.PORT??env.env?.PORT;
  if(port===undefined&&fs.existsSync(path.join(root,'server/.env')))port=fs.readFileSync(path.join(root,'server/.env'),'utf8').match(/^\s*PORT\s*=\s*['"]?(\d+)['"]?\s*$/m)?.[1];
  port=numeric(port??8787);if(!port||port>65535)throw Error('Invalid port');
  const code=fs.readFileSync(path.join(root,'server/app-update-policy.js'),'utf8').replace(/\r\n/g,'\n');
  console.log('DISK',JSON.stringify({sha256:crypto.createHash('sha256').update(code).digest('hex'),minimumFloor:numeric(code.match(/const minimumBuild = Math\.max\((\d+),/)?.[1]),latestFloor:numeric(code.match(/latestBuild: Math\.max\(minimumBuild, (\d+),/)?.[1]),port,pm2Minimum:numeric(env.MIN_SUPPORTED_APP_BUILD??env.env?.MIN_SUPPORTED_APP_BUILD),pm2Latest:numeric(env.LATEST_APP_BUILD??env.env?.LATEST_APP_BUILD)}));
  try{const lines=execFileSync('ss',['-ltnp'],{encoding:'utf8',timeout:10000}).split('\n').filter(line=>new RegExp(':'+port+'\\s').test(line));console.log('LISTENER',JSON.stringify({port,pids:[...new Set(lines.flatMap(line=>[...line.matchAll(/pid=(\d+)/g)].map(m=>Number(m[1]))))],socketCount:lines.length}));}catch{console.log('LISTENER unavailable');}
  const base='http://127.0.0.1:'+port;
  for(const route of ['/api/app/version','/api/app/version?platform=ios&build=136','/api/app/version?platform=ios&build=137','/api/app/version?platform=ios&build=139','/api/app/version?platform=android&channel=beta','/api/app/version?platform=android&channel=store','/api/app/version?platform=web','/api/app/version?platform=harmony','/api/app/version?platform=unknown'])console.log('LOCAL',JSON.stringify(await inspect({base,route})));
  console.log('LOCAL',JSON.stringify(await inspect({base,route:'/api/app/version',headers:{'User-Agent':'Mozilla/5.0 (Linux; Android 15)'}})));
  console.log('AUTH',JSON.stringify(await inspect({base,route:'/api/account/load',method:'POST'})));
  console.log('PUBLIC',JSON.stringify(await inspect({base:'https://api.turtleworld.cn',route:'/api/app/version?platform=ios'})));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={inspect,numeric};
