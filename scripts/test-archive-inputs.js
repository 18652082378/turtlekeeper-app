const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
let saved, message;
const species = { code: 'GHG', name: '果核蛋龟' };
const ctx = {
  TurtleBatches: require('../assets/turtle-batches'),
  crypto, FormData: class { constructor(data) { this.data=data; } get(key) { return this.data[key] ?? null; } },
  state: {}, requireArchiveCapacity: () => true, speciesByCode: () => species, speciesPhoto: () => 'photo',
  turtleLabel: turtle => turtle.code, formatDate: date => date.toISOString().slice(0,10), money: value => Number(value).toFixed(2),
  makeActivity: text => ({text}), activateCareReminder() {}, window: { setTimeout() {} },
  toast: value => {message=value;}, saveWithDeferredImages: patch => {saved=patch;}
};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function submitTurtle(event)'),source.indexOf('function appReviewStorageKey(')),ctx);
function reset(mode) {
  saved=undefined;message='';
  ctx.state={archivePurchaseMode:mode,turtles:[],ledgerRecords:[],keptSpecies:[],turtlePools:[],memos:[],formGender:'公'};
}
function submit(data) {ctx.submitTurtle({preventDefault(){},currentTarget:{speciesCode:'GHG',source:'购买',price:'300',...data}});}
reset('batch');
submit({batchMaleCount:'120',batchFemaleCount:'90',batchTotalPrice:'2100'});
assert.equal(saved.turtles.length,210);
assert.equal(saved.turtles.filter(item=>item.gender==='公').length,120);
assert.equal(saved.turtles.filter(item=>item.gender==='母').length,90);
assert.equal(new Set(saved.turtles.map(item=>item.id)).size,210);
assert.equal(saved.ledgerRecords.length,1);
assert.equal(saved.ledgerRecords[0].amount,2100);
assert.equal(saved.memos.length,1, 'One reminder per batch');
assert.ok(saved.turtles.every(item=>item.stage==='juvenile'));
reset('batch');
submit({batchStage:'hatchling',batchCount:'120',batchTotalPrice:'2400',batchMaleCount:'999',batchFemaleCount:'bad'});
assert.equal(saved.turtles.length,120,'hatchlings use their total count, ignoring hidden gender drafts');
assert.ok(saved.turtles.every(item=>item.gender==='未知' && item.stage==='hatchling'));
assert.equal(saved.ledgerRecords[0].stage,'hatchling');
assert.equal(saved.ledgerRecords[0].amount,2400);
assert.match(saved.ledgerRecords[0].title,/苗子/);
assert.ok(!saved.ledgerRecords[0].title.includes(' 公'));
for(const stage of ['juvenile','adult']) {
  reset('batch');submit({batchStage:stage,batchMaleCount:'2',batchFemaleCount:'3',batchTotalPrice:'500',batchCount:'999'});
  assert.equal(saved.turtles.length,5);
  assert.ok(saved.turtles.every(item=>item.stage===stage));
  assert.equal(saved.turtles.filter(item=>item.gender==='公').length,2);
  assert.equal(saved.turtles.filter(item=>item.gender==='母').length,3);
  reset('batch');submit({batchStage:stage,batchTotalPrice:'500',batchCount:'10'});
  assert.equal(saved,undefined,'older stages require both gender counts');
}
for(const count of ['0','-1','1.5','bad','']) {
  reset('batch');submit({batchStage:'hatchling',batchCount:count,batchTotalPrice:'100'});
  assert.equal(saved,undefined);
}
for(const count of ['-1','1.5','bad','Infinity']) {
  reset('batch');submit({batchMaleCount:count,batchFemaleCount:'1',batchTotalPrice:'300'});
  assert.equal(saved,undefined);assert.match(message,/非负整数/);
}
reset('batch');submit({batchMaleCount:'0',batchFemaleCount:'0',batchTotalPrice:'0'});
assert.equal(saved,undefined);
reset('single');submit({weight:'91.23',carapaceLength:'8.36'});
assert.equal(saved.turtles[0].weight,91.23);
assert.equal(saved.turtles[0].carapaceLength,8.36);
assert.equal(saved.ledgerRecords[0].turtleSnapshot.weight,91.23);
assert.equal(saved.ledgerRecords[0].carapaceLength,8.36);
for(const input of ['1.234','-1','Infinity','']) {
  reset('single');submit({weight:input,carapaceLength:'8.36'});
  assert.equal(saved,undefined);assert.match(message,/克重/);
}
reset('single');submit({weight:'91.23',carapaceLength:'8.366'});
assert.equal(saved,undefined);assert.match(message,/背甲长度/);
for (const birthDate of ['', '2025-05-20']) {
  reset('single'); submit({weight:'91.23',carapaceLength:'8.36',acquiredDate:'2026-01-02',birthDate});
  assert.equal(saved.turtles[0].birthDate,birthDate);
  assert.equal(saved.turtles[0].acquiredDate,'2026-01-02');
  assert.equal(saved.ledgerRecords[0].turtleSnapshot.birthDate,birthDate);
  reset('batch'); submit({batchStage:'hatchling',batchCount:'2',batchTotalPrice:'100',acquiredDate:'2026-01-02',birthDate});
  assert.ok(saved.turtles.every(t=>t.birthDate===birthDate && t.acquiredDate==='2026-01-02'));
}
console.log('Archive inputs passed: batch counts, two-decimal measurements and optional birth dates for single/batch archives.');
