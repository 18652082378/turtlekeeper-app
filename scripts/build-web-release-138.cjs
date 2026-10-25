'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'deploy/web-release-138');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sourceNames=['app.js',...['community-mobile-ui.js','community-mobile-ui.css','turtle-emotes.js','turtle-emote-picker.js','turtle-emotes.css','comment-smile-entry.svg','module-workspaces.css','discovery-workspace.js','discovery-workspace.css','community-page-polish.js','community-page-polish.css','release-notes.js'].map(n=>'assets/'+n),...require('../assets/turtle-emotes.js').entries.map(item=>item.src.slice(2))];
function build(){
 const baseline=JSON.parse(fs.readFileSync(path.join(folder,'reviewed-baseline.json'),'utf8'));
 if(hash(Buffer.from(baseline.indexBase64,'base64'))!==baseline.hashes['index.html'])throw Error('Reviewed public index checksum mismatch');
 const originalIndex=fs.readFileSync(path.join(root,'index.html'),'utf8'),source=sourceNames.map(name=>({source:name,name:name.replace(/^assets\//,''),bytes:fs.readFileSync(path.join(root,name))}));
 const revision='web-release-138-'+hash(hash(fs.readFileSync(__filename))+JSON.stringify(baseline)+originalIndex+source.map(f=>f.source+hash(f.bytes)).join('\n')).slice(0,12),prefix='/assets/'+revision;
 const files=source.map(item=>{
   let bytes=item.bytes;
   if(item.name==='turtle-emotes.js'){
     const code=bytes.toString('utf8'),anchor='src: `./assets/emotes/${id}.svg`';if(code.split(anchor).length!==2)throw Error('Emote URL template changed');
     bytes=Buffer.from(code.replace(anchor,'src: `'+prefix+'/emotes/${id}.svg`'));
   }
   if(item.name.endsWith('.js'))new vm.Script(bytes.toString('utf8'),{filename:item.name});
   return {name:item.name,sha256:hash(bytes),base64:bytes.toString('base64')};
 });
 let index=originalIndex;
 for(const item of source.filter(item=>/\.(js|css)$/.test(item.name))){
   const escaped=item.source.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern=new RegExp('(["\'])\\./'+escaped+'(?:\\?[^"\']*)?(["\'])','g');
   if([...index.matchAll(pattern)].length!==1)throw Error('Expected exactly one HTML entry: '+item.source);
   index=index.replace(pattern,'$1'+prefix+'/'+item.name+'$2');
 }
 index=index.replace('</head>','<!-- '+revision+' -->\n  </head>');
 const pkg={format:'turtle-web-release-138-v1',revision,baseline:baseline.hashes,index:{base64:Buffer.from(index).toString('base64'),sha256:hash(index)},files};
 fs.writeFileSync(path.join(folder,'release.json'),JSON.stringify(pkg)+'\n');return pkg;
}
module.exports={build,sourceNames};
if(require.main===module){const pkg=build();console.log('Prepared '+pkg.revision+': '+pkg.files.length+' versioned website assets and atomic index update.');}
