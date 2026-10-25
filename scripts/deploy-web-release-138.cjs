'use strict';
// Standalone Linux installer. Versioned browser files + one atomic index update.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const ensure=(yes,message)=>{if(!yes)throw Error(message);};
const baselineNames=['index.html','app.js','assets/community-mobile-ui.js','assets/community-mobile-ui.css'];
const codeNames=['app.js','community-mobile-ui.js','community-mobile-ui.css','turtle-emotes.js','turtle-emote-picker.js','turtle-emotes.css','comment-smile-entry.svg','module-workspaces.css','discovery-workspace.js','discovery-workspace.css','community-page-polish.js','community-page-polish.css','release-notes.js'];
function validate(pkg){
 ensure(pkg?.format==='turtle-web-release-138-v1'&&/^web-release-138-[a-f0-9]{12}$/.test(pkg.revision),'Invalid browser package');
 ensure(Object.keys(pkg.baseline||{}).sort().join()===baselineNames.slice().sort().join(),'Unexpected baseline paths');
 for(const file of baselineNames)ensure(/^[a-f0-9]{64}$/.test(pkg.baseline[file]),'Invalid baseline checksum');
 ensure(Array.isArray(pkg.files)&&pkg.files.length===127,'Expected 127 versioned assets');
 const files=new Map();
 function decode(record){
   ensure(typeof record.base64==='string'&&record.base64.length<3e6&&/^[A-Za-z0-9+/]+={0,2}$/.test(record.base64),'Invalid asset encoding');
   const bytes=Buffer.from(record.base64,'base64');ensure(bytes.toString('base64')===record.base64&&hash(bytes)===record.sha256,'Asset checksum mismatch');return bytes;
 }
 for(const file of pkg.files){
   ensure(codeNames.includes(file.name)||/^emotes\/[a-z][a-z0-9-]{0,40}\.svg$/.test(file.name),'Asset path outside allowlist');
   ensure(!files.has(file.name),'Duplicate browser asset');const bytes=decode(file);
   if(file.name.endsWith('.js'))new vm.Script(bytes.toString('utf8'),{filename:file.name});files.set(file.name,bytes);
 }
 ensure(codeNames.every(name=>files.has(name)),'Browser dependency is missing');
 const index=decode(pkg.index),text=index.toString('utf8'),prefix='/assets/'+pkg.revision+'/';
 ensure(text.includes('<!-- '+pkg.revision+' -->')&&/<\/html>\s*$/.test(text),'Invalid revised HTML');
 for(const name of codeNames.filter(name=>/\.(?:js|css)$/.test(name)))ensure(text.includes(prefix+name),'HTML dependency is missing: '+name);
 ensure(!text.includes('src="./app.js?')&&!text.includes('src="./assets/community-mobile-ui.js?'),'HTML still loads old executable files');
 return {files,index};
}
function regular(file){
 const stat=fs.lstatSync(file);ensure(stat.isFile()&&!stat.isSymbolicLink()&&fs.realpathSync(file)===file,'Expected regular source: '+path.basename(file));return fs.readFileSync(file);
}
function atomicIndex(file,bytes,expected){
 ensure(hash(regular(file))===expected,'Website changed concurrently; preserved the newer index');
 const stat=fs.statSync(file),temp=file+'.comment-'+crypto.randomUUID()+'.tmp';
 try{fs.writeFileSync(temp,bytes,{flag:'wx',mode:stat.mode&0o777});if(process.platform!=='win32')fs.chownSync(temp,stat.uid,stat.gid);
   ensure(hash(regular(file))===expected,'Website changed concurrently; preserved the newer index');fs.renameSync(temp,file);
 }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
async function publishDirectory(stage,directory,{platform=process.platform,rename=fs.renameSync,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 // Windows scanners can briefly hold a freshly written directory. Keep the
 // atomic rename and recheck the destination before every bounded retry.
 const delays=[50,100,200,400,800,1600];
 for(let attempt=0;;attempt++){
   ensure(!fs.existsSync(directory),'Browser asset directory appeared concurrently; stopped');
   try{rename(stage,directory);return;}catch(error){
     if(platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=delays.length)throw error;
     await pause(delays[attempt]);
   }
 }
}
async function publicLoad(relative){
 const response=await fetch('https://api.turtleworld.cn'+relative+(relative.includes('?')?'&':'?')+'entrycheck='+Date.now(),{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 ensure(response.ok,'Public verification failed: '+response.status+' '+relative);return Buffer.from(await response.arrayBuffer());
}
async function verifyLive(pkg,files,index,load){
 ensure(hash(await load('/index.html'))===hash(index),'The public website has not switched to the new index');
 const queue=[...files];let cursor=0;
 await Promise.all(Array.from({length:6},async()=>{while(cursor<queue.length){const [name,bytes]=queue[cursor++];ensure(hash(await load('/assets/'+pkg.revision+'/'+name))===hash(bytes),'Public asset mismatch: '+name);}}));
}
async function deploy({root='/www/turtlekeeper-app',pkg,mode='--check',platform=process.platform,load=publicLoad,home=os.homedir(),writeIndex=atomicIndex,publishAssets=publishDirectory,log=console.log}={}){
 ensure(platform==='linux','Run the installer in the Linux server Shell');ensure(['--check','--apply'].includes(mode),'Use --check or --apply');
 const {files,index}=validate(pkg);
 ensure(path.isAbsolute(root)&&fs.realpathSync(root)===root,'Project root must not contain symlinks');
 const assets=path.join(root,'assets');ensure(fs.realpathSync(assets)===assets&&fs.lstatSync(assets).isDirectory(),'Invalid asset directory');
 const current=new Map(baselineNames.map(name=>[name,regular(path.join(root,name))]));
 const already=hash(current.get('index.html'))===hash(index);
 for(const name of baselineNames)if(name!=='index.html'||!already)ensure(hash(current.get(name))===pkg.baseline[name],'Source differs from reviewed website: '+name+'; stopped without overwriting it');
 ensure(hash(await load('/index.html'))===hash(current.get('index.html')),'This directory does not match the public website index');
 ensure(hash(await load('/app.js'))===hash(current.get('app.js')),'This directory does not match the public app.js');
 const directory=path.join(assets,pkg.revision);
 const existing=fs.existsSync(directory);
 if(existing){
   ensure(fs.lstatSync(directory).isDirectory()&&fs.realpathSync(directory)===directory,'Invalid installed browser directory');
   for(const [name,bytes]of files)ensure(hash(regular(path.join(directory,name)))===hash(bytes),'Installed versioned file was changed: '+name);
 }
 if(already){ensure(existing,'Installed HTML is missing its asset directory');await verifyLive(pkg,files,index,load);log('ALREADY INSTALLED: '+pkg.revision);return {status:'unchanged',revision:pkg.revision};}
 if(mode==='--check'){log('CHECK PASSED: reviewed public website matches; no files changed.');return {status:'checked',revision:pkg.revision};}
 const protectedNames=['app.js','config.js','server/server.js','package.json','capacitor.config.json'].filter(name=>fs.existsSync(path.join(root,name)));
 const protectedHashes=new Map(protectedNames.map(name=>[name,hash(regular(path.join(root,name)))]));
 const backupRoot=path.join(home,'.turtlekeeper-web-release-138-backups');
 if(fs.existsSync(backupRoot))ensure(fs.lstatSync(backupRoot).isDirectory()&&fs.realpathSync(backupRoot)===backupRoot,'Invalid backup directory');
 fs.mkdirSync(backupRoot,{recursive:true,mode:0o700});
 const backup=fs.mkdtempSync(path.join(backupRoot,pkg.revision+'-'));
 fs.writeFileSync(path.join(backup,'index-before.html'),current.get('index.html'),{flag:'wx',mode:0o600});
 fs.writeFileSync(path.join(backup,'receipt.json'),JSON.stringify({revision:pkg.revision,indexBefore:hash(current.get('index.html')),indexAfter:hash(index),protected:Object.fromEntries(protectedHashes)},null,2),{flag:'wx',mode:0o600});
 ensure(hash(regular(path.join(backup,'index-before.html')))===hash(current.get('index.html')),'Backup verification failed');
 let switched=false,stage='';
 try{
   if(!existing){
     stage=fs.mkdtempSync(path.join(assets,'.comment-stage-'));fs.chmodSync(stage,0o755);
     for(const [name,bytes]of files){const file=path.join(stage,name);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o755});fs.writeFileSync(file,bytes,{flag:'wx',mode:0o644});}
     await publishAssets(stage,directory);stage='';
   }
   for(const name of baselineNames)ensure(hash(regular(path.join(root,name)))===hash(current.get(name)),'Source changed during installation: '+name);
   writeIndex(path.join(root,'index.html'),index,hash(current.get('index.html')));switched=true;
   for(const [name,before]of protectedHashes)ensure(hash(regular(path.join(root,name)))===before,'Protected source changed: '+name);
   await verifyLive(pkg,files,index,load);
   log('INSTALLED AND VERIFIED: '+pkg.revision+'; '+files.size+' browser assets. Backup: '+backup);
   log('Website only: no database writes, npm install, PM2 restart or mobile build. Reopen the website.');
   return {status:'installed',revision:pkg.revision,backup};
 }catch(error){
   if(switched&&hash(regular(path.join(root,'index.html')))===hash(index))atomicIndex(path.join(root,'index.html'),current.get('index.html'),hash(index));
   throw Error(error.message+'; previous index preserved/restored. Backup: '+backup);
 }finally{
   if(stage){ensure(path.dirname(stage)===assets&&path.basename(stage).startsWith('.comment-stage-'),'Invalid private staging cleanup');fs.rmSync(stage,{recursive:true,force:true,maxRetries:6,retryDelay:100});}
 }
}
module.exports={validate,deploy,hash,baselineNames,publishDirectory};
if(require.main===module){const [mode='--check',root='/www/turtlekeeper-app',manifest=path.resolve(__dirname,'../deploy/web-release-138/release.json'),...extra]=process.argv.slice(2);if(extra.length)throw Error('Use: --check|--apply project-root manifest-path');deploy({mode,root,pkg:JSON.parse(fs.readFileSync(manifest,'utf8'))}).catch(error=>{console.error(error.message);process.exitCode=1;});}
