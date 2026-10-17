#!/usr/bin/env bash
set -euo pipefail
cd "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
node scripts/verify-ios-upload-manifest.cjs
node scripts/verify-ios-build.js --native
node - <<'NODE'
const fs = require('node:fs');
if (!/TURTLE_APP_BUILD\s*=\s*135;/.test(fs.readFileSync('config.js', 'utf8'))) throw Error('Expected iOS build 135');
if (JSON.parse(fs.readFileSync('package.json', 'utf8')).version !== '1.1.8') throw Error('Expected version 1.1.8');
const files = fs.readFileSync('scripts/ios-135-release-files.txt', 'utf8').split(/\r?\n/).filter(Boolean);
for (const file of files) if (!fs.statSync(file).isFile()) throw Error('Missing release source: ' + file);
console.log('Ready: iOS 1.1.8 (135) release source.');
NODE
if [[ "${1:-}" == "--check" ]]; then exit 0; fi
if [[ "$#" -gt 0 ]]; then printf '%s\n' 'Use --check or no arguments.' >&2; exit 1; fi
if [[ "$(git branch --show-current)" != main ]]; then
  printf '%s\n' 'Run this release upload from the main branch.' >&2
  exit 1
fi
mapfile -t release_files < <(tr -d '\r' < scripts/ios-135-release-files.txt)
git add --pathspec-from-file=scripts/ios-135-release-files.txt
git diff --cached --check -- "${release_files[@]}"
if ! git diff --cached --quiet -- "${release_files[@]}"; then
  git -c gc.auto=0 -c maintenance.auto=false commit --only \
    -m "Release iOS 1.1.8 build 135: responsive pages and visual placeholders" \
    --pathspec-from-file=scripts/ios-135-release-files.txt
fi
node - <<'NODE'
const { execFileSync } = require('node:child_process');
const config = execFileSync('git', ['show', 'HEAD:config.js'], { encoding: 'utf8' });
if (!/TURTLE_APP_BUILD\s*=\s*135;/.test(config)) throw Error('The new commit is not build 135; stopped before push.');
NODE
git -c gc.auto=0 -c maintenance.auto=false push origin main
node - <<'NODE'
const { execFileSync } = require('node:child_process');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const remote = execFileSync('git', ['ls-remote', 'origin', 'refs/heads/main'], { encoding: 'utf8' }).trim().split(/\s+/)[0];
if (remote !== head) throw Error('GitHub main does not match the new commit; do not start Codemagic yet.');
console.log('Confirmed GitHub main for build 135: ' + head.slice(0, 12));
NODE
printf '%s\n' 'Upload complete. In Codemagic, build main using iOS TestFlight for 1.1.8 (135).'
