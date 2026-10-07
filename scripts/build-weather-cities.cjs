'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const input = path.resolve(root, process.argv[2] || 'output/weatherkit-research/geonames/cities15000.txt');
const raw = fs.readFileSync(input, 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const start = app.indexOf('const MARKET_PROVINCE_CITIES = ') + 'const MARKET_PROVINCE_CITIES = '.length;
const regions = JSON.parse(app.slice(start, app.indexOf('\n};', start) + 2));
const known = Object.entries(regions).flatMap(([province, names]) => names.map(name => ({ province, name, short: name.replace(/市$/, '') })));
const rows = raw.trim().split('\n').map(l => l.split('\t')).filter(r => r[8] === 'CN' && r[17] === 'Asia/Shanghai');
const matched = new Map(), provinces = new Map();
for (const row of rows.sort((a, b) => Number(b[14]) - Number(a[14]))) {
  const aliases = [row[1], ...row[3].split(',')];
  const k = known.find(k => aliases.includes(k.name) || aliases.includes(k.short));
  if (k && !matched.has(k.name)) { matched.set(k.name, row[0]); provinces.set(row[10], k.province); }
}
const cities = rows.flatMap(r => {
  const aliases = [r[1], r[2], ...r[3].split(',')];
  const k = known.find(k => matched.get(k.name) === r[0]);
  const name = k?.name || aliases.find(a => /^[\p{Script=Han}]{2,14}[市县区镇]$/u.test(a)) || aliases.find(a => /^[\p{Script=Han}]{2,14}$/u.test(a));
  if (!name) return [];
  return [{ id: 'cngeo-' + r[0], name, province: k?.province || provinces.get(r[10]) || '', city: name, latitude: Number(Number(r[4]).toFixed(2)), longitude: Number(Number(r[5]).toFixed(2)), timezone: 'Asia/Shanghai', population: Number(r[14]), aliases: [...new Set([name, r[1], r[2], ...aliases.filter(a => /^[\p{Script=Han}]{2,14}$/u.test(a))])] }];
});
for (const name of ['上海市', '北京市', '深圳市', '杭州市', '广州市', '成都市']) if (!cities.some(c => c.name === name)) throw Error('Missing city: ' + name);
fs.writeFileSync(path.join(root, 'server/weather-cities.json'), JSON.stringify({ source: 'https://download.geonames.org/export/dump/cities15000.zip', license: 'CC BY 4.0', attribution: 'GeoNames', generatedAt: new Date().toISOString(), inputHash: crypto.createHash('sha256').update(raw).digest('hex'), cities }) + '\n');
console.log('Local searchable locations: ' + cities.length + '; matched existing prefecture names: ' + matched.size);
