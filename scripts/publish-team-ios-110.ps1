$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if ((& git branch --show-current).Trim() -ne 'main') { throw 'Run this upload from the main branch.' }
$releasePackage = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
if ($releasePackage.version -ne '1.0.9') { throw 'Expected version 1.0.9.' }
if ((Get-Content -LiteralPath 'config.js' -Raw) -notmatch 'TURTLE_APP_BUILD\s*=\s*110\s*;') { throw 'Expected build 110.' }
$releaseFiles = @(Get-Content -LiteralPath 'scripts/ios-iap-release-files.json' -Raw | ConvertFrom-Json)
foreach ($file in $releaseFiles) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing release file: $file" }
}
& npm.cmd run cap:sync:ios
if ($LASTEXITCODE -ne 0) { throw 'iOS asset sync failed.' }
& node scripts/verify-ios-build.js --native
if ($LASTEXITCODE -ne 0) { throw 'iOS release verification failed.' }
foreach ($test in @('test-team-space.js', 'test-team-visibility.cjs', 'test-team-breeding.cjs', 'test-team-collaboration.cjs', 'test-team-request-races.cjs')) {
  & node "scripts/$test"
  if ($LASTEXITCODE -ne 0) { throw "Failed: $test" }
}
& git add -- @releaseFiles
if ($LASTEXITCODE -ne 0) { throw 'Could not stage release files.' }
& git diff --quiet HEAD -- @releaseFiles
$releaseDiffStatus = $LASTEXITCODE
if ($releaseDiffStatus -eq 1) {
  & git commit --only -m 'Release 1.0.9 build 110: team membership and Apple in-app purchases' -- @releaseFiles
  if ($LASTEXITCODE -ne 0) { throw 'Release commit failed.' }
} elseif ($releaseDiffStatus -ne 0) { throw 'Could not inspect release changes.' }
& git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Git upload failed. Run this script again to retry.' }
Write-Host 'Uploaded source for 1.0.9 (110). In Codemagic, start ios-testflight on main.'
