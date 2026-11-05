$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path $PSScriptRoot -Parent
$sourcePath = Join-Path $PSScriptRoot 'android/branding/guiyou-icon-source.png'
$artwork = [System.Drawing.Image]::FromFile($sourcePath)
function Export-Icon([string]$Destination, [int]$Size, [double]$Scale = 1) {
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb))
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#FFF3BB'))
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $inner = [int][Math]::Round($Size * $Scale)
        $offset = [int][Math]::Floor(($Size - $inner) / 2)
        $attributes = New-Object System.Drawing.Imaging.ImageAttributes
        try {
            $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
            $rectangle = New-Object System.Drawing.Rectangle($offset, $offset, $inner, $inner)
            $graphics.DrawImage($artwork, $rectangle, 0, 0, $artwork.Width, $artwork.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
        } finally { $attributes.Dispose() }
        [System.IO.Directory]::CreateDirectory((Split-Path $Destination -Parent)) | Out-Null
        $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
try {
    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $projectRoot 'assets/guiyou-app-icon.png') -Force
    Export-Icon (Join-Path $projectRoot 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png') 1024
    Export-Icon (Join-Path $projectRoot 'output/android/store/guiyou-icon-512.png') 512
    foreach ($density in @(@('mdpi',48,108), @('hdpi',72,162), @('xhdpi',96,216), @('xxhdpi',144,324), @('xxxhdpi',192,432))) {
        $folder = Join-Path $projectRoot ('android/app/src/main/res/mipmap-' + $density[0])
        Export-Icon (Join-Path $folder 'ic_launcher.png') $density[1]
        Export-Icon (Join-Path $folder 'ic_launcher_round.png') $density[1]
        Export-Icon (Join-Path $folder 'ic_launcher_foreground.png') $density[2] 0.6
    }
    Write-Output 'Generated iOS 1024px RGB icon, all Android launcher densities, store icon and web icon.'
} finally { $artwork.Dispose() }
