'use strict';
// Run the real deployment preflight with isolated Git/PM2 outputs, never a real deployment.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'deploy-server-137.sh'),'utf8');
const marker='node - "$release_commit" "$root" <<\'NODE\'\n';
const start=source.indexOf(marker);assert.ok(start>=0);
const code=source.slice(start+marker.length,source.indexOf('\nNODE',start+marker.length));
function run(options={}) {
  const answers={version:'1.1.9',build:137,node:'24.0.0',cwd:'/fixture/app',script:'/fixture/app/server/server.js',name:'turtlekeeper-api',...options};
  const commands=[];
  vm.runInNewContext(code,{
    require(name) {
      if(name==='node:fs')return fs;
      if(name==='node:path')return path.posix;
      if(name==='node:child_process')return {execFileSync(command,args){
        commands.push([command,...args]);
        if(command==='git'&&args[1].endsWith(':config.js'))return `window.TURTLE_APP_BUILD = ${answers.build};`;
        if(command==='git'&&args[1].endsWith(':package.json'))return JSON.stringify({version:answers.version});
        if(command==='pm2'&&args[0]==='jlist')return JSON.stringify([{name:answers.name,pm2_env:{pm_cwd:answers.cwd,pm_exec_path:answers.script}}]);
        throw Error('Unexpected deployment side effect: '+command);
      }};
      throw Error('Unexpected dependency '+name);
    },process:{argv:['node','-','synthetic-commit','/fixture/app'],versions:{node:answers.node}},console:{log(){}}
  });
  assert.equal(commands.length,3);
}
run();
for(const [patch,pattern] of [[{version:'1.1.8'},/not release/],[{build:136},/not release/],[{node:'20.0.0'},/22 or newer/],[{cwd:'/another/app'},/PM2/],[{script:'/another/app/server.js'},/PM2/],[{name:'unrelated-service'},/PM2/]])assert.throws(()=>run(patch),pattern);
console.log('PASS: deployment preflight accepts the intended release and rejects wrong version/build, old Node, wrong PM2 directory/script/name; no install or restart executed.');

const crypto=require('node:crypto'),zlib=require('node:zlib'),{spawnSync}=require('node:child_process');
const {createBundle,createShortBundle,prepareFetchedInstaller}=require('./copy-server-137-offline.cjs');
const bundle=createBundle();
const payload=bundle.command.split("<<'TURTLE_137_INSTALLER' | gzip -d > \"$release_dir/installer.cjs\"\n")[1].split('\nTURTLE_137_INSTALLER')[0];
const decoded=zlib.gunzipSync(Buffer.from(payload.replace(/\s/g,''),'base64')).toString();
assert.equal(decoded,bundle.installer);
assert.equal(crypto.createHash('sha256').update(decoded).digest('hex'),bundle.checksum);
assert(bundle.command.includes(bundle.commit));
assert(!decoded.includes("input: git(['show', commit + ':scripts/deploy-server-137.sh']),"));
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const syntax=spawnSync(bash,['-n'],{input:bundle.command,encoding:'utf8'});
assert.equal(syntax.status,0,syntax.stderr);
const short=createShortBundle();
assert(Buffer.byteLength(short.command)<4096, 'Short paste must fit below 4 KiB');
assert(!short.command.includes('base64'));
assert.equal(spawnSync(bash,['-n'],{input:short.command,encoding:'utf8'}).status,0);
new vm.Script(short.program);
assert.equal(crypto.createHash('sha256').update(short.installer).digest('hex'),short.checksum);
assert.throws(()=>prepareFetchedInstaller('unknown','unknown'),/Unexpected cached/);
const output=fs.realpathSync(path.join(__dirname,'../output'));
const temp=fs.mkdtempSync(path.join(output,'server-137-header-test-'));
try {
  const header=path.join(temp,'header.sh');fs.writeFileSync(header,source.slice(0,start));
  const log=path.join(temp,'calls.txt');
  const mock=`git() {
    printf '%s\\n' "$*" >> "$RELEASE_TEST_LOG"
    case "$1 $2" in
      'diff --quiet'|'diff --cached') return 0 ;;
      'rev-parse --show-toplevel') pwd -P ;;
      'rev-parse origin/main') printf '%s\\n' 'pinned-commit' ;;
      'fetch origin'|'merge-base --is-ancestor') return 0 ;;
      *) return 99 ;;
    esac
  }
  npm() { :; }
  pm2() { :; }
  export -f git npm pm2
  bash "$RELEASE_TEST_HEADER" --check "$RELEASE_TEST_ROOT"
  `;
  for(const [pin,status,fetch] of [['',0,true],['pinned-commit',0,false],['different-commit',1,false]]) {
    fs.writeFileSync(log,'');
    const result=spawnSync(bash,['-c',mock],{encoding:'utf8',env:{...process.env,
      TURTLE_RELEASE_COMMIT:pin,RELEASE_TEST_LOG:log.replace(/\\/g,'/'),RELEASE_TEST_HEADER:header.replace(/\\/g,'/'),RELEASE_TEST_ROOT:temp.replace(/\\/g,'/')}});
    assert.equal(result.status,status,result.stderr);
    assert.equal(fs.readFileSync(log,'utf8').includes('fetch origin main'),fetch);
  }
  // Run the exact short recovery program with only deployment execution
  // intercepted. Git reads real cached objects; no fetch/install/restart runs.
  for(const drift of [false,true]) {
    let installs=0,writes=0;const errors=[];
    const fakeFs={...fs,
      realpathSync:file=>file==='/www/turtlekeeper-app'?file:fs.realpathSync(file),
      mkdtempSync:prefix=>{assert.equal(path.dirname(prefix),temp);writes++;return fs.mkdtempSync(prefix);}
    };
    const fakeProcess={cwd:()=>'/www/turtlekeeper-app',execPath:process.execPath,exitCode:0};
    vm.runInNewContext(short.program,{
      require(name) {
        if(name==='fs')return fakeFs;
        if(name==='os')return {homedir:()=>temp};
        if(name==='child_process')return {execFileSync(command,args,options){
          if(command==='git') {
            // The recovery script targets cached release 137, independent of
            // whichever later release the real origin/main points to today.
            if(args[0]==='rev-parse'&&args[1]==='origin/main')return short.commit+'\n';
            const bytes=require('node:child_process').execFileSync(command,args,{...options,cwd:path.resolve(__dirname,'..')});
            return drift&&args[0]==='show'&&args[1].endsWith(':scripts/deploy-server-137.sh')?bytes+'\n# unexpected drift\n':bytes;
          }
          assert.equal(command,process.execPath);assert.deepEqual(Array.from(args.slice(1)),['--apply','/www/turtlekeeper-app']);
          assert.equal(fs.readFileSync(args[0],'utf8'),short.installer);installs++;return '';
        }};
        return require(name);
      },process:fakeProcess,console:{log(){},error:message=>errors.push(message)}
    });
    assert.equal(installs,drift?0:1);assert.equal(writes,drift?0:1);
    assert.equal(fakeProcess.exitCode,drift?1:0);
    if(drift)assert(errors.some(message=>message.includes('checksum mismatch')));
  }
} finally {
  assert.equal(path.dirname(temp),output);assert(path.basename(temp).startsWith('server-137-header-test-'));
  fs.rmSync(temp,{recursive:true,force:true});
}
console.log('PASS: exact clipboard payload/hash and Bash syntax; pinned deployments skip GitHub fetch and reject a changed ref; ordinary deployments still fetch. Mocked Git only.');
console.log('PASS: short cached-object recovery is under 4 KiB, executes the exact checked installer, and refuses checksum drift before writing or running it. No real deployment executed.');
