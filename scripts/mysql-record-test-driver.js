// In-memory transactional SQL double, never a connection to production.
// Real MySQL verification can use test-mysql-records.js with TEST_MYSQL_URL.
const copy = value => JSON.parse(JSON.stringify(value));
class Driver {
  constructor(database = { users: {} }) {
    this.legacy = copy(database); this.rows = new Map(); this.meta = null;
    this.locked = false; this.calls = []; this.fail = null; this.commits = 0;
  }
  async query(sql, values = []) { return this.execute(sql, values); }
  async execute(sql, values = []) {
    this.calls.push({ sql, values: copy(values) });
    if (this.fail?.(sql, values)) throw new Error('injected storage failure');
    if (sql.startsWith('CREATE TABLE')) return [{}];
    if (sql.includes('GET_LOCK')) { if (this.locked) return [[{ acquired: 0 }]]; this.locked = true; return [[{ acquired: 1 }]]; }
    if (sql.includes('RELEASE_LOCK')) { this.locked = false; return [[{ released: 1 }]]; }
    if (sql.startsWith('SELECT active_mode')) return [this.meta ? [copy(this.meta)] : []];
    if (sql.startsWith('SELECT COUNT(*)')) return [[{ count: this.rows.size }]];
    if (sql.startsWith('SELECT payload FROM turtlekeeper_app_state')) return [this.legacy === null ? [] : [{ payload: copy(this.legacy) }]];
    if (sql.startsWith('SELECT scope_id')) return [[...this.rows.values()].map(copy)];
    if (sql.startsWith('INSERT INTO turtlekeeper_records_v2')) {
      for (let i = 0; i < values.length; i += 3) this.rows.set(values[i] + values[i + 1], { scope_id: values[i], record_id: values[i + 1], payload: JSON.parse(values[i + 2]) });
      return [{ affectedRows: values.length / 3 }];
    }
    if (sql.startsWith('DELETE FROM turtlekeeper_records_v2')) { this.rows.delete(values[0] + values[1]); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT INTO turtlekeeper_storage_v2')) { this.meta = { active_mode: 'records', revision: 0, source_hash: values[0] }; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE turtlekeeper_storage_v2')) {
      if (this.meta?.active_mode !== 'records' || this.meta.revision !== values[0]) return [{ affectedRows: 0 }];
      this.meta.revision++; if (sql.includes("active_mode = 'legacy'")) this.meta.active_mode = 'legacy';
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO turtlekeeper_app_state')) { this.legacy = JSON.parse(values[0]); return [{ affectedRows: 1 }]; }
    throw new Error('Unhandled SQL in test double: ' + sql);
  }
  async beginTransaction() {
    if (this.transaction) throw new Error('overlapping transaction');
    this.transaction = { rows: new Map([...this.rows].map(([k,v]) => [k, copy(v)])), meta: copy(this.meta), legacy: copy(this.legacy) };
  }
  async commit() { this.transaction = null; this.commits++; }
  async rollback() { if (this.transaction) Object.assign(this, this.transaction); this.transaction = null; }
  release() {}
  async end() {}
}
module.exports = { Driver };
