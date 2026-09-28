'use strict';

// Production CLI is deliberately pinned to one host. It never registers users,
// sends SMS/push, uploads media, or restores an older account snapshot.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const PRODUCTION = 'https://api.turtleworld.cn';
const ROUTES = new Set(['/api/account/login', '/api/account/load', '/api/account/save']);
const FIELDS = ['turtles', 'careRecords', 'memos', 'breedingRecords', 'turtlePools', 'ledgerRecords', 'careCustomItems', 'carePlans'];
const ARRAY_FIELDS = [...FIELDS, 'keptSpecies', 'customSpecies', 'satisfactionReviews', 'feedbackItems', 'marketFavoriteIds',
  'marketHistoryIds', 'pinnedConversationPhones', 'hiddenConversationPhones', 'activityLogs'];
const POLICIES = new Set(['2026-08-12', '2026-09-01']);
const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const fingerprint = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
class AcceptanceStop extends Error {
  constructor(code, detail = {}) { super(code); this.code = code; this.detail = detail; }
}
function guard(condition, code, detail) { if (!condition) throw new AcceptanceStop(code, detail); }
function validateCredentials(value) {
  guard(value && typeof value === 'object' && !Array.isArray(value), 'CREDENTIALS_INVALID');
  guard(/^1[3-9]\d{9}$/.test(value.phone || '') && typeof value.password === 'string' && value.password.length >= 6, 'CREDENTIALS_INVALID');
  guard(value.testAccountOnly === true, 'TEST_ACCOUNT_CONFIRMATION_REQUIRED');
  // The user supplies a version already accepted, not blanket acceptance of any
  // new agreement the test runner happens to know about.
  guard(POLICIES.has(value.acceptedTermsVersion), 'ALREADY_ACCEPTED_TERMS_VERSION_REQUIRED');
  return { phone: value.phone, password: value.password, testAccountOnly: true, acceptedTermsVersion: value.acceptedTermsVersion };
}

function transportFor(base, loopback = false) {
  const origin = new URL(base);
  guard(loopback ? origin.protocol === 'http:' && origin.hostname === '127.0.0.1'
    && origin.pathname === '/' && !origin.username && !origin.password && !origin.search && !origin.hash
    : base === PRODUCTION, 'ENDPOINT_NOT_ALLOWED');
  return async (route, payload) => {
    guard(ROUTES.has(route), 'ROUTE_NOT_ALLOWED');
    const body = Buffer.from(JSON.stringify(payload));
    guard(body.length <= 8 * 1024 * 1024, 'ACCOUNT_TOO_LARGE_FOR_BOUNDED_ACCEPTANCE');
    return new Promise((resolve, reject) => {
      // No global fetch, redirects, proxy environment, cookie jar or shared HTTP
      // agent. Every load uses a fresh connection and the returned cloud data.
      const request = (origin.protocol === 'https:' ? https : http).request(new URL(route, origin), {
        method: 'POST', agent: false, timeout: 20000, headers: { 'Content-Type': 'application/json',
          'Content-Length': body.length, 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache',
          'User-Agent': 'Turtlekeeper-Dedicated-Account-Acceptance/1.0' }
      }, response => {
        const chunks = []; let length = 0;
        response.on('data', chunk => {
          length += chunk.length;
          if (length > 16 * 1024 * 1024) return request.destroy(new AcceptanceStop('RESPONSE_TOO_LARGE'));
          chunks.push(chunk);
        });
        response.on('end', () => {
          try { resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
          catch { reject(new AcceptanceStop('RESPONSE_NOT_JSON', { status: response.statusCode })); }
        });
        response.on('error', () => reject(new AcceptanceStop('RESPONSE_INTERRUPTED')));
      });
      request.on('timeout', () => request.destroy(new AcceptanceStop('REQUEST_TIMEOUT_NO_RETRY')));
      request.on('error', error => reject(error instanceof AcceptanceStop ? error : new AcceptanceStop('NETWORK_FAILURE_NO_RETRY')));
      request.end(body);
    });
  };
}

function buildFixtures(runId) {
  const time = new Date().toISOString(), date = time.slice(0, 10), name = `验收-${runId.slice(-8)}`;
  const id = (field, kind) => `${runId}-${field}-${kind}`;
  const poolName = `${name}龟池`, turtleId = id('turtles', 'witness'), poolId = id('turtlePools', 'witness');
  const turtleRefs = [{ id: turtleId, code: `${name}档案`, speciesName: '果核蛋龟' }];
  const templates = {
    turtles: { code: `${name}档案`, nickname: `${name}档案`, speciesCode: 'GHG', speciesName: '果核蛋龟',
      gender: '母', stage: '种龟', status: '正常饲养', health: '健康', poolId, price: 0, acquiredDate: date,
      weight: '20', carapaceLength: '5', note: `${name}合成记录`, photo: '', measureHistory: [], createdAt: time },
    careRecords: { title: `${name}喂食`, date, itemId: 'feeding', poolId, poolName, turtleRefs,
      sourceMemoId: id('memos', 'witness'), note: `${name}合成记录`, createdAt: time, updatedAt: time },
    memos: { title: `${name}提醒`, dueDate: '2099-12-31', remindTime: '12:00', repeat: false, weekdays: [],
      reminderEnabled: false, lastCompletedDate: '', completedAt: '', turtleId, poolId, note: `${name}合成记录`, createdAt: time },
    breedingRecords: { date, motherId: turtleId, motherName: `${name}档案`, batchId: '', speciesCode: 'GHG', speciesName: '果核蛋龟',
      poolId, poolName, eggCount: 2, fertileCount: 1, hatchCount: 0, hatchEvents: [], note: `${name}合成记录`,
      photo: '', createdAt: time, editHistory: [] },
    turtlePools: { name: poolName, type: 'breeder', length: '60', width: '40', height: '30', count: 1,
      note: `${name}合成记录`, createdAt: time, updatedAt: time },
    ledgerRecords: { type: 'other', title: `${name}养护支出`, category: '其他', amount: 0.01,
      turtleId, poolId, poolName, recordDate: date, note: `${name}合成记录`, photo: '', createdAt: time },
    careCustomItems: { title: `${name}自定义养护`, createdAt: time },
    carePlans: { name: `${name}养护计划`, poolId, poolName, turtleRefs, note: `${name}合成记录`, createdAt: time, updatedAt: time }
  };
  const rows = Object.fromEntries(FIELDS.map(field => [field, ['witness', 'exercise'].map(kind => {
    const record = { ...clone(templates[field]), id: id(field, kind) };
    if (kind === 'exercise' && field === 'careCustomItems') record.title += '-操作';
    if (kind === 'exercise' && field === 'turtlePools') { record.name += '-操作'; record.count = 0; }
    return record;
  })]));
  return { rows, name, ids: Object.fromEntries(FIELDS.map(field => [field, rows[field].map(row => row.id)])) };
}

async function runAcceptance({ credentials: input, request, environment = 'production', reportDirectory, progress = () => {} }) {
  const runId = `accept-${new Date().toISOString().replace(/[-:.]/g, '').replace('Z', '')}-${crypto.randomBytes(4).toString('hex')}`;
  const fixtures = buildFixtures(runId), startedAt = new Date().toISOString();
  const report = { runId, environment, startedAt, status: 'running', namePrefix: fixtures.name,
    scope: 'Dedicated-account API persistence; synthetic run-owned records only; not native UI or real-device verification',
    preservation: { baselineCaptured: false, baselineUnchangedAtLastVerification: null },
    tests: [], requests: [], writesAttempted: 0, successfulDataWrites: 0, conflictProbes: 0,
    syntheticIds: fixtures.ids, retainedWitnessRecords: FIELDS.length,
    limitations: ['No native app relaunch, actual second device, offline network interruption, push delivery, database restart or power-loss durability test',
      'Fresh connections and sequential logical device sessions only; API roundtrip does not validate form UI or all business transitions',
      'Successful run keeps one marked witness per collection; failure stops without rollback or automatic cleanup'] };
  const filename = path.join(reportDirectory || path.join(root, 'output/release-acceptance'), `${environment}-account-${runId}.json`);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  let credentials, baseline, current, accountIdentity, lastAttempt;
  const ownIds = new Set(Object.values(fixtures.ids).flat());
  const record = (name, detail = {}) => { report.tests.push({ name, passed: true, ...detail }); progress(name); };
  const checkpoint = () => fs.writeFileSync(filename, JSON.stringify(report, null, 2), { mode: 0o600 });
  function inspect(user) {
    guard(user && typeof user === 'object' && user.phone === credentials.phone, 'ACCOUNT_IDENTITY_MISMATCH');
    guard(typeof user.token === 'string' && user.token.length >= 16, 'SESSION_RECEIPT_INCOMPLETE');
    guard(typeof user.dataRevision === 'string' && /^[a-f0-9]{64}$/i.test(user.dataRevision), 'REVISION_REQUIRED_BEFORE_WRITING');
    guard(typeof user.accountName === 'string' && typeof user.accountAvatar === 'string'
      && typeof user.isCommunityAdmin === 'boolean', 'ACCOUNT_RECEIPT_INCOMPLETE');
    guard(user.data && typeof user.data === 'object' && !Array.isArray(user.data), 'ACCOUNT_DATA_INVALID');
    for (const field of ARRAY_FIELDS) guard(Array.isArray(user.data[field]), 'COLLECTION_MISSING_OR_INVALID', { field });
    for (const field of FIELDS) {
      const ids = user.data[field].map(row => row && typeof row === 'object' && !Array.isArray(row) ? row.id : null);
      guard(ids.every(id => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length, 'RECORD_IDENTIFIERS_INVALID', { field });
    }
    if (accountIdentity) guard(fingerprint([user.accountName, user.accountAvatar, user.isCommunityAdmin]) === accountIdentity, 'ACCOUNT_PROFILE_CHANGED');
    return user;
  }
  function preserve(data) {
    guard(baseline, 'BASELINE_NOT_CAPTURED');
    guard(Object.keys(data).sort().join('\n') === Object.keys(baseline).sort().join('\n'), 'ACCOUNT_FIELDS_CHANGED');
    for (const field of Object.keys(baseline)) {
      const projected = FIELDS.includes(field) ? data[field].filter(row => !ownIds.has(row.id)) : data[field];
      guard(fingerprint(projected) === fingerprint(baseline[field]), 'BASELINE_CHANGED_STOPPED', { field });
    }
    report.preservation.baselineUnchangedAtLastVerification = true;
  }
  function exact(user, expected) {
    inspect(user); preserve(user.data);
    guard(fingerprint(user.data) === fingerprint(expected), 'DATA_RECEIPT_MISMATCH_STOPPED');
  }
  async function call(route, payload, phase) {
    lastAttempt = { route, phase };
    const entry = { route, phase, method: 'POST', startedAt: new Date().toISOString() };
    report.requests.push(entry); checkpoint();
    let result;
    try { result = await request(route, payload); }
    catch (error) { entry.error = error instanceof AcceptanceStop ? error.code : 'TRANSPORT_FAILURE'; throw error; }
    entry.status = result.status; checkpoint();
    return result;
  }
  function ok(result) {
    guard(result.status === 200 && result.body?.ok === true, 'API_REQUEST_REJECTED', { status: result.status });
    return result.body.user;
  }
  const auth = user => ({ phone: credentials.phone, token: user.token, termsVersion: credentials.acceptedTermsVersion });
  async function load(user, expected, phase) {
    const next = inspect(ok(await call('/api/account/load', auth(user), phase)));
    if (expected) exact(next, expected);
    return next;
  }
  async function login(device, expected) {
    const user = inspect(ok(await call('/api/account/login', { phone: credentials.phone, password: credentials.password,
      termsAccepted: true, termsVersion: credentials.acceptedTermsVersion, deviceId: `${runId}-device-${device}`,
      devicePlatform: device === 'a' ? 'ios' : 'web' }, `login-device-${device}`)));
    if (expected) exact(user, expected);
    return user;
  }
  async function verifyPreviousSession(previous, expected) {
    const result = await call('/api/account/load', auth(previous), 'previous-device-session-policy');
    if (report.sessionPolicy === 'admin-up-to-three-devices') {
      exact(inspect(ok(result)), expected);
      record('Previous admin device remains authorized with identical records');
    } else {
      guard(result.status === 401 && result.body?.ok === false, 'SINGLE_DEVICE_SESSION_POLICY_MISMATCH', { status: result.status });
      record('Previous ordinary-account device is no longer authorized');
    }
  }
  async function save(nextData, phase) {
    // Always freshly load and compare the whole last verified snapshot before a
    // write. A concurrent external change stops the run instead of being merged
    // or overwritten. The revision used below came from this exact load.
    current = await load(current, current.data, `${phase}-prewrite-load`);
    preserve(nextData);
    guard(nextData.memos.filter(row => ownIds.has(row.id)).every(row => row.reminderEnabled === false), 'SYNTHETIC_REMINDER_MUST_BE_DISABLED');
    const oldRevision = current.dataRevision;
    report.writesAttempted++; checkpoint();
    const saved = inspect(ok(await call('/api/account/save', { ...auth(current), accountName: current.accountName,
      accountAvatar: current.accountAvatar, baseDataRevision: current.dataRevision, data: nextData }, phase)));
    exact(saved, nextData);
    guard(saved.dataRevision !== oldRevision, 'SAVE_REVISION_DID_NOT_CHANGE');
    current = saved; report.successfulDataWrites++; checkpoint();
    for (let i = 1; i <= 2; i++) {
      const observed = await load(current, nextData, `${phase}-fresh-load-${i}`);
      guard(observed.dataRevision === current.dataRevision, 'REVISION_CHANGED_DURING_VERIFICATION');
      current = observed;
    }
    for (const field of FIELDS) record(`${phase}: ${field} receipt and two fresh loads match`);
    return oldRevision;
  }
  try {
    credentials = validateCredentials(input);
    report.acceptedTermsVersion = credentials.acceptedTermsVersion;
    current = await login('a');
    accountIdentity = fingerprint([current.accountName, current.accountAvatar, current.isCommunityAdmin]);
    report.sessionPolicy = current.isCommunityAdmin ? 'admin-up-to-three-devices' : 'ordinary-one-device';
    baseline = clone(current.data); report.preservation.baselineCaptured = true;
    report.preservation.baselineCounts = Object.fromEntries(ARRAY_FIELDS.map(field => [field, baseline[field].length]));
    report.preservation.baselineFingerprint = fingerprint(baseline);
    guard(FIELDS.every(field => !baseline[field].some(row => ownIds.has(row.id))), 'RUN_ID_COLLISION');
    current = await load(current, baseline, 'baseline-fresh-load');
    record('Identity, complete collections, original fingerprints and server revision checked before writes');

    const created = clone(current.data);
    for (const field of FIELDS) created[field].push(...clone(fixtures.rows[field]));
    const earlierRevision = await save(created, 'create');

    // Safe CAS rejection probe: an earlier server-returned revision with the
    // exact CURRENT data. Even a broken server that accepts it would not erase
    // any data. A non-409 response stops all further edits/deletions immediately.
    current = await load(current, current.data, 'conflict-probe-preload');
    report.conflictProbes++; checkpoint();
    const conflict = await call('/api/account/save', { ...auth(current), accountName: current.accountName,
      accountAvatar: current.accountAvatar, baseDataRevision: earlierRevision, data: current.data }, 'stale-revision-identical-data-probe');
    guard(conflict.status === 409 && conflict.body?.ok === false, 'SERVER_DID_NOT_ENFORCE_CAS', { status: conflict.status });
    const afterConflict = await load(current, current.data, 'conflict-probe-postload');
    guard(afterConflict.dataRevision === current.dataRevision, 'CONFLICT_CHANGED_DATA_REVISION');
    current = afterConflict; record('Stale server revision rejected with 409; current data remained unchanged');

    const deviceA = current;
    current = await login('b', current.data);
    await verifyPreviousSession(deviceA, current.data);
    current = await load(current, current.data, 'device-b-fresh-load');
    record('Second logical device reloads all created records');
    const edited = clone(current.data);
    for (const field of FIELDS) {
      const row = edited[field].find(item => item.id === fixtures.ids[field][1]);
      if (field === 'careCustomItems') row.title += '-改';
      else { row.note += '-已编辑'; if (field === 'turtles') row.weight = '21'; if (field === 'ledgerRecords') row.amount = 0.02;
        if (field === 'breedingRecords') row.eggCount = 3; if (field === 'turtlePools') row.length = '61'; }
    }
    await save(edited, 'edit');

    const deviceB = current;
    current = await login('a', current.data);
    await verifyPreviousSession(deviceB, current.data);
    current = await load(current, current.data, 'renewed-device-a-fresh-load');
    record('Renewed first logical device reloads all edited records without local cache');
    const deleted = clone(current.data);
    for (const field of FIELDS) deleted[field] = deleted[field].filter(row => row.id !== fixtures.ids[field][1]);
    await save(deleted, 'delete-run-exercise-record');
    for (const field of FIELDS) {
      guard(current.data[field].filter(row => ownIds.has(row.id)).length === 1
        && current.data[field].some(row => row.id === fixtures.ids[field][0]), 'WITNESS_RECORD_MISSING', { field });
    }
    preserve(current.data); report.status = 'passed';
    report.finalCounts = Object.fromEntries(ARRAY_FIELDS.map(field => [field, current.data[field].length]));
    record('Original data unchanged; only one synthetic witness per tested collection remains');
  } catch (error) {
    report.status = 'stopped';
    report.failure = { code: error instanceof AcceptanceStop ? error.code : 'UNEXPECTED_FAILURE_REDACTED',
      ...(error instanceof AcceptanceStop ? error.detail : {}), phase: lastAttempt?.phase || 'preflight' };
    report.possibleUnverifiedWrite = lastAttempt?.route === '/api/account/save';
    report.cleanup = 'No rollback, retry, restore or cleanup was attempted. Inspect this run prefix before further changes.';
    report.tests.push({ name: 'Stopped immediately on failed safety or consistency check', passed: false, code: report.failure.code });
  } finally {
    report.completedAt = new Date().toISOString(); checkpoint();
  }
  return { report, filename };
}

async function main(argv) {
  guard(argv.length === 2 && argv[0] === '--credentials' && argv[1], 'USAGE_EXPECTED_CREDENTIALS_FILE');
  let input;
  try {
    const file = path.resolve(argv[1]), stat = fs.statSync(file);
    guard(stat.isFile() && stat.size <= 16384, 'CREDENTIALS_FILE_INVALID');
    input = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch { throw new AcceptanceStop('CREDENTIALS_FILE_UNREADABLE_OR_INVALID'); }
  const result = await runAcceptance({ credentials: input, request: transportFor(PRODUCTION), progress: name => console.log(`PASS ${name}`) });
  console.log(JSON.stringify({ status: result.report.status, runId: result.report.runId, namePrefix: result.report.namePrefix,
    report: result.filename, failure: result.report.failure || null, successfulDataWrites: result.report.successfulDataWrites }, null, 2));
  if (result.report.status !== 'passed') process.exitCode = 1;
}
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error(error instanceof AcceptanceStop ? error.code : 'UNEXPECTED_FAILURE_REDACTED'); process.exitCode = 1;
});
// Explicit test seam: the production CLI has no URL/environment override.
module.exports = { runAcceptance, validateCredentials, createLoopbackTransport: base => transportFor(base, true), fingerprint, FIELDS, AcceptanceStop };
