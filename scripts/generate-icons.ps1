Add-Type -AssemblyName System.Drawing
$iconDir = Join-Path $PSScriptRoot "..\icons"
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

foreach ($size in @(16, 48, 128)) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::FromArgb(255, 15, 15, 15))
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 62, 166, 255))
  $margin = [Math]::Max(2, [int]($size * 0.15))
  $w = $size - 2 * $margin
  $h = $size - 2 * $margin
  $g.FillRectangle($brush, $margin, $margin + [int]($h * 0.12), $w, [int]($h * 0.78))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 15, 15, 15)), ([Math]::Max(1, $size / 16))
  $y = $margin + [int]($h * 0.28)
  for ($i = 0; $i -lt 3; $i++) {
    $g.DrawLine($pen, $margin + [int]($w * 0.15), $y, $margin + [int]($w * 0.85), $y)
    $y += [int]($h * 0.14)
  }
  $path = Join-Path $iconDir "icon$size.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "Wrote $path"
}
