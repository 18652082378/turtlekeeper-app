'use strict';
// Only the seven production files and nine conflicts supplied on 2026-10-25.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), { execFileSync, spawnSync } = require('node:child_process');
const normalize = value => value.toString().replace(/\r\n/g, '\n');
const hash = value => crypto.createHash('sha256').update(normalize(value)).digest('hex');
const ensure = (yes, message) => { if (!yes) throw Error(message); };
const rawHash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function sourceHash(bytes, file) {
  const text = /\.(?:js|cjs|mjs|css|html|json|md|txt|sh|yaml|yml|xml|swift|plist|gradle|properties|pbxproj)$/.test(file)
    && !bytes.includes(0) && require('node:buffer').isUtf8(bytes);
  return text ? hash(bytes) : rawHash(bytes);
}
// Inspect every incoming path before changing anything. Only the incoming
// version or a version in its Git ancestry is recognized. Text comparison
// permits CRLF/LF differences; binary contents must match byte for byte.
function inspectUntracked({ root, targets, tracked, commit, git, readVersion }) {
  const known = [], unknown = [];
  for (const file of targets) {
    if (tracked.has(file)) continue;
    const target = path.join(root, file);
    let stat;
    try { stat = fs.lstatSync(target); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!stat.isFile() || fs.realpathSync(target) !== target) { unknown.push(file + ' (not a regular source file)'); continue; }
    const bytes = fs.readFileSync(target), digest = sourceHash(bytes, file);
    const versions = [commit];
    let matched = '';
    for (let index = 0; index < versions.length; index++) {
      const revision = versions[index];
      try { if (sourceHash(readVersion(revision, file), file) === digest) { matched = revision; break; } } catch { /* Deleted historical path. */ }
      if (index === 0) versions.push(...git(['log', '--format=%H', commit, '--', file]).trim().split(/\r?\n/).filter(value => value && value !== commit));
    }
    if (matched) known.push({ file, bytes, mode: stat.mode & 0o777, digest: rawHash(bytes), matchedCommit: matched });
    else unknown.push(file + ' (SHA256=' + rawHash(bytes) + ')');
  }
  return { known, unknown };
}
function checkUntracked(root, records) {
  for (const record of records) {
    const target = path.join(root, record.file);
    ensure(fs.lstatSync(target).isFile() && fs.realpathSync(target) === target
      && rawHash(fs.readFileSync(target)) === record.digest, 'Untracked source changed during checks: ' + record.file);
  }
}
function backupUntracked(backup, records) {
  for (const record of records) {
    const target = path.join(backup, 'untracked-source', record.file);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, record.bytes, { mode: 0o600, flag: 'wx' });
    ensure(rawHash(fs.readFileSync(target)) === record.digest, 'Untracked backup verification failed: ' + record.file);
  }
  fs.writeFileSync(path.join(backup, 'untracked-source-manifest.json'), JSON.stringify(records.map(({ bytes, ...record }) => record), null, 2), { mode: 0o600, flag: 'wx' });
}
function clearUntracked(root, records) {
  checkUntracked(root, records);
  for (const record of records) fs.unlinkSync(path.join(root, record.file));
}
function restoreUntracked(root, records) {
  const failures = [];
  for (const record of records) {
    const target = path.join(root, record.file);
    try {
      try {
        const stat = fs.lstatSync(target);
        ensure(stat.isFile() && fs.realpathSync(target) === target && rawHash(fs.readFileSync(target)) === record.digest,
          'Concurrent file was preserved: ' + record.file);
        continue;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      fs.writeFileSync(target, record.bytes, { flag: 'wx', mode: record.mode });
      fs.chmodSync(target, record.mode);
    } catch (error) { failures.push(error.message); }
  }
  ensure(!failures.length, 'Some source files need recovery from the private backup: ' + failures.join('; '));
}
const reviewed = {
  'app.js': '48fc958e256a403c529c0eef38099c833aeae43f7764c6a21218e2ddcea18547',
  'index.html': '92978dfe8637e815b54f2a6738f22f136b1e51f167fa2aae11034abc7ef37b45',
  'privacy.html': '70f9b0a612ae4f693d354e63d6c6849646396064b89d58259bf16bd9e0e2d151',
  'styles.css': '9db9a5643882d2966eab3721f1cebafa70954afcd029a1d7def913f6259294d2',
  'server/community-daily-push.js': 'f8f6a1439fb2feb6070325517f16c1e98af97864a871e34f95afff296cdf6e46',
  'server/mysql-record-store.js': '760cda50ae1ae9bc08c0d761ff691c15d6fe58ff4c1472142eb64e79bed94c51',
  'server/server.js': 'd3ae12e9fe91eeba129e91265af468bb99e0aab2ec470dfc3bfe320734d1b43d'
};
const conflictHashes = [
  '46492cb178fb32635c88c14f4e24a93ff1a53195a7d134a046b6f6d42a0b36ac',
  '99b3e41b46a14e3ae65214dd7b95a9172830677168da93ab0c6f124cd01115f6',
  '283a323613173b9a9443fe998f48588dc7c87c701afdd0cde9d827e4dc6f8514',
  'c27d457b2f17e682aba8fb20383daed99e9da1eeeaa1d1f7b021dc1f6e25c807',
  'ea84a1ef2a4faeadf1746fb5177edeba8f9c6dc04091079921e3fab308616dc0',
  '933da7531f0a33bc74948489f43d8aa4f02d0e8d5aae5e29cca8e8257d8401eb',
  '76adfe99944fc13f2b799aba50c33eeccb726e5181d45163fda9c300f1cb7ce8',
  '9e49510d0d8562b52b3586d0c2eb20da0e9e1efef4345f1910a3da5eddb17fbd',
  'd744bd1aef290db9dadc5022584346001cc9157cf1e83b8cc1f165460fb18f95'
];
function resolveReviewed(source) {
  let count = 0;
  const result = normalize(source).replace(/^<<<<<<< [^\n]*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> [^\n]*(?:\n|$)/gm, (_, current, incoming) => {
    ensure(hash(current + '\0' + incoming) === conflictHashes[count++], 'Unreviewed conflict; no running code changed.');
    return incoming;
  });
  ensure(count === 9 && !/^(?:<<<<<<< |=======|>>>>>>> )/m.test(result), 'Unexpected conflict count or markers; no running code changed.');
  return result;
}
// The old inline care patch inserts these raw fields before `turtles`.
// New normalization supplies the same keys later, so a three-way merge may
// retain the obsolete duplicate keys without reporting a conflict.
const oldCareFields = '    careRecords: Array.isArray(next.careRecords) ? next.careRecords : [],\n'
  + '    careCustomItems: Array.isArray(next.careCustomItems) ? next.careCustomItems : [],\n'
  + '    carePlans: Array.isArray(next.carePlans) ? next.carePlans : [],\n';
function withoutOldMarker(source) {
  let result = normalize(source).replace(/^\/\/ CARE_PERSISTENCE_HOTFIX_20260927\s*$/gm, '');
  const start = result.indexOf('function normalizeAccountData('), end = result.indexOf('\n}', start);
  if (start >= 0 && end > start) {
    const body = result.slice(start, end);
    if (['Records', 'Items', 'Plans'].every(name => body.includes('TurtleCare.normalize' + name + '('))) {
      result = result.slice(0, start) + body.replace(oldCareFields, '') + result.slice(end);
    }
  }
  return result.trimEnd();
}
async function main() {
  const [mode = '--check', root = '/www/turtlekeeper-app'] = process.argv.slice(2);
  ensure(process.argv.length <= 4 && ['--check', '--apply'].includes(mode) && process.platform === 'linux', 'Run --check or --apply in the Linux server terminal.');
  ensure(Number(process.versions.node.split('.')[0]) >= 22, 'Node.js 22+ is required.');
  ensure(root === '/www/turtlekeeper-app' && fs.realpathSync(root) === root, 'Unexpected server path.');
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 24e6 });
  ensure(git(['rev-parse', '--show-toplevel']).trim() === root, 'Expected the server Git root.');
  ensure(!git(['diff', '--cached', '--name-only']).trim(), 'Staged server edits require review.');
  const previous = git(['rev-parse', 'HEAD']).trim();
  ensure(previous.startsWith('627add3'), 'Server baseline changed; no source replaced.');
  const commit = git(['rev-parse', 'origin/main']).trim();
  git(['merge-base', '--is-ancestor', previous, commit]);
  ensure(JSON.parse(git(['show', commit + ':package.json'])).version === '1.1.9'
    && /TURTLE_APP_BUILD\s*=\s*137;/.test(git(['show', commit + ':config.js'])), 'Upload release 137 first.');
  const incoming = normalize(git(['show', commit + ':server/server.js']));
  ensure(hash(incoming) === 'e3e8139827c4d3e9003d4a7037d4a667b60c0c2f27c731a46316ed7853403b23', 'Release server changed; review is required.');
  ensure(/Math\.max\(136,/.test(git(['show', commit + ':server/app-update-policy.js'])), 'Upload the corrected policy first; current iOS floor must remain 136.');
  const files = Object.keys(reviewed);
  const changed = git(['diff', '--name-only', '-z']).split('\0').filter(Boolean);
  ensure(changed.length === files.length && changed.every(file => files.includes(file)), 'Unexpected changed server files; nothing replaced.');
  function checkFiles() {
    for (const file of files) {
      const target = path.join(root, file);
      ensure(fs.lstatSync(target).isFile() && fs.realpathSync(target) === target && hash(fs.readFileSync(target)) === reviewed[file], 'Server file changed since review: ' + file);
    }
  }
  checkFiles();
  const tracked = new Set(git(['ls-files', '-z']).split('\0'));
  const collisions = inspectUntracked({ root, tracked, commit, git,
    targets: git(['ls-tree', '-r', '--name-only', '-z', commit]).split('\0').filter(Boolean),
    readVersion: (revision, file) => execFileSync('git', ['show', revision + ':' + file], { cwd: root, maxBuffer: 24e6, stdio: ['ignore', 'pipe', 'pipe'] }) });
  ensure(!collisions.unknown.length, 'Unreviewed untracked files; no source changed:\n' + collisions.unknown.join('\n'));
  console.log('Checked all incoming paths: ' + collisions.known.length + ' untracked files match release 137 or a version in its Git history.');
  const apps = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 8e6 }));
  const matches = apps.filter(app => app.name === 'turtlekeeper-api');
  const env = matches[0]?.pm2_env;
  ensure(matches.length === 1 && env.status === 'online' && !env.watch && env.pm_cwd === root
    && env.pm_exec_path === path.join(root, 'server/server.js'), 'Unexpected PM2 process; no source replaced.');
  execFileSync('npm', ['--version'], { stdio: 'pipe' });
  const response = await fetch('https://api.turtleworld.cn/api/app/version?platform=ios', { signal: AbortSignal.timeout(10000) });
  const policy = await response.json();
  ensure(response.ok && policy.ok === true && policy.minimumBuild === 136 && policy.latestBuild === 136, 'Live iOS policy differs from reviewed 136/136; nothing replaced.');
  const temp = fs.mkdtempSync(path.join(os.homedir(), 'turtlekeeper-137-reviewed-'));
  fs.chmodSync(temp, 0o700);
  const tempFile = (file, bytes) => { const name = path.join(temp, file); fs.writeFileSync(name, bytes, { mode: 0o600, flag: 'wx' }); return name; };
  const merge = spawnSync('git', ['merge-file', '-p', '--',
    tempFile('current.js', normalize(fs.readFileSync(path.join(root, 'server/server.js')))),
    tempFile('base.js', normalize(git(['show', previous + ':server/server.js']))), tempFile('release.js', incoming)], { encoding: 'utf8', maxBuffer: 24e6 });
  ensure(!merge.error && merge.status > 0 && merge.status < 128, 'Unexpected merge result; no running code changed.');
  const resolved = resolveReviewed(merge.stdout);
  const resolvedPath = tempFile('resolved.js', resolved);
  if (withoutOldMarker(resolved) !== withoutOldMarker(incoming)) {
    console.error('Additional production changes remain. No source was replaced. Private comparison: ' + temp);
    const diff = spawnSync('git', ['diff', '--no-index', '--', path.join(temp, 'release.js'), resolvedPath], { encoding: 'utf8', maxBuffer: 4e6 });
    console.error(diff.stdout);
    throw Error('Send the additional difference output for review.');
  }
  console.log('PASS: seven reviewed files, nine reviewed conflicts; no extra production fixes would be lost. iOS floor remains 136.');
  if (mode === '--check') return;
  execFileSync('tar', ['-cf', path.join(temp, 'modified-source.tar'), '--', ...files], { cwd: root });
  tempFile('local-changes.patch', git(['diff', '--binary', 'HEAD']));
  tempFile('previous-commit.txt', previous + '\n');
  backupUntracked(temp, collisions.known);
  console.log('Private source backup: ' + temp);
  checkFiles();
  checkUntracked(root, collisions.known);
  ensure(git(['rev-parse', 'origin/main']).trim() === commit && git(['rev-parse', 'HEAD']).trim() === previous, 'Git state changed during review.');
  let stash = '';
  try {
    git(['stash', 'push', '-m', 'reviewed-production-before-137', '--', ...files]);
    stash = git(['rev-parse', 'refs/stash']).trim();
    tempFile('stash-commit.txt', stash + '\n');
    clearUntracked(root, collisions.known);
    execFileSync('bash', ['-s', '--', '--apply', root], { cwd: root,
      input: git(['show', commit + ':scripts/deploy-server-137.sh']),
      env: { ...process.env, TURTLE_RELEASE_COMMIT: commit }, stdio: ['pipe', 'inherit', 'inherit'] });
  } catch (error) {
    if (git(['rev-parse', 'HEAD']).trim() === previous) {
      try { restoreUntracked(root, collisions.known); console.error('The original untracked sources were restored.'); }
      catch (failure) { console.error(failure.message); }
      if (stash) {
        try { git(['stash', 'apply', '--index', stash]); console.error('The old tracked source edits were restored.'); }
        catch (failure) { console.error('Tracked source recovery needs the saved stash: ' + failure.message); }
      }
    }
    console.error('Deployment did not complete. Keep source backup: ' + temp + '; stash: ' + stash);
    throw error;
  }
  console.log('The old edits remain recoverable in the private backup and Git stash. Do not apply the old stash onto release 137.');
}
module.exports = { resolveReviewed, withoutOldMarker, reviewed, sourceHash, inspectUntracked, checkUntracked, backupUntracked, clearUntracked, restoreUntracked };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
