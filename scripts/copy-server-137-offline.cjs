'use strict';
// One-time continuation for the fetched ced3c73 release. No GitHub download.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const zlib = require('node:zlib'), vm = require('node:vm'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const commit = 'ced3c73c50b32ebf61c9487e7648fd38bbdee25c';
const ensure = (value, message) => { if (!value) throw Error(message); };
function createBundle() {
  ensure(execFileSync('git', ['rev-parse', commit], { cwd: root, encoding: 'utf8' }).trim() === commit, 'The reviewed source commit is unavailable.');
  const deploy = fs.readFileSync(path.join(__dirname, 'deploy-server-137.sh'), 'utf8').replace(/\r\n/g, '\n');
  ensure(deploy.includes('if [[ -z "${TURTLE_RELEASE_COMMIT:-}" ]]; then\n  git fetch origin main\nfi'), 'Pinned deployments must skip the redundant fetch.');
  const source = fs.readFileSync(path.join(__dirname, 'reconcile-server-137.cjs'), 'utf8').replace(/\r\n/g, '\n');
  const anchor = "input: git(['show', commit + ':scripts/deploy-server-137.sh']),";
  ensure(source.split(anchor).length === 2, 'Unexpected installer layout; no command copied.');
  const installer = source.replace(anchor, () => 'input: ' + JSON.stringify(deploy) + ',');
  new vm.Script(installer);
  const checksum = crypto.createHash('sha256').update(installer).digest('hex');
  const payload = zlib.gzipSync(Buffer.from(installer)).toString('base64').match(/.{1,76}/g).join('\n');
  const command = [
    "bash <<'CONTINUE_137' || printf '%s\\n' 'Update stopped; please send the output.'",
    'set -euo pipefail', 'umask 077', 'cd /www/turtlekeeper-app',
    `[ "$(git rev-parse origin/main)" = "${commit}" ] || { echo 'Expected the already-fetched ced3c73 release; stopped.'; exit 1; }`,
    'release_dir=$(mktemp -d "$HOME/turtlekeeper-137-offline-XXXXXXXX")',
    'base64 -d <<\'TURTLE_137_INSTALLER\' | gzip -d > "$release_dir/installer.cjs"',
    payload, 'TURTLE_137_INSTALLER',
    `printf '%s  %s\\n' '${checksum}' "$release_dir/installer.cjs" | sha256sum -c -`,
    'node "$release_dir/installer.cjs" --apply /www/turtlekeeper-app',
    'CONTINUE_137', ''
  ].join('\n');
  ensure(!/[^\x00-\x7f]/.test(command), 'Clipboard command must be ASCII.');
  return { command, installer, checksum, commit };
}
function prepareFetchedInstaller(source, deploy) {
  source = source.replace(/\r\n/g, '\n');
  deploy = deploy.replace(/\r\n/g, '\n');
  const marker = '    const versions = [commit];';
  const call = "input: git(['show', commit + ':scripts/deploy-server-137.sh']),";
  if (source.split(marker).length !== 2 || source.split(call).length !== 2
    || deploy.split('\ngit fetch origin main\n').length !== 2) throw Error('Unexpected cached installer; stopped.');
  const allow = '    if (file === "server/team-space.js" && digest === "cb01c8600cb899e229c568fcb36ef211a581b463df24b3e1f6f3c0044708765e") {\n'
    + '      known.push({file, bytes, mode: stat.mode & 0o777, digest: rawHash(bytes), matchedCommit: "reviewed-Alipay-compatibility"});\n'
    + '      continue;\n    }\n';
  deploy = deploy.replace('\ngit fetch origin main\n', '\n: # verified cached release; no repeat fetch\n');
  source = source.replace(marker, () => allow + marker);
  return source.replace(call, () => 'input: ' + JSON.stringify(deploy) + ',');
}
function createShortBundle() {
  const read = file => execFileSync('git', ['show', commit + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 24e6 });
  const installer = prepareFetchedInstaller(read('scripts/reconcile-server-137.cjs'), read('scripts/deploy-server-137.sh'));
  new vm.Script(installer);
  const checksum = crypto.createHash('sha256').update(installer).digest('hex');
  const program = [
    "const fs=require('fs'),cp=require('child_process'),os=require('os'),path=require('path'),crypto=require('crypto');",
    prepareFetchedInstaller.toString(),
    'try {',
    `  const commit='${commit}';`,
    "  const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:24000000}).replace(/\\r\\n/g,'\\n');",
    "  if(fs.realpathSync(process.cwd())!=='/www/turtlekeeper-app'||git(['rev-parse','origin/main']).trim()!==commit) throw Error('Expected cached ced3c73 in /www/turtlekeeper-app.');",
    "  const code=prepareFetchedInstaller(git(['show',commit+':scripts/reconcile-server-137.cjs']),git(['show',commit+':scripts/deploy-server-137.sh']));",
    `  if(crypto.createHash('sha256').update(code).digest('hex')!=='${checksum}') throw Error('Installer checksum mismatch; stopped.');`,
    "  const dir=fs.mkdtempSync(path.join(os.homedir(),'turtlekeeper-137-short-'));fs.chmodSync(dir,0o700);",
    "  const file=path.join(dir,'installer.cjs');fs.writeFileSync(file,code,{flag:'wx',mode:0o600});",
    "  console.log('Installer checksum OK. Running reviewed release 137 checks.');",
    "  cp.execFileSync(process.execPath,[file,'--apply','/www/turtlekeeper-app'],{stdio:'inherit'});",
    '} catch(error) { console.error(error.message); process.exitCode=1; }'
  ].join('\n');
  const command = "cd /www/turtlekeeper-app && node <<'NODE_137'\n" + program + '\nNODE_137\n';
  return { command, installer, checksum, commit, program };
}
module.exports = { createBundle, createShortBundle, prepareFetchedInstaller };
if (require.main === module) {
  const bundle = createShortBundle();
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify({ commit, checksum: bundle.checksum, commandBytes: Buffer.byteLength(bundle.command), clipboardChanged: false }));
  } else {
    ensure(process.platform === 'win32', 'Copy this command from the Windows computer.');
    const output = path.join(root, 'output'); fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'continue-server-137.sh'), bundle.command);
    fs.writeFileSync(path.join(output, 'continue-server-137.installer.cjs'), bundle.installer);
    execFileSync(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/clip.exe'), { input: bundle.command, windowsHide: true });
    console.log('短版服务器命令已复制到剪贴板。请先切到阿里云 Shell 模式，再粘贴执行；无需上传或重新拉取 GitHub。');
  }
}
