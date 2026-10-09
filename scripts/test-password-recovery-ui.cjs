'use strict';
// Real isolated server + SMS mock + browser; no production requests or user data.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'), {launchBrowser,engine}=require('./browser-test-engine.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/password-recovery');
(async()=>{
  const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'turtle-password-recovery-'));
  const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const origin='http://127.0.0.1:'+port;
  let child,browser,logs='';
  const call=async(route,body)=>{const r=await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  try{
    child=spawn(process.execPath,['server/server.js'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,HOST:'127.0.0.1',PORT:String(port),TURTLE_RUNTIME_DIR:runtime,MYSQL_HOST:'',MYSQL_URL:'',SMS_PROVIDER:'mock',SMS_MOCK:'true',APNS_KEY_PATH:'',APNS_KEY_BASE64:''}});
    child.stdout.on('data',b=>logs+=b); child.stderr.on('data',b=>logs+=b);
    let ready=false; for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/app/version')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100));}
    assert.ok(ready,'isolated server should start');
    const phone='13900003000',oldPassword='OriginalPassword123',password='RecoveredPassword123';
    const sent=await call('/api/sms/send',{phone,purpose:'register'});
    const reg=await call('/api/account/register',{phone,password:oldPassword,code:sent.body.code,termsAccepted:true,data:{turtles:[{id:'keep-turtle',code:'keep-001',speciesCode:'GHG',nickname:'保留档案',status:'在养'}]}});
    assert.equal(reg.status,200); const oldToken=reg.body.user.token;
    assert.equal((await call('/api/account/password/reset',{phone,code:sent.body.code,password})).status,400);
    assert.equal((await call('/api/sms/send',{phone,purpose:'reset_password'})).status,200);
    // Allow a new UI challenge in the isolated mock store, never on a live server.
    const saved=JSON.parse(fs.readFileSync(path.join(runtime,'data/sms-state.json'),'utf8'));
    const recoveryCode=Object.values(saved.codes)[0]; assert.equal(recoveryCode.purpose,'reset_password');
    // Domain tests cover expiry; real API checks wrong/reused/cross-purpose codes.
    assert.equal((await call('/api/sms/verify',{phone,code:'000000'})).status,400);
    assert.equal((await call('/api/account/password/reset',{phone,code:'000000',password})).status,400);
    browser=await launchBrowser();fs.mkdirSync(output,{recursive:true});
    const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
    await context.route('**/*',route=>{
      const u=new URL(route.request().url()); if(u.origin!==origin)return route.abort();
      if(u.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:'window.TURTLE_API_BASE_URL='+JSON.stringify(origin)+';window.TURTLE_APP_BUILD=132;'});
      return route.continue();
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(7000);
    await page.goto(origin+'/?skipIntro=1');
    await page.evaluate(()=>{dismissTradeIntro?.();state.page='account';state.accountMode='login';state.policyConsentRequired=false;render();});
    for(const theme of ['teal','dark'])for(const width of [320,390,1280]){
      await page.setViewportSize({width,height:844});await page.evaluate(theme=>{state.themeColor=theme;render();},theme);
      const geometry=await page.locator('.account-login-footer').evaluate(footer=>{
        const left=footer.querySelector('.auth-agreement > span'),right=footer.querySelector('.account-forgot-password');
        const a=document.createRange(),b=document.createRange();a.selectNodeContents(left.firstChild);b.selectNodeContents(right.firstChild);
        const x=a.getClientRects()[0],y=b.getClientRects()[0],r=right.getBoundingClientRect(),f=footer.getBoundingClientRect();
        return {leftFont:getComputedStyle(left).fontSize,rightFont:getComputedStyle(right).fontSize,leftY:x.y,rightY:y.y,rightEdge:r.right,footerEdge:f.right,scroll:document.documentElement.scrollWidth,width:innerWidth};
      });
      assert.equal(geometry.leftFont,geometry.rightFont);assert.ok(Math.abs(geometry.leftY-geometry.rightY)<1,'forgot password aligns with first agreement text line');
      assert.ok(Math.abs(geometry.rightEdge-geometry.footerEdge)<1,'forgot password aligns to footer right edge');assert.ok(geometry.scroll<=geometry.width);
      await page.screenshot({path:path.join(output,'login-footer-'+theme+'-'+width+'-'+engine+'.png'),animations:'disabled'});
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#accountForm [name="phone"]').fill(phone);
    await page.locator('[data-account-mode="reset"]').click();
    assert.equal(await page.locator('#passwordRecoveryForm [name="phone"]').inputValue(),phone);
    assert.equal(await page.locator('#passwordRecoveryForm [name="termsAccepted"]').count(),0);
    await page.locator('#passwordRecoveryForm [name="password"]').fill(password);
    await page.locator('#passwordRecoveryForm [name="confirmPassword"]').fill('Mismatch123');
    assert.equal(await page.locator('[data-recovery-password-error]').isVisible(),true);
    await page.locator('#passwordRecoveryForm [name="confirmPassword"]').fill(password);
    const code=await call('/api/account/password/reset',{phone,code:'111111',password:'tiny'});assert.equal(code.status,400);
    // The challenge is retained from the real SMS API; derive the known code via a captured initial SMS response.
    const smsPath=path.join(runtime,'data/sms-state.json');
    // Restart once with aged SMS timestamp; this also verifies persisted challenges.
    child.kill();await new Promise(r=>child.once('exit',r));
    const smsState=JSON.parse(fs.readFileSync(smsPath,'utf8'));smsState.codes[phone].lastSentAt=Date.now()-61000;fs.writeFileSync(smsPath,JSON.stringify(smsState));
    child=spawn(process.execPath,['server/server.js'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,HOST:'127.0.0.1',PORT:String(port),TURTLE_RUNTIME_DIR:runtime,MYSQL_HOST:'',MYSQL_URL:'',SMS_PROVIDER:'mock',SMS_MOCK:'true',APNS_KEY_PATH:'',APNS_KEY_BASE64:''}});
    child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
    for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/app/version')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}
    const smsResponse=page.waitForResponse(r=>r.url().endsWith('/api/sms/send'));
    await page.locator('[data-recovery-send-code]').click();
    const smsResult=await (await smsResponse).json();assert.equal(smsResult.ok,true);
    await page.waitForFunction(()=>document.querySelector('[data-recovery-send-code]').disabled);
    assert.match(await page.locator('[data-recovery-send-code]').innerText(),/秒后重试/);
    await page.locator('#passwordRecoveryForm [name="code"]').fill(smsResult.code);
    assert.equal(await page.evaluate(()=>state.accountMode),'reset','six-digit input must not auto-submit reset');
    for(const theme of ['teal','dark'])for(const width of [320,390,1280]){
      await page.setViewportSize({width,height:844});
      await page.evaluate(theme=>{state.themeColor=theme;render();},theme);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await page.locator('#passwordRecoveryForm [name="password"]').inputValue(),password,'rerender preserves ephemeral input');
      const codeBox=await page.locator('#passwordRecoveryForm [name="code"]').boundingBox();assert.ok(codeBox.width>=120,'six-digit code remains readable on narrow phones');
      await page.evaluate(()=>document.querySelectorAll('.toast').forEach(el=>el.remove()));
      await page.screenshot({path:path.join(output,'reset-'+theme+'-'+width+'-'+engine+'.png'),animations:'disabled'});
    }
    await page.setViewportSize({width:390,height:844});
    await page.route('**/api/account/password/reset', async route => { await new Promise(r=>setTimeout(r,200)); return route.continue(); });
    const response=page.waitForResponse(r=>r.url().endsWith('/api/account/password/reset'));
    await page.locator('#passwordRecoveryForm [type="submit"]').click();
    await page.evaluate(()=>render());
    assert.equal((await response).status(),200);
    await page.waitForSelector('#accountForm');
    assert.equal(await page.locator('#accountForm [name="phone"]').inputValue(),phone);
    assert.equal(await page.locator('#accountForm [name="password"]').inputValue(),'');
    assert.equal(await page.evaluate(()=>state.loggedInPhone),'');
    assert.equal((await call('/api/account/password/reset',{phone,code:smsResult.code,password:'ReplayPassword123'})).status,400);
    assert.equal((await call('/api/account/load',{phone,token:oldToken})).status,401);
    assert.equal((await call('/api/account/login',{phone,password:oldPassword,termsAccepted:true})).status,401);
    const logged=await call('/api/account/login',{phone,password,termsAccepted:true});assert.equal(logged.status,200);
    assert.ok(logged.body.user.data.turtles.some(t=>t.id==='keep-turtle'),'record survives password reset');
    await page.locator('#accountForm [name="password"]').fill(password);await page.locator('#accountForm [name="termsAccepted"]').check();
    const login=page.waitForResponse(r=>r.url().endsWith('/api/account/login'));await page.locator('#accountForm [type="submit"]').click();assert.equal((await login).status(),200);
    await page.waitForFunction(phone=>state.loggedInPhone===phone,phone);
    assert.deepEqual(errors,[]);
    const raw=fs.readFileSync(path.join(runtime,'data/app-data.json'),'utf8');
    assert.equal(raw.includes(password),false,'password is hashed');assert.equal(raw.includes(oldPassword),false);
    console.log('PASS password recovery integration: SMS, cooling, wrong code, purpose, persistence, layouts, reset, old session/password revocation, data preservation and new-password login.');
  }catch(e){console.error(logs.slice(-1800));throw e}
  finally{await browser?.close();if(child&&!child.killed)child.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
