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
