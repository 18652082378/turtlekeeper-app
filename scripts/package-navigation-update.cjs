const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output');
const previous = path.join(output, 'turtlekeeper-hatch-completion-v12');
const base = JSON.parse(fs.readFileSync(path.join(previous, 'manifest.json'), 'utf8'));
const name = 'turtlekeeper-navigation-fix-v13', folder = path.join(output, name);
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const hash = s => crypto.createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
const manifest = { source: 'Reviewed v12 + data-aware return navigation cache', files: {}, dependencies: base.dependencies };
for (const [file, info] of Object.entries(base.files)) {
  const old = read(path.join(previous, 'files', file));
  if (hash(old) !== info.target) throw Error('Reviewed v12 changed: ' + file);
  const text = file === 'app.js' ? read(path.join(root, file)) : old;
  manifest.files[file] = { ...info, bases: [...new Set([...(info.bases || []), info.target])], target: hash(text) };
  write(path.join(folder, 'files', file), text);
}
write(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2));
write(path.join(folder, 'deploy.cjs'), read(path.join(previous, 'deploy.cjs')).replace('SUCCESS: hatch completion, unified hatching and single-device login are active.', 'SUCCESS: navigation cache fix and previous v12 features are active.'));
write(path.join(folder, 'test-access.cjs'), read(path.join(previous, 'test-access.cjs')));
write(path.join(folder, 'README.md'), read(path.join(root, 'docs/navigation-cache-fix.md')));
const tar = process.platform === 'win32' ? 'tar.exe' : 'tar', archive = path.join(output, name + '.tar.gz');
execFileSync(tar, ['-czf', archive, '-C', output, name]);
const actual = execFileSync(tar, ['-tzf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(f => !f.endsWith('/')).sort();
const expected = [...Object.keys(manifest.files).map(f => `${name}/files/${f}`), ...['manifest.json', 'deploy.cjs', 'test-access.cjs', 'README.md'].map(f => `${name}/${f}`)].sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Unexpected archive contents');
console.log(archive);
