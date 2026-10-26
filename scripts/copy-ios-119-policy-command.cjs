'use strict';
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
function serverCommand() {
  const compressed = zlib.gzipSync(fs.readFileSync(path.join(__dirname, 'deploy-ios-119-policy.cjs')));
  const checksum = crypto.createHash('sha256').update(compressed).digest('hex');
  const encoded = compressed.toString('base64').match(/.{1,76}/g).join('\n');
  return `(\nset -euo pipefail\numask 077\npatch_dir=$(mktemp -d /tmp/turtlekeeper-ios119-policy.XXXXXX)\ncd "$patch_dir"\nbase64 --decode --ignore-garbage > ios119-policy.cjs.gz <<'TURTLE_IOS119_POLICY'\n${encoded}\nTURTLE_IOS119_POLICY\nprintf '%s  %s\\n' '${checksum}' 'ios119-policy.cjs.gz' | sha256sum -c -\ngzip -dc ios119-policy.cjs.gz > deploy-ios-119-policy.cjs\nnode deploy-ios-119-policy.cjs --check\nnode deploy-ios-119-policy.cjs --apply\n)\n`;
}
module.exports = { serverCommand };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !['--print', '--clipboard'].includes(args[0]))) { console.error('Use --print or --clipboard'); process.exitCode = 1; }
  else if (args[0] === '--clipboard') {
    try { const command=serverCommand(),file=path.resolve(__dirname,'../output/update-ios-119-policy.sh');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,command);execFileSync('clip.exe', { input: command, windowsHide: true }); console.log('1.1.9 苹果更新策略命令已复制。到已登录的服务器终端粘贴执行；会备份并短暂重启 API。'); }
    catch { console.error('复制失败，请运行 node scripts/copy-ios-119-policy-command.cjs --print'); process.exitCode = 1; }
  } else process.stdout.write(serverCommand());
}
