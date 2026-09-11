const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const accounting = require('../assets/loss-accounting');
const source = fs.readFileSync('app.js', 'utf8');
const turtle = { id:'a', code:'小龟', speciesName:'果核蛋龟', speciesCode:'GHG', price:300, status:'正常饲养', health:'健康', pinned:true, weight:10, carapaceLength:3, photo:'archive-photo.jpg' };
const purchase = { id:'p', type:'purchase', turtleId:'a', amount:300, turtleSnapshot:{...turtle} };
const loss = { id:'l', type:'loss', turtleId:'a', amount:1, recordDate:'2026-09-10', turtleSnapshot:{...turtle} };
const profit = records => records.reduce((sum,r)=>sum+(r.type==='sold'?1:-1)*Math.round(Number(r.amount)*100),0)/100;
let data = { turtles:[],ledgerRecords:[loss,purchase],memos:[{id:'memo',turtleId:'a',reminderEnabled:true}] };
const original=JSON.stringify(data);
let result=accounting.reconcile(data);
assert.equal(JSON.stringify(data),original,'Migration does not mutate the input');
assert.equal(result.ledgerRecords.filter(r=>r.type==='purchase').length,0);
assert.equal(result.ledgerRecords[0].amount,300);
assert.equal(result.ledgerRecords[0].photo,'archive-photo.jpg');
assert.equal(result.ledgerRecords[0].originalLossAmount,1);
assert.equal(profit(result.ledgerRecords),-300);
assert.equal(result.turtles[0].status,'已死亡');
assert.equal(result.turtles[0].pinned,false);
assert.equal(result.memos[0].reminderEnabled,false);
assert.deepEqual(accounting.reconcile(result),result,'Repeated sync/load must be idempotent');
const restored=accounting.undoLoss(result,result.ledgerRecords[0]);
assert.equal(restored.ledgerRecords[0].amount,300);
assert.equal(restored.ledgerRecords[0].type,'purchase');
assert.equal(restored.turtles[0].status,'正常饲养');
assert.equal(restored.memos[0].reminderEnabled,true);
// Preserve a deliberately deleted loss archive on subsequent normalizations.
assert.equal(accounting.reconcile({...result,turtles:[]}).turtles.length,0);
// Repeated historical loss records do not recognize the same cost twice.
const duplicates=accounting.reconcile({turtles:[],ledgerRecords:[{...loss,id:'l2'},loss,purchase]});
assert.equal(profit(duplicates.ledgerRecords),-300);
assert.equal(duplicates.ledgerRecords.find(r=>r.id==='l2').duplicateLossOf,'l');
assert.equal(accounting.undoLoss(duplicates,duplicates.ledgerRecords.find(r=>r.id==='l')).ledgerRecords.length,1);
// Batch cost conservation, including the final rounding cent, and reverse order undo.
const batchTurtles=['a','b','c'].map(id=>({...turtle,id,price:33.33,pinned:false}));
data={turtles:batchTurtles,ledgerRecords:[{...purchase,amount:100,batchPurchase:true,turtleIds:['a','b','c']}],memos:[]};
for(const [index,t] of batchTurtles.entries()) {
 const record={...loss,id:`loss-${t.id}`,turtleId:t.id,turtleSnapshot:{...t}};
 data=accounting.transferLoss({...data,ledgerRecords:[record,...data.ledgerRecords]},record,t);
 assert.equal(profit(data.ledgerRecords),-100);
 assert.equal(data.ledgerRecords.find(r=>r.id===record.id).amount,index===2?33.34:33.33);
}
assert.equal(data.ledgerRecords.filter(r=>r.type==='purchase').length,0);
for(const id of ['loss-a','loss-c','loss-b']) data=accounting.undoLoss(data,data.ledgerRecords.find(r=>r.id===id));
assert.equal(data.ledgerRecords.length,1);
assert.equal(data.ledgerRecords[0].amount,100);
assert.equal(data.ledgerRecords[0].turtleIds.length,3);
// Unlinked amounts cannot be inferred as a turtle's cost.
const unlinked={turtles:[],ledgerRecords:[{id:'free',type:'loss',amount:25}]};
assert.equal(accounting.reconcile(unlinked).ledgerRecords[0].amount,25);
// Exercise the actual save handler: ignore tampered cost, separate extra fees,
// preserve archive, prevent duplicate submissions and sales of lost turtles.
let saved, message;
const ctx={TurtleLossAccounting:accounting,TurtleBatches:require('../assets/turtle-batches'),crypto,
 FormData:class{constructor(values){this.values=values;}get(key){return this.values[key]??null;}},
 requireLogin:()=>true,turtlePoolName:()=>'',turtleLabel:t=>t.code,ledgerTypeText:type=>type,money:n=>Number(n).toFixed(2),
 logActivity:text=>[text],saveWithDeferredImages:patch=>{saved=patch;Object.assign(ctx.state,patch);},toast:text=>message=text,
 state:{turtles:[{...turtle}],ledgerRecords:[purchase],memos:[],turtlePools:[],keptSpecies:['GHG'],ledgerDraftType:'loss'}};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function submitLedgerRecord('),source.indexOf('function deleteLedgerRecord(')),ctx);
const event={preventDefault(){},currentTarget:{turtleId:'a',amount:'999',lossOtherExpense:'20',recordDate:'2026-09-10'}};
ctx.submitLedgerRecord(event);
assert.equal(saved.turtles[0].status,'已死亡');
assert.equal(saved.ledgerRecords.find(r=>r.type==='loss').amount,300);
assert.equal(saved.ledgerRecords.find(r=>r.type==='loss').photo,'archive-photo.jpg');
assert.equal(saved.ledgerRecords.find(r=>r.type==='other').amount,20);
assert.equal(profit(saved.ledgerRecords),-320);
saved=undefined;ctx.submitLedgerRecord(event);assert.equal(saved,undefined);
ctx.state.ledgerDraftType='loss';ctx.submitLedgerRecord({...event,currentTarget:{...event.currentTarget,__ledgerSaved:false}});
assert.match(message,/已经记录损耗/);
// Loss status dominates pinning and every sort option.
ctx.turtleTotalCost=t=>Number(t.price);ctx.state.turtleFilter='all';ctx.state.turtlePoolFilter='all';
ctx.state.turtles=[{...turtle,id:'lost',status:'已死亡',pinned:true,price:999}, {...turtle,id:'alive',pinned:false,price:1}];
vm.runInContext(source.slice(source.indexOf('function sortedTurtles()'),source.indexOf('function archiveDashboardSection()')),ctx);
for(const sort of ['default','latest','weight','shellLength','valueAsc','valueDesc']) {ctx.state.turtleSort=sort;assert.equal(ctx.sortedTurtles().at(-1).id,'lost');}
ctx.defaultPhoto='default.jpg';
vm.runInContext(source.slice(source.indexOf('function ledgerRecordPhoto('),source.indexOf('function ledgerRow(')),ctx);
ctx.state.turtles=[{id:'a',photo:'current.jpg'}];
assert.equal(ctx.ledgerRecordPhoto({...loss,photo:'old.jpg'}),'current.jpg');
ctx.state.turtles=[];
assert.equal(ctx.ledgerRecordPhoto({...loss,photo:''}),'archive-photo.jpg');
assert.equal(ctx.ledgerRecordPhoto({type:'loss',turtleId:'a'}),'default.jpg');
assert.equal(ctx.ledgerRecordPhoto({type:'loss',photo:'unlinked.jpg'}),'unlinked.jpg');
assert.equal(ctx.ledgerRecordPhoto({type:'other',turtleId:'a',photo:'receipt.jpg'}),'receipt.jpg');
console.log('Loss accounting and archive photo checks passed.');
