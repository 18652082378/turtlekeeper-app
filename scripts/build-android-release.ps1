param([ValidateSet('beta', 'store')][string]$UpdateChannel = 'beta')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $projectRoot '.android-build-tools'
$env:JAVA_HOME = (Get-ChildItem -LiteralPath (Join-Path $toolRoot 'java') -Directory | Select-Object -First 1).FullName
$env:ANDROID_SDK_ROOT = Join-Path $toolRoot 'sdk'
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle-cache'
$env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
$credentialsFile = Join-Path $projectRoot 'keys/android-release.json'
if (!(Test-Path -LiteralPath $credentialsFile)) { throw 'Missing keys/android-release.json. Restore the original signing key before rebuilding.' }
$credentials = Get-Content -LiteralPath $credentialsFile -Raw | ConvertFrom-Json
$env:TURTLE_ANDROID_KEYSTORE = Join-Path $projectRoot 'keys/guiyou-release.jks'
$env:TURTLE_ANDROID_STORE_PASSWORD = $credentials.password
$env:TURTLE_ANDROID_KEY_PASSWORD = $credentials.password
$env:TURTLE_ANDROID_KEY_ALIAS = $credentials.alias
Push-Location $projectRoot
try {
    $env:TURTLE_ANDROID_UPDATE_CHANNEL = $UpdateChannel
    node scripts/check-mobile-release.cjs
    if ($LASTEXITCODE -ne 0) { throw 'iOS/Android resource and layout checks failed' }
    node scripts/verify-android-build.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Android asset verification failed' }
    $localGradle = Join-Path $toolRoot 'gradle/gradle-8.14.3/bin/gradle.bat'
    $gradleCommand = if (Test-Path -LiteralPath $localGradle) { $localGradle } else { Join-Path $projectRoot 'android/gradlew.bat' }
    & $gradleCommand -p android --no-daemon --console=plain '-Pkotlin.compiler.execution.strategy=in-process' :app:testDebugUnitTest :app:assembleRelease
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed' }
    $destination = Join-Path $projectRoot 'output/android'
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    $versionMatch = [regex]::Match((Get-Content -LiteralPath 'android/app/build.gradle' -Raw), 'versionName\s+"([^"]+)"')
    if (!$versionMatch.Success) { throw 'Missing Android versionName' }
    $buildMatch = [regex]::Match((Get-Content -LiteralPath 'android/app/build.gradle' -Raw), 'versionCode\s+(\d+)')
    $apkName = 'guiyou-shouzhang-' + $versionMatch.Groups[1].Value + '-' + $buildMatch.Groups[1].Value + '-' + $UpdateChannel + '-release.apk'
    Copy-Item -LiteralPath 'android/app/build/outputs/apk/release/app-release.apk' -Destination (Join-Path $destination $apkName) -Force
    Write-Host "APK: $destination/$apkName"
} finally {
    Pop-Location
    Remove-Item Env:TURTLE_ANDROID_STORE_PASSWORD,Env:TURTLE_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:TURTLE_ANDROID_UPDATE_CHANNEL -ErrorAction SilentlyContinue
}
