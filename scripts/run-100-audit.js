// 53 existing regression suites + 47 independently named boundary scenarios.
// All server tests use their own temporary runtimes and mock credentials.
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'output','audit-100');
fs.mkdirSync(out,{recursive:true});
fs.mkdirSync(path.join(root,'build'),{recursive:true});
const env={...process.env};
// Do not allow tests to inherit production secrets from server/.env.
const envFile=path.join(root,'server','.env');
if(fs.existsSync(envFile)) for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)) {
  const match=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);if(match)env[match[1]]='';
}
Object.assign(env,{MYSQL_URL:'',MYSQL_HOST:'',TEST_MYSQL_URL:'',TURTLE_TEST_MYSQL_URL:'',TURTLE_TEST_RECORD_DRIVER:'',
  REVIEWED_RECOVERY_FIXTURE:'',
  SMS_PROVIDER:'mock',SMS_MOCK:'true',APNS_KEY_PATH:'',APNS_KEY_BASE64:'',APNS_KEY_ID:'',APNS_TEAM_ID:'',
  OSS_ACCESS_KEY_ID:'',OSS_ACCESS_KEY_SECRET:'',ALIBABA_CLOUD_ACCESS_KEY_ID:'',ALIBABA_CLOUD_ACCESS_KEY_SECRET:''});
for(const key of ['PLAYWRIGHT_MODULE','BROWSER_EXECUTABLE','FFMPEG_PATH']) if(process.env[key])env[key]=process.env[key];
// The backup drill copies real local uploads; use synthetic codec cases instead.
// Real MySQL requires a supplied binary and is reported separately if available.
const excluded=new Set(['test-backup-restore.js','test-local-mysql.js']);
const suites=fs.readdirSync(__dirname).filter(n=>/^test-.*\.js$/.test(n)&&!excluded.has(n)).sort();
const cases=require('./audit-boundary-cases');
if(suites.length+cases.length!==100)throw new Error('Audit manifest must contain exactly 100 tasks');
const results=[];
function record(result){results.push(result);if(process.argv[2]!=='--mysql')fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({generatedAt:new Date().toISOString(),results},null,2));console.log(`${result.id}/100 ${result.status} ${result.name}`);}
function runSuite(name,id,args=[]){return new Promise(resolve=>{
  const start=Date.now();let log='';const child=spawn(process.execPath,[path.join(__dirname,name),...args],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',s=>log+=s);child.stderr.on('data',s=>log+=s);
  child.once('error',error=>log+=error.stack);
  const timer=setTimeout(()=>{log+='\nAudit timeout';child.kill();},180000);
  child.once('close',code=>{clearTimeout(timer);fs.writeFileSync(path.join(out,name+'.log'),log);record({id,name,status:code===0?'PASS':'FAIL',milliseconds:Date.now()-start,log:name+'.log'});resolve();});
});}
(async()=>{
  if(process.argv[2]==='--mysql') {
    if(!process.argv[3])throw new Error('Provide an existing local MySQL binary');
    await runSuite('test-local-mysql.js','MYSQL',[path.resolve(process.argv[3])]);
    fs.writeFileSync(path.join(out,'mysql-result.json'),JSON.stringify(results[0],null,2));
    process.exitCode=results[0].status==='PASS'?0:1;return;
  }
  for(let i=0;i<suites.length;i+=2)await Promise.all(suites.slice(i,i+2).map((name,j)=>runSuite(name,i+j+1)));
  for(let i=0;i<cases.length;i++){
    const entry=cases[i],start=Date.now();try{await entry.run();record({id:suites.length+i+1,name:entry.name,status:'PASS',milliseconds:Date.now()-start});}
    catch(error){record({id:suites.length+i+1,name:entry.name,status:'FAIL',milliseconds:Date.now()-start,error:error.stack});}
  }
  results.sort((a,b)=>a.id-b.id);
  const failed=results.filter(r=>r.status==='FAIL');
  fs.writeFileSync(path.join(out,'report.md'),`# 108 构建：100 项检查\n\n通过 ${results.length-failed.length} 项，失败 ${failed.length} 项。\n\n53 项现有回归测试组及 47 项新增边界场景；并非 100 个测试账户或 100 次重复运行。\n\n本地隔离测试，不代表 iPhone 真机、线上 RDS、APNs/OSS 或 3000 日活性能已经验证。\n\n|编号|项目|结果|\n|---|---|---|\n`+results.map(r=>`|${r.id}|${r.name}|${r.status}|`).join('\n'));
  console.log(`RESULT ${results.length-failed.length}/100 passed; ${failed.length} failed`);process.exitCode=failed.length?1:0;
})().catch(error=>{console.error(error);process.exitCode=1});
