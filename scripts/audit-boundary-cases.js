// Independent synthetic cases. No browser storage, account or network access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const batches = require('../assets/turtle-batches');
const accounting = require('../assets/loss-accounting');
const codec = require('../assets/local-data-codec');
const { merge } = require('../assets/account-merge');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const cases = [];
const add = (name, run) => cases.push({ name, run });
function purchaseContext() {
  const ctx = { crypto, TurtleBatches: batches, TurtleLossAccounting: accounting,
    FormData: class { constructor(fields) { this.fields = fields; } get(key) { return this.fields[key] ?? null; } },
    state: { turtles: [], ledgerRecords: [], turtlePools: [{id:'pool',count:0,countMode:'additional'}], memos: [], keptSpecies: [], activityLogs: [], formPhoto:'shared-photo' },
    requireArchiveCapacity: () => true, speciesPhoto: () => 'shared-photo', formatDate: () => '2026-09-12',
    money: value => Number(value).toFixed(2), makeActivity: text => ({text}),
    activateCareReminder() {}, window: {setTimeout() {}},
    toast: text => { ctx.message = text; },
    saveWithDeferredImages: patch => { Object.assign(ctx.state, patch); ctx.saves++; return true; }, saves: 0
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function submitBatchTurtles('), source.indexOf('function appReviewStorageKey(')),ctx);
  ctx.buy = fields => ctx.submitBatchTurtles(new ctx.FormData({batchStage:'hatchling',batchCount:'3',batchTotalPrice:'100.01',poolId:'pool',acquiredDate:'2026-09-10',...fields}),{code:'GHG',name:'果核蛋龟'});
  return ctx;
}
for (const count of [1,2,3,7,10,99,100,499,500,850,1000,10000]) add(`批量购入 ${count} 只：数量、金额、单条展示和龟池一致`,()=>{
  const ctx=purchaseContext();ctx.buy({batchCount:String(count)});
  assert.equal(ctx.saves,1,ctx.message);assert.equal(ctx.state.turtles.length,count);
  assert.equal(batches.group(ctx.state.turtles).length,1);
  assert.equal(batches.poolCount(ctx.state.turtlePools[0],ctx.state.turtles),count);
  assert.equal(ctx.state.turtles.reduce((s,t)=>s+Math.round(t.price*100),0),10001);
  assert.equal(ctx.state.ledgerRecords.length,1);
  assert.equal(new Set(ctx.state.turtles.map(t=>t.code)).size,count);
  assert.equal(new Set(ctx.state.turtles.map(t=>t.photo)).size,1);
});
for (const [name,fields] of [
  ['零数量',{batchCount:'0'}],['负数量',{batchCount:'-1'}],['小数数量',{batchCount:'1.5'}],
  ['非数字数量',{batchCount:'abc'}],['无穷数量',{batchCount:'Infinity'}],['超过单批上限',{batchCount:'10001'}],
  ['负金额',{batchTotalPrice:'-1'}],['超过两位小数金额',{batchTotalPrice:'1.001'}],
  ['无穷金额',{batchTotalPrice:'Infinity'}],['未知生长阶段',{batchStage:'invalid'}]
]) add(`批量表单拒绝${name}且不保存`,()=>{const ctx=purchaseContext();ctx.buy(fields);assert.equal(ctx.saves,0);assert.ok(ctx.message);assert.equal(ctx.state.turtles.length,0);});
const shared='data:image/png;base64,'+'A'.repeat(4096);
for (const [name,value] of [
  ['空账户',{turtles:[],ledgerRecords:[]}], ['中文与表情',{note:'果核🐢\n孵化记录',photo:shared,backup:shared}],
  ['共享图片',{turtles:Array.from({length:500},(_,i)=>({id:String(i),photo:shared}))}],
  ['旧版普通JSON',{turtles:[{id:'legacy',price:450,status:'已死亡'}]}],
  ['特殊键名',JSON.parse('{"__proto__":null,"constructor":"safe","prototype":false}')]
]) add(`备份往返保留${name}`,()=>{assert.deepEqual(codec.parse(codec.stringify(value)),value);assert.equal({}.polluted,undefined);});
add('备份读取接受 UTF-8 BOM',()=>assert.deepEqual(codec.parse('\uFEFF'+codec.stringify({photo:shared,copy:shared})),{photo:shared,copy:shared}));
for (const [name,patch] of [
  ['越界字符串索引',{textRefs:[[['photo'],99]]}],['不存在的目标字段',{textRefs:[[['missing'],0]]}],
  ['覆盖已有数据',{data:{photo:'existing'}}],['原型路径',{textRefs:[[['__proto__','polluted'],0]]}]
]) add(`备份拒绝${name}`,()=>{assert.throws(()=>codec.parse(JSON.stringify({format:'turtlekeeper-local-text-v1',strings:[shared],textRefs:[[['photo'],0]],data:{photo:null},...patch})));assert.equal({}.polluted,undefined);});
const base={accountName:'test',accountAvatar:'',data:{turtles:[{id:'a',code:'A',price:100,status:'正常饲养'},{id:'b',code:'B',price:100,status:'正常饲养'}],ledgerRecords:[],memos:[],turtlePools:[],breedingRecords:[],activityLogs:[],keptSpecies:[]}};
for (const field of ['weight','carapaceLength','note','gender','price']) add(`双端修改不同档案的 ${field} 不丢失`,()=>{
  const a=clone(base),b=clone(base);a.data.turtles[0][field]=field==='note'?'本地':12;b.data.turtles[1][field]=field==='note'?'手机':18;
  const result=merge(base,a,b);assert.equal(result.ready,true);
  assert.equal(result.snapshot.data.turtles.find(t=>t.id==='a')[field],a.data.turtles[0][field]);
  assert.equal(result.snapshot.data.turtles.find(t=>t.id==='b')[field],b.data.turtles[1][field]);
});
for (const field of ['weight','carapaceLength','note','gender','price']) add(`双端冲突 ${field} 不静默覆盖`,()=>{
  const a=clone(base),b=clone(base);a.data.turtles[0][field]=field==='note'?'本地':12;b.data.turtles[0][field]=field==='note'?'手机':18;
  assert.equal(merge(base,a,b).ready,false);
});
add('旧龟池手填数量不与关联档案重复相加',()=>{assert.equal(batches.poolCount({id:'p',count:5},[{poolId:'p',status:'正常饲养'}]),1);assert.equal(batches.poolCountNeedsReview({count:5}),true);});
add('龟池只统计在养而非已损耗或售出',()=>assert.equal(batches.poolCount({id:'p',count:2,countMode:'additional'},['正常饲养','已死亡','已转让'].map(status=>({poolId:'p',status}))),3));
add('同窝同日不同孵化事件分别显示',()=>assert.equal(batches.group(batches.normalizeHatchBatches([{id:'a',sourceBreedingId:'nest',hatchEventId:'one'},{id:'b',sourceBreedingId:'nest',hatchEventId:'two'}])).length,2));
add('同次孵化多只只显示一个批次',()=>assert.equal(batches.group(batches.normalizeHatchBatches(Array.from({length:5},(_,i)=>({id:String(i),sourceBreedingId:'nest',hatchEventId:'one'})))).length,1));
add('不同操作的售出与损耗不可误合并',()=>{const rows=batches.groupLedgerRecords([{type:'sold',batchId:'b',batchMovementId:'one',amount:1},{type:'sold',batchId:'b',batchMovementId:'two',amount:2},{type:'loss',batchId:'b',batchMovementId:'one',amount:3}]);assert.equal(rows.length,3);});
assert.equal(cases.length,47);
module.exports=cases;
