# Interactive PowerShell helper to create the PR (runs locally and uses a one-time PAT)
# Usage: Open PowerShell in repo root and run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tmp/run_pr_now.ps1
#
# This script:
# - securely prompts you for your PAT (not echoed)
# - sets it only for the current process
# - calls the existing sanitize_and_create_pr.ps1 helper (which runs the API call)
# - clears the token from memory afterwards

Write-Host "This will prompt for your GitHub Personal Access Token (PAT). It will only be used in this PowerShell process and not saved to files."
$secure = Read-Host "Enter your PAT (input hidden)" -AsSecureString
if (-not $secure) {
  Write-Error "No token entered. Aborting."
  exit 1
}

# Convert SecureString to plain text in-memory for this process only
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $pat = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
} finally {
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

if (-not $pat -or $pat.Trim() -eq "") {
  Write-Error "Empty token after conversion. Aborting."
  exit 2
}

# Set token for this PowerShell process only
[Environment]::SetEnvironmentVariable('GITHUB_TOKEN', $pat, 'Process')

# Run the sanitise+create helper (this will POST the PR)
Write-Host "Running sanitized PR creation (head = feature/openai-expected-output-tokens-rebased -> base = main)..."
powershell -NoProfile -ExecutionPolicy Bypass -File tmp/sanitize_and_create_pr.ps1

# Clear token from environment and memory
[Environment]::SetEnvironmentVariable('GITHUB_TOKEN', $null, 'Process')
$pat = $null
[GC]::Collect()
[GC]::WaitForPendingFinalizers()

Write-Host "Finished. If the PR was created, the script printed the PR URL. If not, copy the script output and paste it back here for diagnosis."
