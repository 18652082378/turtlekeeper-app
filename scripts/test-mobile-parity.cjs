'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { verify } = require('./verify-mobile-parity.cjs');
const root = path.resolve(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f));
verify();
for (const platform of ['ios/App/App/public/', 'android/app/src/main/assets/public/']) {
  for (const file of ['styles.css', 'app.js', 'assets/search-workspace.js', 'assets/weather-reminders.js', 'privacy.html']) {
    assert.throws(() => verify({ read: f => f === platform + file ? Buffer.from('stale prior release') : read(f) }), /Stale (iOS|Android) shared asset/);
  }
}
assert.throws(() => verify({ read: f => f === 'android/app/src/main/assets/public/android-layout.css' ? Buffer.from('stale override') : read(f) }), /Stale Android adaptation/);
assert.throws(() => verify({ read: f => f === 'android/app/src/main/assets/public/android-fonts/NotoSansSC-VF.ttf' ? Buffer.from('stale font') : read(f) }), /Stale Android font/);
assert.throws(() => verify({ read: f => f === 'ios/App/App/capacitor.config.json' ? Buffer.from('{"packageClassList":[]}') : read(f) }), /iOS push registration/);
console.log('PASS: stale source/styles/feature/policy files on either platform, stale Android overrides and missing Apple push plugin are rejected.');
