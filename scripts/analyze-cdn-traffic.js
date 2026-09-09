/* Usage: node scripts/analyze-cdn-traffic.js file1.gz file2.gz > report.json
 * Logs are input data only. IP addresses are aggregated in memory and never emitted.
 */
const fs=require('node:fs'),zlib=require('node:zlib');
const files=process.argv.slice(2);if(!files.length)throw Error('Pass one or more CDN .gz log files');
let records=[],bad=0;
for(const file of files)for(const line of zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').trim().split('\n')){
 const m=line.match(/^\[([^\]]+)\] (\S+) (\S+) (\d+) "([^"]*)" "(\S+) ([^"]+)" (\d+) (\d+) (\d+) (\S+) "([^"]*)" "([^"]*)"/);
 if(!m){bad++;continue;}records.push({ip:m[2],url:m[7],status:m[8],bytes:Number(m[10]),hit:m[11],type:m[13]});
}
const group=key=>{const map=new Map();for(const row of records){const k=key(row);const item=map.get(k)||{key:k,requests:0,bytes:0};item.requests++;item.bytes+=row.bytes;map.set(k,item);}return [...map.values()].sort((a,b)=>b.bytes-a.bytes)};
const bytes=records.reduce((sum,x)=>sum+x.bytes,0);
console.log(JSON.stringify({requests:records.length,bad,bytes,GB:bytes/1e9,GiB:bytes/1024**3,uniqueClients:new Set(records.map(x=>x.ip)).size,byType:group(x=>x.type),byHit:group(x=>x.hit),byStatus:group(x=>x.status),topFiles:group(x=>new URL(x.url).pathname).slice(0,20),topClientShares:group(x=>x.ip).slice(0,10).map((x,i)=>({client:i+1,requests:x.requests,bytes:x.bytes,share:bytes?x.bytes/bytes:0}))},null,2));
