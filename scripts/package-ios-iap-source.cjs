const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output');
const name = 'turtlekeeper-ios-1.0.9-build-110-iap-source';
const stage = path.join(output, name);
const release = JSON.parse(fs.readFileSync(path.join(__dirname, 'ios-iap-release-files.json'), 'utf8'));
const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const tracked = git(['ls-tree', '-r', '--name-only', '-z', 'HEAD']).toString('utf8').split('\0').filter(Boolean);
const files = [...new Set([...tracked, ...release])].sort();
const checkPath = file => {
  if (path.isAbsolute(file) || file.split('/').includes('..') || /[\r\n]/.test(file)
    || /(^|\/)(\.git|node_modules|output|www|data|uploads|backups)(\/|$)/.test(file)
    || /\.(p8|p12|jks|keystore)$/i.test(file) || /(^|\/)\.env$/.test(file)) throw Error('Unsafe source entry: ' + file);
};
files.forEach(checkPath);
if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version !== '1.0.9') throw Error('Expected 1.0.9');
if (!/TURTLE_APP_BUILD\s*=\s*110;/.test(fs.readFileSync(path.join(root, 'config.js'), 'utf8'))) throw Error('Expected 110');
fs.mkdirSync(stage, { recursive: true });
if (fs.realpathSync(stage) !== stage) throw Error('Source staging directory cannot be a symlink');
const archive = path.join(output, 'ios-iap-git-baseline.tar');
git(['archive', '--format=tar', '--output', archive, 'HEAD']);
const python = process.env.PYTHON || 'python3';
execFileSync(python, ['-c', 'import tarfile,sys; tarfile.open(sys.argv[1]).extractall(sys.argv[2], filter="data")', archive, stage]);
for (const file of release) {
  const source = path.join(root, file), dest = path.join(stage, file);
  if (!fs.lstatSync(source).isFile()) throw Error('Expected regular source file: ' + file);
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(source, dest);
}
const hashes = {};
for (const file of files) {
  const bytes = fs.readFileSync(path.join(stage, file));
  if (/-----BEGIN (?:EC |RSA |ENCRYPTED )?PRIVATE KEY-----/.test(bytes.toString('utf8'))) throw Error('Private key found: ' + file);
  hashes[file] = crypto.createHash('sha256').update(bytes).digest('hex');
}
for (const [suffix, selected] of [['source', files], ['git-update', [...release].sort()]]) {
  const list = path.join(output, 'ios-iap-' + suffix + '-files.txt');
  fs.writeFileSync(list, selected.join('\n') + '\n');
  const zip = path.join(output, `turtlekeeper-ios-1.0.9-build-110-iap-${suffix}.zip`);
  const result = execFileSync(python, ['-c', [
    'import zipfile,pathlib,sys,json',
    'stage,listing,dest=sys.argv[1:]',
    'files=pathlib.Path(listing).read_text(encoding="utf-8").splitlines()',
    'with zipfile.ZipFile(dest,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:',
    ' for name in files: z.write(pathlib.Path(stage)/name,name)',
    'with zipfile.ZipFile(dest) as z:',
    ' assert z.testzip() is None',
    ' print(json.dumps(sorted(z.namelist()),ensure_ascii=True))',
  ].join('\n'), stage, list, zip], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  const actual = JSON.parse(result).sort();
  if (JSON.stringify(actual) !== JSON.stringify(selected)) throw Error('ZIP inventory mismatch');
  console.log(`${zip} (${fs.statSync(zip).size} bytes, ${selected.length} files)`);
}
fs.writeFileSync(path.join(output, 'ios-iap-110-source-manifest.json'), JSON.stringify({ version: '1.0.9', build: 110, baseline: git(['rev-parse', 'HEAD']).toString().trim(), files: hashes }, null, 2));
console.log('Verified source inventory: no .env, private keys, user data, or generated build directories.');
