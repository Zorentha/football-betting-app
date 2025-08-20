# Sanitize GITHUB_TOKEN in the current PowerShell Process and call tmp/auto_create_pr.ps1
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tmp/sanitize_and_create_pr.ps1

$t = [Environment]::GetEnvironmentVariable('GITHUB_TOKEN','Process')
if (-not $t -or $t.Trim() -eq '') {
    Write-Error "GITHUB_TOKEN not set in this process. Aborting."
    exit 2
}

# Remove surrounding angle brackets, quotes and whitespace using Trim with char array
$clean = $t.Trim(" ",'"',"'", "<", ">")

# Persist sanitized token only in Process scope (does not modify User/Computer env)
[Environment]::SetEnvironmentVariable('GITHUB_TOKEN', $clean, 'Process')

Write-Output ("SANITIZED_TOKEN_LENGTH=" + $clean.Length)
Write-Output "Attempting to create PR now..."

# Call the prepared PR creation script (will use $env:GITHUB_TOKEN)
powershell -NoProfile -ExecutionPolicy Bypass -File tmp/auto_create_pr.ps1
