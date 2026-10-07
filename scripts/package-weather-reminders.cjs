'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
// The checked-in manifest is the reviewed patch source. Packaging must work
// after committing and must not absorb unrelated changes from a working diff.
const { patches } = JSON.parse(fs.readFileSync(path.join(__dirname, 'weather-reminders-server-patch.json'), 'utf8'));
const { patchSource } = require('./deploy-weather-reminders.cjs');
for (const [file, hunks] of Object.entries(patches)) {
  if (!['server/server.js', 'privacy.html'].includes(file)) throw Error('Unexpected reviewed target');
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  if (patchSource(source, hunks) !== source) throw Error('Reviewed patch is not installed locally: ' + file);
  const restored = patchSource(source, hunks.map(h => ({ before: h.after, after: h.before })));
  if (patchSource(restored, hunks) !== source) throw Error('Reviewed patch does not round-trip: ' + file);
}
const modules = Object.fromEntries(['server/weather-reminders.js', 'server/weatherkit-provider.js', 'server/weather-cities.json'].map(file => [file, digest(fs.readFileSync(path.join(root, file)))]));
const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, 'weather-reminders-legacy-patch.json'), 'utf8'));
fs.writeFileSync(path.join(__dirname, 'weather-reminders-server-patch.json'), JSON.stringify({ modules, patches, legacy }, null, 2) + '\n');
const out = path.join(root, 'deploy/patches'); fs.mkdirSync(out, { recursive: true });
const files = [...Object.keys(modules), 'scripts/deploy-weather-reminders.cjs', 'scripts/weather-reminders-server-patch.json', 'deploy/configure-weatherkit.sh', 'scripts/configure-weatherkit.cjs'];
const archive = path.join(out, 'turtlekeeper-weather-reminders-v1.tar.gz');
execFileSync('tar', ['-czf', archive, '-C', root, ...files]);
const bytes = fs.readFileSync(archive), checksum = digest(bytes);
fs.writeFileSync(archive + '.sha256', checksum + '  turtlekeeper-weather-reminders-v1.tar.gz\n');
const command = [
  '#!/usr/bin/env bash', '(', 'set -e', 'umask 077',
  'weather_patch_dir=$(mktemp -d /tmp/turtlekeeper-weather.XXXXXX)',
  'cd "$weather_patch_dir"',
  "base64 -d > patch.tar.gz <<'TURTLE_WEATHER_PAYLOAD'",
  bytes.toString('base64').match(/.{1,76}/g).join('\n'),
  'TURTLE_WEATHER_PAYLOAD',
  `printf '%s  %s\\n' '${checksum}' 'patch.tar.gz' | sha256sum -c -`,
  'tar -xzf patch.tar.gz',
  'node scripts/deploy-weather-reminders.cjs --check',
  'node scripts/deploy-weather-reminders.cjs --apply',
  `printf 'Configure Apple WeatherKit: bash "%s/deploy/configure-weatherkit.sh"\\n' "$weather_patch_dir"`,
  ')', ''
].join('\n');
fs.writeFileSync(path.join(root, 'deploy/weather-reminders-server.sh'), command);
console.log('Packaged ' + archive + '\nSHA256 ' + checksum);
