const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const extract = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => { throw error; });
    await page.setContent('<div id="app"></div>');
    await page.addScriptTag({ content: `
      var state={}, notices=[], localReads=0, selectedFile;
      var png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9eAAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));
      window.Capacitor={convertFileSrc:x=>x};
      function requireLogin(){return true} function toast(x){notices.push(x)}
      function nativeMediaPickerPlugin(){return {pick:()=>new Promise(resolve=>window.finishPick=resolve)}}
      function nativeMediaPickerOptions(){return {selectionLimit:1}}
      function captureTurtleFormDraft(){return Object.fromEntries(new FormData(document.querySelector('#turtleForm')))}
      function captureLedgerFormDraft(){return Object.fromEntries(new FormData(document.querySelector('#ledgerForm')))}
      function captureTurtleDetailDraft(){return {}}
      function setState(patch){state={...state,...patch};mountForm()}
      function mountForm(){
        const adding=state.page==='add', attr=adding?'data-photo-input':'data-ledger-photo-input';
        document.querySelector('#app').innerHTML='<form id="'+(adding?'turtleForm':'ledgerForm')+'"><input name="note"><input type="file" '+attr+'><img id="preview"></form>';
        document.querySelector('[name=note]').value=(adding?state.formDraft:state.ledgerDraftForm)?.note||'';
        const photo=adding?state.formPhoto:state.ledgerDraftPhoto;
        if(photo)document.querySelector('#preview').src=photo;
        document.querySelector('input[type=file]').addEventListener('change',event=>{window.photoDone=(adding?readPhoto:readLedgerPhoto)(event)});
      }
      ${extract('function readImageAsDataUrl(', 'function apiAssetUrl(')}
      ${extract('function readImageForLocalUse(', 'function scheduleCloudImageMigration(')}
      ${extract('async function nativePickedFiles(', 'function setupNativeMediaPicker(')}
      ${extract('let photoReadSequence', 'function toggleTurtlePin(')}
      ${extract('async function readLedgerPhoto(', 'async function readBreedingPhoto(')}
    ` });
    for (const kind of ['add', 'purchase', 'sold', 'loss', 'other']) {
      await page.evaluate(async kind => {
        state={page:kind==='add'?'add':'ledger',loggedInPhone:'test',ledgerDraftType:kind,formDraft:{},ledgerDraftForm:{}};
        localReads=0;mountForm();document.querySelector('[name=note]').value='尚未保存的备注';
        window.fetch=async()=>{if(++localReads===1)throw new TypeError('local file not ready');return new Response(new Blob([png],{type:'image/png'}))};
        const task=openNativeMediaPickerForInput(document.querySelector('input[type=file]'));
        mountForm(); // Background render while the native album is open.
        finishPick({files:[{path:'local-photo',mimeType:'image/png',name:'one.png'}]});
        await task;await photoDone;
      }, kind);
      assert.equal(await page.locator('[name=note]').inputValue(), '尚未保存的备注', `${kind}: preserve typed fields`);
      assert.equal(await page.evaluate(() => localReads), 2, `${kind}: recover local file read without reopening album`);
      await page.waitForFunction(() => document.querySelector('#preview').naturalWidth > 0);
    }
    await page.evaluate(async () => {
      state={page:'ledger',loggedInPhone:'test',ledgerDraftType:'sold',selectedLedgerId:'old',ledgerDraftForm:{}};mountForm();
      const task=openNativeMediaPickerForInput(document.querySelector('input[type=file]'));
      state.selectedLedgerId='different-record';mountForm();finishPick({files:[{path:'local-photo'}]});await task;
      if(state.ledgerDraftPhoto)throw new Error('Photo attached to a different record');
      const cancelled=openNativeMediaPickerForInput(document.querySelector('input[type=file]'));
      finishPick({files:[]});await cancelled;
    });
    const failedReads = await page.evaluate(async () => {
      localReads=0;window.fetch=async()=>{localReads++;throw new TypeError('unavailable')};
      try {await nativePickedFiles([{path:'missing-photo'}]);return 0;}catch{return localReads;}
    });
    assert.equal(failedReads, 4, 'Permanent local read failure has bounded automatic retries');
    await page.evaluate(async () => {
      const file=new File([png],'photo.png',{type:'image/png'});
      const original=HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL=()=>{throw new Error('canvas-failure')};
      try {
        try {await readImageAsDataUrl(file);throw new Error('Expected canvas rejection');}
        catch(error){if(error.message!=='canvas-failure')throw error;}
      } finally {HTMLCanvasElement.prototype.toDataURL=original;}
      try {await readImageAsDataUrl(new File(['bad bytes'],'broken.png',{type:'image/png'}));throw new Error('Invalid photo accepted');}
      catch(error){if(error.message==='Invalid photo accepted')throw error;}
      const originalRead=readImageForLocalUse, pending=[];
      readImageForLocalUse=()=>new Promise(resolve=>pending.push(resolve));
      state={page:'ledger',loggedInPhone:'test',ledgerDraftType:'other',ledgerDraftForm:{}};mountForm();
      const input={files:[file],value:''};
      const first=readLedgerPhoto({target:input}), second=readLedgerPhoto({target:input});
      pending[1]('data:image/png;base64,new');await second;pending[0]('data:image/png;base64,old');await first;
      if(state.ledgerDraftPhoto!=='data:image/png;base64,new')throw new Error('Late first photo replaced newer selection');
      readImageForLocalUse=originalRead;
    });
    console.log('Photo handoff passed: add/purchase/sold/loss/other, replaced input, local retry, preserved draft, navigation, cancellation, corrupt image, canvas failure, and selection race.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
