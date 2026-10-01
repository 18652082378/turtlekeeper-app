'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'output');
const folder = path.join(out, 'turtlekeeper-community-recommendation-v3');
fs.mkdirSync(folder, { recursive: true });
const names = ['deploy-community-recommendation.cjs', 'community-admin-recommendation-patch.cjs', 'community-daily-push.js'];
const hashes = {};
for (const name of names) {
  const bytes = Buffer.from(fs.readFileSync(path.join(root, name.endsWith('.cjs') ? 'scripts' : 'server', name), 'utf8').replace(/\r\n/g, '\n'));
  execFileSync(process.execPath, ['--check'], { input: bytes });
  fs.writeFileSync(path.join(folder, name), bytes); hashes[name] = crypto.createHash('sha256').update(bytes).digest('hex');
}
const { NEW_HASH } = require('./deploy-community-recommendation.cjs');
if (hashes['community-daily-push.js'] !== NEW_HASH) throw Error('Deployment source checksum is stale');
fs.writeFileSync(path.join(folder, 'SHA256SUMS'), Object.entries(hashes).map(([name, hash]) => `${hash}  ${name}`).join('\n') + '\n');
const archive = path.join(out, 'turtlekeeper-community-recommendation-v3.tar.gz');
execFileSync('tar', ['-czf', archive, '-C', folder, ...names, 'SHA256SUMS']);
const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/).sort();
if (entries.join() !== [...names, 'SHA256SUMS'].sort().join()) throw Error('Unexpected archive entries');
for (const name of names) {
  const bytes = execFileSync('tar', ['-xOf', archive, name]);
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== hashes[name]) throw Error('Archived file checksum mismatch');
}
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
fs.writeFileSync(archive + '.sha256', `${sha256}  ${path.basename(archive)}\n`);
const manifest = { archive, bytes: fs.statSync(archive).size, sha256, files: hashes, productionDeployed: false };
fs.writeFileSync(path.join(out, 'community-recommendation-package-v3.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
