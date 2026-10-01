'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const plist = require('plist');
const { parseProject } = require('./verify-notification-extension.cjs');
const { verifySigning, releaseTargets, installedResources } = require('./verify-ios-signing.cjs');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
const now = new Date('2026-10-01T00:00:00Z');
// Synthetic certificate bytes and plist objects; no Apple credentials, network
// calls, or actual keychain writes are used by these regression tests.
const certificate = Buffer.from('synthetic certificate fixture, not a real credential');
const identity = crypto.createHash('sha1').update(certificate).digest('hex').toUpperCase();
const mainBundle = 'com.turtlekeeper.app';
const extensionBundle = mainBundle + '.NotificationService';
function profile(bundle) {
  return { Name: bundle + '-AppStore', UUID: bundle + '-fixture-uuid', TeamIdentifier: ['TEAMFIXTURE'],
    Platform: ['iOS'], ExpirationDate: new Date('2027-01-01T00:00:00Z'), DeveloperCertificates: [certificate],
    Entitlements: { 'application-identifier': 'LEGACYPREFIX.' + bundle, 'get-task-allow': false } };
}
function fixture(applied = false) {
  const project = parseProject(source);
  const profiles = [profile(mainBundle), profile(extensionBundle)];
  const exportOptions = { method: 'app-store', teamID: 'TEAMFIXTURE', provisioningProfiles: {} };
  releaseTargets(project).forEach((target, index) => {
    exportOptions.provisioningProfiles[target.bundle] = profiles[index].UUID;
    if (applied) Object.assign(target.settings, { CODE_SIGN_STYLE: 'Manual', DEVELOPMENT_TEAM: 'TEAMFIXTURE', PROVISIONING_PROFILE_SPECIFIER: profiles[index].Name });
  });
  return { project, profiles, exportOptions, identities: new Set([identity]), applied, now };
}
const outcomes = [];
function test(name, run) {
  try { run(); outcomes.push({ name, pass: true }); }
  catch (error) { outcomes.push({ name, pass: false, error: error.message }); }
}
function rejects(name, change, expression, applied = false) {
  test(name, () => { const data = fixture(applied); change(data); assert.throws(() => verifySigning(data), expression); });
}
test('same-team exact App Store profiles and an available common identity pass', () => assert.equal(verifySigning(fixture()).passed, true));
test('applied manual Release profiles and export mapping pass', () => assert.equal(verifySigning(fixture(true)).passed, true));
test('Xcode-managed signing with an applied team and export mapping passes', () => {
  const data = fixture(true);
  for (const target of releaseTargets(data.project)) { delete target.settings.CODE_SIGN_STYLE; delete target.settings.PROVISIONING_PROFILE_SPECIFIER; }
  assert.equal(verifySigning(data).passed, true);
});
rejects('build 162 failure: main profile alone cannot sign the notification extension', data => data.profiles.pop(), /TurtleNotificationService.*no matching App Store/);
rejects('extension profile alone cannot sign the main app', data => data.profiles.shift(), /App \(com.turtlekeeper.app\).*no matching App Store/);
rejects('wildcard profile cannot substitute for the required extension profile', data => data.profiles[1].Entitlements['application-identifier'] = 'TEAMFIXTURE.com.turtlekeeper.app.*', /TurtleNotificationService/);
rejects('expired extension profile is rejected', data => data.profiles[1].ExpirationDate = now, /expired/);
rejects('malformed expiration date is rejected', data => data.profiles[1].ExpirationDate = 'unknown', /expiration date/);
rejects('development profile is rejected', data => data.profiles[1].Entitlements['get-task-allow'] = true, /App Store distribution/);
rejects('ad hoc profile is rejected', data => data.profiles[1].ProvisionedDevices = ['fixture-device'], /App Store distribution/);
rejects('enterprise profile is rejected', data => data.profiles[1].ProvisionsAllDevices = true, /App Store distribution/);
rejects('macOS profile is rejected', data => data.profiles[1].Platform = ['OSX'], /not for iOS/);
rejects('certificate without an available private-key identity is rejected', data => data.identities.clear(), /private key/);
rejects('different teams cannot sign the app and extension', data => data.profiles[1].TeamIdentifier = ['OTHERTEAM'], /same Apple team/);
rejects('different available certificates cannot sign the app and extension', data => {
  const other = Buffer.from('a different synthetic certificate');
  data.profiles[1].DeveloperCertificates = [other];
  data.identities.add(crypto.createHash('sha1').update(other).digest('hex').toUpperCase());
}, /common distribution signing identity/);
rejects('installed extension profile without Release assignment is rejected', data => delete releaseTargets(data.project)[1].settings.PROVISIONING_PROFILE_SPECIFIER, /Release profile assignment/, true);
rejects('wrong Release development team is rejected', data => releaseTargets(data.project)[1].settings.DEVELOPMENT_TEAM = 'OTHERTEAM', /development team/, true);
rejects('missing extension export mapping is rejected', data => delete data.exportOptions.provisioningProfiles[extensionBundle], /Release profile assignment/, true);
rejects('development export method is rejected', data => data.exportOptions.method = 'development', /App Store distribution/, true);
test('expired duplicate profile does not hide a valid profile', () => {
  const data = fixture(); const expired = profile(extensionBundle); expired.ExpirationDate = now;
  data.profiles.unshift(expired); assert.equal(verifySigning(data).passed, true);
});
test('CMS decoding and identity discovery are read-only and tolerate an unrelated damaged profile', () => {
  const calls = [];
  const resources = installedResources({ home: '/fixture-home', disk: {
    existsSync: () => true, readdirSync: () => ['good.mobileprovision', 'bad.mobileprovision', 'ignore.txt']
  }, run: (command, args) => {
    calls.push([command, ...args]);
    assert.equal(command, 'security');
    if (args[0] === 'cms') {
      if (args.at(-1).endsWith('bad.mobileprovision')) throw Error('bad synthetic CMS');
      return plist.build(profile(mainBundle));
    }
    assert.deepEqual(args, ['find-identity', '-v', '-p', 'codesigning']);
    return `  1) ${identity} "Apple Distribution: Synthetic Fixture"\n  1 valid identities found\n`;
  }});
  assert.equal(resources.profiles.length, 2); assert.equal(resources.unreadable, 2);
  assert.ok(resources.identities.has(identity)); assert.equal(calls.length, 5);
  assert.ok(Buffer.isBuffer(resources.profiles[0].DeveloperCertificates[0]));
});
if (process.platform !== 'darwin') test('Windows invocation fails honestly instead of claiming real Apple signing passed', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-ios-signing.cjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /Windows resource tests cannot verify Apple signing/);
});
const report = { scope: 'Synthetic regression fixtures only. Real macOS profiles, keychain, Xcode archive and TestFlight are not validated here.', outcomes };
const destination = path.join(root, 'output/release-acceptance/ios-signing-regression.json');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (outcomes.some(item => !item.pass)) process.exitCode = 1;
