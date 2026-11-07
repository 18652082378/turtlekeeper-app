'use strict';
const fs = require('node:fs'), path = require('node:path');
const { buildPackage: mediation } = require('./build-mediation-server-package.cjs');
const { hash } = require('./deploy-mediation-applications.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
function buildPackage() {
  const source = read('server/server.js'), patches = [];
  function patch(before, after) { if (!source.includes(after)) throw Error('Missing reviewed market alert patch'); patches.push({ before, after }); }
  const importLine = "const { createMarketAlerts, quotaAvailable: recommendationQuotaAvailable, reserveQuota: reserveRecommendationQuota } = require('./market-alerts');\n";
  patch("const { createMediationService } = require('./mediation-service');\n", "const { createMediationService } = require('./mediation-service');\n" + importLine);
  patch('      updatedAt: String(item?.updatedAt || ""),', '      updatedAt: String(item?.updatedAt || ""),\n      ...(item?.marketAlerts === true ? { marketAlerts: true } : {}),');
  patch('    { token: deviceToken, platform, updatedAt: now, sessionHash: hashValue(String(body.token || "")) }', '    { token: deviceToken, platform, updatedAt: now, sessionHash: hashValue(String(body.token || "")), marketAlerts: body.marketAlerts === true }');
  patch('  const addressedPayload = { ...payload, recipientId: communityUserId(user.phone) };', "  if (payload.route === 'marketAlerts' && !marketAlertsService.canSend(readDatabase(), user, payload)) return { ok: false, skipped: true };\n  const addressedPayload = { ...payload, recipientId: communityUserId(user.phone) };");
  for (const line of source.split('\n').filter(line => line.includes('["communityDaily", "weather", "marketAlerts"]'))) {
    const before = line.replace(', "marketAlerts"', '').replace("payload.route === 'marketAlerts' ? 'market-alerts' : ", ''); patch(before, line);
  }
  patch('  db.marketListings = [listing, ...(Array.isArray(db.marketListings) ? db.marketListings : [])];', '  listing.marketAlertPublishedAt = listing.createdAt;\n  db.marketListings = [listing, ...(Array.isArray(db.marketListings) ? db.marketListings : [])];');
  const start = source.indexOf('const marketAlertsService = createMarketAlerts('), end = source.indexOf('const mediationService = createMediationService(', start);
  if (start < 0 || end < start) throw Error('Missing market service');
  patch('const mediationService = createMediationService(', source.slice(start, end) + 'const mediationService = createMediationService(');
  const route = source.split('\n').find(line => line.includes('/^\\/api\\/market\\/alerts\\/(preference|open)$/'));
  if (!route) throw Error('Missing market alert route');
  const mediationRoute = source.split('\n').find(line => line.includes('/^\\/api\\/mediation\\/(create|list|detail|withdraw|update)$/'));
  patch(mediationRoute, mediationRoute + '\n' + route);
  patch('  devices: availablePushDevices,\n  canReceive:', '  devices: availablePushDevices,\n  canRecommend: (db, user, day, campaign) => recommendationQuotaAvailable(db, user, day, campaign, availablePushDevices(user)),\n  reserveRecommendation: reserveRecommendationQuota,\n  canReceive:');
  const timerStart = source.indexOf('async function dispatchRecommendations()'), timerEnd = source.indexOf('\nsetInterval(() => { if (!shuttingDown) runScheduledBackup();', timerStart);
  patch('setInterval(() => { if (!shuttingDown) dispatchDailyCommunityPush().catch(error => console.error("Daily community push stopped:", error.message)); }, 60 * 1000).unref();', source.slice(timerStart, timerEnd));
  const base = mediation();
  const modules = ['server/market-alerts.js', 'server/community-daily-push.js'].map(name => { const bytes = Buffer.from(read(name)); return { name, sha256: hash(bytes), base64: bytes.toString('base64'), previousHashes: name.endsWith('community-daily-push.js') ? ['f8f6a1439fb2feb6070325517f16c1e98af97864a871e34f95afff296cdf6e46'] : [] }; });
  modules.push({ ...base.module, previousHashes: [] });
  return { format: 'turtle-market-alerts-api-v1', version: '1.2.2', build: 142, mediation: base, patches, modules };
}
module.exports = { buildPackage };
if (require.main === module) { const file = path.join(root, 'deploy/market-alerts-142/server.json'); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(buildPackage(), null, 2) + '\n'); console.log('Prepared marketplace alert server package.'); }
