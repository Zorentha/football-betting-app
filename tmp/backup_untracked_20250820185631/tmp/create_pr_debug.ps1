# Debug PowerShell script to create a PR and always print full HTTP response (body + status)
# Usage (PowerShell, run from repo root):
# 1) set token in session (do NOT paste token in chat):
#    $env:GITHUB_TOKEN = 'ghp_<YOUR_PAT>'
# 2) run:
#    powershell -NoProfile -ExecutionPolicy Bypass -File tmp/create_pr_debug.ps1
#
# This script uses System.Net.Http.HttpClient to POST JSON and prints:
# - HTTP status code
# - Response headers
# - Full response body (even on 4xx/5xx)
# - Request payload (for verification)

$token = $env:GITHUB_TOKEN
if (-not $token -or $token.Trim() -eq '') {
  Write-Error "GITHUB_TOKEN not set in session. Set it and re-run."
  exit 2
}

$uri = "https://api.github.com/repos/Zorentha/football-betting-app/pulls"
$bodyObj = @{
  title = "Make OpenAI expected output tokens configurable and remove hardcoded cap"
  head  = "feature/openai-expected-output-tokens"   # existing remote branch (use rebased if you prefer)
  base  = "main"
  body  = "See PR_DESCRIPTION.md in repository for full details."
}
$json = ($bodyObj | ConvertTo-Json -Depth 10)

Write-Host "REQUEST PAYLOAD:"
Write-Host $json
Write-Host "----"

Add-Type -AssemblyName System.Net.Http

$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Add("User-Agent","pr-debug-client")
$client.DefaultRequestHeaders.Add("Accept","application/vnd.github+json")
$client.DefaultRequestHeaders.Add("Authorization","token $token")

# Create StringContent with application/json
$content = New-Object System.Net.Http.StringContent($json,[System.Text.Encoding]::UTF8,"application/json")

try {
  $resp = $client.PostAsync($uri,$content).GetAwaiter().GetResult()
  $status = $resp.StatusCode.value__
  Write-Host "HTTP Status Code: $status ($($resp.StatusCode))"
  Write-Host "Response headers:"
  $resp.Headers | ForEach-Object { Write-Host ("  {0}: {1}" -f $_.Key, ($_.Value -join ", ")) }
  Write-Host "Content headers:"
  $resp.Content.Headers | ForEach-Object { Write-Host ("  {0}: {1}" -f $_.Key, ($_.Value -join ", ")) }
  $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  Write-Host "---- Response body (raw) ----"
  Write-Host $body
  Write-Host "---- end response ----"
} catch {
  Write-Error "HTTP request threw exception: $($_.Exception.Message)"
  if ($_.Exception.InnerException) {
    Write-Host "Inner: $($_.Exception.InnerException.Message)"
  }
  exit 1
} finally {
  $client.Dispose()
}
