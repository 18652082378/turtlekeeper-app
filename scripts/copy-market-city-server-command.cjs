'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
function serverCommand() {
  const source = fs.readFileSync(path.join(__dirname, 'deploy-market-city-override.cjs'));
  const compressed = zlib.gzipSync(source);
  const checksum = crypto.createHash('sha256').update(compressed).digest('hex');
  const encoded = compressed.toString('base64').match(/.{1,76}/g).join('\n');
  return `(\nset -euo pipefail\npatch_dir=$(mktemp -d /tmp/turtlekeeper-city.XXXXXX)\ncd "$patch_dir"\nbase64 -d > market-city.cjs.gz <<'TURTLE_CITY_PATCH'\n${encoded}\nTURTLE_CITY_PATCH\nprintf '%s  %s\\n' '${checksum}' 'market-city.cjs.gz' | sha256sum -c -\ngzip -dc market-city.cjs.gz > deploy-market-city-override.cjs\nnode deploy-market-city-override.cjs --check\nnode deploy-market-city-override.cjs --apply\n)\n`;
}
module.exports = { serverCommand };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !['--print', '--clipboard'].includes(args[0]))) { console.error('Use --print or --clipboard'); process.exitCode = 1; }
  else if (args[0] === '--clipboard') {
    try {
      execFileSync('clip.exe', { input: serverCommand(), windowsHide: true });
      console.log('服务器安装命令已复制。切到服务器终端，粘贴完整命令并执行。无需公网 IP 或手动上传。');
    } catch { console.error('剪贴板复制失败，请运行 node scripts/copy-market-city-server-command.cjs --print'); process.exitCode = 1; }
  } else process.stdout.write(serverCommand());
}
