'use strict';
const crypto = require('node:crypto'), fs = require('node:fs');
const catalog = require('./weather-cities.json').cities;
const sourceUrl = 'https://weatherkit.apple.com/legal-attribution.html';
const logoUrl = 'https://weatherkit.apple.com/assets/branding/combined-mark-light@2x.png';
const error = message => Object.assign(new Error(message), { status: 503 });
const dateInChina = stamp => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stamp));
const publicCity = ({ population, aliases, ...city }) => city;
const distance = (lat, lon, c) => {
  const r = Math.PI / 180, a = Math.sin((c.latitude - lat) * r / 2) ** 2 + Math.cos(lat * r) * Math.cos(c.latitude * r) * Math.sin((c.longitude - lon) * r / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
};
async function lookup(query) {
  if (typeof query !== 'string' || !query.trim() || query.length > 60) throw Object.assign(new Error('请输入城市名称'), { status: 400 });
  const q = query.trim().toLowerCase();
  const coordinates = q.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (coordinates) {
    const lon = Number(coordinates[1]), lat = Number(coordinates[2]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw Object.assign(new Error('地点坐标无效'), { status: 400 });
    return catalog.map(c => ({ c, km: distance(lat, lon, c) })).filter(c => c.km <= 100).sort((a, b) => a.km - b.km).slice(0, 5).map(c => publicCity(c.c));
  }
  return catalog.filter(c => c.id === q || c.aliases.some(a => a.toLowerCase().includes(q)) || (c.province + c.name).includes(q)).sort((a, b) => Number(b.name.toLowerCase() === q || b.aliases.some(n => n.toLowerCase() === q)) - Number(a.name.toLowerCase() === q || a.aliases.some(n => n.toLowerCase() === q)) || b.population - a.population).slice(0, 10).map(publicCity);
}
function createWeatherProvider({ env = process.env, fetcher = fetch, now = () => new Date() } = {}) {
  const team = String(env.WEATHERKIT_TEAM_ID || '').trim(), kid = String(env.WEATHERKIT_KEY_ID || '').trim(), service = String(env.WEATHERKIT_SERVICE_ID || '').trim();
  const keyPath = String(env.WEATHERKIT_KEY_PATH || '').trim();
  const configured = () => /^[A-Z0-9]{10}$/.test(team) && /^[A-Z0-9]{10}$/.test(kid) && /^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(service) && service.length <= 255 && Boolean(keyPath);
  const cache = new Map(), pending = new Map();
  let privateKey, token, expires = 0;
  function authorization() {
    const seconds = Math.floor(now().getTime() / 1000);
    if (!token || seconds >= expires - 60) {
      privateKey ||= crypto.createPrivateKey(fs.readFileSync(keyPath, 'utf8'));
      if (privateKey.asymmetricKeyType !== 'ec' || privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw error('WeatherKit 需要 Apple 签发的 P-256 私钥');
      expires = seconds + 900;
      const head = Buffer.from(JSON.stringify({ alg: 'ES256', kid, id: `${team}.${service}` })).toString('base64url');
      const body = Buffer.from(JSON.stringify({ iss: team, iat: seconds - 30, exp: expires, sub: service })).toString('base64url');
      token = `${head}.${body}.${crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    }
    return 'Bearer ' + token;
  }
  async function forecast(location) {
    if (!configured()) throw error('Apple 天气服务尚未配置');
    if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) throw error('养龟地点无效');
    const url = `https://weatherkit.apple.com/api/v1/weather/zh-Hans/${location.latitude.toFixed(2)}/${location.longitude.toFixed(2)}?dataSets=forecastDaily&timezone=Asia%2FShanghai`;
    const hit = cache.get(url);
    if (hit && now().getTime() < hit.until) { if (hit.error) throw hit.error; return hit.data; }
    if (pending.has(url)) return pending.get(url);
    const job = Promise.resolve().then(async () => {
      try {
        const response = await fetcher(url, { headers: { Authorization: authorization() }, signal: AbortSignal.timeout(10000), redirect: 'error' });
        if (!response.ok) throw error(response.status === 401 || response.status === 403 ? 'Apple 天气认证失败，请检查服务 ID 和 WeatherKit 密钥权限' : response.status === 429 ? 'Apple 天气请求暂受限制，请稍后重试' : 'Apple 天气数据暂不可用');
        const text = await response.text(); if (text.length > 512000) throw error('天气响应无效');
        const data = JSON.parse(text), received = now().getTime();
        const days = (data.forecastDaily?.days || []).filter(d => Number.isFinite(Date.parse(d.forecastStart)) && typeof d.temperatureMin === 'number' && Number.isFinite(d.temperatureMin) && d.temperatureMin >= -90 && d.temperatureMin <= 65).map(d => ({ date: dateInChina(d.forecastStart), minimum: d.temperatureMin }));
        if (!days.length) throw error('天气预报暂不可用');
        const expiry = Date.parse(data.forecastDaily?.metadata?.expireTime);
        if (Number.isFinite(expiry) && expiry <= received) throw error('天气预报已过期，请稍后重试');
        const result = { days, fetchedAt: new Date(received).toISOString(), source: 'Apple Weather', sourceUrl };
        cache.set(url, { data: result, until: received + 30 * 60000 }); return result;
      } catch (e) {
        const failure = e.status === 503 ? e : error('Apple 天气数据暂不可用，请稍后重试');
        cache.set(url, { error: failure, until: now().getTime() + 60000 }); throw failure;
      } finally { pending.delete(url); while (cache.size > 1000) cache.delete(cache.keys().next().value); }
    });
    pending.set(url, job); return job;
  }
  return { configured, lookup, forecast, attribution: { source: 'Apple Weather', sourceUrl, logoUrl, citySource: 'GeoNames', citySourceUrl: 'https://www.geonames.org/' } };
}
module.exports = { createWeatherProvider, lookup };
