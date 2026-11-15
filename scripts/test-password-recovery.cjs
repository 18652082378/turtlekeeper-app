'use strict';
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createPasswordRecovery } = require('../server/password-recovery');
function harness(mode = 'mock') {
  const phone = '13900002000', codes = new Map();
  let db = { users: { [phone]: { phone, data: { turtles: [{ id: 'keep' }] }, tokens: [{ hash: 'old-token' }], pushDevices: [{ token: 'old-device' }] } } }, writes = 0;
  const h = { codes, phone, check: async () => true, get db() { return db; }, get writes() { return writes; } };
  h.api = createPasswordRecovery({
    smsCodes: codes, readDatabase: () => structuredClone(db),
    writeDatabase: next => { db = next; writes++; }, validPhone: p => /^1[3-9]\d{9}$/.test(p),
    sendJson: (_, status, body) => ({ status, body }), persistSmsState: () => {}, forgetCode: p => codes.delete(p),
    hashPassword: p => ({ salt: 'new-salt', hash: crypto.createHash('sha256').update(p).digest('hex') }),
    sms: { mode: () => mode, check: (...args) => h.check(...args) }
  });
  h.challenge = () => { codes.set(phone, { purpose:'reset_password', mode, salt:'salt', codeHash:crypto.createHash('sha256').update('salt:'+phone+':123456').digest('hex'), expiresAt:Date.now()+300000 }); };
  h.reset = (patch={}) => h.api.reset({}, {}, {phone,code:'123456',password:'NewPassword123',...patch});
  return h;
}
(async () => {
  let h=harness();
  assert.equal((await h.reset()).status,400,'a challenge is required to reset');
  h.challenge(); h.codes.get(h.phone).purpose='register'; assert.equal((await h.reset()).status,400,'registration code cannot reset');
  h.challenge(); h.codes.get(h.phone).expiresAt=1; assert.equal((await h.reset()).status,400);
  h.challenge(); for(let i=0;i<5;i++) assert.equal((await h.reset({code:'000000'})).status,400);
  assert.equal((await h.reset()).status,400); assert.equal(h.writes,0);
  h.challenge(); assert.equal((await h.reset({password:'short'})).status,400); assert.equal((await h.reset({password:'x'.repeat(129)})).status,400);
  assert.equal((await h.reset()).status,200); assert.deepEqual(h.db.users[h.phone].data,{turtles:[{id:'keep'}]});
  assert.deepEqual(h.db.users[h.phone].tokens,[]); assert.deepEqual(h.db.users[h.phone].pushDevices,[]);
  assert.equal((await h.reset()).status,400,'single-use code'); assert.equal(h.writes,1);
  h=harness('aliyun-pnvs'); h.challenge();
  let resolve; h.check=()=>new Promise(r=>resolve=r);
  const first=h.reset(); assert.equal((await h.reset()).status,429,'parallel provider checks cannot reuse a code');
  h.db.users[h.phone].data.turtles.push({id:'saved-while-verifying'}); resolve(true); assert.equal((await first).status,200);
  assert.equal(h.db.users[h.phone].data.turtles.length,2,'provider yield must preserve concurrent record changes');
  h=harness('aliyun-pnvs'); h.challenge(); h.check=()=>new Promise(r=>resolve=r);
  const stale=h.reset(); h.codes.delete(h.phone); resolve(true); assert.equal((await stale).status,400); assert.equal(h.writes,0);
  h=harness('aliyun-pnvs'); h.challenge(); h.check=()=>Promise.reject(Error('provider down'));
  await assert.rejects(h.reset(),/provider down/); h.check=async()=>true; assert.equal((await h.reset()).status,200,'provider failures release lock');
  h=harness(''); h.challenge();
  assert.equal((await h.reset()).status,503,'unconfigured provider must not enable password reset');
  assert.equal(h.writes,0);
  console.log('PASS password recovery domain: purpose, expiry, retries, one-use, concurrent provider, latest records and session revocation.');
})().catch(e=>{console.error(e);process.exitCode=1});
