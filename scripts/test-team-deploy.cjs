// Exercise the installer against a temporary filesystem and mocked PM2/HTTP.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), bundle = process.env.TEAM_DEPLOY_BUNDLE ? path.resolve(process.env.TEAM_DEPLOY_BUNDLE) : path.join(root, 'output/turtlekeeper-team-update');
const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8'));
const source = fs.readFileSync(path.join(bundle, 'deploy.cjs'), 'utf8');
async function scenario(mode, failure = '') {
  const local = fs.mkdtempSync(path.join(os.tmpdir(), 'team-deploy-test-'));
  const translate = value => typeof value === 'string' && (value === '/www/turtlekeeper-app' || value.startsWith('/www/turtlekeeper-app/')) ? path.join(local, value.slice('/www/turtlekeeper-app'.length)) : value;
  const original = new Map();
  for (const [file, expected] of Object.entries(manifest.files)) {
    if (process.env.TEAM_DEPLOY_BASELINE ? !fs.existsSync(path.join(process.env.TEAM_DEPLOY_BASELINE, file)) : !expected.base) continue;
    const dest = path.join(local, file); fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, process.env.TEAM_DEPLOY_BASELINE ? fs.readFileSync(path.join(process.env.TEAM_DEPLOY_BASELINE, file)) : execFileSync('git', ['show', `HEAD:${file}`], { cwd: root }));
    original.set(file, fs.readFileSync(dest, 'utf8'));
  }
  for (const file of Object.keys(manifest.dependencies)) { fs.mkdirSync(path.dirname(path.join(local, file)), { recursive: true }); fs.copyFileSync(path.join(root, file), path.join(local, file)); }
  fs.mkdirSync(path.join(local, 'server/data'), { recursive: true });
  fs.writeFileSync(path.join(local, 'server/data/app-data.json'), 'USER DATA SENTINEL');
  fs.writeFileSync(path.join(local, 'server/.env'), 'CONFIG SENTINEL');
  if (failure === 'drift') fs.appendFileSync(path.join(local, 'server/server.js'), '\n// unreviewed remote change');
  const before = fs.readFileSync(path.join(local, 'server/server.js'), 'utf8'), calls = [];
  const fakeFs = { ...fs };
  for (const method of ['readFileSync', 'existsSync', 'lstatSync', 'mkdirSync', 'writeFileSync', 'unlinkSync']) fakeFs[method] = (file, ...args) => fs[method](translate(file), ...args);
  fakeFs.copyFileSync = (from, to) => fs.copyFileSync(translate(from), translate(to));
  fakeFs.realpathSync = file => { fs.realpathSync(translate(file)); return file; };
  const context = vm.createContext({
    require: name => name === 'node:fs' ? fakeFs : name === 'node:path' ? path.posix : name === 'node:child_process' ? { execFileSync(command, args, options) {
      if (command !== 'pm2') return execFileSync(command, args, { ...options, cwd: local, stdio: 'pipe' });
      calls.push(args.join(' '));
      if (args[0] === 'jlist') return JSON.stringify([{ name: 'turtlekeeper-api', pm2_env: { status: 'online', exec_mode: 'fork_mode', pm_cwd: '/www/turtlekeeper-app', pm_exec_path: '/www/turtlekeeper-app/server/server.js' } }]);
      return '';
    } } : require(name),
    __dirname: bundle.replace(/\\/g, '/'), console: { log() {}, error() {} },
    process: { platform: 'linux', argv: ['node', 'deploy.cjs', mode], execPath: process.execPath },
    setTimeout: resolve => setTimeout(resolve, 0), AbortSignal,
    fetch: async url => ({ ok: true, status: failure === 'health' ? 405 : 401, json: async () => ({ ok: false }) })
  });
  vm.runInContext(source.slice(0, source.lastIndexOf('\nmain().catch')) + '\nglobalThis.finished = main();', context);
  if (failure) await assert.rejects(context.finished);
  else await context.finished;
  assert.equal(fs.readFileSync(path.join(local, 'server/data/app-data.json'), 'utf8'), 'USER DATA SENTINEL');
  assert.equal(fs.readFileSync(path.join(local, 'server/.env'), 'utf8'), 'CONFIG SENTINEL');
  if (mode === '--check' || failure) assert.equal(fs.readFileSync(path.join(local, 'server/server.js'), 'utf8'), before);
  else for (const file of Object.keys(manifest.files)) assert.equal(fs.readFileSync(path.join(local, file), 'utf8'), fs.readFileSync(path.join(bundle, 'files', file), 'utf8'));
  if (failure === 'drift' || mode === '--check') assert.deepEqual(calls, failure === 'drift' ? [] : ['jlist']);
  if (failure === 'health') {
    assert.equal(calls.filter(c => c === 'restart turtlekeeper-api').length, 2);
    for (const file of Object.keys(manifest.files)) {
      if (original.has(file)) assert.equal(fs.readFileSync(path.join(local, file), 'utf8'), original.get(file), 'Rollback must restore every original module');
      else assert(!fs.existsSync(path.join(local, file)), 'Rollback must remove only newly installed modules');
    }
  }
}
(async () => {
  await scenario('--check'); await scenario('--apply'); await scenario('--apply', 'drift'); await scenario('--apply', 'health');
  console.log('PASS: read-only preflight, install, version drift refusal, health-failure rollback; account/configuration files unchanged. No real PM2 or server accessed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
