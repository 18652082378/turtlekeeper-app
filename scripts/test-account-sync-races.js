const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function device() {
  const ctx = {
    CONFIGURED_SMS_BACKEND: true, POLICY_VERSION: 'test',
    state: { loggedInPhone: 'account', cloudAccountUpdatedAt: 'revision-1', page: 'home', ledgerRecords: [] },
    pending: null, cloudHydrationComplete: true, cloudSyncInFlight: false,
    cloudSyncQueued: false, cloudImageMigrationInFlight: false,
    currentCloudToken: () => 'token', accountHasEmbeddedImages: () => false,
    accountDataSnapshot: state => ({ ledgerRecords: clone(state.ledgerRecords) }),
    saveState() {}, queueCloudSave() {}, toast() {}, console,
  };
  ctx.readPendingCloudData = () => ctx.pending;
  ctx.clearPendingCloudData = () => { ctx.pending = null; };
  ctx.persistPendingCloudData = () => {
    ctx.pending = { phone: ctx.state.loggedInPhone, baseUpdatedAt: ctx.state.cloudAccountUpdatedAt,
      data: ctx.accountDataSnapshot(ctx.state), updatedAt: new Date().toISOString() };
  };
  ctx.restorePendingCloudData = () => {
    if (!ctx.pending || ctx.pending.phone !== ctx.state.loggedInPhone) return false;
    Object.assign(ctx.state, clone(ctx.pending.data), { cloudAccountUpdatedAt: ctx.pending.baseUpdatedAt });
    return true;
  };
  ctx.applyCloudUser = user => {
    Object.assign(ctx.state, clone(user.data), { cloudAccountUpdatedAt: user.updatedAt });
  };
  ctx.setState = patch => Object.assign(ctx.state, patch);
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('async function pushCloudDataNow('), source.indexOf('async function startCloudSessionHydration(')), ctx);
  return ctx;
}
(async () => {
  const a = device();
  a.state.ledgerRecords = [{ id: 'sale-1', type: 'sold' }];
  a.persistPendingCloudData();
  let resolveSave;
  a.apiPost = () => new Promise(resolve => { resolveSave = resolve; });
  const saving = a.pushCloudDataNow(true);
  a.state.ledgerRecords.push({ id: 'loss-2', type: 'loss' });
  a.persistPendingCloudData();
  resolveSave({ user: { updatedAt: 'revision-2' } });
  await saving;
  assert.equal(a.pending.data.ledgerRecords.length, 2, 'save acknowledgment cannot clear edits made during upload');
  assert.equal(a.pending.baseUpdatedAt, 'revision-2');

  const b = device();
  b.apiPost = async () => ({ user: { phone: 'account', updatedAt: 'revision-3', data: { ledgerRecords: clone(a.pending.data.ledgerRecords) } } });
  assert.equal(await b.refreshCloudAccountFromServer({ background: true }), true);
  assert.equal(b.state.ledgerRecords.length, 2, 'idle second device receives sales and losses');
  b.state.ledgerRecords.push({ id: 'local-loss', type: 'loss' });
  b.persistPendingCloudData();
  assert.equal(await b.refreshCloudAccountFromServer({ background: true }), false, 'background refresh must preserve unsent edits');
  await b.refreshCloudAccountFromServer();
  assert.ok(b.state.ledgerRecords.some(record => record.id === 'local-loss'));
  assert.ok(b.pending, 'startup retains a pending journal regardless of device clock');

  const c = device();
  let resolveLoad;
  c.apiPost = () => new Promise(resolve => { resolveLoad = resolve; });
  const loading = c.refreshCloudAccountFromServer({ background: true });
  c.state.ledgerRecords.push({ id: 'edit-during-load', type: 'sold' });
  c.persistPendingCloudData();
  resolveLoad({ user: { phone: 'account', updatedAt: 'revision-2', data: { ledgerRecords: [] } } });
  assert.equal(await loading, false);
  assert.equal(c.state.ledgerRecords[0].id, 'edit-during-load');

  const d = device();
  d.state.ledgerRecords = [{ id: 'conflicted-loss', type: 'loss' }];
  d.persistPendingCloudData();
  d.apiPost = async () => { throw Object.assign(new Error('stale device'), { code: 'ACCOUNT_DATA_CONFLICT' }); };
  await assert.rejects(d.pushCloudDataNow(true), /stale device/);
  assert.equal(d.pending.data.ledgerRecords[0].id, 'conflicted-loss');
  console.log('Account sync races passed: concurrent saves, cross-device refresh, pending recovery, load/edit races and stale-write preservation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
