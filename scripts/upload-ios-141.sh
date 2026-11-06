#!/usr/bin/env bash
set -euo pipefail
cd "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$#" -gt 1 || ( "$#" -eq 1 && "$1" != --check ) ]]; then
  printf '%s\n' 'Use --check or no arguments.' >&2
  exit 1
fi

manifest=scripts/ios-141-release-files.txt
if [[ ! -f node_modules/plist/package.json || ! -f node_modules/playwright/package.json ]]; then
  npm ci --cache .npm-cache --no-audit --no-fund
fi
# Validate both packaged apps with Playwright's matching browser builds.
# Node needs a native path here, including when launched from Git Bash.
unset BROWSER_ENGINE BROWSER_EXECUTABLE MOBILE_UI_PLATFORM COMMUNITY_MOBILE_PLATFORM
export PLAYWRIGHT_BROWSERS_PATH="$(node -p 'require("node:path").resolve(".browser-tests")')"
npx playwright install --only-shell chromium webkit

node - <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = file => fs.readFileSync(file, 'utf8');
const config = read('config.js');
assert.match(config, /TURTLE_APP_BUILD\s*=\s*141;/);
assert.match(config, /TURTLE_APP_VERSION\s*=\s*"1\.2\.1"/);
assert.equal(JSON.parse(read('package.json')).version, '1.2.1');
const lock = JSON.parse(read('package-lock.json'));
assert.equal(lock.version, '1.2.1');
assert.equal(lock.packages[''].version, '1.2.1');
NODE
node scripts/verify-ios-upload-manifest.cjs
node scripts/test-mediation-deploy.cjs
node scripts/check-mobile-release.cjs
node scripts/test-native-edge-transport.cjs
node scripts/test-app-update-policy.cjs
BROWSER_ENGINE=webkit node scripts/test-release-notes.cjs
if [[ "${1:-}" == --check ]]; then exit 0; fi

# Build 141 is committed from this worktree and pushed only as a fast-forward.
git -c gc.auto=0 -c maintenance.auto=false fetch origin main
if ! git merge-base --is-ancestor origin/main HEAD; then
  printf '%s\n' 'GitHub main has newer commits. Integrate them before uploading.' >&2
  exit 1
fi
node - "$manifest" <<'NODE'
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const git = args => execFileSync('git', args, { encoding: 'utf8' });
const allowed = new Set(fs.readFileSync(process.argv[2], 'utf8').trim().split(/\r?\n/));
for (const file of fs.readFileSync('scripts/ios-141-changes.txt', 'utf8').trim().split(/\r?\n/)) {
  if (!allowed.has(file)) throw Error('Staging path is outside the release source allowlist: ' + file);
}
const outside = git(['diff', '--name-only', '-z', 'origin/main', 'HEAD']).split('\0').filter(file => file && !allowed.has(file));
if (outside.length) throw Error('Existing commits include files outside this release: ' + outside.join(', '));
if (git(['diff', '--cached', '--name-only', '-z'])) throw Error('This worktree already has staged changes. Review them before uploading.');
NODE

git add --pathspec-from-file=scripts/ios-141-changes.txt
git diff --cached --check
if ! git diff --cached --quiet; then
  git -c gc.auto=0 -c maintenance.auto=false commit -m 'Release iOS 1.2.1 build 141'
fi
node - <<'NODE'
const { execFileSync } = require('node:child_process');
const config = execFileSync('git', ['show', 'HEAD:config.js'], { encoding: 'utf8' });
if (!/TURTLE_APP_BUILD\s*=\s*141;/.test(config) || !/TURTLE_APP_VERSION\s*=\s*"1\.2\.1"/.test(config)) {
  throw Error('HEAD is not iOS 1.2.1 (141).');
}
NODE
git -c gc.auto=0 -c maintenance.auto=false push origin HEAD:main
node - <<'NODE'
const { execFileSync } = require('node:child_process');
const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
const head = git(['rev-parse', 'HEAD']);
const remote = git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0];
if (remote !== head) throw Error('GitHub main differs from the release commit.');
console.log('Confirmed GitHub main: ' + head + '; iOS 1.2.1 (141).');
NODE
uploaded_commit=$(git rev-parse HEAD)
node scripts/copy-mediation-server-command.cjs --revision "$uploaded_commit"
printf '%s\n' 'Next: paste the copied command into Aliyun Shell. After API installation succeeds, start a new Codemagic iOS TestFlight build from this main commit.'
