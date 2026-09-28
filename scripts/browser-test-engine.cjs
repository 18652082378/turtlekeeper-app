const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER_ENGINE || 'chromium';
if (!['chromium', 'webkit'].includes(engine)) throw new Error('BROWSER_ENGINE must be chromium or webkit');

function launchBrowser(chromiumOptions = {}) {
  const options = { headless: true, ...(engine === 'chromium' ? chromiumOptions : {}) };
  // Existing Chromium scripts use a locally installed Chrome/Edge. A WebKit
  // run must use its matching Playwright build rather than that executable.
  if (engine === 'chromium' && process.env.BROWSER_EXECUTABLE) {
    options.executablePath = process.env.BROWSER_EXECUTABLE;
    delete options.channel;
  }
  return playwright[engine].launch(options);
}

function artifactName(name) {
  if (engine === 'chromium') return name;
  const extension = path.extname(name);
  return name.slice(0, -extension.length) + '-' + engine + extension;
}

function recordResult(root, name, result) {
  fs.mkdirSync(path.join(root, 'output'), { recursive: true });
  fs.writeFileSync(path.join(root, 'output', artifactName(name)), JSON.stringify({
    engine, platform: process.platform, nativeDevice: false, checkedAt: new Date().toISOString(), ...result
  }, null, 2));
}

module.exports = { engine, launchBrowser, artifactName, recordResult };
