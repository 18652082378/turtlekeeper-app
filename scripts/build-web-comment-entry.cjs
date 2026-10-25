'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'deploy/web-comment-entry');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceNames=['app.js','assets/community-mobile-ui.js','assets/community-mobile-ui.css','assets/turtle-emotes.js','assets/turtle-emote-picker.js','assets/turtle-emotes.css','assets/comment-smile-entry.svg',...require('../assets/turtle-emotes.js').entries.map(item=>item.src.slice(2))];
function build(){
 const baseline=JSON.parse(fs.readFileSync(path.join(folder,'reviewed-baseline.json'),'utf8'));
 const beforeIndex=Buffer.from(baseline.indexBase64,'base64').toString('utf8');
 if(hash(beforeIndex)!==baseline.hashes['index.html'])throw Error('Reviewed HTML checksum mismatch');
 const source=sourceNames.map(file=>({source:file,name:file.replace(/^assets\//,''),bytes:fs.readFileSync(path.join(root,file))}));
 const fingerprint=hash(hash(fs.readFileSync(__filename))+JSON.stringify(baseline)+source.map(item=>item.source+hash(item.bytes)).join('\n')).slice(0,12);
 const revision='web-comment-entry-20261025-'+fingerprint,prefix='/assets/'+revision;
 const files=source.map(item=>{
   let bytes=item.bytes;
   if(item.name==='turtle-emotes.js'){
     const code=bytes.toString('utf8'),old='src: `./assets/emotes/${id}.svg`';
     if(code.split(old).length!==2)throw Error('Emote URL template changed; review the builder');
     bytes=Buffer.from(code.replace(old,'src: `'+prefix+'/emotes/${id}.svg`'));
   }
   if(item.name.endsWith('.js'))new vm.Script(bytes.toString(),{filename:item.name});
   return {name:item.name,sha256:hash(bytes),base64:bytes.toString('base64')};
 });
 let index=beforeIndex;
 for(const name of ['app.js','assets/community-mobile-ui.css','assets/community-mobile-ui.js']){
   const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const regex=new RegExp('(["\'])\\./'+escaped+'\\?[^"\']*(["\'])','g');
   const matches=[...index.matchAll(regex)];if(matches.length!==1)throw Error('Unexpected HTML reference: '+name);
   index=index.replace(regex,'$1'+prefix+'/'+name.replace(/^assets\//,'')+'$2');
 }
 const appTag=`    <script src="${prefix}/app.js"></script>`;
 if(index.split(appTag).length!==2)throw Error('Cannot locate the revised app entry');
 index=index.replace(appTag,`    <!-- ${revision} -->\n    <script src="${prefix}/turtle-emotes.js"></script>\n    <link rel="stylesheet" href="${prefix}/turtle-emotes.css" />\n${appTag}`);
 const endTag=`    <script src="${prefix}/community-mobile-ui.js"></script>`;
 index=index.replace(endTag,endTag+`\n    <script src="${prefix}/turtle-emote-picker.js"></script>`);
 const pkg={format:'turtle-web-comment-entry-v1',revision,baseline:baseline.hashes,index:{base64:Buffer.from(index).toString('base64'),sha256:hash(index)},files};
 fs.writeFileSync(path.join(folder,'release.json'),JSON.stringify(pkg)+'\n');
 return pkg;
}
module.exports={build,sourceNames};
if(require.main===module){const pkg=build();console.log(`Prepared ${pkg.revision}: ${pkg.files.length} versioned assets and website index only.`);}
