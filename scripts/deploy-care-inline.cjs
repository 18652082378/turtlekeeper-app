const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const { execFileSync: exec } = require('child_process');
const check = (ok, message) => { if (!ok) throw Error(message); };
const mark = '// CARE_PERSISTENCE_HOTFIX_20260927';
const hashes = {
  emptyAccountData: '48db0ca2751281287e1bd615dd6e702f437a440c5427775ad035d11fb2d3b8b9',
  normalizeAccountData: '72f921753c4f47c0ef6fd5216ac79c32f1632f5fc4e7d9ebed0b422f9082760c',
  accountDataHasContent: 'b597ab1672ff26f0f4fa377d52585d124a8e6e62487c68aaa0b101bde274238d',
  accountRecordCounts: '40840092ca00fe35a8d6b129d51b99e11b8022577777d687788de03ea73777df',
  handleSaveAccount: 'dd30215844f3f7cc04d8b77aa13a3132226f8dc17005b5de3104130b640c1f87'
};
function extract(s, name) {
  const found = [...s.matchAll(new RegExp('^(?:async )?function ' + name + '\\(', 'gm'))];
  check(found.length === 1, 'Unexpected function: ' + name);
  const start = found[0].index, end = s.indexOf('\n}', start);
  check(end > start, 'Incomplete function: ' + name);
  return s.slice(start, end + 2);
}
function patch(source) {
  let s = source.replace(/\r\n/g, '\n');
  for (const [name, hash] of Object.entries(hashes)) {
    check(crypto.createHash('sha256').update(extract(s, name)).digest('hex') === hash, 'Server differs; nothing changed: ' + name);
  }
  function replace(name, from, to) {
    const old = extract(s, name);
    check(old.split(from).length === 2, 'Patch anchor differs: ' + name);
    s = s.replace(old, () => old.replace(from, () => to));
  }
  replace('emptyAccountData', '  return {', '  return {\n    careRecords: [], careCustomItems: [], carePlans: [],');
  replace('normalizeAccountData', '  return {', `  return {
    careRecords: Array.isArray(next.careRecords) ? next.careRecords : [],
    careCustomItems: Array.isArray(next.careCustomItems) ? next.careCustomItems : [],
    carePlans: Array.isArray(next.carePlans) ? next.carePlans : [],`);
  replace('accountDataHasContent', '    account.memos,', '    account.careRecords, account.careCustomItems, account.carePlans,\n    account.memos,');
  replace('accountRecordCounts', 'const fields = [', 'const fields = ["careRecords", "careCustomItems", "carePlans", ');
  replace('handleSaveAccount', `  const incomingHasContent = accountDataHasContent(incomingData);
  const existingData = normalizeAccountData(user.data || {});`, `  const existingData = normalizeAccountData(user.data || {});
  for (const key of ['careRecords', 'careCustomItems', 'carePlans']) {
    if (!Object.hasOwn(body.data || {}, key)) incomingData[key] = existingData[key];
  }
  const oldCare = new Map(existingData.careRecords.map(r => [r?.id, r]));
  incomingData.careRecords = incomingData.careRecords.map(r => {
    if (!r || typeof r !== 'object') return r;
    const prior = oldCare.get(r.id);
    return { ...r,
      turtleRefs: Object.hasOwn(r, 'turtleRefs') ? r.turtleRefs : prior?.turtleRefs || [],
      sourceMemoId: Object.hasOwn(r, 'sourceMemoId') ? r.sourceMemoId : prior?.sourceMemoId || '' };
  });
  const incomingHasContent = accountDataHasContent(incomingData);`);
  return s + '\n' + mark + '\n';
}
function verify(source) {
  const ctx = vm.createContext({ crypto, normalizeCustomSpecies: x => x || [] });
  for (const name of ['emptyAccountData', 'normalizeAccountData', 'accountDataHasContent', 'accountRecordCounts']) vm.runInContext(extract(source, name), ctx);
  const sample = { careRecords: [{ id: 'test', title: 'feeding', date: '2026-09-27', note: 'check', turtleRefs: [{ id: 't1' }] }], carePlans: [{ id: 'p1', name: 'plan' }], careCustomItems: [{ id: 'c1', title: 'clean' }] };
  const saved = ctx.normalizeAccountData(sample), loaded = ctx.normalizeAccountData(JSON.parse(JSON.stringify(saved)));
  for (const key of Object.keys(sample)) check(JSON.stringify(loaded[key]) === JSON.stringify(sample[key]), 'Round-trip failed: ' + key);
  check(ctx.accountDataHasContent(sample) && ctx.accountRecordCounts(sample).careRecords === 1, 'Data guards failed');
}
async function main() {
  const root = '/www/turtlekeeper-app', file = root + '/server/server.js', service = 'turtlekeeper-api';
  check(process.platform === 'linux' && fs.realpathSync(file) === file, 'Unexpected server path');
  const before = fs.readFileSync(file, 'utf8');
  if (before.includes(mark)) { verify(before); console.log('Already installed.'); return; }
  const after = patch(before);
  exec(process.execPath, ['--check'], { input: after });
  verify(after);
  const apps = JSON.parse(exec('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 8388608 }));
  const matches = apps.filter(x => x.name === service);
  check(matches.length === 1, 'Expected one API process');
  const pm = matches[0].pm2_env;
  check(pm.status === 'online' && pm.exec_mode === 'fork_mode' && pm.pm_cwd === root && pm.pm_exec_path === file, 'Unexpected PM2 configuration');
  const env = { ...pm.env, ...pm }, envFile = root + '/server/.env';
  if (fs.existsSync(envFile)) for (const raw of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim(), pos = line.indexOf('=');
    if (!line || line.startsWith('#') || pos < 0) continue;
    const key = line.slice(0, pos).trim(); let value = line.slice(pos + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (env[key] === undefined) env[key] = value;
  }
  const port = Number(env.PORT || 8787);
  check(Number.isInteger(port) && port > 0 && port < 65536, 'Invalid API port');
  const version = async () => {
    const r = await fetch(`http://127.0.0.1:${port}/api/app/version`, { signal: AbortSignal.timeout(3000) });
    check(r.ok, 'API unavailable'); return JSON.stringify(await r.json());
  };
  const policy = await version();
  const dir = root + '/server/backups';
  fs.mkdirSync(dir, { recursive: true });
  check(fs.realpathSync(dir) === dir, 'Unexpected backup path');
  const backup = fs.mkdtempSync(dir + '/care-fix-');
  fs.chmodSync(backup, 0o700);
  fs.copyFileSync(file, backup + '/server.js');
  console.log('Checks passed. Backup: ' + backup);
  check(fs.readFileSync(file, 'utf8') === before, 'Source changed during checks');
  const pm2 = action => exec('pm2', [action, service], { cwd: root, stdio: 'inherit' });
  pm2('stop');
  try {
    fs.writeFileSync(file, after);
    pm2('restart');
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        check(await version() === policy, 'Version policy changed');
        const r = await fetch(`http://127.0.0.1:${port}/api/account/load`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(2000) });
        check(r.status === 401, 'Account endpoint failed');
        ready = true; break;
      } catch { await new Promise(r => setTimeout(r, 500)); }
    }
    check(ready, 'Restart verification failed');
  } catch (error) {
    pm2('stop'); fs.copyFileSync(backup + '/server.js', file); pm2('restart');
    console.error('Previous code restored.'); throw error;
  }
  exec('pm2', ['save'], { cwd: root, stdio: 'inherit' });
  console.log('SUCCESS: care persistence installed.');
}
module.exports = { patch, verify };
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
