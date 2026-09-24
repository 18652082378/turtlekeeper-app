const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
const build = Number(fs.readFileSync(path.join(root, 'config.js'), 'utf8').match(/TURTLE_APP_BUILD\s*=\s*(\d+)/)?.[1]);
if (!/^\d+\.\d+\.\d+$/.test(version) || !Number.isInteger(build) || build < 1) throw Error('Invalid release version');
const entries = ['package.json', 'package-lock.json', 'capacitor.config.json', 'codemagic.yaml', '.gitignore', '.github', '.well-known',
  'app.js', 'index.html', 'config.js', 'styles.css', 'chat-tools.css', 'dark-surface-audit.css', 'species-data.js',
  'official.html', 'privacy.html', 'terms.html', 'support.html', 'apple-app-site-association', 'README.md',
  'server.js', 'ecosystem.config.cjs', 'assets', 'server', 'scripts', 'ios', 'deploy',
  `docs/ios-${build}-release.md`, 'docs/navigation-scroll-keyboard-audit.md', 'docs/bottom-nav-recovery.md', 'docs/species-selection-audit.md'];
const raw = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...entries], { cwd: root, maxBuffer: 16 * 1024 * 1024 }).toString('utf8');
const forbidden = /(^|\/)(?:\.git|node_modules|output|www|build|dist|data|uploads|backups|keys|Pods|DerivedData|xcuserdata)(?:\/|$)|(^|\/)\.env(?:$|\.(?!example$|sample$))|\.(?:p8|p12|jks|keystore|pem|key|log)$/i;
const files = [...new Set(raw.split('\0').filter(Boolean))].filter(file => {
  if (path.isAbsolute(file) || file.split('/').includes('..')) throw Error('Invalid source path');
  return !forbidden.test(file) && fs.existsSync(path.join(root, file));
}).sort();
const hashes = {};
for (const file of files) {
  const full = path.join(root, file);
  if (!fs.lstatSync(full).isFile()) throw Error('Expected regular source file: ' + file);
  const bytes = fs.readFileSync(full);
  // A PEM wrapper template is source code; reject a marker followed by actual
  // base64 key material, including a key embedded with escaped newlines.
  if (/-----BEGIN (?:EC |RSA |ENCRYPTED |OPENSSH )?PRIVATE KEY-----\s*[A-Za-z0-9+/=]{40,}/.test(bytes.toString('utf8').replace(/\\n/g, '\n'))) throw Error('Private key in source: ' + file);
  hashes[file] = crypto.createHash('sha256').update(bytes).digest('hex');
}
for (const required of ['app.js', 'server/server.js', 'server/team-breeding.js', 'assets/care-records.js', 'assets/care-records.css', 'scripts/build-web.js', 'scripts/verify-ios-build.js', 'ios/App/App.xcodeproj/project.pbxproj', `docs/ios-${build}-release.md`]) {
  if (!hashes[required]) throw Error('Missing release source: ' + required);
}
fs.mkdirSync(output, { recursive: true });
const name = `turtlekeeper-ios-${version}-build-${build}-source`;
const manifest = path.join(output, name + '-manifest.json');
const zip = path.join(output, name + '.zip');
fs.writeFileSync(manifest, JSON.stringify({ version, build, files: hashes }, null, 2));
execFileSync(process.env.PYTHON || 'python3', ['-c', [
  'import hashlib,json,pathlib,sys,zipfile',
  'root,manifest,dest=map(pathlib.Path,sys.argv[1:])',
  'meta=json.loads(manifest.read_text(encoding="utf-8"))',
  'with zipfile.ZipFile(dest,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:',
  ' for name in meta["files"]: z.write(root/name,name)',
  ' z.write(manifest,"SOURCE-MANIFEST.json")',
  'with zipfile.ZipFile(dest) as z:',
  ' assert z.testzip() is None',
  ' assert set(z.namelist())==set(meta["files"])|{"SOURCE-MANIFEST.json"}',
  ' for name,expected in meta["files"].items(): assert hashlib.sha256(z.read(name)).hexdigest()==expected,name',
].join('\n'), root, manifest, zip], { stdio: 'inherit' });
const checksum = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
fs.writeFileSync(zip + '.sha256', `${checksum}  ${path.basename(zip)}\n`);
console.log(JSON.stringify({ zip, files: files.length, bytes: fs.statSync(zip).size, sha256: checksum }));
