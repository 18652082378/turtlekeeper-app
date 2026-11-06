'use strict';
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hash } = require('./deploy-mediation-applications.cjs');
const root = path.resolve(__dirname, '..');
const files = ['scripts/deploy-mediation-applications.cjs', 'deploy/mediation-141/server.json'];
function buildCommand(revision) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw Error('An exact Git commit is required');
  const checksums = files.map(file => hash(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'))));
  return `bash <<'MEDIATION_141' || echo 'Update stopped; keep and send the output.'
set -euo pipefail
umask 077
command -v curl node sha256sum >/dev/null
patch_dir=$(mktemp -d "$HOME/turtle-mediation-141-XXXXXXXX")
get_file() {
  for base in \\
    'https://cdn.jsdelivr.net/gh/18652082378/turtlekeeper-app@${revision}' \\
    'https://fastly.jsdelivr.net/gh/18652082378/turtlekeeper-app@${revision}' \\
    'https://raw.githubusercontent.com/18652082378/turtlekeeper-app/${revision}'; do
    if curl --fail --location --silent --show-error --connect-timeout 6 --max-time 45 --output "$3" "$base/$1" &&
      echo "$2  $3" | sha256sum -c -; then return 0; fi
  done
  echo 'Download/checksum failed; nothing installed.' >&2
  return 1
}
get_file '${files[0]}' '${checksums[0]}' "$patch_dir/install.cjs"
get_file '${files[1]}' '${checksums[1]}' "$patch_dir/server.json"
node "$patch_dir/install.cjs" --check /www/turtlekeeper-app "$patch_dir/server.json"
node "$patch_dir/install.cjs" --apply /www/turtlekeeper-app "$patch_dir/server.json"
MEDIATION_141
`;
}
module.exports = { buildCommand };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--revision')) throw Error('Use --revision commit or no arguments after uploading');
  const revision = args[1] || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  for (const file of files) {
    const committed = execFileSync('git', ['show', revision + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 2e6 }).replace(/\r\n/g, '\n');
    if (hash(committed) !== hash(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'))) throw Error('Upload the reviewed server files before generating this command');
  }
  const command = buildCommand(revision), target = path.join(root, 'output/update-mediation-141.sh');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, command);
  try { execFileSync('clip.exe', { input: command, windowsHide: true }); console.log('Server command copied. Paste once into the logged-in Aliyun Shell (not Agent).'); }
  catch { console.log('Clipboard unavailable. Open the saved server command file and copy its full contents.'); }
  console.log('Server command saved: ' + target);
}
