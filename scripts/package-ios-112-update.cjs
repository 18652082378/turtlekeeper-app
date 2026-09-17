const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output');
const previous = path.join(output, 'turtlekeeper-ios-111-v14');
const base = JSON.parse(fs.readFileSync(path.join(previous, 'manifest.json'), 'utf8'));
const name = 'turtlekeeper-ios-112-v15', folder = path.join(output, name);
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const hash = text => crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
const updated = new Set(['app.js']);
const manifest = { source: 'Reviewed v14 plus every-entry intro; cumulative 1.0.9 (112)', files: {}, dependencies: base.dependencies };
for (const [file, info] of Object.entries(base.files)) {
  const old = read(path.join(previous, 'files', file));
  if (hash(old) !== info.target) throw Error('Reviewed v14 changed: ' + file);
  const text = updated.has(file) ? read(path.join(root, file)) : old;
  manifest.files[file] = { ...info, bases: [...new Set([...(info.bases || []), info.target])], target: hash(text) };
  write(path.join(folder, 'files', file), text);
}
for (const file of updated) if (!manifest.files[file]) throw Error('Missing release file: ' + file);
for (const file of ['app.js', 'styles.css']) {
  if (manifest.files[file]?.target !== hash(read(path.join(root, file)))) throw Error('Release source differs: ' + file);
}
const intro = 'assets/trade-guide.js';
const oldIntro = execFileSync('git', ['show', '55636e6:assets/trade-guide.js'], { cwd: root, encoding: 'utf8' });
const newIntro = read(path.join(root, intro));
manifest.files[intro] = { base: hash(oldIntro), bases: [hash(oldIntro)], target: hash(newIntro) };
write(path.join(folder, 'files', intro), newIntro);
write(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2));
write(path.join(folder, 'deploy.cjs'), read(path.join(previous, 'deploy.cjs')).replace("const files = [", "const files = ['assets/trade-guide.js', " ).replace('SUCCESS: iOS 111 membership layout, hatching and navigation fixes are active.', 'SUCCESS: iOS 112 every-entry intro and cumulative team fixes are active.'));
write(path.join(folder, 'test-access.cjs'), read(path.join(previous, 'test-access.cjs')));
write(path.join(folder, 'README.md'), read(path.join(root, 'docs/ios-112-release.md')));
const tar = process.platform === 'win32' ? 'tar.exe' : 'tar';
const archive = path.join(output, name + '.tar.gz');
execFileSync(tar, ['-czf', archive, '-C', output, name]);
const actual = execFileSync(tar, ['-tzf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(f => !f.endsWith('/')).sort();
const expected = [...Object.keys(manifest.files).map(f => `${name}/files/${f}`), ...['manifest.json', 'deploy.cjs', 'test-access.cjs', 'README.md'].map(f => `${name}/${f}`)].sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Unexpected archive contents');
console.log(archive);
