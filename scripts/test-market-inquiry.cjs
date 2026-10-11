'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto'), net=require('node:net');
const {spawn}=require('node:child_process');
const inquiry=require('../assets/market-inquiry'), {rankMarketListings,createMarketRankPager}=require('../server/market-ranking');
const root=path.resolve(__dirname,'..'), now=Date.now();
const item=(id,status='active')=>({id,status,title:'测试商品',speciesCode:'GHG',speciesName:'果核蛋龟',sellerPhoneRaw:'13900000333',stage:'juvenile',city:'南京市',delivery:'可快递',createdAt:new Date(now).toISOString(),refreshedAt:new Date(now).toISOString(),price:100,mediaItems:[],wantedPhones:[]});
const listings=[item('first-abc123'),item('second-abc123'),item('sold-abc123','sold'),item('off-abc123','inactive'),{...item('other-zzzzzz'),title:'KM-ABC123'}];
assert.equal(inquiry.code(listings[0]),'KM-ABC123');
assert.equal(inquiry.parse('  km-abc123  '),'KM-ABC123');
assert.equal(inquiry.parse('您好，我想咨询「'+ '长名称'.repeat(100) +'」，商品咨询码：km-abc123'),'KM-ABC123');
for(const bad of ['abc123','KM-ABC1234','KM-','标题 KM-ABC123','商品咨询码：KM-ABC123Z','商品咨询码：KM-ABC123 商品咨询码：KM-ABC123'])assert.equal(inquiry.parse(bad),'',bad);
assert.equal(inquiry.code({id:''}),'');
const filters={keyword:'km-abc123',stage:'adult',regionCities:['上海市'],delivery:'仅自提',freshOnly:true};
assert.deepEqual(rankMarketListings(listings,filters).map(x=>x.id).sort(),['first-abc123','second-abc123']);
assert.equal(rankMarketListings(listings,{keyword:'KM-999999'}).length,0);
const pager=createMarketRankPager();
const first=pager({listings,body:{...filters,limit:1},owner:'buyer'});
const second=pager({listings,body:{...filters,limit:1,offset:first.nextOffset,rankingSession:first.rankingSession},owner:'buyer'});
assert.equal(first.total,2);assert.equal(first.listings.length,1);assert.equal(second.listings.length,1);assert.notEqual(first.listings[0].id,second.listings[0].id);
(async()=>{
  const runtime=fs.mkdtempSync(path.join(root,'output/market-inquiry-api-'));
  fs.mkdirSync(path.join(runtime,'data'));
  const phone='13900000222',token='synthetic-consultation-test-token';
  const data={users:{[phone]:{phone,tokens:[{hash:crypto.createHash('sha256').update(token).digest('hex')}],data:{}},'13900000333':{phone:'13900000333',accountName:'虚构卖家',data:{}}},marketListings:listings};
  fs.writeFileSync(path.join(runtime,'data/app-data.json'),JSON.stringify(data));
  const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p));});});
  const child=spawn(process.execPath,[path.join(root,'server/server.js')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,TURTLE_RUNTIME_DIR:runtime,HOST:'127.0.0.1',PORT:String(port),MYSQL_HOST:'',MYSQL_URL:'',SMS_MOCK:'true',APNS_KEY_PATH:'',APNS_KEY_BASE64:''}});
  let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
  try {
    let ready=false;
    for(let i=0;i<80&&!ready;i++){try{ready=(await fetch('http://127.0.0.1:'+port+'/api/app/version',{signal:AbortSignal.timeout(500)})).ok;}catch{}if(!ready)await new Promise(r=>setTimeout(r,100));}
    assert.ok(ready,output);
    const post=async(body)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/market/list',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,token,...body}),signal:AbortSignal.timeout(3000)});assert.equal(r.status,200);return r.json();};
    for(const rankingVersion of [undefined,1]) {
      const result=await post({...filters,rankingVersion,keyword:'您好，商品咨询码：km-abc123',limit:8});
      assert.equal(result.total,2);assert.deepEqual(result.listings.map(x=>x.id).sort(),['first-abc123','second-abc123']);
      assert.ok(result.listings.every(x=>!('sellerPhoneRaw' in x)),'public results must not expose seller phone');
      const missing=await post({rankingVersion,keyword:'KM-999999'});
      assert.equal(missing.total,0);assert.equal(missing.listings.length,0);
    }
    const details=await fetch('http://127.0.0.1:'+port+'/api/market/detail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({listingId:'first-abc123'})});
    assert.equal(details.status,200);assert.equal((await details.json()).listing.id,'first-abc123');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(runtime,'data/app-data.json'),'utf8')).users,data.users,'read-only search leaves users unchanged');
    console.log('PASS consultation lookup: case/whitespace/full message, exact suffix, collisions/pagination, no title false positives, unavailable items hidden, real ranked/legacy HTTP search, detail, seller privacy and user data unchanged.');
  } finally {await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);child.kill();});}
})().catch(e=>{console.error(e);process.exitCode=1;});
