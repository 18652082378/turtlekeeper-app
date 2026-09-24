const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'picker.test') return route.abort();
      if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.TURTLE_API_BASE_URL="";' });
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
    });
    await page.addInitScript(() => {
      const turtles = [
        { id: 'g1', code: '小果 · GH-01', speciesCode: 'GHG', speciesName: '果核蛋龟', gender: '母', health: '健康', poolId: 'p1', photo: '/assets/species/GHG.jpg' },
        { id: 'g2', code: '核桃 · GH-02', speciesCode: 'GHG', speciesName: '果核蛋龟', gender: '公', health: '生病', poolId: 'p2', photo: '/missing-photo.jpg' },
        ...Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, code: `GH-2026-${i}`, batchId: 'batch-september', batchName: '九月果核苗', speciesCode: 'GHG', speciesName: i ? '果核蛋龟' : '果核蛋���', health: i ? '健康' : '生病', poolId: i ? 'p1' : 'p2', acquiredDate: '2026-09-08', photo: '/assets/species/GHG.jpg' })),
        { id: 'r1', code: '小红', speciesCode: 'HMG', speciesName: '红面泥龟', gender: '母', health: '健康', poolId: 'p1' },
        { id: 'r2', code: '小青', speciesCode: 'TDG', speciesName: '台湾草龟', gender: '公', health: '健康', poolId: 'p1' },
        { id: 'unknown', code: '待确认 <名称>', speciesCode: 'CUS-11111111-1111-4111-8111-111111111111', speciesName: '我的自建品种', photo: '/missing-custom.jpg' },
        { id: 'lost', code: '已经损耗', speciesName: '不可选择', status: '已死亡', lossRecordId: 'lost1' }
      ].map(turtle => ({ status: '正常饲养', gender: '未知', price: 20, ...turtle }));
      const data = { turtles, keptSpecies: ['GHG','HMG','TDG'], turtlePools: [{ id: 'p1', name: '阳台主池', type: 'hatchling' }, { id: 'p2', name: '观察池', type: 'juvenile' }], memos: [], ledgerRecords: [] };
      localStorage.setItem('turtlekeeper-state-v1', JSON.stringify({ loggedInPhone: 'preview', accountName: '图片选择测试', registeredUsers: [{ phone: 'preview', data }], policyConsentRequired: false }));
    });
    await page.goto('https://picker.test/?skipIntro=1');
    await page.evaluate(() => openLedgerForm('loss'));
    await page.locator('#ledgerForm [name="note"]').fill('选择前保留的备注');
    const open = () => page.locator('#ledgerForm .archive-directory-trigger').click();
    await open();
    const loaded = () => page.waitForFunction(() => [...document.querySelectorAll('.archive-directory-list img')].every(image => image.complete && image.naturalWidth > 0));
    await loaded();
    assert.equal(await page.locator('.directory-species-card').count(), 4);
    assert.ok(!(await page.locator('.archive-directory-list').innerText()).includes('\uFFFD'), 'corrupted species names use the catalogue');
    assert.equal(await page.locator('.archive-directory-list').innerText().then(text => text.includes('不可选择')), false);
    fs.mkdirSync(path.join(root, 'output'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'output/archive-picker-species.png') });
    await page.locator('.directory-species-card').filter({ hasText: '果核蛋龟' }).click();
    await loaded();
    assert.equal(await page.locator('.directory-archive-card').count(), 3);
    assert.match(await page.locator('.directory-archive-card').filter({ hasText: '九月果核苗' }).innerText(), /在养 5 只[\s\S]*含生病/);
    await page.screenshot({ path: path.join(root, 'output/archive-picker-records.png') });
    await page.locator('[data-directory-kind="batch"]').click();
    assert.equal(await page.locator('.directory-archive-card').count(), 1);
    await page.locator('[data-directory-search]').fill('GH-2026-4');
    assert.equal(await page.locator('.directory-archive-card').count(), 1, 'Search finds any member of a collapsed batch');
    await page.locator('[data-directory-health]').selectOption('生病');
    await page.locator('[data-directory-pool]').selectOption('p1');
    assert.equal(await page.locator('.directory-archive-card').count(), 0, 'Health and pool must match the same member');
    await page.locator('[data-directory-pool]').selectOption('p2');
    assert.equal(await page.locator('.directory-archive-card').count(), 1);
    await page.locator('[data-directory-close]').click();
    assert.equal(await page.locator('#ledgerForm [name="note"]').inputValue(), '选择前保留的备注');
    await open();
    await page.locator('[data-directory-search]').fill('核桃');
    await loaded();
    assert.match(await page.locator('.directory-archive-card img').getAttribute('src'), /GHG\.jpg$/);
    await page.locator('.directory-archive-card').click();
    assert.equal(await page.locator('#ledgerForm [name="turtleId"]').inputValue(), 'g2');
    assert.equal(await page.locator('#ledgerForm [name="note"]').inputValue(), '选择前保留的备注');
    for (const [width, height] of [[320,568],[390,844],[430,932],[1280,900]]) {
      await page.setViewportSize({ width, height });
      for (const theme of ['teal', 'dark']) {
        await page.evaluate(theme => { state.themeColor = theme; applyTheme(); }, theme);
        await open();
        const box = await page.locator('.archive-directory-dialog').boundingBox();
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1);
        assert.ok(await page.evaluate(() => document.querySelector('.archive-directory-dialog').scrollWidth <= document.querySelector('.archive-directory-dialog').clientWidth));
        const listBox = await page.locator('.archive-directory-list').boundingBox();
        assert.ok(listBox.height >= 100, 'Results remain usable on compact phones');
        if (width === 1280 && theme === 'teal') { await loaded(); await page.screenshot({ path: path.join(root, 'output/archive-picker-desktop.png') }); }
        if (width === 390 && theme === 'dark') { await loaded(); await page.screenshot({ path: path.join(root, 'output/archive-picker-dark.png') }); }
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.archive-directory-overlay').count(), 0);
        assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      }
    }
    // A breeding batch is the recorded parent group, never an arbitrary mother.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => setState({ page: 'breedingAdd', themeColor: 'teal' }));
    await page.locator('#breedingForm [name="eggCount"]').fill('8');
    await page.locator('#breedingForm [name="fertileCount"]').fill('6');
    await page.locator('#breedingForm [name="note"]').fill('选择种母前的繁殖备注');
    await page.locator('#breedingForm .archive-directory-trigger').click();
    await page.locator('.directory-species-card').filter({ hasText: '果核蛋龟' }).click();
    assert.equal(await page.locator('.directory-archive-card').count(), 2, 'one mother and one folded batch; males stay excluded');
    await loaded();
    await page.screenshot({ path: path.join(root, 'output/breeding-picture-picker.png') });
    await page.locator('[data-directory-search]').fill('GH-2026-4');
    await page.locator('.directory-archive-card').click();
    assert.equal(await page.locator('.archive-directory-overlay').count(), 0);
    assert.equal(await page.locator('#breedingForm [name="mother"]').inputValue(), 'batch:batch-september');
    assert.equal(await page.locator('#breedingForm [name="note"]').inputValue(), '选择种母前的繁殖备注');
    await page.getByRole('button', { name: '保存繁殖记录', exact: true }).click();
    assert.equal(await page.evaluate(() => state.breedingRecords[0].motherId), '');
    assert.equal(await page.evaluate(() => state.breedingRecords[0].batchId), 'batch-september');
    assert.equal(await page.evaluate(() => state.breedingRecords[0].speciesName), '果核蛋龟');
    await page.evaluate(() => setState({page: 'breedingDetail', selectedBreedingId: state.breedingRecords[0].id}));
    assert.equal(await page.locator('#breedingDetailForm [name="mother"]').inputValue(), 'batch:batch-september');
    await page.locator('#breedingDetailForm [name="eggCount"]').fill('9');
    await page.getByRole('button', {name:'保存修改',exact:true}).click();
    assert.deepEqual(await page.evaluate(() => [state.breedingRecords[0].batchId, state.breedingRecords[0].motherId, state.breedingRecords[0].eggCount]), ['batch-september', '', 9]);
    // Many species must scroll instead of squeezing pictures into thin strips.
    await page.evaluate(() => setState({ page: 'breedingAdd', breedingMotherValue: '', turtles: [
      ...Array.from({length: 7}, (_, i) => ({id:'layout'+i, code:'测试'+i, speciesCode:'CUSTOM'+i, speciesName:'自建品种'+i, gender:'母'})),
      {id:'damaged', code:'待核对', speciesCode:'UNKNOWN', speciesName:'���', gender:'母'}
    ] }));
    for (const width of [390,1195]) {
      await page.setViewportSize({width,height:844});
      await page.locator('#breedingForm .archive-directory-trigger').click();
      assert.match(await page.locator('.archive-directory-list').innerText(), /品种待确认/);
      const pictures = await page.locator('.directory-species-image').evaluateAll(nodes => nodes.map(n => ({width:n.clientWidth,height:n.clientHeight})));
      assert.ok(pictures.every(n => n.height > 70 && Math.abs(n.width / n.height - 1.6) < 0.1), 'all image cards retain their aspect ratio');
      assert.ok(await page.locator('.archive-directory-list').evaluate(n => n.scrollHeight > n.clientHeight), 'many species scroll within the picker');
      if(width === 1195) await page.screenshot({path:path.join(root,'output/breeding-species-layout-fixed.png')});
      await page.locator('[data-directory-close]').click();
    }
    // Search remains complete even when the rendered list is paged.
    await page.evaluate(() => {
      const rows = Array.from({ length: 125 }, (_, i) => ({ id: `extra${i}`, code: `查找-${i}`, speciesName: '果核蛋龟', speciesCode: 'GHG', status: '正常饲养' }));
      setState({ page: 'ledger', turtles: rows, ledgerDraftTurtleId: '', ledgerDraftForm: {}, ledgerDraftType: 'loss' });
    });
    await open();
    await page.locator('[data-directory-kind="single"]').click();
    assert.equal(await page.locator('.directory-archive-card').count(), 60);
    await page.locator('[data-directory-more]').click();
    assert.equal(await page.locator('.directory-archive-card').count(), 120);
    await page.locator('[data-directory-search]').fill('查找-124');
    assert.equal(await page.locator('.directory-archive-card').count(), 1);
    await page.locator('[data-directory-search]').fill('没有这个档案');
    await page.getByRole('button', { name: '清除搜索与筛选' }).click();
    assert.equal(await page.locator('.directory-species-card').count(), 1);
    await page.locator('[data-directory-close]').click();
    assert.deepEqual(errors, []);
    console.log('Photo picker passed: photos/fallbacks, species/single/batch search, member matching, allowed options, unchanged drafts, 125-record paging, responsive light/dark, Escape cleanup.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
