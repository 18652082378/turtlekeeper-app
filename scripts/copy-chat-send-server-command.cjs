'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
function serverCommand() {
  const compressed = zlib.gzipSync(fs.readFileSync(path.join(__dirname, 'deploy-chat-send-recovery.cjs')));
  const checksum = crypto.createHash('sha256').update(compressed).digest('hex');
  const encoded = compressed.toString('base64').match(/.{1,76}/g).join('\n');
  return `(\nset -euo pipefail\npatch_dir=$(mktemp -d /tmp/turtlekeeper-chat-send-recovery.XXXXXX)\ncd "$patch_dir"\nbase64 --decode --ignore-garbage > chat-send-recovery.cjs.gz <<'TURTLE_CHAT_SEND_PATCH'\n${encoded}\nTURTLE_CHAT_SEND_PATCH\nprintf '%s  %s\\n' '${checksum}' 'chat-send-recovery.cjs.gz' | sha256sum -c -\ngzip -dc chat-send-recovery.cjs.gz > deploy-chat-send-recovery.cjs\nnode deploy-chat-send-recovery.cjs --check\nnode deploy-chat-send-recovery.cjs --apply\n)\n`;
}
module.exports = { serverCommand };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !['--print', '--clipboard'].includes(args[0]))) { console.error('Use --print or --clipboard'); process.exitCode = 1; }
  else if (args[0] === '--clipboard') {
    try { execFileSync('clip.exe', { input: serverCommand(), windowsHide: true }); console.log('聊天发送修复补丁命令已复制。到已登录的服务器终端粘贴执行；会短暂重启 API。'); }
    catch { console.error('复制失败，请运行 node scripts/copy-chat-send-server-command.cjs --print'); process.exitCode = 1; }
  } else process.stdout.write(serverCommand());
}
