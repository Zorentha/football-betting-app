# PowerShell one-liner script to create a PR using the existing remote branch
# Usage (in PowerShell, from repo root):
# 1) Set your PAT in this session:
#    $env:GITHUB_TOKEN = 'ghp_<YOUR_PAT_HERE>'
# 2) Run this script:
#    powershell -NoProfile -ExecutionPolicy Bypass -File tmp/create_pr_use_existing_branch.ps1
#
# Note: This uses the existing remote branch "feature/openai-expected-output-tokens" (confirmed present).
# If you want to use a different head, modify $body.head accordingly.

$body = @{
  title = "Make OpenAI expected output tokens configurable and remove hardcoded cap"
  head  = "feature/openai-expected-output-tokens"   # EXISTING remote branch
  base  = "main"
  body  = "See PR_DESCRIPTION.md in repository for full details."
}

$headers = @{
  Authorization = "token $env:GITHUB_TOKEN"
  Accept = "application/vnd.github+json"
  "User-Agent" = "cli-pr-creator"
}

try {
  Write-Host "Creating PR (head: $($body.head) -> base: $($body.base))..."
  $resp = Invoke-RestMethod -Uri "https://api.github.com/repos/Zorentha/football-betting-app/pulls" -Method Post -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) -ErrorAction Stop
  Write-Host "PR created:"
  $resp | Select-Object number, html_url, title, state | ConvertTo-Json
} catch {
  Write-Error "API request failed: $($_.Exception.Message)"
  if ($_.Exception.Response -ne $null) {
    try {
      $s = $_.Exception.Response.GetResponseStream()
      $r = New-Object System.IO.StreamReader($s)
      $text = $r.ReadToEnd()
      Write-Output "Response body:"
      Write-Output $text
    } catch {
      Write-Output "Failed to read response body."
    }
  }
  exit 1
}
