'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createWeatherProvider } = require('../server/weatherkit-provider');
async function configure({ root = '/www/turtlekeeper-app', input = process.env, fetcher = fetch, log = console.log } = {}) {
  if (fs.realpathSync(root) !== root || fs.realpathSync(path.join(root, 'server')) !== path.join(root, 'server')) throw Error('Unexpected server path');
  const team = String(input.WEATHERKIT_TEAM_ID || '').trim(), kid = String(input.WEATHERKIT_KEY_ID || '').trim(), service = String(input.WEATHERKIT_SERVICE_ID || '').trim();
  const encoded = String(input.WEATHERKIT_KEY_INPUT || '').trim();
  if (!/^[A-Z0-9]{10}$/.test(team) || !/^[A-Z0-9]{10}$/.test(kid) || !/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(service) || service.length > 255 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 8192) throw Error('Team ID、Key ID、Services ID或私钥Base64格式无效');
  let pem, key;
  try { pem = Buffer.from(encoded, 'base64').toString('utf8'); key = crypto.createPrivateKey(pem); } catch { throw Error('无法读取私钥：请复制 .p8 文件的Base64，不是文件名或Key ID'); }
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw Error('需要启用了 WeatherKit 的 Apple P-256 .p8 私钥');
  const folder = path.join(root, 'server/keys'); fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(folder) !== folder) throw Error('Unexpected key directory');
  const temp = path.join(folder, '.weatherkit-' + crypto.randomUUID() + '.p8');
  const file = path.join(root, 'server/.env'), keyFile = path.join(folder, `weatherkit-${kid}.p8`);
  for (const target of [file, keyFile]) if (fs.existsSync(target) && (fs.realpathSync(target) !== target || !fs.lstatSync(target).isFile())) throw Error('Unexpected configuration path');
  fs.writeFileSync(temp, pem, { mode: 0o600, flag: 'wx' });
  try {
    const env = { WEATHERKIT_TEAM_ID: team, WEATHERKIT_KEY_ID: kid, WEATHERKIT_SERVICE_ID: service, WEATHERKIT_KEY_PATH: temp };
    const provider = createWeatherProvider({ env, fetcher });
    const forecast = await provider.forecast({ latitude: 31.23, longitude: 121.47 });
    if (forecast.days.length < 8) throw Error('Apple返回的预报不足8个日期，请检查WeatherKit服务');
    const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const backups = path.join(root, 'server/backups'); fs.mkdirSync(backups, { recursive: true });
    if (fs.realpathSync(backups) !== backups) throw Error('Unexpected backup path');
    const backup = fs.mkdtempSync(path.join(backups, 'weatherkit-env-')); fs.chmodSync(backup, 0o700);
    fs.writeFileSync(path.join(backup, 'previous.env'), previous, { mode: 0o600, flag: 'wx' });
    if (fs.existsSync(keyFile)) fs.writeFileSync(path.join(backup, 'previous.p8'), fs.readFileSync(keyFile), { mode: 0o600, flag: 'wx' });
    const values = { ...env, WEATHERKIT_KEY_PATH: keyFile }; let next = previous;
    for (const [name, value] of Object.entries(values)) {
      const pattern = new RegExp('^\\s*' + name + '\\s*=.*$', 'gm');
      next = pattern.test(next) ? next.replace(pattern, name + '=' + value) : next.replace(/\s*$/, '\n') + name + '=' + value + '\n';
    }
    const envTemp = file + '.weatherkit-' + crypto.randomUUID() + '.tmp';
    fs.writeFileSync(envTemp, next, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, keyFile); fs.chmodSync(keyFile, 0o600); fs.renameSync(envTemp, file); fs.chmodSync(file, 0o600);
    log('SUCCESS: Apple真实天气认证和多日预报通过，配置已保存；原环境已备份。');
    return { configured: true, backup };
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
module.exports = { configure };
if (require.main === module) configure().catch(e => { console.error(e.message); process.exitCode = 1; });
