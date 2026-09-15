$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

$releaseBranch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $releaseBranch -ne 'main') { throw 'Run this release from the main branch.' }
$releasePackage = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
if ($releasePackage.version -ne '1.0.9') { throw 'Expected version 1.0.9.' }
if ((Get-Content -LiteralPath 'config.js' -Raw) -notmatch 'TURTLE_APP_BUILD\s*=\s*110\s*;') { throw 'Expected build 110.' }

& node --check app.js
if ($LASTEXITCODE -ne 0) { throw 'App syntax check failed.' }
& node --check server/server.js
if ($LASTEXITCODE -ne 0) { throw 'Server syntax check failed.' }
& node scripts/verify-ios-build.js
if ($LASTEXITCODE -ne 0) { throw 'Build verification failed. Run npm.cmd run cap:sync:ios first.' }

$releaseFiles = @(
  'app.js', 'config.js', 'package.json', 'package-lock.json',
  'ios/App/App.xcodeproj/project.pbxproj', 'server/server.js',
  'scripts/test-api-workflows.js', 'scripts/test-community-home-layout.js',
  'scripts/test-home-loss-count.js', 'scripts/test-account-device-sessions.js',
  'scripts/test-feed-loading-recovery.js', 'scripts/test-photo-picker-handoff.js',
  'docs/account-device-sessions.md', 'scripts/publish-ios-110.ps1'
)
& git add -- @releaseFiles
if ($LASTEXITCODE -ne 0) { throw 'Could not stage release files.' }
& git diff --quiet HEAD -- @releaseFiles
$releaseDiffStatus = $LASTEXITCODE
if ($releaseDiffStatus -eq 1) {
  & git commit --only -m 'Release 1.0.9 build 110: photo selection and device login fixes' -- @releaseFiles
  if ($LASTEXITCODE -ne 0) { throw 'Release commit failed.' }
} elseif ($releaseDiffStatus -ne 0) {
  throw 'Could not inspect release changes.'
}
& git push origin main
if ($LASTEXITCODE -ne 0) { throw 'GitHub push failed. Run this same script again to retry.' }
Write-Host 'Published source for 1.0.9 (110). Start Codemagic ios-testflight on main.'
