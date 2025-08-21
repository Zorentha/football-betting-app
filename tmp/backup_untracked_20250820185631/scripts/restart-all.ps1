# Restart both backend (server.js) and frontend (Vite) on Windows
# This script is defensive: if it's started from a non-PowerShell host (or double-clicked),
# it re-invokes itself explicitly using powershell.exe so PowerShell expressions like $p.ProcessId
# are interpreted correctly. Run it from PowerShell with:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restart-all.ps1
#
# Notes:
# - Uses Get-CimInstance to find processes whose command-lines mention server.js or vite.
# - Stops them (Stop-Process) and then starts backend and frontend in new PowerShell windows
#   so logs remain visible.
# - If you want the backend to bind to port 3001, set the PORT environment variable before running:
#   $env:PORT = "3001"; powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restart-all.ps1

# If not running under PowerShell (e.g., executed by cmd.exe by accident),
# re-launch the script with powershell.exe and exit the current process.
if (-not $PSVersionTable) {
  Start-Process -FilePath "powershell" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $MyInvocation.MyCommand.Definition
  exit
}

try {
  $wd = (Get-Location).Path

  Write-Output "Looking for existing server.js and vite processes..."

  # Stop processes whose CommandLine mentions server.js
  $procsServer = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'server\.js' }
  if ($procsServer) {
    foreach ($p in $procsServer) {
      try {
        # Using the ProcessId property directly (safe in PowerShell)
        Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
        Write-Output "Stopped server PID:$($p.ProcessId)"
      } catch {
        Write-Warning "Failed to stop server PID:$($p.ProcessId) - $_"
      }
    }
  } else {
    Write-Output "No server.js processes found"
  }

  # Stop processes whose CommandLine mentions vite
  $procsVite = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'vite' }
  if ($procsVite) {
    foreach ($p in $procsVite) {
      try {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
        Write-Output "Stopped vite PID:$($p.ProcessId)"
      } catch {
        Write-Warning "Failed to stop vite PID:$($p.ProcessId) - $_"
      }
    }
  } else {
    Write-Output "No vite processes found"
  }

  # Start backend (node server.js) in a new PowerShell window so logs remain visible
  Write-Output "Starting backend in new PowerShell window: node server.js"
  $backendCmd = "Set-Location -LiteralPath '$wd'; node server.js"
  Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $backendCmd

  # Start frontend (npm run dev) in another new PowerShell window
  Write-Output "Starting frontend in new PowerShell window: npm run dev"
  $npmCmd = "Set-Location -LiteralPath '$wd'; npm.cmd run dev"
  Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $npmCmd

  Write-Output "Restart commands issued."
} catch {
  Write-Error "Error while restarting services: $_"
  exit 1
}
