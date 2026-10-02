'use strict';
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
function serverCommand() {
  const compressed = zlib.gzipSync(fs.readFileSync(path.join(__dirname, 'deploy-ios-113-policy.cjs')));
  const checksum = crypto.createHash('sha256').update(compressed).digest('hex');
  const encoded = compressed.toString('base64').match(/.{1,76}/g).join('\n');
  return `(\nset -euo pipefail\npatch_dir=$(mktemp -d /tmp/turtlekeeper-ios113-policy.XXXXXX)\ncd "$patch_dir"\nbase64 --decode --ignore-garbage > ios113-policy.cjs.gz <<'TURTLE_IOS113_POLICY'\n${encoded}\nTURTLE_IOS113_POLICY\nprintf '%s  %s\\n' '${checksum}' 'ios113-policy.cjs.gz' | sha256sum -c -\ngzip -dc ios113-policy.cjs.gz > deploy-ios-113-policy.cjs\nnode deploy-ios-113-policy.cjs --check\nnode deploy-ios-113-policy.cjs --apply\n)\n`;
}
module.exports = { serverCommand };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !['--print', '--clipboard'].includes(args[0]))) { console.error('Use --print or --clipboard'); process.exitCode = 1; }
  else if (args[0] === '--clipboard') {
    try { execFileSync('clip.exe', { input: serverCommand(), windowsHide: true }); console.log('1.1.3 更新策略命令已复制。到已登录的服务器终端粘贴执行；会备份并短暂重启 API。'); }
    catch { console.error('复制失败，请运行 node scripts/copy-ios-113-policy-command.cjs --print'); process.exitCode = 1; }
  } else process.stdout.write(serverCommand());
}
