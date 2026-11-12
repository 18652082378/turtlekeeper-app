#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -gt 1 || ( "$#" -eq 1 && "$1" != --check ) ]]; then
  printf '%s\n' 'Use --check or no arguments.' >&2
  exit 1
fi

source_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
manifest=scripts/ios-145-release-files.txt
base=c6638afeb56f2d1d08a82f0678eed691daeb7f90
remote=https://github.com/18652082378/turtlekeeper-app.git
cd "$source_root"

node - "$manifest" <<'NODE'
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const files = fs.readFileSync(process.argv[2], 'utf8').trim().split(/\r?\n/);
const snapshot = fs.existsSync('SOURCE-MANIFEST.json') ? JSON.parse(fs.readFileSync('SOURCE-MANIFEST.json', 'utf8')) : null;
assert.equal(files.length, new Set(files).size);
if (snapshot) {
  assert.equal(snapshot.version, '1.2.3');
  assert.equal(snapshot.build, 145);
}
for (const file of files) {
  assert.match(file, /^(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.@-]+$/);
  assert(!file.split('/').some(part => part === '..' || part === '.' || part === '.git'));
  assert(fs.lstatSync(file).isFile(), 'Missing regular release source: ' + file);
  if (snapshot) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), snapshot.files[file], 'Source hash differs: ' + file);
}
const config = fs.readFileSync('config.js', 'utf8');
assert.match(config, /TURTLE_APP_BUILD\s*=\s*145;/);
assert.match(config, /TURTLE_APP_VERSION\s*=\s*"1\.2\.3";/);
assert.equal(JSON.parse(fs.readFileSync('package.json', 'utf8')).version, '1.2.3');
const project = fs.readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
assert.deepEqual([...project.matchAll(/CURRENT_PROJECT_VERSION\s*=\s*(\d+);/g)].map(match => match[1]), Array(4).fill('145'));
assert.deepEqual([...project.matchAll(/MARKETING_VERSION\s*=\s*([^;]+);/g)].map(match => match[1]), Array(4).fill('1.2.3'));
console.log('Checked iOS 1.2.3 (145) and ' + files.length + ' upload paths.');
NODE
if [[ "${1:-}" == --check ]]; then exit 0; fi

release_dir="$(mktemp -d)"
printf 'Release checkout: %s\n' "$release_dir"
git clone --single-branch --branch main -- "$remote" "$release_dir"
if [[ "$(git -C "$release_dir" rev-parse HEAD)" != "$base" ]]; then
  printf '%s\n' 'GitHub main has changed since the reviewed build 144. Stop and review the new commit.' >&2
  exit 1
fi

while IFS= read -r file; do
  file="${file%$'\r'}"
  [[ -n "$file" ]] || continue
  mkdir -p -- "$release_dir/$(dirname -- "$file")"
  cp -- "$source_root/$file" "$release_dir/$file"
done < "$manifest"

git -C "$release_dir" --literal-pathspecs add --pathspec-from-file="$release_dir/$manifest"
git -C "$release_dir" -c core.whitespace=cr-at-eol diff --cached --check
git -C "$release_dir" commit -m 'Release iOS 1.2.3 build 145'
git -C "$release_dir" push origin HEAD:refs/heads/main
commit="$(git -C "$release_dir" rev-parse HEAD)"
published="$(git -C "$release_dir" ls-remote origin refs/heads/main | cut -f1)"
[[ "$published" == "$commit" ]]
printf 'GitHub main %s is ready for Codemagic iOS TestFlight 1.2.3 (145).\n' "$commit"
