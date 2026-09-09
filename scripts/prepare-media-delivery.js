/* Generate immutable media derivatives without changing account/database records.
 * Dry-run by default. --apply requires ffmpeg and the same server/.env as the API.
 */
const fs=require('node:fs'),path=require('node:path');
const {createMediaVariantService}=require('../server/media-variants');
const root=path.resolve(__dirname,'..');
const env=path.join(root,'server/.env');
if(fs.existsSync(env))for(const line of fs.readFileSync(env,'utf8').split(/\r?\n/)){
 const m=line.trim().match(/^([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*)$/);if(!m||process.env[m[1]]!==undefined)continue;
 let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[m[1]]=v;
}
const uploadRoot=path.resolve(process.env.TURTLE_RUNTIME_DIR||path.join(root,'server'),'uploads');
const apply=process.argv.includes('--apply');
const arg=name=>{const i=process.argv.indexOf(name);return i<0?'':process.argv[i+1]||''};
const limit=Number(arg('--limit')||20);
if(!Number.isInteger(limit)||limit<1||limit>5000)throw Error('--limit must be between 1 and 5000');
function files(dir){
 if(!fs.existsSync(dir))return [];
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.isFile()?[path.join(dir,e.name)]:[]);
}
async function main(){
 let sources;
 if(arg('--paths')) {
  sources=fs.readFileSync(arg('--paths'),'utf8').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(value=>{
   const p=decodeURIComponent(new URL(value,'http://local').pathname);
   if(!/^\/uploads\/\d{4}\/\d{2}\/[^/\\]+\.(jpg|jpeg|png|webp|mp4|mov|m4v|webm)$/i.test(p))throw Error('Invalid upload path');
   const full=path.resolve(uploadRoot,p.slice(9));if(!full.startsWith(uploadRoot+path.sep))throw Error('Invalid upload path');return full;
  });
 } else sources=files(uploadRoot).filter(f=>/\.(jpg|jpeg|png|webp|mp4|mov|m4v|webm)$/i.test(f)&&!/^((delivery|poster|thumb600)-)/.test(path.basename(f))).sort((a,b)=>fs.statSync(b).size-fs.statSync(a).size);
 sources=[...new Set(sources)].slice(0,limit);
 let client;
 const ossFields=['OSS_REGION','OSS_BUCKET','OSS_ACCESS_KEY_ID','OSS_ACCESS_KEY_SECRET','OSS_PUBLIC_BASE_URL'];
 if(apply&&ossFields.some(k=>process.env[k])&&!ossFields.every(k=>process.env[k]))throw Error('Incomplete OSS configuration; no derivatives generated');
 if(apply&&ossFields.every(k=>process.env[k])){const OSS=require('ali-oss');client=new OSS({region:process.env.OSS_REGION,bucket:process.env.OSS_BUCKET,accessKeyId:process.env.OSS_ACCESS_KEY_ID,accessKeySecret:process.env.OSS_ACCESS_KEY_SECRET,authorizationV4:true,internal:process.env.OSS_INTERNAL!=='false',timeout:'10m',retryMax:3});}
 const service=createMediaVariantService({uploadRoot,publish:async(file,year,month,name,mime)=>{
  const key=`uploads/${year}/${month}/${name}`;
  if(!client)return '/'+key;
  await client.put(key,file,{headers:{'Content-Type':mime,'Content-Disposition':'inline','Cache-Control':'public, max-age=31536000, immutable'}});
  return process.env.OSS_PUBLIC_BASE_URL.replace(/\/+$/,'')+'/'+key;
 }});
 console.log(apply?'Generating derivatives; originals and database remain unchanged.':'Dry run; no files, cloud resources or database records will be changed.');
 let completed=0,failed=0;
 for(const file of sources){
  const url='/uploads/'+path.relative(uploadRoot,file).split(path.sep).join('/');
  if(!fs.existsSync(file)){console.log('Missing local original:',url);failed++;continue;}
  if(service.get(url)){console.log('Already ready:',url);continue;}
  console.log(url,fs.statSync(file).size,'bytes');
  if(apply){const result=await service.ensure(url);if(result)completed++;else failed++;}
 }
 console.log(JSON.stringify({selected:sources.length,completed,failed,apply}));if(apply&&failed)process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
