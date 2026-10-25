'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { resolveReviewed, withoutOldMarker, reviewed } = require('./reconcile-server-137.cjs');
const pairs = require('./fixtures/reviewed-server-137-conflicts.json');
const conflict = (left, right) => `<<<<<<< current\n${left}=======\n${right}>>>>>>> release\n`;
const source = pairs.map(pair => conflict(...pair)).join('');
assert.equal(resolveReviewed(source), pairs.map(pair => pair[1]).join(''));
assert.equal(resolveReviewed(source.replace(/\n/g, '\r\n')), resolveReviewed(source));
assert.throws(() => resolveReviewed(source.replace('careRecords: [], careCustomItems:', 'careRecords: [1], careCustomItems:')), /Unreviewed/);
assert.throws(() => resolveReviewed(pairs.slice(1).map(pair => conflict(...pair)).join('')), /Unreviewed|count/);
assert.throws(() => resolveReviewed(source + conflict('unknown\n', 'unknown\n')), /Unreviewed/);
assert.throws(() => resolveReviewed(source + '\n<<<<<<< stray\n'), /markers/);
assert.equal(withoutOldMarker('code\n\n// CARE_PERSISTENCE_HOTFIX_20260927\n'), 'code');
assert.notEqual(withoutOldMarker('code\nproductionFix();\n'), withoutOldMarker('code\n'));
const normalizer = 'function normalizeAccountData(data = {}) {\n  return {\n    turtles: [],\n    careRecords: TurtleCare.normalizeRecords(next.careRecords),\n    careCustomItems: TurtleCare.normalizeItems(next.careCustomItems),\n    carePlans: TurtleCare.normalizePlans(next.carePlans)\n  };\n}';
const oldFields = '    careRecords: Array.isArray(next.careRecords) ? next.careRecords : [],\n    careCustomItems: Array.isArray(next.careCustomItems) ? next.careCustomItems : [],\n    carePlans: Array.isArray(next.carePlans) ? next.carePlans : [],\n';
assert.equal(withoutOldMarker(normalizer.replace('    turtles:', oldFields + '    turtles:')), normalizer);
assert.notEqual(withoutOldMarker(normalizer.replace('    turtles:', oldFields.replace('next.careRecords : []', 'next.careRecords : [1]') + '    turtles:')), normalizer);
assert.equal(Object.keys(reviewed).length, 7);
const installer = fs.readFileSync(path.join(__dirname, 'reconcile-server-137.cjs'), 'utf8');
for (const guard of ['checkFiles();', 'withoutOldMarker(resolved)', "'Unreviewed untracked files;", 'policy.minimumBuild === 136', 'backupUntracked(temp, collisions.known)', 'checkUntracked(root, collisions.known)']) {
  assert(installer.indexOf(guard) < installer.indexOf("git(['stash', 'push'"), 'Preflight must precede source changes: ' + guard);
}
assert(!installer.includes('reset --hard') && !installer.includes("'stash', 'pop'"));
console.log('PASS: the nine supplied conflicts resolve exactly; unknown/extra/malformed conflicts and unreviewed extra code are rejected; checks precede source changes.');

// Exercise historical untracked files using real Git objects and a private,
// isolated checkout. No existing repository, service or database is modified.
const { execFileSync } = require('node:child_process');
const { sourceHash, inspectUntracked, backupUntracked, clearUntracked, restoreUntracked } = require('./reconcile-server-137.cjs');
const output = fs.realpathSync(path.join(__dirname, '../output'));
const root = fs.mkdtempSync(path.join(output, 'reconcile-untracked-test-'));
const originalUnlink = fs.unlinkSync;
try {
  const git = args => execFileSync('git', ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const commit = message => git(['-c', 'user.name=Release Test', '-c', 'user.email=release@example.invalid', 'commit', '-qm', message]);
  git(['init', '-q']);
  fs.writeFileSync(path.join(root, 'README.md'), 'synthetic fixture\n'); git(['add', '.']); commit('baseline');
  const base = git(['rev-parse', 'HEAD']).trim();
  fs.mkdirSync(path.join(root, 'assets'));
  const oldCss = '/* old */\nbody { color: green; }\n', latestJs = 'const version = 137;\n';
  const binary = Buffer.from([137, 80, 78, 71, 0, 255, 13, 10]);
  fs.writeFileSync(path.join(root, 'assets/team-space.css'), oldCss);
  fs.writeFileSync(path.join(root, 'assets/same.js'), latestJs);
  fs.writeFileSync(path.join(root, 'assets/image.png'), binary);
  fs.writeFileSync(path.join(root, 'assets/custom.js'), 'reviewed\n');
  fs.writeFileSync(path.join(root, 'assets/blocked.css'), 'reviewed\n');
  git(['add', '.']); commit('first source version');
  fs.writeFileSync(path.join(root, 'assets/team-space.css'), '/* latest */\nbody { color: teal; }\n');
  fs.writeFileSync(path.join(root, 'assets/image.png'), Buffer.from([137, 80, 78, 71, 0, 254]));
  git(['add', '.']); commit('new release');
  const incoming = git(['rev-parse', 'HEAD']).trim();
  git(['checkout', '--detach', '-q', base]);
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(root, 'server'));
  fs.writeFileSync(path.join(root, 'server/.env'), 'SYNTHETIC_CONFIG=must-stay\n');
  fs.writeFileSync(path.join(root, 'assets/team-space.css'), oldCss.replace(/\n/g, '\r\n'));
  fs.writeFileSync(path.join(root, 'assets/same.js'), latestJs.replace(/\n/g, '\r\n'));
  fs.writeFileSync(path.join(root, 'assets/image.png'), binary);
  fs.writeFileSync(path.join(root, 'assets/custom.js'), 'private custom change\n');
  fs.mkdirSync(path.join(root, 'assets/blocked.css'));
  const report = inspectUntracked({ root, commit: incoming, git,
    targets: git(['ls-tree', '-r', '--name-only', '-z', incoming]).split('\0').filter(Boolean),
    tracked: new Set(git(['ls-files', '-z']).split('\0')),
    readVersion: (revision, file) => execFileSync('git', ['show', revision + ':' + file], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }) });
  assert.equal(report.known.length, 3);
  assert.equal(report.unknown.length, 2, 'All unknown collisions are collected together');
  assert(report.unknown.some(line => line.startsWith('assets/custom.js ')));
  assert(report.unknown.some(line => line.startsWith('assets/blocked.css ')));
  assert.notEqual(report.known.find(record => record.file.endsWith('.css')).matchedCommit, incoming);
  assert.equal(report.known.find(record => record.file.endsWith('.js')).matchedCommit, incoming);
  assert.notEqual(sourceHash(Buffer.from([255]), 'image.png'), sourceHash(Buffer.from([254]), 'image.png'));
  const backup = fs.mkdtempSync(path.join(root, 'backup-'));
  backupUntracked(backup, report.known);
  for (const record of report.known) assert.deepEqual(fs.readFileSync(path.join(backup, 'untracked-source', record.file)), record.bytes);
  const first = report.known[0];
  fs.appendFileSync(path.join(root, first.file), 'concurrent edit');
  assert.throws(() => clearUntracked(root, report.known), /changed during checks/);
  assert(report.known.every(record => fs.existsSync(path.join(root, record.file))), 'No removal when source changed');
  fs.writeFileSync(path.join(root, first.file), first.bytes);
  clearUntracked(root, report.known);
  assert(report.known.every(record => !fs.existsSync(path.join(root, record.file))));
  restoreUntracked(root, report.known);
  for (const record of report.known) assert.deepEqual(fs.readFileSync(path.join(root, record.file)), record.bytes);
  let calls = 0;
  fs.unlinkSync = target => { if (++calls === 2) throw Error('synthetic partial removal failure'); return originalUnlink(target); };
  assert.throws(() => clearUntracked(root, report.known), /partial removal/);
  fs.unlinkSync = originalUnlink;
  restoreUntracked(root, report.known);
  clearUntracked(root, report.known);
  fs.writeFileSync(path.join(root, first.file), 'new concurrent file');
  assert.throws(() => restoreUntracked(root, report.known), /Concurrent file was preserved/);
  assert.equal(fs.readFileSync(path.join(root, first.file), 'utf8'), 'new concurrent file');
  assert.equal(fs.readFileSync(path.join(root, 'server/.env'), 'utf8'), 'SYNTHETIC_CONFIG=must-stay\n');
  assert.equal(fs.readFileSync(path.join(root, 'assets/custom.js'), 'utf8'), 'private custom change\n');
  // Reconstruct the supplied server hash from reviewed Git code, rather than
  // trusting an arbitrary screenshot hash as an upgrade exception.
  const repository = path.resolve(__dirname, '..');
  const oldTeam = execFileSync('git', ['show', '4fd1de3:server/team-space.js'], { cwd: repository, encoding: 'utf8' }).replace(/\r\n/g, '\n');
  const newTeam = fs.readFileSync(path.join(repository, 'server/team-space.js'), 'utf8').replace(/\r\n/g, '\n');
  const access = text => { const start = text.indexOf('function access('); const end = text.indexOf('\nfunction ', start + 1); assert(start >= 0 && end > start); return text.slice(start, end); };
  const partialTeam = oldTeam.replace(access(oldTeam), () => access(newTeam));
  const { reviewedUntrackedHashes } = require('./reconcile-server-137.cjs');
  assert.equal(sourceHash(Buffer.from(partialTeam), 'server/team-space.js'), reviewedUntrackedHashes['server/team-space.js']);
  fs.writeFileSync(path.join(root, 'server/team-space.js'), partialTeam);
  const partialOptions = { root, commit: incoming, git, tracked: new Set(), targets: ['server/team-space.js'], readVersion() { throw Error('not a synthetic Git path'); } };
  const partialReport = inspectUntracked(partialOptions);
  assert.equal(partialReport.known.length, 1); assert.equal(partialReport.unknown.length, 0);
  fs.appendFileSync(path.join(root, 'server/team-space.js'), '\n// unknown extra change');
  assert.equal(inspectUntracked(partialOptions).unknown.length, 1);
  fs.writeFileSync(path.join(root, 'server/another-file.js'), partialTeam);
  assert.equal(inspectUntracked({ ...partialOptions, targets: ['server/another-file.js'] }).unknown.length, 1);
  console.log('PASS: all untracked collisions inspected; current/historical text and binary versions recognized; unknown files preserved; backups, concurrent edits and partial-failure recovery checked in an isolated Git repository.');
  console.log('PASS: the supplied team module is exactly build 110 plus the reviewed Alipay access change; extra changes and the same bytes at another path remain rejected.');
} finally {
  fs.unlinkSync = originalUnlink;
  assert.equal(path.dirname(root), output);
  assert(path.basename(root).startsWith('reconcile-untracked-test-'));
  fs.rmSync(root, { recursive: true, force: true });
}
