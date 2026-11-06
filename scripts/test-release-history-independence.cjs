'use strict';

// Exercise the real upgrade and HTTP workflows in an archive-style checkout.
// No .git, .env, user database, uploads or credentials are copied into it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
// macOS commonly exposes its temporary directory through /var -> /private/var.
// Use the canonical root so the server's symlink escape guard remains active.
const temporaryRoot = fs.realpathSync(os.tmpdir());
const sandbox = fs.mkdtempSync(path.join(temporaryRoot, 'tk-history-free-release-'));
const copy = file => {
  const target = path.join(sandbox, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target);
};
try {
  for (const file of ['app.js', 'index.html', 'config.js', 'styles.css', 'species-data.js', 'privacy.html', 'terms.html', 'apple-app-site-association',
    'scripts/test-api-workflows.js', 'scripts/test-version-upgrade.js', 'scripts/legacy-upgrade-fixture.js',
    'scripts/fixtures/released-1.0.7-upgrade-source.json']) copy(file);
  for (const name of fs.readdirSync(path.join(root, 'server'))) {
    if (name.endsWith('.js') || name === 'weather-cities.json') copy('server/' + name);
  }
  fs.cpSync(path.join(root, 'assets'), path.join(sandbox, 'assets'), { recursive: true });
  assert.equal(fs.existsSync(path.join(sandbox, '.git')), false);
  assert.equal(fs.existsSync(path.join(sandbox, 'server/.env')), false);
  const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  env.NODE_PATH = path.join(root, 'node_modules');
  env.GIT_CEILING_DIRECTORIES = path.dirname(sandbox);
  // A missing fixture must fail visibly, never fall back to Git or skip the
  // compatibility check. Its actionable error must survive in CI artifacts.
  const snapshot = path.join(sandbox, 'scripts/fixtures/released-1.0.7-upgrade-source.json');
  const original = fs.readFileSync(snapshot);
  try {
    fs.renameSync(snapshot, snapshot + '.held');
    const missing = spawnSync(process.execPath, [path.join(sandbox, 'scripts/test-api-workflows.js')], {
      cwd: sandbox, env, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024
    });
    if (missing.error) throw missing.error;
    assert.notEqual(missing.status, 0, 'an omitted legacy snapshot must block the release');
    const failure = JSON.parse(fs.readFileSync(path.join(sandbox, 'output/api-workflow-qa/results.json'), 'utf8'));
    assert.equal(failure.status, 'failed');
    assert.match(failure.error.message, /released-1\.0\.7-upgrade-source\.json/);
    assert.equal(failure.error.code, 'MODULE_NOT_FOUND');
    console.log('PASS missing upgrade fixture blocks the check and preserves its full error in the API report.');
  } finally {
    fs.writeFileSync(snapshot, original);
  }
  for (const name of ['test-version-upgrade.js', 'test-api-workflows.js']) {
    const result = spawnSync(process.execPath, [path.join(sandbox, 'scripts', name)], {
      cwd: sandbox, env, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    assert.equal(result.status, 0, name + ' must run without any Git history or local server configuration');
  }
  console.log('PASS history-independent release: original 1.0.7 upgrade and complete HTTP workflows pass without .git or local credentials.');
} finally {
  assert.equal(path.dirname(path.resolve(sandbox)), temporaryRoot);
  assert.ok(path.basename(sandbox).startsWith('tk-history-free-release-'));
  fs.rmSync(sandbox, { recursive: true, force: true });
}
