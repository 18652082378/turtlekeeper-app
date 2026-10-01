'use strict';
// Run on the Codemagic Mac, where the real profiles and private-key identities
// are installed. This is read-only; it does not create/revoke Apple credentials.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const plist = require('plist');
const { parseProject } = require('./verify-notification-extension.cjs');
const root = path.resolve(__dirname, '..');

function releaseTargets(project) {
  const objects = project.objects;
  return ['App', 'TurtleNotificationService'].map(name => {
    const target = Object.values(objects).find(item => item.isa === 'PBXNativeTarget' && item.name === name);
    if (!target) throw Error(`Missing signing target: ${name}`);
    const configs = objects[target.buildConfigurationList]?.buildConfigurations || [];
    const release = configs.map(id => objects[id]).find(item => item?.name === 'Release');
    const settings = release?.buildSettings;
    if (!settings?.PRODUCT_BUNDLE_IDENTIFIER || settings.PRODUCT_BUNDLE_IDENTIFIER.includes('$')) throw Error(`Missing explicit Release bundle identifier: ${name}`);
    return { name, bundle: settings.PRODUCT_BUNDLE_IDENTIFIER, settings };
  });
}

function certificateHashes(profile) {
  return (profile.DeveloperCertificates || []).map(bytes => crypto.createHash('sha1').update(bytes).digest('hex').toUpperCase());
}

function profileProblem(profile, target, identities, now) {
  const appId = profile.Entitlements?.['application-identifier'];
  if (typeof appId !== 'string' || appId.slice(appId.indexOf('.') + 1) !== target.bundle) return 'bundle identifier does not match exactly';
  if (!profile.UUID || !profile.Name || !profile.TeamIdentifier?.[0]) return 'profile metadata is incomplete';
  if (!(new Date(profile.ExpirationDate).getTime() > now.getTime())) return 'profile is expired or has no valid expiration date';
  if (profile.Entitlements?.['get-task-allow'] !== false || Object.hasOwn(profile, 'ProvisionedDevices') || profile.ProvisionsAllDevices === true) return 'an App Store distribution profile is required';
  if (!profile.Platform?.includes('iOS')) return 'profile is not for iOS';
  if (!certificateHashes(profile).some(hash => identities.has(hash))) return 'profile has no valid signing identity with a private key in the keychain';
  return null;
}

function verifySigning({ project, profiles, identities, applied = false, exportOptions, now = new Date() }) {
  const targets = releaseTargets(project);
  if (applied && !['app-store', 'app-store-connect'].includes(exportOptions?.method)) throw Error('Export options must use App Store distribution');
  const available = targets.map(target => {
    const candidates = profiles.filter(profile => !profileProblem(profile, target, identities, now));
    if (!candidates.length) {
      const matching = profiles.filter(profile => profile.Entitlements?.['application-identifier']?.endsWith(`.${target.bundle}`));
      const reasons = [...new Set(matching.map(profile => profileProblem(profile, target, identities, now)))];
      throw Error(`${target.name} (${target.bundle}): ${reasons.join('; ') || 'no matching App Store provisioning profile is installed'}. See docs/ios-121-signing-fix.md; add/fetch the extension profile in Codemagic Code signing identities.`);
    }
    if (!applied) return candidates;
    const settings = target.settings;
    const specifier = settings.PROVISIONING_PROFILE_SPECIFIER || settings.PROVISIONING_PROFILE;
    const exportProfile = exportOptions.provisioningProfiles?.[target.bundle];
    const assigned = candidates.filter(profile => {
      const identifiers = [profile.UUID, profile.Name];
      if (!identifiers.includes(exportProfile) || settings.DEVELOPMENT_TEAM !== profile.TeamIdentifier[0]) return false;
      if (exportOptions.teamID && exportOptions.teamID !== profile.TeamIdentifier[0]) return false;
      // Codemagic applies explicit assignments for manual profiles. For an
      // Xcode-managed profile it sets the team and records the export mapping.
      return settings.CODE_SIGN_STYLE === 'Manual' ? identifiers.includes(specifier) :
        [undefined, 'Automatic'].includes(settings.CODE_SIGN_STYLE) && !specifier;
    });
    if (!assigned.length) throw Error(`${target.name}: Release profile assignment or development team does not match an installed valid profile`);
    return assigned;
  });
  // Both embedded products must be signed by the same team and identity.
  const pair = available[0].flatMap(main => available[1].map(extension => [main, extension])).find(([main, extension]) =>
    main.TeamIdentifier[0] === extension.TeamIdentifier[0] && certificateHashes(main).some(hash => identities.has(hash) && certificateHashes(extension).includes(hash)));
  if (!pair) throw Error('App and TurtleNotificationService need profiles for the same Apple team and an available common distribution signing identity');
  return { mode: applied ? 'applied-release-signing' : 'installed-signing-resources', targets: targets.map(item => ({ name: item.name, bundleIdentifier: item.bundle })), passed: true, xcodeCompiled: false };
}

function installedResources({ home = os.homedir(), run = execFileSync, disk = fs } = {}) {
  const directories = [
    'Library/MobileDevice/Provisioning Profiles',
    'Library/Developer/Xcode/UserData/Provisioning Profiles'
  ].map(relative => path.join(home, relative));
  const files = directories.filter(directory => disk.existsSync(directory)).flatMap(directory =>
    disk.readdirSync(directory).filter(file => file.endsWith('.mobileprovision')).map(file => path.join(directory, file)));
  const profiles = [];
  let unreadable = 0;
  for (const file of files) {
    try {
      const xml = run('security', ['cms', '-D', '-i', file], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
      profiles.push(plist.parse(xml));
    } catch { unreadable++; }
  }
  const output = run('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
  const identities = new Set([...output.matchAll(/^\s*\d+\)\s+([A-Fa-f0-9]{40})\s+/gm)].map(match => match[1].toUpperCase()));
  return { profiles, identities, unreadable };
}

module.exports = { verifySigning, releaseTargets, installedResources };
if (require.main === module) {
  try {
    if (process.platform !== 'darwin') throw Error('Real iOS signing checks must run on the Codemagic Mac; Windows resource tests cannot verify Apple signing');
    const resources = installedResources();
    if (resources.unreadable) console.error(`Ignored ${resources.unreadable} unreadable profile(s); no credential contents were logged.`);
    const project = parseProject(fs.readFileSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8'));
    const applied = process.argv.includes('--applied');
    const exportOptions = applied ? plist.parse(fs.readFileSync(path.join(os.homedir(), 'export_options.plist'), 'utf8')) : undefined;
    console.log(JSON.stringify(verifySigning({ project, ...resources, applied, exportOptions })));
  } catch (error) { console.error(`iOS SIGNING CHECK FAILED: ${error.message}`); process.exitCode = 1; }
}
