'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const ROOT = '/www/turtlekeeper-app';
const SERVICE = 'turtlekeeper-api';
const TARGET = { id: 'ff2e7d9f-e236-40c9-9b2d-a8392f848cb8', title: '果核大尾种公', price: 3899 };
const OPERATION = 'market-stat-ff2e7d9f-134-1-20261002';
const HELPER = `function marketWantCount(item, excludeAdmin = false) {
  const phones = Array.isArray(item.wantedPhones) ? item.wantedPhones : [];
  const realCount = excludeAdmin ? phones.filter(phone => String(phone) !== REVIEW_ADMIN_PHONE).length : phones.length;
  const adjustment = Number(item.manualMetricAdjustment?.wantDelta || 0);
  return Math.max(0, realCount + (Number.isSafeInteger(adjustment) ? adjustment : 0));
}

`;
const replacements = [
  ['wantCount: (Array.isArray(listing.wantedPhones) ? listing.wantedPhones : []).length', 'wantCount: marketWantCount(listing)', 3],
  ['wantCount: (Array.isArray(item.wantedPhones) ? item.wantedPhones : []).length', 'wantCount: marketWantCount(item)', 1],
  ['wantCount: listing.wantedPhones.length', 'wantCount: marketWantCount(listing)', 1],
  ['const wantCount = (Array.isArray(item.wantedPhones) ? item.wantedPhones : []).filter(phone => String(phone) !== REVIEW_ADMIN_PHONE).length;', 'const wantCount = marketWantCount(item, true);', 1]
];
function ensure(ok, message) { if (!ok) throw new Error(message); }
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function patchServer(source) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const helper = HELPER.replaceAll('\n', eol);
  const installed = source.includes(helper);
  ensure(installed || !source.includes('function marketWantCount('), 'Unreviewed want-count helper; nothing changed');
  if (installed) {
    for (const after of new Set(replacements.map(item => item[1]))) {
      const count = replacements.filter(item => item[1] === after).reduce((sum, item) => sum + item[2], 0);
      ensure(source.split(after).length === count + 1, 'Unreviewed metric call sites; nothing changed');
    }
  } else for (const [before, after, count] of replacements) {
    ensure(source.split(before).length === count + 1, 'Unreviewed metric call sites; nothing changed');
    source = source.replaceAll(before, after);
  }
  if (!installed) {
    const anchor = 'function marketListingView(db, item, viewer = null) {';
    ensure(source.split(anchor).length === 2, 'Expected one market view function');
    source = source.replace(anchor, helper + anchor);
  }
  new vm.Script(source, { filename: 'server.js' });
  return source;
}
function targetListing(db) {
  const matches = (Array.isArray(db.marketListings) ? db.marketListings : []).filter(item => item.id === TARGET.id);
  ensure(matches.length === 1, 'Target listing not found or duplicated; nothing changed');
  const item = matches[0];
  ensure(item.title === TARGET.title && Number(item.price) === TARGET.price, 'Target title/price changed; nothing changed');
  return item;
}
function adjust(db, now = new Date().toISOString()) {
  const item = targetListing(db);
  if (item.manualMetricAdjustment?.operation === OPERATION) return false;
  ensure(!item.manualMetricAdjustment, 'An existing manual adjustment requires review');
  const exposure = Number(item.impressionCount || 0);
  const wanted = (Array.isArray(item.wantedPhones) ? item.wantedPhones : []).length;
  ensure(Number.isSafeInteger(exposure) && exposure >= 0 && exposure <= 134 && wanted <= 1, 'New real activity exceeds the requested counts; nothing changed');
  item.manualMetricAdjustment = { operation: OPERATION, source: 'owner-request', createdAt: now,
    previousImpressions: exposure, targetImpressions: 134, targetWants: 1, wantDelta: 1 - wanted };
  item.impressionCount = 134;
  return true;
}
function undoAdjustment(db, before) {
  const item = targetListing(db);
  ensure(item.manualMetricAdjustment?.operation === OPERATION, 'Adjustment changed; automatic data rollback refused');
  const exposure = Number(item.impressionCount);
  ensure(Number.isSafeInteger(exposure) && exposure >= 134, 'Exposure changed unexpectedly; automatic data rollback refused');
  // Preserve real impressions, views and wants received after the restart.
  item.impressionCount = exposure - (134 - Number(before.impressionCount || 0));
  if (Object.hasOwn(before, 'manualMetricAdjustment')) item.manualMetricAdjustment = before.manualMetricAdjustment;
  else delete item.manualMetricAdjustment;
}
function atomicWrite(file, bytes, mode = 0o600) {
  const temporary = file + '.stat-' + crypto.randomUUID() + '.tmp';
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', mode); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file);
  } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function runtimeEnv(app, root) {
  const env = { ...(app.pm2_env.env || {}), ...app.pm2_env };
  const file = path.join(root, 'server/.env');
  if (fs.existsSync(file)) for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('='); if (at < 0) continue;
    const key = line.slice(0, at).trim(); let value = line.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (env[key] === undefined) env[key] = value;
  }
  return env;
}
async function openStorage(root, env, readOnly = false, dependencies = {}) {
  const dir = path.join(root, 'server');
  if (!env.MYSQL_URL && !env.MYSQL_HOST) {
    const file = path.resolve(env.TURTLE_RUNTIME_DIR || dir, 'data/app-data.json');
    ensure(fs.realpathSync(file) === file && fs.lstatSync(file).isFile(), 'Data file symlink rejected');
    const original = fs.readFileSync(file), db = JSON.parse(original);
    ensure(db && typeof db === 'object' && !Array.isArray(db) && db.users && Array.isArray(db.marketListings), 'Invalid database; nothing changed');
    return { db, save: async () => {
      ensure(!readOnly && hash(fs.readFileSync(file)) === hash(original), 'Read-only or concurrent database change');
      atomicWrite(file, Buffer.from(JSON.stringify(db, null, 2)), fs.statSync(file).mode & 0o777);
    }, close: async () => {} };
  }
  const requireServer = dependencies.requireServer || createRequire(path.join(dir, 'server.js'));
  const mysql = requireServer('mysql2/promise');
  const connection = await mysql.createConnection(env.MYSQL_URL || { host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE || 'turtlekeeper', charset: 'utf8mb4' });
  try {
    const mode = env.MYSQL_STORAGE_MODE || 'legacy';
    ensure(['legacy', 'records'].includes(mode), 'Unknown storage mode');
    const records = requireServer('./mysql-record-store');
    if (!readOnly) await records.acquireWriter(connection);
    if (mode === 'records') {
      const meta = await records.mode(connection);
      ensure(meta?.active_mode === 'records', 'Records storage not active');
      const { database, packed } = await records.load(connection);
      const store = new records.MysqlRecordStore(connection, database, packed, meta.revision);
      return { db: store.data, save: async () => { ensure(!readOnly, 'Read-only storage'); await store.write(); }, close: () => connection.end() };
    }
    await records.assertLegacyMode(connection);
    const [rows] = await connection.query('SELECT payload FROM turtlekeeper_app_state WHERE id = 1');
    ensure(rows.length === 1, 'Missing legacy database; nothing changed');
    const db = typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
    const original = JSON.stringify(db);
    return { db, save: async () => {
      ensure(!readOnly, 'Read-only storage');
      const [latest] = await connection.query('SELECT payload FROM turtlekeeper_app_state WHERE id = 1');
      const current = typeof latest[0]?.payload === 'string' ? JSON.parse(latest[0].payload) : latest[0]?.payload;
      ensure(JSON.stringify(current) === original, 'Concurrent database change; nothing changed');
      await connection.execute('UPDATE turtlekeeper_app_state SET payload = ? WHERE id = 1', [JSON.stringify(db)]);
    }, close: () => connection.end() };
  } catch (error) { await connection.end().catch(() => {}); throw error; }
}
const runPm2 = args => {
  try { return execFileSync('pm2', args, { encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error('PM2 failed: ' + args[0]); }
};
async function health(port, route, body) {
  const res = await fetch('http://127.0.0.1:' + port + route, { redirect: 'error', signal: AbortSignal.timeout(3000),
    ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  return { status: res.status, json: await res.json() };
}
async function deploy({ mode, root = ROOT, platform = process.platform, run = runPm2, request = health,
  storage = openStorage, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), log = console.log } = {}) {
  ensure(platform === 'linux' && ['--check', '--apply'].includes(mode), 'Run --check/--apply on the Linux server');
  ensure(fs.realpathSync(root) === root, 'Unexpected project root');
  const file = path.join(root, 'server/server.js');
  ensure(fs.realpathSync(file) === file && fs.realpathSync(path.dirname(file)) === path.dirname(file), 'Server symlink rejected');
  const original = fs.readFileSync(file), patched = Buffer.from(patchServer(original.toString('utf8')));
  const fileMode = fs.statSync(file).mode & 0o777;
  function processInfo(online = true) {
    const entries = JSON.parse(run(['jlist'])).filter(item => item.name === SERVICE);
    ensure(entries.length === 1, 'Expected one API process');
    const app = entries[0], env = app.pm2_env;
    ensure(env.exec_mode === 'fork_mode' && env.pm_cwd === root && env.pm_exec_path === file && !env.watch &&
      (online ? env.status === 'online' && app.pid > 0 : env.status === 'stopped' && !app.pid), 'Unexpected API process state/configuration');
    return app;
  }
  const app = processInfo(), env = runtimeEnv(app, root), port = Number(env.PORT || 8787);
  ensure(Number.isInteger(port) && port > 0 && port < 65536, 'Invalid API port');
  const version = await request(port, '/api/app/version');
  ensure(version.status === 200 && version.json?.ok, 'Version API unavailable');
  const baseline = JSON.stringify(version.json);
  let store = await storage(root, env, true), before;
  try { before = JSON.parse(JSON.stringify(targetListing(store.db))); adjust(JSON.parse(JSON.stringify(store.db))); }
  finally { await store.close(); }
  const already = before.manualMetricAdjustment?.operation === OPERATION;
  log('PASS: exact listing ID/title/price, reviewed counters, storage and API process. Views and real want records will be preserved.');
  if (mode === '--check') return { status: 'checked' };
  if (already && original.equals(patched)) { log('ALREADY APPLIED: later real activity preserved; no counters reset.'); return { status: 'already' }; }
  const backups = path.join(root, 'server/backups'); fs.mkdirSync(backups, { recursive: true });
  ensure(fs.realpathSync(backups) === backups, 'Backup symlink rejected');
  const backup = fs.mkdtempSync(path.join(backups, 'market-stat-')); fs.chmodSync(backup, 0o700);
  fs.writeFileSync(path.join(backup, 'server.js'), original, { mode: 0o600, flag: 'wx' });
  log('Backup: ' + backup);
  let stopped = false, changed = false, wroteCode = false;
  const stop = () => { run(['stop', SERVICE, '--kill-timeout', '30000']); stopped = true; processInfo(false); };
  async function startAndVerify(expectedAdjustment) {
    run(['restart', SERVICE, '--kill-timeout', '30000']); stopped = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const current = processInfo(), currentVersion = await request(port, '/api/app/version');
        const detail = await request(port, '/api/market/detail', { listingId: TARGET.id });
        const item = detail.json.listing;
        if (current.pid !== app.pid && currentVersion.status === 200 && JSON.stringify(currentVersion.json) === baseline &&
          detail.status === 200 && item?.id === TARGET.id && (!expectedAdjustment || (item.impressionCount >= 134 && item.wantCount >= 1))) return;
      } catch {}
      await wait(500);
    }
    throw new Error('Post-restart API/version/listing check failed');
  }
  try {
    ensure(hash(fs.readFileSync(file)) === hash(original) && processInfo().pid === app.pid, 'Server changed during preflight');
    stop();
    store = await storage(root, env);
    try {
      before = JSON.parse(JSON.stringify(targetListing(store.db)));
      fs.writeFileSync(path.join(backup, 'database-before.json'), JSON.stringify(store.db), { mode: 0o600, flag: 'wx' });
      changed = adjust(store.db);
      ensure(hash(fs.readFileSync(file)) === hash(original), 'Concurrent source change');
      atomicWrite(file, patched, fileMode); wroteCode = true;
      if (changed) await store.save();
    } finally { await store.close(); }
    await startAndVerify(true);
  } catch (error) {
    try {
      if (!stopped) stop();
      if (changed) {
        store = await storage(root, env);
        try {
          const current = targetListing(store.db);
          if (current.manualMetricAdjustment?.operation === OPERATION) { undoAdjustment(store.db, before); await store.save(); }
          else ensure(JSON.stringify(current) === JSON.stringify(before), 'Concurrent listing change; data rollback needs review');
        } finally { await store.close(); }
      }
      if (wroteCode) { ensure(hash(fs.readFileSync(file)) === hash(patched), 'Concurrent source change; source rollback refused'); atomicWrite(file, original, fileMode); }
      await startAndVerify(false);
      log('ROLLED BACK: previous code and manual adjustment restored; new real activity retained.');
    } catch (failure) { throw new Error(error.message + '; rollback needs attention: ' + failure.message + '. Backup: ' + backup); }
    throw error;
  }
  log('SUCCESS: target listing exposure set to 134 and displayed wants to 1. Views and real want records preserved. Future activity continues accumulating.');
  return { status: 'installed', backup };
}
module.exports = { HELPER, TARGET, OPERATION, patchServer, adjust, undoAdjustment, openStorage, deploy };
if (require.main === module) deploy({ mode: process.argv.length === 3 ? process.argv[2] : '' }).catch(error => { console.error(error.message); process.exitCode = 1; });
