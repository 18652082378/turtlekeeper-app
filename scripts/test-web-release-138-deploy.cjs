'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {deploy,validate,hash,baselineNames,publishDirectory}=require('./deploy-web-release-138.cjs');
const root=path.resolve(__dirname,'..'),original=JSON.parse(fs.readFileSync(path.join(root,'deploy/web-release-138/release.json'),'utf8'));
const base=path.join(root,'output/web-release-138-installer-tests');fs.mkdirSync(base,{recursive:true});
const fixtures={'index.html':Buffer.from(JSON.parse(fs.readFileSync(path.join(root,'deploy/web-release-138/reviewed-baseline.json'))).indexBase64,'base64'),'app.js':Buffer.from('// Original public app\n'),'assets/community-mobile-ui.js':Buffer.from('// Original community\n'),'assets/community-mobile-ui.css':Buffer.from('/* Original community */\n')};
function setup(){
 const work=fs.mkdtempSync(path.join(base,'case-')),home=path.join(work,'home');fs.mkdirSync(home);fs.mkdirSync(path.join(work,'assets'));
 for(const [name,bytes]of Object.entries(fixtures)){fs.mkdirSync(path.dirname(path.join(work,name)),{recursive:true});fs.writeFileSync(path.join(work,name),bytes);}
 for(const name of ['config.js','server/server.js','package.json','capacitor.config.json']){fs.mkdirSync(path.dirname(path.join(work,name)),{recursive:true});fs.writeFileSync(path.join(work,name),'Protected '+name);}
 const pkg=structuredClone(original);pkg.baseline=Object.fromEntries(baselineNames.map(name=>[name,hash(fixtures[name])]));
 const load=async name=>fs.readFileSync(path.join(work,name));
 return {root:work,home,pkg,load,platform:'linux',log:()=>{}};
}
(async()=>{
 const files=validate(original).files;assert.equal(files.size,127);
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
 // Keep simulated retry counts independent of real Windows scanner locks.
 // Actual directory publication is covered by the install/repeat cases above.
 for(const code of ['EPERM','EACCES','EBUSY'])for(const failures of [2,3]){
   c=setup();let attempts=0;const waits=[];
   const stage=path.join(c.root,'simulated-stage'),directory=path.join(c.root,'simulated-target');
   await publishDirectory(stage,directory,{platform:'win32',pause:async ms=>{waits.push(ms);},rename:(from,to)=>{
     assert.equal(from,stage);assert.equal(to,directory);
     if(++attempts<=failures)throw Object.assign(Error('Temporary directory lock'),{code});
   }});
   assert.equal(attempts,failures+1);assert.deepEqual(waits,[50,100,200].slice(0,failures));
   assert.deepEqual(fs.readFileSync(path.join(c.root,'index.html')),fixtures['index.html']);
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
 console.log('PASS: release 138 website install, repeat, source guards, checksums, rollback, concurrent changes and Windows file locks.');
})().catch(error=>{console.error(error);process.exitCode=1;});
