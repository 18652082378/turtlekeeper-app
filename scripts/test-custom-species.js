const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');const path=require('node:path');const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const species={code:'CUS-11111111-1111-4111-8111-111111111111',name:'我的品种',photo:'/uploads/private.jpg'};
const ctx={state:{loggedInPhone:'a',customSpecies:[species]},speciesList:[{code:'PUBLIC',name:'公共品种'}],defaultPhoto:'placeholder',apiAssetUrl:x=>x};vm.createContext(ctx);
for(const [start,end] of [['function normalizeCustomSpecies(','function normalizeAccountData('],['function accountSpeciesList(','function isMarketProhibitedSpecies('],['function speciesPhoto(','async function resolveSpeciesImage(']])vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end)),ctx);
assert.equal(ctx.accountSpeciesList().length,2);assert.equal(ctx.speciesByCode(species.code).name,'我的品种');assert.equal(ctx.speciesPhoto(ctx.speciesByCode(species.code)),species.photo);assert.equal(ctx.speciesList.length,1);
ctx.state={loggedInPhone:'b',customSpecies:[]};assert.equal(ctx.accountSpeciesList().length,1);assert.equal(ctx.speciesByCode(species.code),undefined);
ctx.state={loggedInPhone:'',customSpecies:[species]};assert.equal(ctx.accountSpeciesList().length,1);
assert.equal(ctx.normalizeCustomSpecies([{...species,code:'PUBLIC'}]).length,0);assert.equal(ctx.normalizeCustomSpecies([species,species]).length,1);assert.equal(ctx.normalizeCustomSpecies([{...species,photo:'javascript:alert(1)'}])[0].photo,'');
console.log('Private species client checks passed: account switching, logout, public catalogue unchanged, private photo, sanitized input.');
