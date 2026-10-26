'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
function serverCommand(){
  const source=fs.readFileSync(path.join(__dirname,'diagnose-ios-119-policy.cjs'),'utf8').replace('if(require.main===module)main()', 'main()');
  return "node <<'DIAGNOSE_IOS119'\n"+source+"\nDIAGNOSE_IOS119\n";
}
module.exports={serverCommand};
if(require.main===module){
  const command=serverCommand(),file=path.resolve(__dirname,'../output/diagnose-ios-119-policy.sh');
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,command);
  if(process.argv[2]==='--print')process.stdout.write(command);
  else{execFileSync('clip.exe',{input:command,windowsHide:true});console.log('Read-only diagnostic command copied. Paste into the logged-in server Shell. No source writes or restarts.');console.log('Saved: '+file);}
}
