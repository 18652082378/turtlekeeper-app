#!/usr/bin/env bash
set -euo pipefail
cd "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$#" -gt 1 || ( "$#" -eq 1 && "$1" != --check ) ]]; then echo 'Use --check or no argument.' >&2; exit 1; fi
if [[ ! -f node_modules/playwright/package.json ]]; then npm ci --cache .npm-cache --no-audit --no-fund; fi
node scripts/build-web-comment-entry.cjs
node scripts/test-web-comment-entry-deploy.cjs
if [[ -z "${BROWSER_EXECUTABLE:-}" && -f 'C:/Program Files/Google/Chrome/Application/chrome.exe' ]]; then
  export BROWSER_EXECUTABLE='C:/Program Files/Google/Chrome/Application/chrome.exe'
fi
if [[ -d .browser-tests ]]; then export PLAYWRIGHT_BROWSERS_PATH="$PWD/.browser-tests"; fi
BROWSER_ENGINE=chromium node scripts/test-web-comment-entry-ui.cjs
node scripts/copy-web-comment-entry-command.cjs --check
if [[ "${1:-}" == --check ]]; then exit 0; fi
git -c gc.auto=0 -c maintenance.auto=false fetch origin main
git merge-base --is-ancestor origin/main HEAD || { echo 'GitHub main has newer changes; stopped without force push.' >&2; exit 1; }
git add --pathspec-from-file=scripts/web-comment-entry-release-files.txt
git -c gc.auto=0 -c maintenance.auto=false diff --cached --check
if ! git diff --cached --quiet -- $(cat scripts/web-comment-entry-release-files.txt); then
  git -c gc.auto=0 -c maintenance.auto=false commit --only -m "Publish isolated website comment input and original emotes" --pathspec-from-file=scripts/web-comment-entry-release-files.txt
fi
git -c gc.auto=0 -c maintenance.auto=false push origin HEAD:main
node - <<'NODE'
const {execFileSync}=require('node:child_process');
const local=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const remote=execFileSync('git',['ls-remote','origin','refs/heads/main'],{encoding:'utf8'}).trim().split(/\s+/)[0];
if(local!==remote)throw Error('GitHub main does not match this upload; no server command copied.');
console.log('Confirmed website upload: '+local);
NODE
node scripts/copy-web-comment-entry-command.cjs
