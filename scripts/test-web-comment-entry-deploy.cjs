'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{buildCommand}=require('./copy-web-comment-entry-command.cjs');
const {deploy,validate,hash,baselineNames,publishDirectory}=require('./deploy-web-comment-entry.cjs');
const root=path.resolve(__dirname,'..'),original=JSON.parse(fs.readFileSync(path.join(root,'deploy/web-comment-entry/release.json'),'utf8'));
const base=path.join(root,'output/web-comment-entry-installer-tests');fs.mkdirSync(base,{recursive:true});
const fixtures={'index.html':Buffer.from(JSON.parse(fs.readFileSync(path.join(root,'deploy/web-comment-entry/reviewed-baseline.json'))).indexBase64,'base64'),'app.js':Buffer.from('// Original public app\n'),'assets/community-mobile-ui.js':Buffer.from('// Original community\n'),'assets/community-mobile-ui.css':Buffer.from('/* Original community */\n')};
function setup(){
 const work=fs.mkdtempSync(path.join(base,'case-')),home=path.join(work,'home');fs.mkdirSync(home);fs.mkdirSync(path.join(work,'assets'));
 for(const [name,bytes]of Object.entries(fixtures)){fs.mkdirSync(path.dirname(path.join(work,name)),{recursive:true});fs.writeFileSync(path.join(work,name),bytes);}
 for(const name of ['config.js','server/server.js','package.json','capacitor.config.json']){fs.mkdirSync(path.dirname(path.join(work,name)),{recursive:true});fs.writeFileSync(path.join(work,name),'Protected '+name);}
 const pkg=structuredClone(original);pkg.baseline=Object.fromEntries(baselineNames.map(name=>[name,hash(fixtures[name])]));
 const load=async name=>fs.readFileSync(path.join(work,name));
 return {root:work,home,pkg,load,platform:'linux',log:()=>{}};
}
(async()=>{
 const files=validate(original).files;assert.equal(files.size,121);
 let c=setup();const protectedPaths=['app.js','config.js','server/server.js','package.json','capacitor.config.json','assets/community-mobile-ui.js','assets/community-mobile-ui.css'];
 const originals=Object.fromEntries(protectedPaths.map(name=>[name,fs.readFileSync(path.join(c.root,name))]));
 assert.equal((await deploy(c)).status,'checked');assert.equal(fs.existsSync(path.join(c.root,'assets',c.pkg.revision)),false);
 const installed=await deploy({...c,mode:'--apply'});assert.equal(installed.status,'installed');
 assert.equal(hash(fs.readFileSync(path.join(c.root,'index.html'))),c.pkg.index.sha256);
 for(const name of protectedPaths)assert.deepEqual(fs.readFileSync(path.join(c.root,name)),originals[name]);
 assert.equal((await deploy({...c,mode:'--apply'})).status,'unchanged');
 c=setup();fs.appendFileSync(path.join(c.root,'app.js'),'// server hotfix');
 await assert.rejects(deploy({...c,mode:'--apply'}),/differs from reviewed/);assert.equal(fs.existsSync(path.join(c.root,'assets',c.pkg.revision)),false);
 c=setup();c.pkg.files[0].base64=Buffer.from('bad bytes').toString('base64');await assert.rejects(deploy({...c,mode:'--apply'}),/checksum mismatch/);
 c=setup();c.pkg.files[0].name='../server/server.js';await assert.rejects(deploy({...c,mode:'--apply'}),/outside allowlist/);
 c=setup();const read=c.load;let rootReads=0;
 c.load=async name=>{if(name==='/index.html'&&++rootReads>1)return Buffer.from('stale CDN page');return read(name);};
 await assert.rejects(deploy({...c,mode:'--apply'}),/public website has not switched/);
 assert.deepEqual(fs.readFileSync(path.join(c.root,'index.html')),fixtures['index.html']);assert.equal(fs.existsSync(path.join(c.root,'assets',c.pkg.revision)),true,'Keep published versioned assets for in-flight pages after rollback');
 c=setup();await assert.rejects(deploy({...c,mode:'--apply',writeIndex:file=>{fs.writeFileSync(file,'Concurrent operator change');throw Error('Concurrent write');}}),/Concurrent write/);
 assert.equal(fs.readFileSync(path.join(c.root,'index.html'),'utf8'),'Concurrent operator change');
 c=setup();c.load=async()=>Buffer.from('another website');await assert.rejects(deploy({...c,mode:'--apply'}),/does not match the public website/);
 // Reproduce Windows scanner locks without depending on a scanner being active.
 for(const code of ['EPERM','EACCES','EBUSY']){
   c=setup();let attempts=0;const waits=[];
   const publishAssets=(stage,directory)=>publishDirectory(stage,directory,{platform:'win32',pause:async ms=>{waits.push(ms);},rename:(from,to)=>{
     if(++attempts<=2)throw Object.assign(Error('Temporary directory lock'),{code});fs.renameSync(from,to);
   }});
   assert.equal((await deploy({...c,mode:'--apply',publishAssets})).status,'installed');
   assert.equal(attempts,3);assert.deepEqual(waits,[50,100]);
   assert.equal(hash(fs.readFileSync(path.join(c.root,'index.html'))),c.pkg.index.sha256);
 }
 c=setup();let attempts=0;const waits=[];
 await assert.rejects(deploy({...c,mode:'--apply',publishAssets:(stage,directory)=>publishDirectory(stage,directory,{platform:'win32',pause:async ms=>{waits.push(ms);},rename:()=>{
   attempts++;throw Object.assign(Error('Persistent directory lock'),{code:'EPERM'});
 }})}),/Persistent directory lock/);
 assert.equal(attempts,7);assert.deepEqual(waits,[50,100,200,400,800,1600]);
 assert.deepEqual(fs.readFileSync(path.join(c.root,'index.html')),fixtures['index.html']);
 assert.equal(fs.existsSync(path.join(c.root,'assets',c.pkg.revision)),false);
 assert.equal(fs.readdirSync(path.join(c.root,'assets')).some(name=>name.startsWith('.comment-stage-')),false);
 for(const [platform,code] of [['linux','EPERM'],['win32','ENOENT']]){
   c=setup();let attempts=0;
   await assert.rejects(deploy({...c,mode:'--apply',publishAssets:(stage,directory)=>publishDirectory(stage,directory,{platform,pause:async()=>assert.fail('Unexpected retry'),rename:()=>{
     attempts++;throw Object.assign(Error('Non-retryable directory failure'),{code});
   }})}),/Non-retryable directory failure/);
   assert.equal(attempts,1);assert.deepEqual(fs.readFileSync(path.join(c.root,'index.html')),fixtures['index.html']);
 }
 c=setup();let races=0;
 await assert.rejects(deploy({...c,mode:'--apply',publishAssets:(stage,directory)=>publishDirectory(stage,directory,{platform:'win32',pause:async()=>{
   fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'operator.txt'),'Concurrent operator files');
 },rename:()=>{races++;throw Object.assign(Error('Temporary lock before concurrent publication'),{code:'EPERM'});}})}),/appeared concurrently/);
 assert.equal(races,1);assert.deepEqual(fs.readFileSync(path.join(c.root,'index.html')),fixtures['index.html']);
 assert.equal(fs.readFileSync(path.join(c.root,'assets',c.pkg.revision,'operator.txt'),'utf8'),'Concurrent operator files');
 // Execute the exact short Bash transport using mocked Git/Node. No server or GitHub writes.
 const installer=path.join(root,'scripts/deploy-web-comment-entry.cjs'),payload=path.join(root,'deploy/web-comment-entry/release.json');
 const command=buildCommand({commit:'a'.repeat(40),installerHash:hash(fs.readFileSync(installer)),payloadHash:hash(fs.readFileSync(payload))});
 assert.ok(Buffer.byteLength(command)<1800,'Keep the pasted server command short');
 assert.throws(()=>buildCommand({commit:'bad',installerHash:'f'.repeat(64),payloadHash:'f'.repeat(64)}),/Invalid reviewed/);
 for(const scenario of ['good','corrupt','wrong-commit']){
   const folder=fs.mkdtempSync(path.join(base,'transport-'));
   const mocked=command.replace('cd /www/turtlekeeper-app','cd "$PWD"').replace('"$HOME/turtle-web-comment-XXXXXXXX"','"$PWD/command-stage-XXXXXXXX"');
   const harness=[
     'git() {',
     '  if [[ "$1" == rev-parse ]]; then if [[ "$TASK_WEB_SCENARIO" == wrong-commit ]]; then printf "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\n"; else printf "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\n"; fi',
     '  elif [[ "$1" == show ]]; then',
     '    if [[ "$2" == *:scripts/deploy-web-comment-entry.cjs ]]; then cat "$TASK_WEB_INSTALLER"; else cat "$TASK_WEB_PAYLOAD"; if [[ "$TASK_WEB_SCENARIO" == corrupt ]]; then printf bad; fi; fi',
     '  else return 0; fi',
     '}',
     'node() { [[ "$2" == --apply && "$3" == /www/turtlekeeper-app && -f "$1" && -f "$4" ]] || return 1; printf checked > node-invoked.txt; }',
     'export -f git node',mocked
   ].join('\n');
   const result=spawnSync(process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash',['--noprofile','--norc','-c',harness],{cwd:folder,env:{...process.env,TASK_WEB_INSTALLER:installer,TASK_WEB_PAYLOAD:payload,TASK_WEB_SCENARIO:scenario},encoding:'utf8'});
   if(result.error)throw result.error;
   assert.equal(result.status,0,result.stderr);
   assert.equal(fs.existsSync(path.join(folder,'node-invoked.txt')),scenario==='good',result.stdout+'\n'+result.stderr);
 }
 console.log('PASS: website-only check/install/repeat, protected files, unknown source, corrupted payload, path traversal, public-readiness rollback and concurrent-change preservation.');
 console.log('PASS: Windows directory locks retry within a fixed limit; persistent errors preserve the old index, non-retryable errors stop immediately, and concurrent destination files remain untouched.');
 console.log('PASS: exact short Bash transport executes both SHA256 checks before install; corrupt bytes or a changed GitHub commit stop before invoking the installer.');
})().catch(error=>{console.error(error);process.exitCode=1;});
