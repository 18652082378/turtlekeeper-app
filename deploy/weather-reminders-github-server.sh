#!/usr/bin/env bash
(
set -e
umask 077
weather_patch_dir=$(mktemp -d /tmp/turtlekeeper-weather.XXXXXX)
cd "$weather_patch_dir"
curl -fsS --retry 2 --connect-timeout 10 --max-time 60 \
  -H 'Accept: application/vnd.github+json' -H 'User-Agent: TurtleKeeper-Deploy' \
  'https://api.github.com/repos/18652082378/turtlekeeper-app/git/blobs/b71446b599188ea5a418493057c96c1a7af8c3d3' -o patch.json
node <<'WEATHER_DOWNLOAD'
const fs = require('fs'), crypto = require('crypto');
const data = JSON.parse(fs.readFileSync('patch.json', 'utf8'));
if (data.sha !== 'b71446b599188ea5a418493057c96c1a7af8c3d3' || data.encoding !== 'base64') throw Error('Unexpected GitHub patch response; nothing changed');
const bytes = Buffer.from(data.content, 'base64');
if (crypto.createHash('sha256').update(bytes).digest('hex') !== '41b9de84514027d49f3be31b1770bef35a822126607ffbc123aa1e5ad1b62c3e') throw Error('Patch checksum failed; nothing changed');
fs.writeFileSync('patch.tar.gz', bytes, { flag: 'wx', mode: 0o600 });
console.log('PASS: downloaded patch checksum verified');
WEATHER_DOWNLOAD
tar -xzf patch.tar.gz
node scripts/deploy-weather-reminders.cjs --check
node scripts/deploy-weather-reminders.cjs --apply
printf 'Configure Apple WeatherKit: bash "%s/deploy/configure-weatherkit.sh"\n' "$weather_patch_dir"
)
