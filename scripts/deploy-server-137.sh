#!/usr/bin/env bash
# Linux server only. No source force-reset, database migration, or .env rewrite.
set -euo pipefail
mode="${1:---check}"
root="${2:-/www/turtlekeeper-app}"
if [[ "$#" -gt 2 || ( "$mode" != --check && "$mode" != --apply ) ]]; then
  printf '%s\n' 'Usage: bash deploy-server-137.sh [--check|--apply] [/www/turtlekeeper-app]' >&2; exit 1
fi
cd -- "$root"
root="$(pwd -P)"
if [[ "$(git rev-parse --show-toplevel)" != "$root" ]]; then
  printf '%s\n' 'The target must be the root of the server Git checkout.' >&2; exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  printf '%s\n' 'Server source has local changes. Stopped without overwriting them; do not use git reset --hard.' >&2; exit 1
fi
command -v npm >/dev/null
command -v pm2 >/dev/null
# The reviewed installer already fetched and pinned this exact commit. Avoid
# another network request after saving/removing the old working files.
if [[ -z "${TURTLE_RELEASE_COMMIT:-}" ]]; then
  git fetch origin main
fi
release_commit="$(git rev-parse origin/main)"
if [[ -n "${TURTLE_RELEASE_COMMIT:-}" && "$release_commit" != "$TURTLE_RELEASE_COMMIT" ]]; then
  printf '%s\n' 'GitHub main changed after source review. Stopped before installation.' >&2; exit 1
fi
git merge-base --is-ancestor HEAD "$release_commit" || { printf '%s\n' 'Server history diverged; stopped without force-reset.' >&2; exit 1; }
node - "$release_commit" "$root" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const [commit,root]=process.argv.slice(2);
if(Number(process.versions.node.split('.')[0])<22) throw Error('Node.js 22 or newer is required.');
const config=execFileSync('git',['show',commit+':config.js'],{encoding:'utf8'});
const pkg=JSON.parse(execFileSync('git',['show',commit+':package.json'],{encoding:'utf8'}));
if(pkg.version!=='1.1.9'||!/TURTLE_APP_BUILD\s*=\s*137;/.test(config)) throw Error('origin/main is not release 1.1.9 (137). Upload the computer source first.');
const apps=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const app=apps.find(item=>item.name==='turtlekeeper-api');
if(!app||path.resolve(app.pm2_env.pm_cwd)!==root||path.resolve(app.pm2_env.pm_exec_path)!==path.join(root,'server/server.js')) throw Error('PM2 turtlekeeper-api does not run this checkout. No restart performed.');
console.log('Checked: release 1.1.9 (137), Node.js and PM2 target.');
NODE
if [[ "$mode" == --check ]]; then printf '%s\n' 'Check complete; no code installation, dependency changes or restart.'; exit 0; fi
umask 077
backup_root="${HOME:?HOME is required}/.turtlekeeper-release-backups"
if [[ -L "$backup_root" || ( -e "$backup_root" && ! -d "$backup_root" ) ]]; then
  printf '%s\n' 'Invalid backup directory.' >&2; exit 1
fi
mkdir -p -- "$backup_root"
chmod 700 -- "$backup_root"
backup="$(mktemp -d "$backup_root/release-137-XXXXXXXX")"
git rev-parse HEAD > "$backup/previous-commit.txt"
git archive --format=tar --output="$backup/source-before.tar" HEAD
printf 'Previous source saved in: %s\n' "$backup"
trap 'printf "Deployment stopped. Previous source: %s. Existing user data and environment files were not replaced.\n" "$backup" >&2' ERR
git merge --ff-only "$release_commit"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
node --check server/server.js
pm2 restart turtlekeeper-api --update-env
node - <<'NODE'
(async()=>{
  const url='https://api.turtleworld.cn/api/app/version?platform=web';
  let error;
  for(let i=0;i<5;i++) {
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
      const data=await response.json();
      if(!response.ok||data.ok!==true||data.platform!=='web'||data.minimumBuild!==0) throw Error('Public API readiness check failed');
      const iosResponse=await fetch('https://api.turtleworld.cn/api/app/version?platform=ios',{signal:AbortSignal.timeout(10000)});
      const ios=await iosResponse.json();
      if(!iosResponse.ok||ios.ok!==true||ios.minimumBuild!==136||ios.latestBuild!==136) throw Error('iOS published-build policy changed; expected 136/136, never force unpublished 137.');
      console.log('Public API is ready. Server source for 1.1.9 (137) deployed.'); return;
    } catch(e) { error=e; if(i<4) await new Promise(resolve=>setTimeout(resolve,1000)); }
  }
  throw error;
})().catch(error=>{console.error(error.message);process.exitCode=1});
NODE
trap - ERR
printf '%s\n' 'Server update complete. Existing minimum-version gates were not increased. This does not publish an App Store build.'
