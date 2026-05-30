# Links this folder to a GitHub repo and pushes main.
# Usage:
#   .\scripts\push-to-github.ps1 -GitHubUser YOUR_USERNAME
#   .\scripts\push-to-github.ps1 -GitHubUser YOUR_USERNAME -RepoName youtube-study-notes

param(
  [Parameter(Mandatory = $true)]
  [string] $GitHubUser,

  [string] $RepoName = 'youtube-study-notes'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not (Test-Path '.git')) {
  git init -b main
  git add .
  git commit -m "Initial commit: YouTube Study Notes Chrome extension"
}

$remoteUrl = "https://github.com/$GitHubUser/$RepoName.git"
$existing = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
  if ($existing -ne $remoteUrl) {
    git remote set-url origin $remoteUrl
    Write-Host "Updated origin -> $remoteUrl"
  }
} else {
  git remote add origin $remoteUrl
  Write-Host "Added origin -> $remoteUrl"
}

Write-Host ""
Write-Host "Before pushing, create the empty repo on GitHub:"
Write-Host "  https://github.com/new?name=$RepoName"
Write-Host "  (no README, no .gitignore — this project already has them)"
Write-Host ""
$confirm = Read-Host "Created the repo on GitHub? Press Enter to push (or Ctrl+C to cancel)"
git push -u origin main

Write-Host ""
Write-Host "Done. Enable GitHub Pages:"
Write-Host "  Repo -> Settings -> Pages -> Source: GitHub Actions"
Write-Host ""
Write-Host "Privacy policy URL (after Pages deploys):"
Write-Host "  https://$GitHubUser.github.io/$RepoName/privacy.html"
