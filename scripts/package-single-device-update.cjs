// Build on the reviewed live baseline; do not deploy unrelated backend work.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output');
const previous = path.join(output, 'turtlekeeper-team-update-v10');
const base = JSON.parse(fs.readFileSync(path.join(previous, 'manifest.json'), 'utf8'));
const name = 'turtlekeeper-single-device-v11', folder = path.join(output, name);
const staged = path.join(output, 'team-live-merged-v11');
const hash = s => crypto.createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
const read = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
const current = read(path.join(root, 'server/server.js'));
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw Error('Missing reviewed section: ' + start);
  return source.slice(a, b);
}
function replace(source, start, end, replacement) {
  const old = section(source, start, end);
  return source.replace(old, replacement);
}
const manifest = { source: 'Reviewed v10 + single-session authentication and build 111 client fixes', files: {}, dependencies: base.dependencies };
for (const [file, info] of Object.entries(base.files)) {
  let data = read(path.join(previous, 'files', file));
  if (hash(data) !== info.target) throw Error('Reviewed v10 changed: ' + file);
  if (file === 'server/server.js') {
    for (const [start, end] of [['function sendJson(', 'function readJson('], ['function readJson(', 'function emptyAccountData(']]) {
      data = replace(data, start, end, section(current, start, end));
    }
    data = replace(data, 'async function handleRegister(', 'async function handleLoadAccount(',
      section(current, 'function addAccountSession(', 'async function handleLoadAccount('));
    const route = '    if (req.method === "POST" && url.pathname === "/api/account/load")';
    if (!data.includes(route)) throw Error('Missing account route');
    data = data.replace(route, '    if (req.method === "POST" && url.pathname === "/api/account/logout") return await handleLogout(req, res);\n    if (req.method === "POST" && url.pathname === "/api/account/session") return await handleAccountSession(req, res);\n' + route);
  } else if (['app.js', 'assets/team-space.js'].includes(file)) data = read(path.join(root, file));
  manifest.files[file] = { ...info, bases: [...new Set([...(info.bases || []), info.target])], target: hash(data) };
  write(path.join(folder, 'files', file), data);
  write(path.join(staged, file), data);
}
write(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2));
let deploy = read(path.join(previous, 'deploy.cjs'))
  .replace("['/api/team', '/api/apple/purchases']", "['/api/team', '/api/apple/purchases', '/api/account/session']")
  .replace('SUCCESS: team and Apple endpoints are active.', 'SUCCESS: single-device login is active.')
  .replace('Refresh the webpage. Apple purchases still require server key configuration and an iOS build.', 'Refresh the webpage. Install build 111 for automatic sign-out and the re-login notice on iOS.');
write(path.join(folder, 'deploy.cjs'), deploy);
write(path.join(folder, 'test-access.cjs'), read(path.join(previous, 'test-access.cjs')));
write(path.join(folder, 'README.md'), read(path.join(root, 'docs/single-device-login.md')));
const archive = path.join(output, name + '.tar.gz');
const tar = process.platform === 'win32' ? 'tar.exe' : 'tar';
execFileSync(tar, ['-czf', archive, '-C', output, name]);
const actual = execFileSync(tar, ['-tzf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(f => !f.endsWith('/')).sort();
const expected = [...Object.keys(base.files).map(f => `${name}/files/${f}`), ...['manifest.json', 'deploy.cjs', 'test-access.cjs', 'README.md'].map(f => `${name}/${f}`)].sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Unexpected archive contents');
console.log(archive);
console.log('Verified reviewed baselines, source checksums, and archive file inventory. No credentials or account data included.');
