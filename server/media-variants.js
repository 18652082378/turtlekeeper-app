/* Immutable media derivatives. Originals and legacy API URLs are never replaced. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

function createMediaVariantService({ uploadRoot, publish, binary = process.env.FFMPEG_PATH || 'ffmpeg' }) {
  const root = path.resolve(uploadRoot);
  const pending = new Map(), failures = new Map(), ready = new Map();
  let tail = Promise.resolve();
  function sourceFor(value) {
    try {
      const pathname = decodeURIComponent(new URL(String(value), 'http://local').pathname);
      if (!/^\/uploads\/\d{4}\/\d{2}\/[^/\\]+\.(jpg|jpeg|png|webp|mp4|mov|m4v|webm)$/i.test(pathname)) return null;
      const source = path.resolve(root, pathname.slice(9));
      if (!source.startsWith(root + path.sep) || !fs.existsSync(source)) return null;
      const real = fs.realpathSync(source);
      if (!real.startsWith(fs.realpathSync(root) + path.sep)) return null;
      const stat = fs.statSync(source);
      const hash = crypto.createHash('sha256').update(`delivery-v1:${pathname}:${stat.size}:${stat.mtimeMs}`).digest('hex').slice(0,24);
      return {source,stat,hash,manifest:path.join(path.dirname(source),`delivery-${hash}.json`),video:/\.(mp4|mov|m4v|webm)$/i.test(source),year:pathname.split('/')[2],month:pathname.split('/')[3]};
    } catch { return null; }
  }
  function get(value) {
    const info = sourceFor(value);
    if (!info) return null;
    if (ready.has(info.hash)) return ready.get(info.hash);
    try {
      const record = JSON.parse(fs.readFileSync(info.manifest,'utf8'));
      if (record.hash === info.hash) { remember(info.hash,record.variants); return record.variants; }
    } catch {}
    return null;
  }
  function remember(hash, variants) {
    if (ready.size >= 2000) ready.delete(ready.keys().next().value);
    ready.set(hash, variants);
  }
  function run(args) {
    return new Promise((resolve,reject)=>execFile(binary,['-nostdin','-loglevel','error','-y','-protocol_whitelist','file,pipe',...args],{windowsHide:true,timeout:180000,maxBuffer:65536},error=>error?reject(error):resolve()));
  }
  function ensure(value) {
    const info = sourceFor(value);
    if (!info) return Promise.resolve(null);
    const existing = get(value);
    if (existing) return Promise.resolve(existing);
    if (pending.has(info.hash)) return pending.get(info.hash);
    if (pending.size >= 64 || Date.now()-(failures.get(info.hash)||0)<300000) return Promise.resolve(null);
    const task = tail.then(async()=>{
      const variants = {};
      const output = async (kind, ext, args, mime) => {
        const filename=`delivery-${info.hash}-${kind}.${ext}`;
        const target=path.join(path.dirname(info.source),filename),tmp=target+`.tmp.${ext}`;
        try {
          if (!fs.existsSync(target)) {
            await run(['-threads','1','-i',info.source,...args,'-threads','1',tmp]);
            if (!fs.statSync(tmp).size) throw Error('Empty media derivative');
            fs.renameSync(tmp,target);
          }
          // Re-encoding a small clip must not increase its delivery size.
          if (kind==='video' && fs.statSync(target).size >= info.stat.size && /\.mp4$/i.test(info.source)) return '';
          return await publish(target,info.year,info.month,filename,mime);
        } finally { fs.rmSync(tmp,{force:true}); }
      };
      const imageArgs = size => ['-frames:v','1','-vf',`scale=w='min(iw,${size})':h='min(ih,${size})':force_original_aspect_ratio=decrease`,'-q:v','6'];
      variants.thumbnailUrl=await output('thumb','jpg',imageArgs(600),'image/jpeg');
      if (info.video) {
        variants.posterUrl=variants.thumbnailUrl;
        const scale="scale=w='min(iw,if(gte(iw,ih),1280,720))':h='min(ih,if(gte(iw,ih),720,1280))':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30";
        variants.playbackUrl=await output('video','mp4',['-map','0:v:0','-map','0:a?','-c:v','libx264','-preset','fast','-b:v','1200k','-maxrate','1500k','-bufsize','3000k','-pix_fmt','yuv420p','-vf',scale,'-c:a','aac','-b:a','64k','-ac','2','-movflags','+faststart'],'video/mp4');
      } else variants.displayUrl=await output('detail','jpg',imageArgs(1200),'image/jpeg');
      const temp=info.manifest+'.tmp';
      fs.writeFileSync(temp,JSON.stringify({hash:info.hash,variants}));
      fs.renameSync(temp,info.manifest);
      remember(info.hash,variants);
      return variants;
    }).catch(error=>{
      if(failures.size>=2000)failures.delete(failures.keys().next().value);
      failures.set(info.hash,Date.now());
      console.warn('Media derivative unavailable:',error.code||error.message);
      return null;
    }).finally(()=>pending.delete(info.hash));
    pending.set(info.hash,task);tail=task.then(()=>{});
    return task;
  }
  return {get,ensure};
}
module.exports={createMediaVariantService};
