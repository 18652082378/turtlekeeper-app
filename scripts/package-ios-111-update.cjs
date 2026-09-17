const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output');
const previous = path.join(output, 'turtlekeeper-navigation-fix-v13');
const base = JSON.parse(fs.readFileSync(path.join(previous, 'manifest.json'), 'utf8'));
const name = 'turtlekeeper-ios-111-v14', folder = path.join(output, name);
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const hash = text => crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
const updated = new Set(['assets/team-space.js', 'assets/team-space.css']);
const manifest = { source: 'Reviewed v13 plus compact iOS membership purchase page; cumulative 1.0.9 (111)', files: {}, dependencies: base.dependencies };
for (const [file, info] of Object.entries(base.files)) {
  const old = read(path.join(previous, 'files', file));
  if (hash(old) !== info.target) throw Error('Reviewed v13 changed: ' + file);
  const text = updated.has(file) ? read(path.join(root, file)) : old;
  manifest.files[file] = { ...info, bases: [...new Set([...(info.bases || []), info.target])], target: hash(text) };
  write(path.join(folder, 'files', file), text);
}
for (const file of updated) if (!manifest.files[file]) throw Error('Missing release file: ' + file);
for (const file of ['app.js', 'styles.css']) {
  if (manifest.files[file]?.target !== hash(read(path.join(root, file)))) throw Error('Release source differs: ' + file);
}
write(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2));
write(path.join(folder, 'deploy.cjs'), read(path.join(previous, 'deploy.cjs')).replace('SUCCESS: navigation cache fix and previous v12 features are active.', 'SUCCESS: iOS 111 membership layout, hatching and navigation fixes are active.'));
write(path.join(folder, 'test-access.cjs'), read(path.join(previous, 'test-access.cjs')));
write(path.join(folder, 'README.md'), read(path.join(root, 'docs/ios-111-release.md')));
const tar = process.platform === 'win32' ? 'tar.exe' : 'tar';
const archive = path.join(output, name + '.tar.gz');
execFileSync(tar, ['-czf', archive, '-C', output, name]);
const actual = execFileSync(tar, ['-tzf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(f => !f.endsWith('/')).sort();
const expected = [...Object.keys(manifest.files).map(f => `${name}/files/${f}`), ...['manifest.json', 'deploy.cjs', 'test-access.cjs', 'README.md'].map(f => `${name}/${f}`)].sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Unexpected archive contents');
console.log(archive);
