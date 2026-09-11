// Record-level persistence behind the existing API. Only one process may own
// the in-memory catalogue; GET_LOCK makes that restriction explicit.
const crypto = require('node:crypto');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
const clone = value => JSON.parse(JSON.stringify(value));
const assign = (object, key, value) => Object.defineProperty(object, key, { value, enumerable: true, configurable: true, writable: true });
const TABLE = 'turtlekeeper_records_v2';
const META = 'turtlekeeper_storage_v2';
async function schema(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS ${META} (id TINYINT UNSIGNED PRIMARY KEY, active_mode VARCHAR(16) NOT NULL, revision BIGINT UNSIGNED NOT NULL, source_hash CHAR(64) NOT NULL) ENGINE=InnoDB`);
  await connection.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (scope_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, record_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, payload JSON NOT NULL, PRIMARY KEY (scope_id, record_id)) ENGINE=InnoDB`);
}
async function mode(connection) {
  try {
    const [rows] = await connection.query(`SELECT active_mode, revision, source_hash FROM ${META} WHERE id = 1`);
    return rows[0] || null;
  } catch (error) { if (error.code === 'ER_NO_SUCH_TABLE') return null; throw error; }
}
async function assertLegacyMode(connection) {
  if ((await mode(connection))?.active_mode === 'records') throw new Error('已启用分记录存储，禁止读取或写入旧整站表；请使用新版服务或先执行回滚导出');
}
async function acquireWriter(connection) {
  const [rows] = await connection.query("SELECT GET_LOCK(SHA2(CONCAT('turtlekeeper:', DATABASE()), 256), 0) AS acquired");
  if (Number(rows[0]?.acquired) !== 1) throw new Error('数据库已有写入进程，请停止旧 API；当前存储只允许一个 API 实例');
}
async function releaseWriter(connection) {
  await connection.query("SELECT RELEASE_LOCK(SHA2(CONCAT('turtlekeeper:', DATABASE()), 256))");
}
async function upsertRows(connection, rows, update = true) {
  let chunk = [], bytes = 0;
  const flush = async () => {
    if (!chunk.length) return;
    await connection.execute(`INSERT INTO ${TABLE} (scope_id, record_id, payload) VALUES ${chunk.map(() => '(?, ?, ?)').join(', ')}${update ? ' ON DUPLICATE KEY UPDATE payload = VALUES(payload)' : ''}`,
      chunk.flatMap(row => [row.scope, row.id, row.payload]));
    chunk = []; bytes = 0;
  };
  for (const row of rows) {
    const size = Buffer.byteLength(row.payload);
    if (chunk.length && (chunk.length >= 100 || bytes + size > 512 * 1024)) await flush();
    chunk.push(row); bytes += size;
  }
  await flush();
}
function scopes(database) {
  const result = new Map();
  // Every user is its own dirty scope. Global lists are separate scopes; their
  // members are separate SQL rows. No user save scans other users or messages.
  for (const [field, value] of Object.entries(database)) {
    if (field === 'users') {
      result.set(JSON.stringify(['users']), {});
      for (const [phone, user] of Object.entries(value || {})) result.set(JSON.stringify(['users', phone]), user);
    } else result.set(JSON.stringify([field]), value);
  }
  return result;
}
function pack(scope, value) {
  const rows = new Map(), layout = [];
  const walk = (value, path) => {
    if (Array.isArray(value)) {
      const occurrences = new Map();
      const ids = value.map((record, index) => {
        const identity = record && typeof record === 'object' && record.id ? ['id', String(record.id)] : ['position', index];
        const name = JSON.stringify([path, identity]);
        const occurrence = occurrences.get(name) || 0; occurrences.set(name, occurrence + 1);
        const id = hash(JSON.stringify([path, identity, occurrence]));
        rows.set(id, JSON.stringify({ value: record }));
        return id;
      });
      layout.push({ path, ids });
      return [];
    }
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item, [...path, key])]));
    return value;
  };
  const shell = walk(value, []);
  rows.set('0'.repeat(64), JSON.stringify({ scope: JSON.parse(scope), shell, layout }));
  return rows;
}
function unpack(rows) {
  const metadata = rows.get('0'.repeat(64));
  if (!metadata) throw new Error('分记录存储缺少目录，拒绝以空数据启动');
  const { scope, shell, layout } = JSON.parse(metadata);
  if (!Array.isArray(scope) || !Array.isArray(layout)) throw new Error('存储目录无效');
  let value = shell;
  const used = new Set(['0'.repeat(64)]);
  for (const { path, ids } of layout) {
    const list = ids.map(id => {
      if (!rows.has(id) || used.has(id)) throw new Error('分记录存储缺失或重复，已停止读取');
      used.add(id); return JSON.parse(rows.get(id)).value;
    });
    if (!path.length) value = list;
    else {
      let parent = value;
      for (const key of path.slice(0, -1)) {
        if (!Object.hasOwn(parent, key)) throw new Error('存储路径无效');
        parent = parent[key];
      }
      assign(parent, path[path.length - 1], list);
    }
  }
  if (used.size !== rows.size) throw new Error('检测到未关联的存储记录，已停止读取');
  return { scope, value };
}
async function load(connection) {
  const [rows] = await connection.query(`SELECT scope_id, record_id, payload FROM ${TABLE}`);
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.scope_id)) groups.set(row.scope_id, new Map());
    groups.get(row.scope_id).set(row.record_id, typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload));
  }
  const database = {}, packed = new Map();
  const decoded = [...groups.entries()].map(([key, value]) => ({ key, rows: value, ...unpack(value) })).sort((a, b) => a.scope.length - b.scope.length);
  for (const item of decoded) {
    const key = JSON.stringify(item.scope);
    if (hash(key) !== item.key || packed.has(key)) throw new Error('存储分区校验失败');
    packed.set(key, pack(key, item.value));
    if (item.scope.length === 1) assign(database, item.scope[0], item.value);
    else if (item.scope.length === 2 && item.scope[0] === 'users' && database.users) assign(database.users, item.scope[1], item.value);
    else throw new Error('存储分区路径无效');
  }
  if (!Object.hasOwn(database, 'users')) throw new Error('缺少账户目录，拒绝以空数据库启动');
  return { database, packed };
}
function track(database, mark) {
  const proxies = new WeakMap(), raw = new WeakMap();
  const wrap = (object, path) => {
    if (!object || typeof object !== 'object') return object;
    if (raw.has(object)) return object;
    if (proxies.has(object)) return proxies.get(object);
    const changed = key => {
      const parts = [...path, String(key)];
      if (parts[0] === 'users' && parts.length >= 2) mark(JSON.stringify(parts.slice(0, 2)));
      else mark(JSON.stringify(parts.slice(0, 1)));
    };
    const proxy = new Proxy(object, {
      get(target, key, receiver) { return typeof key === 'symbol' ? Reflect.get(target, key, receiver) : wrap(Reflect.get(target, key, receiver), [...path, String(key)]); },
      set(target, key, value) { const unwrapped = raw.get(value) || value; if (target[key] !== unwrapped) { changed(key); if (key === '__proto__') assign(target, key, unwrapped); else Reflect.set(target, key, unwrapped); } return true; },
      deleteProperty(target, key) { if (Object.hasOwn(target, key)) { changed(key); delete target[key]; } return true; },
      defineProperty(target, key, descriptor) { changed(key); return Reflect.defineProperty(target, key, descriptor); }
    });
    proxies.set(object, proxy); raw.set(proxy, object); return proxy;
  };
  return wrap(database, []);
}
class MysqlRecordStore {
  constructor(connection, database, packed, revision) {
    this.connection = connection; this.packed = packed; this.revision = Number(revision); this.dirty = new Set();
    this.failure = null; this.queue = Promise.resolve(); this.lastWrite = { scopes: 0, upserts: 0, deletes: 0, bytes: 0 };
    this.data = track(database, key => this.dirty.add(key));
  }
  static async open(connection) {
    await acquireWriter(connection);
    try {
      const metadata = await mode(connection);
      if (metadata?.active_mode !== 'records') throw new Error('分记录存储尚未迁移，请先执行 migrate-mysql-records.js 的校验和切换');
      const { database, packed } = await load(connection);
      return new MysqlRecordStore(connection, database, packed, metadata.revision);
    } catch (error) { await releaseWriter(connection).catch(() => {}); throw error; }
  }
  assertHealthy() { if (this.failure) throw new Error('数据库保存失败，已暂停读写保护数据；请检查数据库后重启服务', { cause: this.failure }); }
  write(database = this.data) {
    this.assertHealthy();
    // Maintenance code may return a new root. Adopt changed roots through the
    // tracker, while ordinary calls pass the tracked catalogue directly.
    if (database !== this.data) {
      for (const field of Object.keys(this.data)) if (!Object.hasOwn(database, field)) delete this.data[field];
      for (const [field, value] of Object.entries(database)) if (this.data[field] !== value) this.data[field] = value;
    }
    let keys = [...this.dirty]; this.dirty.clear();
    if (keys.includes('["users"]')) keys = [...new Set([...keys, ...[...this.packed.keys()].filter(k => JSON.parse(k)[0] === 'users'), ...Object.keys(this.data.users || {}).map(phone => JSON.stringify(['users', phone]))])];
    const changes = [], pending = [];
    for (const scope of keys) {
      const path = JSON.parse(scope);
      const exists = path.length === 1 ? Object.hasOwn(this.data, path[0]) : Object.hasOwn(this.data[path[0]] || {}, path[1]);
      const value = path.length === 1 ? path[0] === 'users' ? {} : this.data[path[0]] : this.data[path[0]]?.[path[1]];
      const next = exists ? pack(scope, value) : new Map(), before = this.packed.get(scope) || new Map();
      for (const [id, payload] of next) if (before.get(id) !== payload) changes.push({ scope: hash(scope), id, payload });
      for (const id of before.keys()) if (!next.has(id)) changes.push({ scope: hash(scope), id, payload: null });
      pending.push([scope, next]);
    }
    this.lastWrite = { scopes: keys.length, upserts: changes.filter(c => c.payload !== null).length, deletes: changes.filter(c => c.payload === null).length,
      bytes: changes.reduce((sum, c) => sum + (c.payload === null ? 0 : Buffer.byteLength(c.payload)), 0) };
    if (!changes.length) return this.flush();
    // This index represents the queued state, so overlapping requests only
    // queue their own deltas. Any failure poisons all subsequent writes.
    for (const [scope, next] of pending) if (next.size) this.packed.set(scope, next); else this.packed.delete(scope);
    const expected = this.revision++;
    const task = this.queue.then(async () => {
      this.assertHealthy();
      await this.connection.beginTransaction();
      try {
        const [result] = await this.connection.execute(`UPDATE ${META} SET revision = revision + 1 WHERE id = 1 AND active_mode = 'records' AND revision = ?`, [expected]);
        if (result.affectedRows !== 1) throw new Error('数据库版本已变化，拒绝覆盖其他进程写入');
        for (const change of changes.filter(c => c.payload === null)) await this.connection.execute(`DELETE FROM ${TABLE} WHERE scope_id = ? AND record_id = ?`, [change.scope, change.id]);
        await upsertRows(this.connection, changes.filter(c => c.payload !== null));
        await this.connection.commit();
      } catch (error) { await this.connection.rollback().catch(() => {}); throw error; }
    });
    this.queue = task.catch(error => { this.failure = error; throw error; });
    this.queue.catch(() => {}); // existing background callers may not await
    return this.queue;
  }
  flush() { this.assertHealthy(); return this.queue; }
  async close() { try { await this.flush(); } finally { await releaseWriter(this.connection); } }
}
async function migrate(connection, database) {
  await schema(connection);
  const metadata = await mode(connection);
  if (metadata?.active_mode === 'records') throw new Error('分记录存储已启用，拒绝再次覆盖');
  const [existing] = await connection.query(`SELECT COUNT(*) AS count FROM ${TABLE}`);
  if (Number(existing[0].count)) throw new Error('目标记录表非空，拒绝覆盖；请先检查上次迁移');
  const expected = canonical(database);
  await connection.beginTransaction();
  try {
    const [source] = await connection.query('SELECT payload FROM turtlekeeper_app_state WHERE id = 1 FOR UPDATE');
    if (source.length) {
      const value = typeof source[0].payload === 'string' ? JSON.parse(source[0].payload) : source[0].payload;
      if (canonical(value) !== expected) throw new Error('预检后旧数据库已有新写入，拒绝迁移，请停止 API 后重试');
    } else throw new Error('迁移源已消失，拒绝创建空数据库');
    for (const [scope, value] of scopes(database)) await upsertRows(connection,
      [...pack(scope, value)].map(([id, payload]) => ({ scope: hash(scope), id, payload })), false);
    const restored = (await load(connection)).database;
    if (canonical(restored) !== expected) throw new Error('迁移前后数据不一致，已回滚');
    await connection.execute(`INSERT INTO ${META} (id, active_mode, revision, source_hash) VALUES (1, 'records', 0, ?) ON DUPLICATE KEY UPDATE active_mode = 'records', revision = 0, source_hash = VALUES(source_hash)`, [hash(expected)]);
    await connection.commit();
  } catch (error) { await connection.rollback().catch(() => {}); throw error; }
}
// Caller holds the writer lock and has backed up this exact snapshot. The
// revision check prevents restoring a snapshot taken before a newer commit.
async function rollbackToLegacy(connection, database, revision) {
  await connection.beginTransaction();
  try {
    const [guard] = await connection.execute(`UPDATE ${META} SET active_mode = 'legacy', revision = revision + 1 WHERE id = 1 AND active_mode = 'records' AND revision = ?`, [revision]);
    if (guard.affectedRows !== 1) throw new Error('核对期间数据库发生变化，拒绝回滚');
    await connection.execute('INSERT INTO turtlekeeper_app_state (id, payload) VALUES (1, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)', [JSON.stringify(database)]);
    const [rows] = await connection.query('SELECT payload FROM turtlekeeper_app_state WHERE id = 1');
    if (!rows.length || canonical(typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload) !== canonical(database)) throw new Error('回滚核对失败');
    await connection.commit();
  } catch (error) { await connection.rollback().catch(() => {}); throw error; }
}
module.exports = { MysqlRecordStore, schema, mode, assertLegacyMode, acquireWriter, releaseWriter, migrate, rollbackToLegacy, load, scopes, pack, unpack, canonical, hash, TABLE, META };
