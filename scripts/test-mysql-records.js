const assert = require('node:assert/strict');
const storage = require('../server/mysql-record-store');
const { Driver } = require('./mysql-record-test-driver');
const clone = value => JSON.parse(JSON.stringify(value));
const user = i => ({ id: 'user-' + i, phone: String(i), tokens: [], accountName: '用户' + i, data: {
  turtles: Array.from({ length: 50 }, (_, j) => ({ id: `t-${i}-${j}`, code: `G${j}`, price: 360, batchId: `b${i}`, photo: '/uploads/shared.jpg', status: '正常饲养', measureHistory: [] })),
  ledgerRecords: [], memos: [], breedingRecords: [], turtlePools: [] } });
const initial = { users: Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [String(i), user(i)])),
  messages: [{ id: 'same-id', text: '一' }, { id: 'same-id', text: '二' }, { text: 'legacy' }], reviews: [],
  appAnalytics: { days: { '2026-09-12': { count: 2 } } }, careReminderDeliveries: {}, arbitrary: { preserved: null } };
async function verify(connection, fullFixture) {
  await storage.migrate(connection, fullFixture);
  assert.equal(storage.canonical((await storage.load(connection)).database), storage.canonical(fullFixture), 'migration preserves every ID, photo, ordering, duplicate historical ID and unknown field');
  await assert.rejects(storage.migrate(connection, fullFixture), /拒绝/);
  await assert.rejects(storage.assertLegacyMode(connection), /禁止/);
  const store = await storage.MysqlRecordStore.open(connection);
  const before = Buffer.byteLength(JSON.stringify(store.data));
  store.data.users['20'].data.turtles[0].weight = 123;
  await store.write();
  assert.equal(store.lastWrite.scopes, 1, 'one account update cannot serialize another account');
  assert.equal(store.lastWrite.upserts, 1, 'one turtle edit writes one SQL record');
  assert.ok(store.lastWrite.bytes < 1500);
  console.log(`1000 accounts / 50000 turtles: old full write ${before} bytes; edited one turtle: ${store.lastWrite.bytes} bytes, ${store.lastWrite.upserts} SQL record.`);
  const data = store.data;
  data.users['20'].data.ledgerRecords.push({ id: 'loss', type: 'loss', turtleId: 't-20-0', amount: 360 });
  data.users['20'].data.turtles[0].status = '已死亡';
  data.users['20'].data.turtles[0].lossRecordId = 'loss';
  await store.write();
  const afterLoss = clone(data);
  data.users['21'].data.memos.unshift({ id: 'care', text: 'care' }); const first = store.write();
  data.users['22'].data.turtles[1].measureHistory.push({ id: 'growth', weight: 55 }); const second = store.write();
  await Promise.all([first, second]);
  data.messages.reverse(); await store.write();
  delete data.users['30']; await store.write();
  data.users['new'] = user('new'); await store.write();
  data.users['new'].data.turtles.splice(0, 2); await store.write();
  data.users['20'].data.ledgerRecords = []; await store.write();
  data.users['20'].data.turtles[0].status = '正常饲养'; delete data.users['20'].data.turtles[0].lossRecordId; await store.write();
  data.appAnalytics.days['2026-09-12'].count++; await store.write();
  const expected = clone(data);
  assert.equal(storage.canonical((await storage.load(connection)).database), storage.canonical(expected));
  await store.write(); assert.equal(store.lastWrite.upserts, 0); assert.equal(store.lastWrite.deletes, 0);
  await store.close();
  const restarted = await storage.MysqlRecordStore.open(connection);
  assert.equal(storage.canonical(restarted.data), storage.canonical(expected), 'restart preserves additions, deletions and undo without old-table resurrection');
  await restarted.close();
  return afterLoss;
}
(async () => {
  const fake = new Driver(initial);
  await verify(fake, initial);
  assert.equal(storage.canonical(fake.legacy), storage.canonical(initial), 'normal writes never touch the legacy whole-site row');
  let inserts = 0;
  const rollback = new Driver(initial); rollback.fail = sql => sql.startsWith('INSERT INTO turtlekeeper_records_v2') && ++inserts === 2;
  await assert.rejects(storage.migrate(rollback, initial), /injected/);
  assert.equal(rollback.rows.size, 0); assert.equal(rollback.meta, null);
  const store = await storage.MysqlRecordStore.open(fake);
  const durable = storage.canonical((await storage.load(fake)).database);
  fake.fail = sql => sql.startsWith('INSERT INTO turtlekeeper_records_v2');
  store.data.users['20'].accountName = 'failed';
  await assert.rejects(store.write(), /injected/);
  assert.throws(() => store.write(), /暂停/);
  assert.equal(storage.canonical((await storage.load(fake)).database), durable, 'partial transaction rolls back and later requests cannot overwrite it');
  fake.fail = null; await store.close().catch(() => {});
  const stale = await storage.MysqlRecordStore.open(fake); fake.meta.revision++;
  stale.data.users['20'].accountName = 'stale';
  await assert.rejects(stale.write(), /版本/); await stale.close().catch(() => {});
  const newer = new Driver(initial); newer.legacy.users['20'].accountName = 'changed after preflight';
  await assert.rejects(storage.migrate(newer, initial), /新写入/);
  assert.equal(newer.rows.size, 0);
  const corrupt = new Driver(initial); await storage.migrate(corrupt, initial);
  const key = [...corrupt.rows].find(([,row]) => row.record_id !== '0'.repeat(64))[0]; corrupt.rows.delete(key);
  await assert.rejects(storage.load(corrupt), /缺失/);
  const cutoverSource = { users: { '20': user(20) }, messages: [] };
  const cutover = new Driver(cutoverSource);
  await storage.migrate(cutover, cutoverSource);
  const active = await storage.MysqlRecordStore.open(cutover);
  await assert.rejects(storage.MysqlRecordStore.open(cutover), /已有写入进程/);
  active.data.users['20'].data.ledgerRecords.push({ id: 'after-migration', type: 'loss', amount: 360 });
  await active.write();
  const latest = clone(active.data), revision = cutover.meta.revision;
  await active.close();
  await assert.rejects(storage.rollbackToLegacy(cutover, latest, revision - 1), /发生变化/);
  cutover.fail = sql => sql.startsWith('INSERT INTO turtlekeeper_app_state');
  await assert.rejects(storage.rollbackToLegacy(cutover, latest, revision), /injected/);
  assert.equal(cutover.meta.active_mode, 'records', 'failed rollback cannot switch the active mode');
  assert.equal(storage.canonical(cutover.legacy), storage.canonical(cutoverSource));
  cutover.fail = null;
  await storage.rollbackToLegacy(cutover, latest, revision);
  assert.equal(cutover.meta.active_mode, 'legacy');
  assert.equal(storage.canonical(cutover.legacy), storage.canonical(latest), 'rollback retains records created after migration');
  await storage.assertLegacyMode(cutover);
  await assert.rejects(storage.MysqlRecordStore.open(cutover), /尚未迁移/);
  await assert.rejects(storage.migrate(cutover, latest), /目标记录表非空/);
  if (process.env.TEST_MYSQL_URL) {
    // Explicit opt-in only. Never loads server/.env; use a test DB user with
    // CREATE DATABASE permission. A random isolated schema is owned by this run.
    const mysql = require('mysql2/promise');
    const name = 'tk_record_test_' + require('node:crypto').randomBytes(8).toString('hex');
    const c = await mysql.createConnection(process.env.TEST_MYSQL_URL);
    let created = false;
    try {
      await c.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`); created = true;
      await c.query(`USE \`${name}\``);
      await c.query('CREATE TABLE turtlekeeper_app_state (id TINYINT PRIMARY KEY, payload JSON NOT NULL) ENGINE=InnoDB');
      await c.execute('INSERT INTO turtlekeeper_app_state VALUES (1, ?)', [JSON.stringify(initial)]);
      await verify(c, initial);
      await storage.acquireWriter(c);
      const latest = (await storage.load(c)).database;
      await storage.rollbackToLegacy(c, latest, (await storage.mode(c)).revision);
      await storage.assertLegacyMode(c);
      const [rolledBack] = await c.query('SELECT payload FROM turtlekeeper_app_state WHERE id = 1');
      assert.equal(storage.canonical(typeof rolledBack[0].payload === 'string' ? JSON.parse(rolledBack[0].payload) : rolledBack[0].payload), storage.canonical(latest));
      console.log('Real MySQL transaction, migration and restart checks passed.');
    } finally { try { if (created) await c.query(`DROP DATABASE \`${name}\``); } finally { await c.end(); } }
  } else console.log('Real MySQL not configured: SQL-double checks passed; run with TEST_MYSQL_URL in staging before production cutover.');
  console.log('Record storage passed: incremental writes, migration round trip, duplicate legacy IDs, array reorder, deletes, concurrent queue, rollback, stale versions, corrupt rows and restart.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
