# Install GitHub CLI (gh) on Windows - helper script & commands
# Usage:
# 1) Open PowerShell (Admin recommended if winget not available)
# 2) Run this script (or copy & paste the commands below into PowerShell)
#
# This script will try winget first (recommended). If winget is not available it
# prints manual instructions to download the MSI.

# Recommended one-line (run in PowerShell):
#   winget install --id GitHub.cli -e --source winget

# If winget fails or is not installed, use MSI manual flow:
# 1) Open this URL in browser:
#    https://github.com/cli/cli/releases/latest
# 2) Download the Windows MSI asset (gh_*_windows_amd64.msi)
# 3) Run the MSI installer and follow the defaults
# 4) After installation, restart PowerShell/Git Bash

# If you prefer to download the MSI from PowerShell (non-interactive):
# (Note: this uses GitHub releases "latest" page to find the MSI url - may require manual adjustment)
$msiUrl = "https://github.com/cli/cli/releases/latest/download/gh-windows-amd64.msi"
$msiPath = "$env:TEMP\gh-windows-amd64.msi"

Write-Host "Attempting to install gh via winget (recommended)..." -ForegroundColor Cyan
try {
  winget install --id GitHub.cli -e --source winget -h
  Write-Host "winget install attempted. If successful, run 'gh --version' in a new terminal." -ForegroundColor Green
  return
} catch {
  Write-Host "winget not available or installation failed. Falling back to MSI download instructions." -ForegroundColor Yellow
}

Write-Host "Downloading gh MSI to $msiPath ..." -ForegroundColor Cyan
try {
  Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing
  Write-Host "Downloaded MSI. Running installer..." -ForegroundColor Cyan
  Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$msiPath`" /qn" -Wait
  Write-Host "Installer finished. Please restart your terminal and run 'gh --version'." -ForegroundColor Green
} catch {
  Write-Host "Automatic download/install failed. Please download manually from:" -ForegroundColor Red
  Write-Host "https://github.com/cli/cli/releases/latest" -ForegroundColor Yellow
  Write-Host "Then run the MSI and restart your terminal." -ForegroundColor Yellow
}

Write-Host "`nAfter installing, authenticate with GitHub CLI by running:" -ForegroundColor Cyan
Write-Host "  gh auth login" -ForegroundColor Green
Write-Host "Choose GitHub.com, HTTPS, and login with web browser flow." -ForegroundColor Green
