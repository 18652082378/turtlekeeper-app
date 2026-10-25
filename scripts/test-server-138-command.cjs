'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process'),{buildCommand}=require('./copy-server-138-command.cjs');
const root=path.resolve(__dirname,'..'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const ref='a'.repeat(40),read=file=>fs.readFileSync(path.join(root,file));
const installer=read('scripts/deploy-web-release-138.cjs'),payload=read('deploy/web-release-138/release.json');
const command=buildCommand({ref,installerHash:hash(installer),payloadHash:hash(payload)});
assert.ok(!/\bgit\b/.test(command));assert.ok(!/\bread\b|\bssh\b/.test(command));assert.ok(Buffer.byteLength(command)<2200);
assert.throws(()=>buildCommand({ref:'bad',installerHash:hash(installer),payloadHash:hash(payload)}),/Invalid release/);
const base=path.join(root,'output/web-release-138-cdn-tests');fs.mkdirSync(base,{recursive:true});
for(const scenario of ['good','first-unavailable','first-corrupt','all-unavailable','all-corrupt','payload-corrupt','installer-failed']){
 const folder=fs.mkdtempSync(path.join(base,'case-'));fs.writeFileSync(path.join(folder,'installer.cjs'),installer);fs.writeFileSync(path.join(folder,'release.json'),payload);
 const local=command.replace('cd /www/turtlekeeper-app','cd "$PWD"').replace('"$HOME/turtle-web-138-XXXXXXXX"','"$PWD/stage-XXXXXXXX"');
 const harness=[
   'curl() {',
   '  local out="" url=""; while [[ "$#" -gt 0 ]]; do if [[ "$1" == --output ]]; then out="$2"; shift 2; else url="$1"; shift; fi; done',
   '  if [[ "$TASK_CDN_SCENARIO" == all-unavailable || ( "$TASK_CDN_SCENARIO" == first-unavailable && "$url" == https://cdn.jsdelivr.net/* ) ]]; then return 28; fi',
   '  if [[ "$url" == */scripts/deploy-web-release-138.cjs ]]; then cat installer.cjs > "$out"; else cat release.json > "$out"; fi',
   '  if [[ "$TASK_CDN_SCENARIO" == all-corrupt || ( "$TASK_CDN_SCENARIO" == first-corrupt && "$url" == https://cdn.jsdelivr.net/* ) || ( "$TASK_CDN_SCENARIO" == payload-corrupt && "$url" == */release.json ) ]]; then printf corrupt >> "$out"; fi',
   '}',
   'node() {',
   '  [[ "$2" == --apply && "$3" == /www/turtlekeeper-app ]] || return 99',
   '  cmp "$1" installer.cjs && cmp "$4" release.json || return 98',
   '  printf checked > installer-invoked.txt',
   '  if [[ "$TASK_CDN_SCENARIO" == installer-failed ]]; then echo "Installer baseline guard stopped" >&2; return 7; fi',
   '}',
   'export -f curl node',local
 ].join('\n');
 const result=spawnSync(process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash',['--noprofile','--norc','-c',harness],{cwd:folder,env:{...process.env,TASK_CDN_SCENARIO:scenario},encoding:'utf8'});
 if(result.error)throw result.error;
 assert.equal(result.status,0,result.stderr);
 const invoked=['good','first-unavailable','first-corrupt','installer-failed'].includes(scenario);
 assert.equal(fs.existsSync(path.join(folder,'installer-invoked.txt')),invoked,result.stdout+'\n'+result.stderr);
 assert.equal(result.stdout.includes('Update stopped;'),!['good','first-unavailable','first-corrupt'].includes(scenario),result.stdout+'\n'+result.stderr);
}
console.log('PASS: exact noninteractive server command, pinned checksums, unavailable/corrupted CDN fallback, no install after bad bytes, and installer errors remain visible. No server or network writes.');
