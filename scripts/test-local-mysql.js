// Run a supplied MySQL 8 binary in an isolated temporary directory. No system
// service, production credentials, server/.env edits or external DB access.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const root = path.resolve(__dirname, '..');
async function run(exe, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'] });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Test process exited ${code}: ${path.basename(exe)}`)));
  });
}
(async () => {
  if (!process.argv[2]) throw new Error('Pass the local mysqld binary path; this script does not download or install services.');
  const binary = await fs.realpath(path.resolve(process.argv[2]));
  const basedir = path.dirname(path.dirname(binary));
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'tk-local-mysql-'));
  let server, connection;
  try {
    const datadir = path.join(temp, 'data');
    const errorLog = path.join(temp, 'mysql-error.log');
    await run(binary, ['--no-defaults', '--initialize-insecure', '--basedir=' + basedir, '--datadir=' + datadir, '--log-error=' + errorLog]);
    const password = crypto.randomBytes(24).toString('hex');
    const initFile = path.join(temp, 'init.sql');
    await fs.writeFile(initFile, `ALTER USER 'root'@'localhost' IDENTIFIED BY '${password}';\n`);
    const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
    const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
    const url = `mysql://root:${password}@127.0.0.1:${port}/mysql`;
    server = spawn(binary, ['--no-defaults', '--basedir=' + basedir, '--datadir=' + datadir, '--bind-address=127.0.0.1', '--port=' + port,
      '--mysqlx=0', '--skip-log-bin', '--innodb-buffer-pool-size=128M', '--max-connections=30', '--log-error=' + errorLog, '--init-file=' + initFile],
      { cwd: root, windowsHide: true, stdio: 'ignore' });
    let spawnError; server.once('error', error => { spawnError = error; });
    for (let i = 0; i < 160; i++) {
      if (spawnError) throw spawnError;
      if (server.exitCode !== null) throw new Error('Temporary MySQL exited: ' + await fs.readFile(errorLog, 'utf8'));
      try { connection = await mysql.createConnection(url); break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!connection) throw new Error('Temporary MySQL did not become ready: ' + await fs.readFile(errorLog, 'utf8'));
    await fs.unlink(initFile);
    const [rows] = await connection.query('SELECT VERSION() AS version');
    assert.match(rows[0].version, /^8\./); console.log('Isolated real MySQL:', rows[0].version);
    const env = { ...process.env, TEST_MYSQL_URL: url, TURTLE_TEST_MYSQL_URL: url, TURTLE_TEST_RECORD_DRIVER: '' };
    await run(process.execPath, ['scripts/test-mysql-records.js'], env);
    await run(process.execPath, ['scripts/test-api-workflows.js'], env);
    // Exercise the actual operator CLI against a small disposable database,
    // including its backup files and rollback after a post-migration edit.
    const name = 'tk_cli_test_' + crypto.randomBytes(8).toString('hex');
    await connection.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
    await connection.query(`USE \`${name}\``);
    await connection.query('CREATE TABLE turtlekeeper_app_state (id TINYINT PRIMARY KEY, payload JSON NOT NULL) ENGINE=InnoDB');
    const fixture = { users: { synthetic: { data: { turtles: [{ id: 'synthetic-turtle', price: 450 }], ledgerRecords: [] } } } };
    await connection.execute('INSERT INTO turtlekeeper_app_state VALUES (1, ?)', [JSON.stringify(fixture)]);
    const cliUrl = new URL(url); cliUrl.pathname = '/' + name;
    const cliEnv = { ...env, MYSQL_URL: cliUrl.toString(), MYSQL_HOST: '', TURTLE_RUNTIME_DIR: path.join(temp, 'cli-runtime') };
    const cli = flags => run(process.execPath, ['scripts/migrate-mysql-records.js', ...flags], cliEnv);
    await cli([]); await cli(['--apply']);
    const storage = require('../server/mysql-record-store');
    const store = await storage.MysqlRecordStore.open(connection);
    store.data.users.synthetic.data.ledgerRecords.push({ id: 'new-loss', type: 'loss', amount: 450 }); await store.write(); await store.close();
    await cli(['--export']); await cli(['--rollback']); await cli(['--rollback', '--apply']);
    const [rolledBack] = await connection.query('SELECT payload FROM turtlekeeper_app_state WHERE id=1');
    const restored = typeof rolledBack[0].payload === 'string' ? JSON.parse(rolledBack[0].payload) : rolledBack[0].payload;
    assert.equal(restored.users.synthetic.data.ledgerRecords[0].amount, 450);
    const backupDir = path.join(temp, 'cli-runtime', 'backups', 'mysql-record-cutover');
    assert.equal((await fs.readdir(backupDir)).filter(name => name.endsWith('.json')).length, 3);
    console.log('REAL MYSQL ACCEPTANCE PASSED: migration, incremental writes, API and 1.0.7 compatibility, export and current-data rollback.');
  } finally {
    if (connection) { try { await connection.query('SHUTDOWN'); } catch {} await connection.end().catch(() => {}); }
    if (server && server.exitCode === null) {
      const exited = new Promise(resolve => server.once('exit', resolve));
      let timer; await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 10000); })]); clearTimeout(timer);
      if (server.exitCode === null) { server.kill(); await exited; }
    }
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir())); assert.ok(path.basename(temp).startsWith('tk-local-mysql-'));
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
