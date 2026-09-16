// Local server administrator tool. No HTTP endpoint and no account/Apple writes.
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
function updateAccess(file, action, phone, now = Date.now()) {
  if (!['--grant', '--revoke'].includes(action) || !/^1[3-9]\d{9}$/.test(phone)) throw new Error('Use --grant PHONE or --revoke PHONE');
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(dir) !== path.resolve(dir)) throw new Error('Symlink directory rejected');
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('Symlink file rejected');
  const lock = file + '.lock', temp = file + '.' + process.pid + '.tmp';
  const fd = fs.openSync(lock, 'wx', 0o600);
  try {
    const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { version: 1, accounts: {} };
    if (config.version !== 1 || !config.accounts || Array.isArray(config.accounts) || typeof config.accounts !== 'object') throw new Error('Invalid access file; stopped without changes');
    let grant = config.accounts[phone];
    if (action === '--revoke') delete config.accounts[phone];
    // Retrying a successful command does not silently extend its seven-day window.
    else if (!(Date.parse(grant?.issuedAt) <= now && Date.parse(grant?.expiresAt) > now && Date.parse(grant.expiresAt) - Date.parse(grant.issuedAt) <= 7 * 86400000)) {
      grant = { issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 7 * 86400000).toISOString() };
      config.accounts[phone] = grant;
    }
    fs.writeFileSync(temp, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, file);
    return action === '--grant' ? grant : null;
  } finally {
    fs.closeSync(fd); fs.unlinkSync(lock);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
function main() {
  if (process.platform !== 'linux') throw new Error('Run on the Linux API server');
  const [action, phone, ...extra] = process.argv.slice(2);
  if (extra.length || !['--grant', '--revoke'].includes(action) || !/^1[3-9]\d{9}$/.test(phone || '')) throw new Error('Use --grant PHONE or --revoke PHONE');
  const root = '/www/turtlekeeper-app';
  if (fs.realpathSync(root) !== root) throw new Error('Unexpected project path');
  const apps = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  const matches = apps.filter(a => a.name === 'turtlekeeper-api');
  if (matches.length !== 1) throw new Error('Expected one API process');
  const pm = matches[0].pm2_env;
  if (pm.status !== 'online' || pm.exec_mode !== 'fork_mode' || path.resolve(pm.pm_cwd) !== root || path.resolve(pm.pm_exec_path) !== path.join(root, 'server/server.js')) throw new Error('Unexpected API process configuration');
  // Use the same environment precedence and runtime location as the running API.
  const env = { ...(pm.env || {}), ...pm };
  const envFile = path.join(root, 'server/.env');
  const line = fs.existsSync(envFile) && fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find(s => /^\s*TURTLE_RUNTIME_DIR\s*=/.test(s));
  const fileValue = line ? line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2') : '';
  process.env.TURTLE_RUNTIME_DIR = path.resolve(root, env.TURTLE_RUNTIME_DIR ?? (fileValue || 'server'));
  const { testAccessFile, access } = require(path.join(root, 'server/team-space.js'));
  const grant = updateAccess(testAccessFile(), action, phone);
  const current = access({ phone });
  if (action === '--grant' && (!current.active || !current.testing)) throw new Error('Access verification failed');
  console.log(`SUCCESS: ${phone.slice(0, 3)}****${phone.slice(-4)} ${grant ? 'test access until ' + grant.expiresAt : 'test access revoked'}`);
  console.log('Refresh Team Space. Existing accounts, Apple purchases and other users are unchanged.');
}
module.exports = { updateAccess };
if (require.main === module) { try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; } }
