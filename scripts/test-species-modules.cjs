const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const customCode = 'CUS-11111111-1111-4111-8111-111111111111';
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
  const results = [];
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    page.setDefaultTimeout(5000);
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      const url = new URL(route.request().url());
      if(url.hostname !== 'species-audit.test') return route.abort();
      if(url.pathname === '/config.js') return route.fulfill({contentType:'text/javascript',body:'window.TURTLE_API_BASE_URL="";'});
      const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()) return route.fulfill({status:404,body:''});
      return route.fulfill({body:fs.readFileSync(file),contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
    });
    await page.goto('https://species-audit.test/?skipIntro=1');
    async function reset() {
      await page.evaluate(customCode=>{
        canUseCommunity=()=>true;
        apiPost=async(url,body)=>url==='/api/account/species/create'?{ok:true,species:{code:body.code,name:body.name},customSpecies:[...state.customSpecies,{code:body.code,name:body.name}]}:{ok:true,products:[],posts:[]};
        window.auditToasts=[]; toast=value=>auditToasts.push(value);
        state.loggedInPhone='preview';state.cloudToken='audit-token';cloudHydrationComplete=true;
        Object.assign(state,{policyConsentRequired:false,customSpecies:[{code:customCode,name:'私有测试品种'}],keptSpecies:['GHG',customCode],
          turtles:[{id:'g1',code:'一号',speciesCode:'GHG',speciesName:'果核蛋龟',gender:'母',status:'正常饲养',weight:20,carapaceLength:3,price:10},
            {id:'g2',code:'二号',speciesCode:'HMG',speciesName:'红面泥龟',gender:'母',status:'正常饲养',weight:30,carapaceLength:4,price:20},
            {id:'legacy',code:'旧档案',speciesCode:'OLD-MISSING',speciesName:'历史未收录品种',status:'正常饲养',gender:'未知',weight:20,carapaceLength:3}],
          turtlePools:[],breedingRecords:[],ledgerRecords:[],formDraft:{},selectedSpeciesCode:'',speciesPickerForAdd:false,speciesPickerForLedger:false,
          marketDraftTurtleId:'',editingMarketListingId:'',marketDraftMedia:[],marketDraftDescription:'',marketDraftDescriptionTemplate:'',
          archivePurchaseMode:'single',turtleFilter:'all',turtlePoolFilter:'all',updatingTurtleId:'',turtleDetailDraftId:'',turtleDetailDraft:null});
        setState({page:'home'},{skipSave:true});
      },customCode);
    }
    async function check(name,run) {
      try { await reset(); await run(); results.push({name,pass:true}); console.log('PASS '+name); }
      catch(e) { results.push({name,pass:false,error:e.message}); console.error('FAIL '+name+': '+e.message); }
    }
    await check('market search requires explicit species confirmation',async()=>{
      await page.evaluate(()=>setState({page:'marketAdd'},{skipSave:true}));
      await page.locator('[data-market-species-search]').fill('龟');
      assert.equal(await page.locator('[name="speciesCode"]').inputValue(),'');
      await page.locator('[data-market-species-option]').first().click();
      assert.notEqual(await page.locator('[name="speciesCode"]').inputValue(),'');
      await page.locator('[data-market-species-search]').fill('');
      await page.evaluate(()=>submitMarketListing({preventDefault(){},currentTarget:document.querySelector('#marketListingForm')}));
      assert.match(await page.evaluate(()=>auditToasts.at(-1)),/选择品种/);
    });
    await check('editing an unknown historical species never defaults to another species',async()=>{
      await page.evaluate(()=>setState({page:'turtleDetail',selectedTurtleId:'legacy',updatingTurtleId:'legacy'},{skipSave:true}));
      assert.equal(await page.locator('#turtleDetailForm [name="speciesCode"]').inputValue(),'OLD-MISSING');
      await page.locator('#turtleDetailForm [name="code"]').fill('旧档案改名');
      await page.locator('#turtleDetailForm [type="submit"]').click();
      assert.equal(await page.evaluate(()=>state.turtles.find(t=>t.id==='legacy').speciesCode),'OLD-MISSING');
      assert.equal(await page.evaluate(()=>state.turtles.find(t=>t.id==='legacy').code),'旧档案改名');
    });
    await check('archive catalogue selects an already-kept species and preserves draft',async()=>{
      await page.evaluate(()=>setState({page:'add'},{skipSave:true}));
      await page.locator('#turtleForm [name="code"]').fill('保留昵称');
      await page.locator('#turtleForm [data-page="species"]').click();
      await page.locator('[data-add-species="GHG"]').click();
      assert.equal(await page.evaluate(()=>state.page),'add');
      assert.equal(await page.locator('#turtleForm [name="speciesCode"]').inputValue(),'GHG');
      assert.equal(await page.locator('#turtleForm [name="code"]').inputValue(),'保留昵称');
      assert.ok(await page.evaluate(()=>state.keptSpecies.includes('GHG')));
    });
    await check('purchase catalogue returns with chosen species and amount',async()=>{
      await page.evaluate(()=>openLedgerForm('purchase'));
      await page.locator('#ledgerForm [name="amount"]').fill('123');
      await page.locator('#ledgerForm [name="note"]').fill('收购备注');
      await page.locator('#ledgerForm [data-page="species"]').click();
      await page.locator('[data-back]').first().click();
      assert.equal(await page.locator('#ledgerForm [name="amount"]').inputValue(),'123');
      await page.locator('#ledgerForm [data-page="species"]').click();
      await page.locator('[data-add-species="HMG"]').click();
      assert.equal(await page.evaluate(()=>state.page),'ledger');
      assert.equal(await page.locator('#ledgerForm [name="purchaseSpeciesCode"]').inputValue(),'HMG');
      assert.equal(await page.locator('#ledgerForm [name="amount"]').inputValue(),'123');
      assert.equal(await page.locator('#ledgerForm [name="note"]').inputValue(),'收购备注');
    });
    await check('market changing archive preserves entered sale fields and uploaded media',async()=>{
      await page.evaluate(()=>setState({page:'marketAdd',marketDraftMedia:[{dataUrl:'/assets/species/GHG.jpg',type:'image'}]},{skipSave:true}));
      await page.locator('[name="price"]').fill('456');
      await page.locator('[name="title"]').fill('自己填写的标题');
      await page.locator('[name="delivery"]').selectOption('仅自提');
      await page.locator('[data-market-turtle-source]').selectOption('g2',{force:true});
      assert.equal(await page.locator('[name="price"]').inputValue(),'456');
      assert.equal(await page.locator('[name="title"]').inputValue(),'自己填写的标题');
      assert.equal(await page.locator('[name="delivery"]').inputValue(),'仅自提');
      assert.equal(await page.locator('[name="speciesCode"]').inputValue(),'HMG');
      assert.equal(await page.evaluate(()=>state.marketDraftMedia.length),1);
    });
    await check('community changing archive preserves handwritten growth text',async()=>{
      await page.evaluate(()=>{communityDraftTopic='growth';communityDraftTurtleId='g1';communityDraftText='';setState({page:'communityAdd'},{skipSave:true});});
      await page.locator('[name="content"]').fill('今天自己写的成长记录');
      await page.locator('[data-community-turtle-source]').selectOption('g2',{force:true});
      assert.equal(await page.locator('[name="content"]').inputValue(),'今天自己写的成长记录');
    });
    await check('editing a listing changes linked species and allows unlinking',async()=>{
      await page.evaluate(()=>{state.myMarketListings=[{id:'listing',turtleId:'g1',speciesCode:'GHG',speciesName:'果核蛋龟',title:'原商品标题',description:'原描述',price:123,media:[]}];beginMarketListingEdit('listing');});
      await page.locator('[name="description"]').fill('修改后的商品说明');
      await page.locator('[data-market-turtle-source]').selectOption('g2',{force:true});
      assert.equal(await page.locator('[name="speciesCode"]').inputValue(),'HMG');
      assert.equal(await page.locator('[name="description"]').inputValue(),'修改后的商品说明');
      await page.locator('[data-market-turtle-source]').selectOption('',{force:true});
      assert.equal(await page.locator('[data-market-turtle-source]').inputValue(),'');
      assert.equal(await page.locator('[name="title"]').inputValue(),'原商品标题');
    });
    await check('choosing market species preserves a handwritten title',async()=>{
      await page.evaluate(()=>setState({page:'marketAdd'},{skipSave:true}));
      await page.locator('[name="title"]').fill('我的标题');
      await page.locator('[data-market-species-search]').fill('GHG');
      await page.locator('[data-market-species-option="GHG"]').click();
      assert.equal(await page.locator('[name="title"]').inputValue(),'我的标题');
    });
    await check('custom species creation rejects bad text and returns to purchase',async()=>{
      await page.evaluate(()=>openLedgerForm('purchase'));
      await page.locator('#ledgerForm [name="amount"]').fill('777');
      await page.locator('#ledgerForm [data-page="species"]').click();
      await page.locator('[data-create-custom-species]').click();
      await page.evaluate(()=>{hasCloudSession=()=>true;cloudHydrationComplete=true;});
      await page.locator('#customSpeciesForm [name="name"]').fill('乱码\uFFFD');
      await page.locator('#customSpeciesForm [type="submit"]').click();
      assert.match(await page.evaluate(()=>auditToasts.at(-1)),/乱码/);
      await page.locator('#customSpeciesForm [name="name"]').fill('新建的专用品种');
      await page.locator('#customSpeciesForm [type="submit"]').click();
      await page.locator('#ledgerForm').waitFor();
      assert.match(await page.locator('[name="purchaseSpeciesCode"]').inputValue(),/^CUS-/);
      assert.equal(await page.locator('[name="amount"]').inputValue(),'777');
    });
    await check('catalogue search, favorites and all native species fields support private species',async()=>{
      await page.evaluate(()=>setState({page:'species'},{skipSave:true}));
      await page.locator('[data-species-search]').fill('私有测试');
      assert.equal(await page.locator('.species-row:visible').count(),1);
      await page.evaluate(()=>setState({page:'breeds'},{skipSave:true}));
      assert.ok((await page.locator('#app').innerText()).includes('私有测试品种'));
      for (const mode of ['single','batch']) {
        await page.evaluate(mode=>setState({page:'add',archivePurchaseMode:mode},{skipSave:true}),mode);
        await page.locator('#turtleForm [name="speciesCode"]').selectOption(customCode);
        assert.equal(await page.locator('#turtleForm [name="speciesCode"]').inputValue(),customCode);
      }
      await page.evaluate(()=>setState({page:'home'},{skipSave:true}));
      await page.locator('[data-filter-species]').selectOption('HMG');
      assert.deepEqual(await page.evaluate(()=>sortedTurtles().map(t=>t.id)),['g2']);
      await page.evaluate(()=>setState({page:'turtleDetail',selectedTurtleId:'g1',updatingTurtleId:'g1'},{skipSave:true}));
      await page.locator('#turtleDetailForm [name="speciesCode"]').selectOption(customCode);
      await page.locator('#turtleDetailForm [type="submit"]').click();
      assert.equal(await page.evaluate(()=>state.turtles.find(t=>t.id==='g1').speciesCode),customCode);
    });
    await check('empty required archive selector opens the visible picker',async()=>{
      await page.evaluate(()=>setState({page:'breedingAdd',breedingMotherValue:'',breedingMotherMode:'archive'},{skipSave:true}));
      await page.locator('#breedingForm [type="submit"]').click();
      await page.locator('.archive-directory-overlay').waitFor();
      await page.locator('[data-directory-close]').click();
    });
    await check('single and batch purchase persist the chosen private species',async()=>{
      for (const mode of ['single','batch']) {
        await page.evaluate(mode=>setState({page:'add',archivePurchaseMode:mode,formDraft:{}},{skipSave:true}),mode);
        await page.locator('#turtleForm [name="speciesCode"]').selectOption(customCode);
        if(mode==='single') {
          await page.locator('#turtleForm [name="weight"]').fill('30');
          await page.locator('#turtleForm [name="carapaceLength"]').fill('4');
          await page.locator('#turtleForm [name="price"]').fill('30');
        } else {
          await page.locator('[name="batchMaleCount"]').fill('1');
          await page.locator('[name="batchFemaleCount"]').fill('1');
          await page.locator('[name="batchTotalPrice"]').fill('60');
        }
        await page.locator('#turtleForm [type="submit"]').click();
        assert.equal(await page.evaluate(()=>state.turtles[0].speciesCode),customCode);
        assert.equal(await page.evaluate(()=>state.turtles[0].speciesName),'私有测试品种');
        if(mode==='batch') assert.equal(await page.evaluate(()=>state.turtles.filter(t=>t.batchId===state.turtles[0].batchId).length),2);
      }
    });
    await check('hatching persists selected offspring species separately from the parent',async()=>{
      await page.evaluate(()=>setState({page:'breedingDetail',selectedBreedingId:'nest',breedingRecords:[{id:'nest',date:formatDate(new Date()),motherId:'g1',motherName:'一号',eggCount:2,fertileCount:2,hatchCount:0}]},{skipSave:true}));
      assert.equal(await page.locator('[name="hatchSpeciesCode"]').inputValue(),'GHG');
      await page.locator('[name="hatchSpeciesCode"]').selectOption(customCode);
      await page.locator('[name="successfulHatchCount"]').fill('1');
      await page.getByRole('button',{name:'确认孵化',exact:true}).click();
      assert.equal(await page.evaluate(()=>state.turtles.find(t=>t.sourceBreedingId==='nest')?.speciesCode),customCode);
      assert.equal(await page.evaluate(()=>state.turtles.find(t=>t.id==='g1').speciesCode),'GHG');
    });
    fs.mkdirSync(path.join(root,'output'),{recursive:true});
    fs.writeFileSync(path.join(root,'output/species-modules-audit.json'),JSON.stringify({results,errors},null,2));
    assert.deepEqual(errors,[]);assert.ok(results.every(r=>r.pass),'Some species modules failed; see output/species-modules-audit.json');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
