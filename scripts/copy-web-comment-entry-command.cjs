'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function buildCommand({commit,installerHash,payloadHash}){
 if(!/^[a-f0-9]{40}$/.test(commit)||![installerHash,payloadHash].every(value=>/^[a-f0-9]{64}$/.test(value)))throw Error('Invalid reviewed commit/checksum');
 return ["bash <<'WEB_COMMENT_ENTRY' || printf '%s\\n' 'Update stopped; please send the output.'",'set -euo pipefail','umask 077','cd /www/turtlekeeper-app',
   'fetched=0','for attempt in 1 2 3; do','  if git -c http.version=HTTP/1.1 -c gc.auto=0 -c maintenance.auto=false fetch origin main; then fetched=1; break; fi','  sleep 2','done',
   '[ "$fetched" -eq 1 ] || { echo "GitHub unavailable; nothing installed."; exit 1; }',
   `[ "$(git rev-parse origin/main)" = "${commit}" ] || { echo "GitHub main differs from the reviewed upload; stopped."; exit 1; }`,
   'entry_dir=$(mktemp -d "$HOME/turtle-web-comment-XXXXXXXX")',
   `git show ${commit}:scripts/deploy-web-comment-entry.cjs > "$entry_dir/install.cjs"`,
   `git show ${commit}:deploy/web-comment-entry/release.json > "$entry_dir/release.json"`,
   `printf '%s  %s\\n' '${installerHash}' "$entry_dir/install.cjs" | sha256sum -c -`,
   `printf '%s  %s\\n' '${payloadHash}' "$entry_dir/release.json" | sha256sum -c -`,
   'node "$entry_dir/install.cjs" --apply /www/turtlekeeper-app "$entry_dir/release.json"','WEB_COMMENT_ENTRY',''].join('\n');
}
module.exports={buildCommand};
if(require.main===module){
 const check=process.argv[2]==='--check';if(process.argv.length>3||(process.argv[2]&&!check))throw Error('Use --check or no argument');
 const git=args=>execFileSync('git',args,{cwd:root,maxBuffer:8e6});
 const commit=git(['rev-parse','HEAD']).toString().trim();
 const read=file=>check?fs.readFileSync(path.join(root,file)):git(['show',commit+':'+file]);
 const command=buildCommand({commit,installerHash:hash(read('scripts/deploy-web-comment-entry.cjs')),payloadHash:hash(read('deploy/web-comment-entry/release.json'))});
 fs.mkdirSync(path.join(root,'output'),{recursive:true});const file=path.join(root,check?'output/update-web-comment-entry-preview.sh':'output/update-web-comment-entry.sh');fs.writeFileSync(file,(check?'# CHECK-ONLY preview; publish with upload-web-comment-entry.sh before use.\n':'')+command);
 if(check)console.log('Check-only server command: '+Buffer.byteLength(command)+' bytes; not copied or executed.');
 else{
   const result=spawnSync('clip.exe',[],{input:command,windowsHide:true});
   if(!result.error&&result.status===0)console.log('Server command copied. Open Aliyun Shell (not Agent), paste once, then press Enter.');
   else console.log(command);
   console.log('Saved command: '+file);
 }
}
