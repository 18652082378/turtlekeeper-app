const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const verifier = path.join(root, 'scripts/verify-ios-build.js');
const load = createRequire(verifier);
const outcomes = [];
function check(name, run) {
  try { run(); outcomes.push({ name, pass: true }); }
  catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
}
function verify(overrides = {}, native = false) {
  const fakeFs = Object.create(fs);
  fakeFs.readFileSync = (file, options) => {
    const key = path.relative(root, path.resolve(file)).split(path.sep).join('/');
    if (!Object.hasOwn(overrides, key)) return fs.readFileSync(file, options);
    if (overrides[key] === null) throw Error(`ENOENT: ${key}`);
    const bytes = Buffer.from(overrides[key]);
    return typeof options === 'string' || options?.encoding ? bytes.toString(typeof options === 'string' ? options : options.encoding) : bytes;
  };
  for (const operation of ['writeFileSync', 'unlinkSync', 'rmSync']) fakeFs[operation] = () => { throw Error('Verifier must not mutate files'); };
  vm.runInNewContext(read('scripts/verify-ios-build.js'), {
    require: name => ['fs', 'node:fs'].includes(name) ? fakeFs : load(name),
    __dirname: path.dirname(verifier), process: { argv: ['node', verifier, ...(native ? ['--native'] : [])] },
    console: { log() {} }, Buffer
  }, { filename: verifier });
}

check('current source and web resources validate without writes', () => verify());
check('current native resources and plugins validate without writes', () => verify({}, true));
for (const file of ['assets/ui-system.css', 'assets/ui-experience.js', 'privacy.html']) {
  check(`stale web ${file} is rejected`, () => assert.throws(() => verify({ [`www/${file}`]: 'stale release fixture' }), /[Ss]tale|differs/));
}
check('stale native shared UI file is rejected', () => assert.throws(() => verify({ 'ios/App/App/public/assets/ui-experience.js': 'stale fixture' }, true), /Stale native asset: assets\/ui-experience.js/));
check('missing video plugin in synced native config is rejected', () => {
  const config = JSON.parse(read('ios/App/App/capacitor.config.json'));
  config.packageClassList = config.packageClassList.filter(name => name !== 'TurtleVideoCachePlugin');
  assert.throws(() => verify({ 'ios/App/App/capacitor.config.json': JSON.stringify(config) }, true), /TurtleVideoCachePlugin/);
});
check('plugin configurator restores all local plugins and is idempotent', () => {
  let data = JSON.stringify({ packageClassList: ['AppPlugin', 'PushNotificationsPlugin'] });
  const fakeFs = {
    existsSync: file => path.basename(file) === 'capacitor.config.json',
    readFileSync: () => data,
    writeFileSync: (_file, value) => { data = value; }
  };
  const run = () => vm.runInNewContext(read('scripts/configure-ios-local-plugins.js'), {
    require: name => name === 'fs' ? fakeFs : require(name), __dirname,
    console: { log() {} }, process: { exit() { throw Error('Unexpected exit'); } }
  });
  run(); const first = data; run(); assert.equal(data, first);
  const actual = JSON.parse(data).packageClassList;
  for (const name of ['AppPlugin','PushNotificationsPlugin','TurtleMediaPickerPlugin','TurtleAppReviewPlugin','TurtlePurchasesPlugin','TurtleVideoCachePlugin']) assert.ok(actual.includes(name), `Missing ${name}`);
});
check('absent app privacy manifest is rejected', () => assert.throws(() => verify({ 'ios/App/App/PrivacyInfo.xcprivacy': null }), /PrivacyInfo/));
check('incorrect file timestamp reason is rejected', () => {
  const file = 'ios/App/App/PrivacyInfo.xcprivacy';
  const value = fs.existsSync(path.join(root,file)) ? read(file).replace('C617.1','INVALID.1') : '<plist><dict/></plist>';
  assert.throws(() => verify({ [file]: value }), /C617.1|timestamp/i);
});
check('privacy manifest must be in the actual Xcode resources phase', () => {
  const file = 'ios/App/App.xcodeproj/project.pbxproj';
  const value = read(file).replace(/^\s*[A-F0-9]+ \/\* PrivacyInfo\.xcprivacy in Resources \*\/,\s*$/gm,'');
  assert.throws(() => verify({ [file]: value }), /PrivacyInfo.*[Rr]esources|privacy manifest.*[Rr]esources/i);
});
check('GitHub sync must configure local plugins before native verification', () => {
  const file = '.github/workflows/ios-check.yml';
  assert.throws(() => verify({ [file]: read(file).replace(/.*node scripts\/configure-ios-local-plugins\.js.*\r?\n/g,'') }), /workflow|GitHub/i);
});
for (const command of ['node scripts/verify-ios-signing.cjs', 'node scripts/verify-ios-signing.cjs --applied']) {
  check(`Codemagic cannot omit signing gate: ${command}`, () => {
    const file = 'codemagic.yaml';
    const value = read(file).split(/\r?\n/).filter(line => line.trim() !== command).join('\n');
    assert.throws(() => verify({ [file]: value }), /signing profiles before Build IPA/);
  });
}
const report = path.join(root,'output/release-acceptance/ios-readiness-regression.json');
fs.mkdirSync(path.dirname(report), { recursive:true });
fs.writeFileSync(report,JSON.stringify({ scope:'Read-only verifier with in-memory invalid artifact fixtures. Not an Xcode build.', outcomes },null,2));
console.log(JSON.stringify(outcomes,null,2));
if (outcomes.some(item => !item.pass)) process.exitCode = 1;
