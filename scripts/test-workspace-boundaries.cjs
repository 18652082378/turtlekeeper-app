const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const Care = require('../assets/care-records');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'output/audit-20260926'), { recursive: true });
(async () => {
  const today = '2026-09-26';
  assert.deepEqual(Care.dueMemos([{ id: 'done', completedAt: today }, { id: 'future', dueDate: '2026-09-27' }, { id: 'disabled', reminderEnabled: false }, { id: 'wrong-day', repeat: true, weekdays: ['1'] }, { id: 'done-today', repeat: true, lastCompletedDate: today }, { id: 'due', repeat: true, weekdays: ['6'] }], today).map(m => m.id), ['due']);
  const server = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
  const due = vm.runInNewContext('(' + server.slice(server.indexOf('function careReminderDue('), server.indexOf('\nasync function notifyCareReminder')) + ')');
  assert.equal(due({ remindTime: '09:00', completedAt: today }, { date: today, time: '09:00', weekday: '6' }), false);
  assert.equal(due({ remindTime: '09:00', repeat: true, lastCompletedDate: today }, { date: today, time: '09:00', weekday: '6' }), false);
  const unrelated={id:'unrelated',title:'保持原提醒'};
  const memos=[{id:'once',repeat:false},unrelated];
  const records=[{id:'first',sourceMemoId:'once',date:today,createdAt:today+'T01:00:00Z'}, {id:'second',sourceMemoId:'once',date:today,createdAt:today+'T02:00:00Z'}];
  const completed=Care.reconcileCompletion(memos,records,'once');
  assert.equal(completed[0].completedAt,records[1].createdAt);
  assert.equal(completed[1],unrelated);
  assert.equal(Care.reconcileCompletion(completed,records.slice(0,1),'once')[0].completedAt,records[0].createdAt,'deleting a duplicate keeps the remaining completion');
  assert.equal(Care.reconcileCompletion(completed,[],'once')[0].completedAt,'','deleting the final record reopens a one-time task');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let accept = true, dialogs = 0;
    page.on('dialog', dialog => { dialogs++; return accept ? dialog.accept() : dialog.dismiss(); });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'workspace.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.goto('https://workspace.test/?skipIntro=1');
    await page.evaluate(() => {
      const today = formatDate(new Date());
      state = { ...state, ...emptyAccountData(), loggedInPhone: 'preview', policyConsentRequired: false,
        turtles: [{ id: 'a', code: '小果', speciesCode: 'GHG', speciesName: '果核蛋龟', health: '健康', status: '正常饲养', poolId: 'p' }, { id: 'b', code: '苗一', speciesCode: 'GHG', speciesName: '果核蛋龟', batchId: 'batch', status: '正常饲养' }, { id: 'c', code: '苗二', speciesCode: 'GHG', speciesName: '果核蛋龟', batchId: 'batch', status: '正常饲养' }],
        turtlePools: [{ id: 'p', name: '一号池' }], keptSpecies: ['GHG'],
        careRecords: Array.from({ length: 55 }, (_, i) => ({ id: `r${i}`, title: i % 2 ? '换水' : '喂食', itemId: i % 2 ? 'water' : 'feeding', date: today, createdAt: `${today}T08:00:00Z`, poolId: 'p', poolName: '一号池', turtleRefs: i % 2 ? [] : [{ id: i === 0 ? 'b' : 'a', code: i === 0 ? '苗一' : '小果', speciesName: '果核蛋龟' }], note: `记录${i}` })),
        memos: [{ id: 'task', title: '换水', content: '换三分之一', remindTime: '09:00', repeat: true }, { id: 'growth', title: '记录小果成长', turtleId: 'a', dueDate: today, growthReminder: true }],
        breedingRecords: [{ id: 'nest', motherId: 'a', motherName: '小果', eggCount: 6, fertileCount: 5, date: today }]
      }; edgeBackSnapshots = []; render();
    });

    const initial = await page.evaluate(() => JSON.parse(JSON.stringify(state)));
    const outcomes = [];
    async function check(name, run) {
      await page.evaluate(initial => { state = { ...initial }; edgeBackSnapshots = []; careHistoryFilter = {}; careHistoryLimit = 40; render(); }, initial);
      try { await run(); outcomes.push({ name, pass: true }); }
      catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
    }
    await check('deleting completion restores pending task', async () => {
      await page.locator('[data-start-task="task"]').click();
      await page.locator('#careForm [type="submit"]').click();
      const id=await page.evaluate(() => state.careRecords[0].id);
      if (await page.locator('[data-more-care]').count()) await page.locator('[data-more-care]').click();
      await page.locator('[data-delete-care="'+id+'"]').click();
      assert.equal(await page.evaluate(() => TurtleCare.dueMemos(state.memos, formatDate(new Date())).some(m => m.id==='task')),true);
    });
    await check('editing completion date updates pending task', async () => {
      await page.locator('[data-start-task="task"]').click();
      await page.locator('#careForm [type="submit"]').click();
      const id=await page.evaluate(() => state.careRecords[0].id);
      if (await page.locator('[data-more-care]').count()) await page.locator('[data-more-care]').click();
      await page.locator('[data-edit-care="'+id+'"]').click();
      await page.locator('#careForm [name="date"]').fill('2026-09-01');
      await page.locator('#careForm [type="submit"]').click();
      assert.equal(await page.evaluate(() => state.memos.find(m=>m.id==='task').lastCompletedDate),'2026-09-01');
    });
    await check('return to archive editor retains edit mode and inputs', async () => {
      await page.evaluate(() => setState({page:'turtleDetail',selectedTurtleId:'a',updatingTurtleId:'a'}, {pageMotion:'none'}));
      await page.locator('#turtleDetailForm [name="code"]').fill('未保存的新昵称');
      await page.locator('[data-account-save-status]').click();
      await page.evaluate(() => navigateBack());
      assert.equal(await page.evaluate(() => state.updatingTurtleId),'a');
      assert.equal(await page.locator('#turtleDetailForm [name="code"]').inputValue(),'未保存的新昵称');
    });
    await check('growth timeline uses China calendar day', async () => {
      await page.evaluate(() => { state.turtles[0].measureHistory=[{updatedAt:'2026-09-25T18:30:00Z',newSnapshot:{weight:10}}];setState({page:'turtleDetail',selectedTurtleId:'a'}, {pageMotion:'none'}); });
      const row=page.locator('.work-timeline li').filter({hasText:'成长记录'});
      assert.equal(await row.locator('time').textContent(),'2026-09-26');
    });
    await check('unchanged growth measurements can complete a reminder', async () => {
      await page.evaluate(() => { state.turtles[0].weight=10; state.turtles[0].carapaceLength=3; });
      await page.locator('[data-start-task="growth"]').click();
      await page.locator('#turtleDetailForm [name="note"]').fill('已检查，无变化');
      await page.locator('#turtleDetailForm [type="submit"]').click();
      assert.equal(await page.evaluate(() => state.memos.find(m=>m.id==='growth').dueDate>formatDate(new Date())),true);
      await page.evaluate(() => navigateBack());
      assert.equal(await page.evaluate(() => state.updatingTurtleId),'','saved growth form must not return as an unsaved draft');
      assert.equal(await page.locator('#turtleDetailForm').count(),0);
    });
    await check('batch growth task advances after explicit update', async () => {
      await page.evaluate(() => {state.turtles.filter(t=>t.batchId).forEach(t=>{t.stage='hatchling';t.gender='未知';});state.memos=[{id:'batch-growth',turtleId:'b',batchId:'batch',growthReminder:true,dueDate:formatDate(new Date()),title:'批次成长'}];render();});
      await page.locator('[data-start-task="batch-growth"]').click();
      await page.locator('#turtleDetailForm [name="note"]').fill('整批观察，状态稳定');
      await page.locator('#turtleDetailForm [type="submit"]').click();
      assert.equal(await page.evaluate(() => state.memos[0].dueDate>formatDate(new Date())),true);
    });
    await check('historical species remain filterable after rename', async () => {
      await page.evaluate(() => {state.careRecords.push({...state.careRecords[2],id:'old-species',turtleRefs:[{id:'a',code:'原编号',speciesName:'历史品种名'}]});setState({page:'memos',careTab:'care'}, {pageMotion:'none'});});
      assert.equal(await page.locator('#careFilterForm [name="species"] option').filter({hasText:'历史品种名'}).count(),1);
      await page.locator('.work-filters > summary').click();
      await page.locator('#careFilterForm [name="species"]').selectOption('历史品种名');
      assert.equal(await page.locator('#careFilterForm [name="turtle"] option[value="a"]').count(),1);
      assert.equal(await page.evaluate(() => document.querySelector('#careFilterForm [name="turtle"]').__directorySource.turtles.find(t=>t.id==='a').speciesName),'历史品种名');
    });
    await check('archive, reminders and logs display special characters as text', async () => {
      const text='小龟 " & </textarea><span data-audit-mark>测试</span>';
      for (const mode of ['readonly','editor','reminders','calendar']) {
        await page.evaluate(({text,mode}) => {
          state.turtles[0].code=text; state.turtles[0].note=text;
          state.memos=[{id:'special',title:text,content:text}];
          state.activityLogs=[{id:'special',type:text,text,createdAt:new Date().toISOString()}];
          state.page=mode==='reminders'?'memos':mode==='calendar'?'calendar':'turtleDetail';
          state.careTab='reminders'; state.memoTab='all'; state.selectedTurtleId='a';
          state.updatingTurtleId=mode==='editor'?'a':'';state.turtleDetailDraftId='';state.turtleDetailDraft=null;
          render();
        }, {text,mode});
        assert.equal(await page.locator('[data-audit-mark]').count(),0,mode+': user text must not create elements');
        if (mode==='editor') {
          assert.equal(await page.locator('#turtleDetailForm [name="code"]').inputValue(),text);
          assert.equal(await page.locator('#turtleDetailForm [name="note"]').inputValue(),text);
        } else assert.ok(await page.locator('main').textContent().then(value=>value.includes(text)),mode+': original text retained');
      }
    });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(root,'output/audit-20260926/workspace-boundaries.json'),JSON.stringify(outcomes,null,2));
    console.log(JSON.stringify(outcomes,null,2));
    assert.ok(outcomes.every(result=>result.pass),'all boundary cases pass');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
