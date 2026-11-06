'use strict';
const fs = require('node:fs'), path = require('node:path');
const { validate, patchServer, hash } = require('./deploy-mediation-applications.cjs');
const root = path.resolve(__dirname, '..');
function buildPackage() {
  const source = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('const mediationService = createMediationService('), end = source.indexOf('const server = http.createServer(', start);
  if (start < 0 || end < start) throw Error('Mediation bootstrap missing');
  const route = source.split('\n').find(line => line.includes("/^\\/api\\/mediation\\/(create|list|detail|withdraw|update)$/"));
  if (!route) throw Error('Mediation route missing');
  const bytes = Buffer.from(fs.readFileSync(path.join(root, 'server/mediation-service.js'), 'utf8').replace(/\r\n/g, '\n'));
  const pkg = { format: 'turtle-mediation-api-v1', version: '1.2.1', build: 141,
    bootstrap: source.slice(start, end), route, module: { name: 'server/mediation-service.js', sha256: hash(bytes), base64: bytes.toString('base64') } };
  validate(pkg); patchServer(source, pkg);
  return pkg;
}
module.exports = { buildPackage };
if (require.main === module) {
  const file = path.join(root, 'deploy/mediation-141/server.json');
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(buildPackage(), null, 2) + '\n');
  console.log('Prepared reviewed mediation API package: ' + file);
}
