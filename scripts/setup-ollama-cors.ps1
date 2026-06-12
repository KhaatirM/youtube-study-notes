# Fixes Ollama 403 for Chrome extensions on Windows.
# The extension also rewrites Origin headers automatically (v1.0.10+).

$ErrorActionPreference = 'Stop'

$origins = 'chrome-extension://*,http://localhost,http://127.0.0.1,*'
[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', $origins, 'User')
Write-Host "Set OLLAMA_ORIGINS=$origins"

$ollama = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
if (Test-Path $ollama) {
  Get-Process -Name 'ollama' -ErrorAction SilentlyContinue | Stop-Process -Force
  Get-Process -Name 'Ollama' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2
  Start-Process $ollama
  Write-Host "Restarted Ollama."
} else {
  Write-Host "Quit Ollama from the tray, then open it from the Start menu."
}

Write-Host ""
Write-Host "Next:"
Write-Host "  1. chrome://extensions -> Reload 'YouTube Study Notes'"
Write-Host "  2. Refresh your YouTube tab (F5)"
Write-Host "  3. Settings -> Ollama -> model: tinyllama -> Save"
Write-Host "  4. Generate notes"
