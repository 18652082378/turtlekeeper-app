'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const plist = require('plist');
// Parse the actual OpenStep object graph, rather than merely searching for
// filenames which could be present but unconnected to the build target.
function parseProject(source) {
  const tokens = source.match(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*|[{}()=;,]|[^\s{}()=;,"]+/g)
    .filter(token => !token.startsWith('/*') && !token.startsWith('//'));
  let index = 0;
  const take = expected => { assert.equal(tokens[index++], expected, 'Invalid Xcode project syntax'); };
  const scalar = () => { const token = tokens[index++]; assert.ok(token && !/^[{}()=;,]$/.test(token)); return token.startsWith('"') ? JSON.parse(token) : token; };
  function value() {
    if (tokens[index] === '{') {
      index++; const result = {};
      while (tokens[index] !== '}') { const key = scalar(); assert.ok(!Object.hasOwn(result, key), 'Duplicate Xcode object/property: ' + key); take('='); result[key] = value(); take(';'); }
      take('}'); return result;
    }
    if (tokens[index] === '(') {
      index++; const result = [];
      while (tokens[index] !== ')') { result.push(value()); if (tokens[index] !== ')') take(','); }
      take(')'); return result;
    }
    return scalar();
  }
  const project = value(); assert.equal(index, tokens.length, 'Unexpected trailing project data'); return project;
}
function verifyNotificationExtension(root, read = file => fs.readFileSync(path.join(root, file), 'utf8')) {
  const project = parseProject(read('ios/App/App.xcodeproj/project.pbxproj'));
  const objects = project.objects;
  const targets = Object.entries(objects).filter(([, item]) => item.isa === 'PBXNativeTarget');
  const [extensionId, extension] = targets.find(([, item]) => item.name === 'TurtleNotificationService') || [];
  const [, app] = targets.find(([, item]) => item.name === 'App') || [];
  assert.ok(extension && app, 'Notification extension target is missing');
  assert.equal(extension.productType, 'com.apple.product-type.app-extension');
  assert.ok(objects[project.rootObject].targets.includes(extensionId));
  assert.ok(app.dependencies.some(id => objects[id]?.target === extensionId), 'App must build the notification extension');
  const product = objects[extension.productReference];
  assert.equal(product?.path, 'TurtleNotificationService.appex');
  assert.ok(app.buildPhases.some(id => {
    const phase = objects[id];
    return phase?.isa === 'PBXCopyFilesBuildPhase' && phase.dstSubfolderSpec === '13' && phase.files.some(file => objects[file]?.fileRef === extension.productReference);
  }), 'App must embed the built extension in PlugIns');
  const phases = extension.buildPhases.map(id => objects[id]);
  const sources = phases.find(phase => phase?.isa === 'PBXSourcesBuildPhase');
  assert.ok(sources?.files.some(id => objects[objects[id]?.fileRef]?.path === 'NotificationService.swift'), 'Extension source must compile in its own target');
  const resources = phases.find(phase => phase?.isa === 'PBXResourcesBuildPhase');
  assert.ok(resources?.files.some(id => objects[objects[id]?.fileRef]?.path === 'PrivacyInfo.xcprivacy'), 'Extension privacy manifest must be bundled');
  const configs = target => objects[target.buildConfigurationList].buildConfigurations.map(id => objects[id]);
  const appConfigs = configs(app);
  assert.equal(configs(extension).length, appConfigs.length);
  for (const config of configs(extension)) {
    const main = appConfigs.find(item => item.name === config.name)?.buildSettings;
    const setting = config.buildSettings;
    assert.ok(main);
    for (const field of ['CURRENT_PROJECT_VERSION', 'MARKETING_VERSION', 'IPHONEOS_DEPLOYMENT_TARGET']) assert.equal(setting[field], main[field], 'Extension and app must agree: ' + field);
    assert.equal(setting.PRODUCT_BUNDLE_IDENTIFIER, main.PRODUCT_BUNDLE_IDENTIFIER + '.NotificationService');
    assert.equal(setting.APPLICATION_EXTENSION_API_ONLY, 'YES'); assert.equal(setting.SKIP_INSTALL, 'YES');
    assert.equal(setting.INFOPLIST_FILE, 'TurtleNotificationService/Info.plist');
  }
  const info = plist.parse(read('ios/App/TurtleNotificationService/Info.plist'));
  assert.equal(info.NSExtension.NSExtensionPointIdentifier, 'com.apple.usernotifications.service');
  assert.equal(info.NSExtension.NSExtensionPrincipalClass, '$(PRODUCT_MODULE_NAME).NotificationService');
  const { ATTACHMENT_HOSTS } = require('../server/community-daily-push');
  assert.deepEqual(info.TurtleAttachmentHosts, ATTACHMENT_HOSTS, 'Server and native attachment hosts differ');
  assert.equal(info.CFBundleVersion, '$(CURRENT_PROJECT_VERSION)');
  assert.equal(info.CFBundleShortVersionString, '$(MARKETING_VERSION)');
  const privacy = plist.parse(read('ios/App/TurtleNotificationService/PrivacyInfo.xcprivacy'));
  assert.equal(privacy.NSPrivacyTracking, false);
  assert.ok(read('ios/App/TurtleNotificationService/NotificationService.swift').includes('final class NotificationService: UNNotificationServiceExtension'));
  return { target: extension.name, bundleIdentifier: configs(extension)[0].buildSettings.PRODUCT_BUNDLE_IDENTIFIER, xcodeCompiled: false, nativeDeviceTested: false };
}
module.exports = { parseProject, verifyNotificationExtension };
if (require.main === module) console.log(JSON.stringify(verifyNotificationExtension(path.resolve(__dirname, '..'))));
