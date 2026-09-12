const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function device() {
  const ctx = {
    CONFIGURED_SMS_BACKEND: true, POLICY_VERSION: 'test',
    TurtleLocalData: require('../assets/local-data-codec'),
    state: { loggedInPhone: 'account', cloudAccountUpdatedAt: 'revision-1', page: 'home', ledgerRecords: [] },
    pending: null, cloudRenders: 0, localRenders: 0, cloudHydrationComplete: true, cloudSyncInFlight: false,
    cloudSyncQueued: false, cloudImageMigrationInFlight: false,
    cloudSyncTimer: null, CLOUD_SYNC_DEBOUNCE_MS: 10,
    setTimeout: () => 1, clearTimeout() {},
    document: { querySelector: () => null, createElement: () => ({ dataset: {}, setAttribute() {}, querySelector: () => ({ addEventListener() {} }) }) },
    normalizeAccountData: data => clone(data), hasCloudSession: () => true, render() {},
    currentCloudToken: () => 'token', accountHasEmbeddedImages: () => false,
    accountDataSnapshot: state => ({ ledgerRecords: clone(state.ledgerRecords) }),
    saveState() {}, queueCloudSave() {}, toast() {}, console,
  };
  ctx.readPendingCloudData = () => ctx.pending;
  ctx.clearPendingCloudData = () => { ctx.pending = null; };
  ctx.persistPendingCloudData = () => {
    ctx.pending = { phone: ctx.state.loggedInPhone, baseUpdatedAt: ctx.state.cloudAccountUpdatedAt,
      baseDataRevision: ctx.state.cloudAccountDataRevision || '', conflict: ctx.state.cloudSyncConflict || null,
      data: ctx.accountDataSnapshot(ctx.state), updatedAt: new Date().toISOString() };
  };
  ctx.restorePendingCloudData = () => {
    if (!ctx.pending || ctx.pending.phone !== ctx.state.loggedInPhone) return false;
    Object.assign(ctx.state, clone(ctx.pending.data), { cloudAccountUpdatedAt: ctx.pending.baseUpdatedAt,
      cloudAccountDataRevision: ctx.pending.baseDataRevision || '', cloudSyncConflict: ctx.pending.conflict || null });
    return true;
  };
  ctx.applyCloudUser = user => {
    ctx.cloudRenders++;
    Object.assign(ctx.state, clone(user.data), { cloudAccountUpdatedAt: user.updatedAt });
  };
  ctx.setState = patch => { ctx.localRenders++; Object.assign(ctx.state, patch); };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function accountSyncSignature('), source.indexOf('async function startCloudSessionHydration(')), ctx);
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
  let retries = 0;
  let warnings = 0;
  d.apiPost = async () => { retries++; throw new Error('must not retry'); };
  d.toast = () => { warnings++; };
  for (let i = 0; i < 5; i++) {
    d.queueCloudSave();
    await d.pushCloudDataNow();
    d.pauseCloudSync();
  }
  assert.equal(retries, 0, 'paused sync cannot flood retries while navigating');
  assert.equal(warnings, 0, 'an existing conflict cannot flood toasts');
  assert.equal(d.pending.conflict.phone, 'account', 'pause is retained in the recovery journal');

  const e = device();
  e.state.cloudAccountUpdatedAt = '';
  e.state.ledgerRecords = [{ id: 'already-saved-loss', type: 'loss', amount: 450 }];
  e.persistPendingCloudData();
  e.apiPost = async () => ({ user: { phone: 'account', updatedAt: 'revision-8', dataRevision: 'hash-8', data: clone(e.pending.data) } });
  await e.refreshCloudAccountFromServer();
  assert.equal(e.pending, null, 'identical full snapshots repair empty legacy revisions without uploading');
  assert.equal(e.state.cloudAccountDataRevision, 'hash-8');

  const f = device();
  f.state.cloudAccountDataRevision = 'hash-1';
  f.state.ledgerRecords = [{ id: 'loss-during-notification', type: 'loss' }];
  f.persistPendingCloudData();
  f.apiPost = async (route, payload) => {
    assert.equal(payload.baseDataRevision, 'hash-1');
    return { user: { updatedAt: 'revision-9', dataRevision: 'hash-2' } };
  };
  await f.pushCloudDataNow(true);
  assert.equal(f.pending, null);

  const g = device();
  g.state.ledgerRecords = [{ id: 'different-note', type: 'loss', amount: 450, note: 'local' }];
  g.persistPendingCloudData();
  g.apiPost = async () => ({ user: { phone: 'account', updatedAt: 'revision-7', dataRevision: 'hash-7', data: { ledgerRecords: [{ id: 'different-note', type: 'loss', amount: 450, note: 'remote' }] } } });
  await g.syncCloudAccountManually();
  assert.equal(g.pending.data.ledgerRecords[0].note, 'local', 'matching totals cannot erase different record details');
  assert.equal(g.cloudSyncIsPaused(), true);
  let conflictWarnings = 0;
  g.toast = () => { conflictWarnings++; };
  g.cloudHydrationComplete = false;
  for (let i = 0; i < 3; i++) await g.refreshCloudAccountFromServer();
  assert.equal(g.cloudRenders, 0, 'startup must never briefly display cloud data over pending local edits');
  assert.equal(g.localRenders, 0, 'an unchanged journal must not redraw the current form');
  assert.equal(conflictWarnings, 0, 'repeated loads cannot reset and reannounce a persisted conflict');
  assert.equal(g.cloudHydrationComplete, true, 'protected local startup completes hydration');
  assert.equal(g.state.ledgerRecords[0].note, 'local');

  const h = device();
  h.apiPost = async () => ({ user: { phone: 'different-account', data: { ledgerRecords: [] } } });
  assert.equal(await h.refreshCloudAccountFromServer(), false);
  assert.equal(h.cloudRenders, 0, 'a mismatched account response cannot replace the current session');
  console.log('Account sync races passed: concurrent saves, cross-device refresh, pending recovery, load/edit races and stale-write preservation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
