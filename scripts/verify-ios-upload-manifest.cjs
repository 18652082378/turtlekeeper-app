'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function verifyUploadManifest(files, { cwd = root } = {}) {
  assert(files.length > 0, 'Release source list is empty');
  assert.equal(new Set(files).size, files.length, 'Duplicate release source');
  for (const file of files) {
    assert(!path.isAbsolute(file) && !file.includes('\\') && !file.split('/').includes('..'), 'Invalid release path');
  }
  // NUL separators avoid PowerShell CRLF/path quoting changing the check.
  // --no-index also catches generated files after their .gitignore is staged.
  const result = spawnSync('git', ['check-ignore', '--no-index', '--stdin', '-z'], { cwd, input: files.join('\0') + '\0', encoding: 'utf8' });
  if (result.error) throw result.error;
  assert([0, 1].includes(result.status), result.stderr || 'Could not check ignored release sources');
  const ignored = result.stdout.split('\0').filter(Boolean);
  assert.equal(ignored.length, 0, 'Release list includes Git-ignored files: ' + ignored.join(', '));
  for (const file of files) assert(fs.statSync(path.join(cwd, file)).isFile(), 'Missing release source: ' + file);
  return files.length;
}
module.exports = { verifyUploadManifest };
if (require.main === module) {
  const build = fs.readFileSync(path.join(root, 'config.js'), 'utf8').match(/TURTLE_APP_BUILD\s*=\s*(\d+)/)?.[1];
  const files = fs.readFileSync(path.join(root, `scripts/ios-${build}-release-files.txt`), 'utf8').split(/\r?\n/).filter(Boolean);
  console.log(`PASS: ${verifyUploadManifest(files)} release sources exist and none are Git-ignored.`);
}
