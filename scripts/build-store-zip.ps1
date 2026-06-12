# Build Chrome Web Store upload zip (extension files only).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$dest = Join-Path (Split-Path $root -Parent) 'youtube-study-notes-store.zip'
if (Test-Path $dest) { Remove-Item $dest -Force }

$files = @(
  'manifest.json',
  'background.js',
  'privacy.html',
  'content',
  'export',
  'icons',
  'lib',
  'options',
  'popup'
)

foreach ($f in $files) {
  if (-not (Test-Path $f)) { throw "Missing required path: $f" }
}

# Validate manifest JSON
$null = Get-Content 'manifest.json' -Raw | ConvertFrom-Json

Compress-Archive -Path $files -DestinationPath $dest -Force
$zip = Get-Item $dest
Write-Host "Created: $($zip.FullName)"
Write-Host "Size: $([math]::Round($zip.Length / 1KB, 1)) KB"
Write-Host "Manifest version: $((Get-Content manifest.json -Raw | ConvertFrom-Json).version)"
