'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function buildCommand({ref,installerHash,payloadHash}){
 if(!/^(?:main|[a-f0-9]{40})$/.test(ref)||![installerHash,payloadHash].every(v=>/^[a-f0-9]{64}$/.test(v)))throw Error('Invalid release reference or checksum');
 return ["bash <<'WEB_RELEASE_138' || printf '%s\\n' 'Update stopped; please send the output.'",'set -euo pipefail','umask 077','cd /www/turtlekeeper-app','command -v curl node sha256sum >/dev/null',
 'release_dir=$(mktemp -d "$HOME/turtle-web-138-XXXXXXXX")','get_file() {','  for base in \\',
 `    'https://cdn.jsdelivr.net/gh/18652082378/turtlekeeper-app@${ref}' \\`,
 `    'https://fastly.jsdelivr.net/gh/18652082378/turtlekeeper-app@${ref}' \\`,
 `    'https://raw.githubusercontent.com/18652082378/turtlekeeper-app/${ref}'; do`,
 '    printf "Downloading %s\\n" "$1"',
 '    if curl --fail --location --silent --show-error --connect-timeout 6 --max-time 45 --output "$3" "$base/$1" &&',
 '       printf \'%s  %s\\n\' "$2" "$3" | sha256sum -c -; then return 0; fi','  done','  echo "Download/checksum failed; nothing installed." >&2; return 1','}',
 `get_file scripts/deploy-web-release-138.cjs '${installerHash}' "$release_dir/install.cjs"`,
 `get_file deploy/web-release-138/release.json '${payloadHash}' "$release_dir/release.json"`,
 'node "$release_dir/install.cjs" --apply /www/turtlekeeper-app "$release_dir/release.json"','WEB_RELEASE_138',''].join('\n');
}
module.exports={buildCommand};
if(require.main===module){
 try{
   const check=process.argv[2]==='--check';if(process.argv.length>3||(process.argv[2]&&!check))throw Error('Use --check or no argument');
   const git=args=>execFileSync('git',args,{cwd:root,maxBuffer:12e6});const ref=check?'main':git(['rev-parse','HEAD']).toString().trim();
   const read=name=>check?fs.readFileSync(path.join(root,name)):git(['show',ref+':'+name]);
   const command=buildCommand({ref,installerHash:hash(read('scripts/deploy-web-release-138.cjs')),payloadHash:hash(read('deploy/web-release-138/release.json'))});
   fs.mkdirSync(path.join(root,'output'),{recursive:true});const file=path.join(root,'output/update-server-138'+(check?'-preview':'')+'.sh');fs.writeFileSync(file,command);
   if(check)console.log('CHECK ONLY: content-pinned main command prepared; run only AFTER uploading 138. '+file);
   else{const result=spawnSync('clip.exe',[],{input:command,windowsHide:true});if(!result.error&&result.status===0)console.log('Server command copied: paste into the logged-in Aliyun Shell. No IP/password prompt.');else console.log(command);console.log('Saved command: '+file);}
 }catch(error){console.error(error.message);process.exitCode=1;}
}
