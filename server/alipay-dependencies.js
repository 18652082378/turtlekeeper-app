// Production may install this SDK in an isolated directory so deploying Android
// payments never upgrades the dependencies used by Apple subscriptions.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
function dependency(name) {
  if (!['alipay-sdk', 'undici'].includes(name)) throw Error('Unexpected payment dependency');
  const isolated = path.join(__dirname, 'vendor/alipay-team/package.json');
  return (fs.existsSync(isolated) ? createRequire(isolated) : require)(name);
}
module.exports = { dependency };
