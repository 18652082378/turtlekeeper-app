param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if ((& git branch --show-current).Trim() -ne 'main') { throw 'Run this release from main.' }
$releasePackage = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
if ($releasePackage.version -ne '1.1.0') { throw 'Expected version 1.1.0.' }
if ((Get-Content -LiteralPath 'config.js' -Raw) -notmatch 'TURTLE_APP_BUILD\s*=\s*115\s*;') { throw 'Expected build 115.' }
$releaseFiles = @(Get-Content -LiteralPath 'scripts/ios-115-release-files.json' -Raw | ConvertFrom-Json)
foreach ($file in $releaseFiles) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing release file: $file" }
  if ($file -match '(^|/)(server|android|output|www|node_modules|\.git)(/|$)|\.(p8|p12|jks|keystore)$|(^|/)\.env') { throw "Unexpected release file: $file" }
}
# build-web recreates only this verified generated directory.
$releaseRoot = (Get-Location).Path
$webOutput = [IO.Path]::GetFullPath((Join-Path $releaseRoot 'www'))
if ($webOutput -ne ($releaseRoot + '\www')) { throw 'Unexpected web output directory.' }
& npm.cmd run cap:sync:ios
if ($LASTEXITCODE -ne 0) { throw 'iOS sync failed.' }
& node scripts/verify-ios-build.js --native
if ($LASTEXITCODE -ne 0) { throw 'iOS release verification failed.' }
& node --check app.js
if ($LASTEXITCODE -ne 0) { throw 'App syntax check failed.' }
& node --check assets/team-space.js
if ($LASTEXITCODE -ne 0) { throw 'Team syntax check failed.' }
if ($CheckOnly) { Write-Host 'CHECK PASSED: iOS 1.1.0 (115). No commit or upload performed.'; exit 0 }
& git add -- @releaseFiles
if ($LASTEXITCODE -ne 0) { throw 'Could not stage release files.' }
& git diff --quiet HEAD -- @releaseFiles
$releaseDiffStatus = $LASTEXITCODE
if ($releaseDiffStatus -eq 1) {
  & git -c gc.auto=0 -c maintenance.auto=false commit --only -m 'Release iOS 1.1.0 build 115: branding and team farm switching' -- @releaseFiles
  if ($LASTEXITCODE -ne 0) { throw 'Release commit failed.' }
} elseif ($releaseDiffStatus -ne 0) { throw 'Could not inspect release changes.' }
& git -c gc.auto=0 -c maintenance.auto=false push origin main
if ($LASTEXITCODE -ne 0) { throw 'GitHub upload failed. Run this script again to retry.' }
Write-Host 'Source uploaded for iOS 1.1.0 (115). Start Codemagic ios-testflight on main. App Store review remains manual.'
