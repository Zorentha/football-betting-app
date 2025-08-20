# Restart frontend (Vite) - stop existing vite processes and start `npm run dev`
# Defensive: if invoked from non-PowerShell host (cmd.exe/double-click), re-launch under PowerShell
# Run with:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restart-frontend.ps1

# Re-launch under PowerShell if necessary
if (-not $PSVersionTable) {
  Start-Process -FilePath "powershell" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $MyInvocation.MyCommand.Definition
  exit
}

try {
  $wd = (Get-Location).Path
  Write-Output "Looking for existing vite processes..."

  $procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'vite' }
  if ($procs) {
    foreach ($p in $procs) {
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

  # Start frontend dev server in new PowerShell window so logs remain visible
  Write-Output "Starting frontend in new PowerShell window: npm run dev"
  $npmCmd = "Set-Location -LiteralPath '$wd'; npm.cmd run dev"
  Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $npmCmd

  Write-Output "Frontend restart command issued."
} catch {
  Write-Error "Error while restarting frontend: $_"
  exit 1
}
