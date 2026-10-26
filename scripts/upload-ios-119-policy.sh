#!/usr/bin/env bash
set -euo pipefail
cd "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$#" -gt 1 || ( "$#" -eq 1 && "$1" != --check ) ]]; then
  printf '%s\n' 'Use --check or no arguments.' >&2; exit 1
fi
node scripts/test-app-update-policy.cjs
node scripts/test-ios-119-policy-deploy.cjs
node scripts/verify-ios-upload-manifest.cjs
if [[ "${1:-}" == --check ]]; then exit 0; fi
git -c gc.auto=0 -c maintenance.auto=false fetch origin main
git merge-base --is-ancestor origin/main HEAD || { echo 'Remote history changed; stopped without force-pushing.' >&2; exit 1; }
node - <<'NODE'
const fs=require('fs'),{execFileSync}=require('child_process');
const files=new Set(fs.readFileSync('scripts/ios-119-policy-release-files.txt','utf8').trim().split(/\r?\n/));
const outside=execFileSync('git',['diff','--name-only','-z','origin/main','HEAD']).toString().split('\0').filter(x=>x&&!files.has(x));
if(outside.length)throw Error('Existing commits contain unrelated changes: '+outside.join(', '));
NODE
git add --pathspec-from-file=scripts/ios-119-policy-release-files.txt
git diff --cached --check
if node - <<'NODE'
const fs=require('fs'),{execFileSync}=require('child_process');
const files=new Set(fs.readFileSync('scripts/ios-119-policy-release-files.txt','utf8').trim().split(/\r?\n/));
process.exit(execFileSync('git',['diff','--cached','--name-only','-z']).toString().split('\0').some(x=>files.has(x))?0:1);
NODE
then
  git -c gc.auto=0 -c maintenance.auto=false commit --only -m "Require App Store 1.1.9 for iOS; preserve Android update channels [skip ci]" --pathspec-from-file=scripts/ios-119-policy-release-files.txt
fi
git -c gc.auto=0 -c maintenance.auto=false push origin HEAD:main
node - <<'NODE'
const {execFileSync}=require('child_process');
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const remote=execFileSync('git',['ls-remote','origin','refs/heads/main'],{encoding:'utf8'}).trim().split(/\s+/)[0];
if(head!==remote)throw Error('GitHub main verification failed.');
console.log('Confirmed policy source on GitHub main: '+head);
NODE
node scripts/copy-ios-119-policy-command.cjs --clipboard
