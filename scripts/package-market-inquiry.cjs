'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {patchSource}=require('./deploy-market-inquiry.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'deploy/patches'),name='turtlekeeper-market-inquiry.tar.gz';
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'market-inquiry-server-patch.json'),'utf8'));
for(const [file,hunks] of Object.entries(manifest.patches)) {
 const source=fs.readFileSync(path.join(root,file),'utf8');
 if(patchSource(source,hunks)!==source)throw Error('Source differs from reviewed installed patch: '+file);
 new vm.Script(source);
}
if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/market-inquiry.js'))).digest('hex')!==manifest.moduleHash)throw Error('Module hash differs');
fs.mkdirSync(out,{recursive:true});
execFileSync('tar',['-czf',path.join(out,name),'-C',root,'scripts/market-inquiry-server-patch.json','scripts/deploy-market-inquiry.cjs','assets/market-inquiry.js'],{windowsHide:true});
fs.writeFileSync(path.join(out,name+'.sha256'),crypto.createHash('sha256').update(fs.readFileSync(path.join(out,name))).digest('hex')+'  '+name+'\n');
console.log('Prepared '+path.join(out,name));
