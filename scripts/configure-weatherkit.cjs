'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createWeatherProvider } = require('../server/weatherkit-provider');
function normalizeInput(input) {
  // Some browser terminals wrap pasted text in bracketed-paste control codes.
  const clean = value => String(value || '').trim().replace(/^\x1b\[200~/, '').replace(/\x1b\[201~$/, '').trim();
  const team = clean(input.WEATHERKIT_TEAM_ID), kid = clean(input.WEATHERKIT_KEY_ID), service = clean(input.WEATHERKIT_SERVICE_ID);
  if (!/^[A-Z0-9]{10}$/.test(team)) throw Error('Team ID格式无效：需要苹果后台的10位大写字母或数字');
  if (!/^[A-Z0-9]{10}$/.test(kid)) throw Error('Key ID格式无效：需要WeatherKit密钥的10位大写字母或数字');
  if (!/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(service) || service.length > 255) throw Error('Services ID格式无效：请填写已注册的服务标识符');
  if (String(input.WEATHERKIT_KEY_INPUT || '').length > 12000) throw Error('私钥Base64过长，请重新复制密钥');
  const encoded = clean(input.WEATHERKIT_KEY_INPUT).replace(/[ \t\r\n]/g, '');
  if (!encoded) throw Error('未读到私钥Base64：请在服务器等待输入时重新运行本机复制密钥脚本，再粘贴并按回车');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 8192 || Buffer.from(encoded, 'base64').toString('base64') !== encoded) throw Error('私钥Base64格式无效：请重新复制 .p8 文件的Base64，避免混入命令或文件路径');
  return { team, kid, service, encoded };
}
async function configure({ root = '/www/turtlekeeper-app', input = process.env, fetcher = fetch, log = console.log } = {}) {
  if (fs.realpathSync(root) !== root || fs.realpathSync(path.join(root, 'server')) !== path.join(root, 'server')) throw Error('Unexpected server path');
  const { team, kid, service, encoded } = normalizeInput(input);
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
module.exports = { configure, normalizeInput };
if (require.main === module) configure().catch(e => { console.error(e.message); process.exitCode = 1; });
