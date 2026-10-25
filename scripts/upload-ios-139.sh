#!/usr/bin/env bash
set -euo pipefail
cd "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$#" -gt 1 || ( "$#" -eq 1 && "$1" != --check ) ]]; then
  printf '%s\n' 'Use --check or no arguments.' >&2; exit 1
fi
if [[ ! -f node_modules/plist/package.json ]]; then npm ci --cache .npm-cache --no-audit --no-fund; fi
if [[ -z "${BROWSER_EXECUTABLE:-}" && -f 'C:/Program Files/Google/Chrome/Application/chrome.exe' ]]; then
  export BROWSER_EXECUTABLE='C:/Program Files/Google/Chrome/Application/chrome.exe'
fi
if [[ -d .browser-tests ]]; then export PLAYWRIGHT_BROWSERS_PATH="$PWD/.browser-tests"; fi
node scripts/check-mobile-release.cjs --prepare-only
node scripts/verify-ios-build.js --native
node scripts/verify-release-139.cjs
node scripts/verify-ios-upload-manifest.cjs
node scripts/test-api-request-resilience.cjs
node scripts/test-app-update-policy.cjs
node scripts/test-community-release-138.cjs
node scripts/test-community-page-polish.cjs --bundle
node scripts/test-community-single-photo.cjs
node scripts/test-server-release-137.cjs
if [[ "${1:-}" == --check ]]; then exit 0; fi
# Support this app's detached worktree as well as main, without forced pushes.
# Windows can hold old packfiles open in another Git client. Fetch source
# without launching unrelated automatic repacking or maintenance.
git -c gc.auto=0 -c maintenance.auto=false fetch origin main
if ! git merge-base --is-ancestor origin/main HEAD; then
  printf '%s\n' 'GitHub main has changes missing here. Stopped; do not force push.' >&2; exit 1
fi
node - <<'NODE'
const fs = require('node:fs'), {execFileSync} = require('node:child_process');
const allowed = new Set(fs.readFileSync('scripts/ios-139-release-files.txt','utf8').trim().split(/\r?\n/));
const changed = execFileSync('git',['diff','--name-only','-z','origin/main','HEAD']).toString().split('\0').filter(Boolean);
const outside = changed.filter(file => !allowed.has(file));
if (outside.length) throw Error('Existing commits include files outside this release: '+outside.join(', '));
NODE
git add --pathspec-from-file=scripts/ios-139-release-files.txt
git diff --cached --check
# Read path lists through files/stdout rather than overflowing Windows argv limits.
if node - <<'NODE'
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
const allowed=new Set(fs.readFileSync('scripts/ios-139-release-files.txt','utf8').trim().split(/\r?\n/));
const staged=execFileSync('git',['diff','--cached','--name-only','-z']).toString().split('\0').filter(Boolean);
process.exit(staged.some(file=>allowed.has(file))?0:1);
NODE
then
  git -c gc.auto=0 -c maintenance.auto=false commit --only \
    -m "Release iOS 1.1.9 build 139" \
    --pathspec-from-file=scripts/ios-139-release-files.txt
fi
node - <<'NODE'
const {execFileSync} = require('node:child_process');
const config=execFileSync('git',['show','HEAD:config.js'],{encoding:'utf8'});
if (!/TURTLE_APP_BUILD\s*=\s*139;/.test(config) || !/TURTLE_APP_VERSION\s*=\s*"1\.1\.9"/.test(config)) throw Error('HEAD is not 1.1.9 (139); stopped before push.');
NODE
git -c gc.auto=0 -c maintenance.auto=false push origin HEAD:main
node - <<'NODE'
const {execFileSync} = require('node:child_process');
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const remote=execFileSync('git',['ls-remote','origin','refs/heads/main'],{encoding:'utf8'}).trim().split(/\s+/)[0];
if(remote!==head) throw Error('GitHub main differs from the release commit.');
console.log('Confirmed GitHub main: '+head+'; iOS 1.1.9 (139).');
NODE
printf '%s\n' 'Next: start a NEW Codemagic iOS TestFlight build from this latest main commit. Website files are unchanged; no server redeployment is needed for this build-number update.'
