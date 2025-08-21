# PowerShell script to create a GitHub Pull Request using $env:GITHUB_TOKEN
# Usage (already set in this environment): powershell -NoProfile -ExecutionPolicy Bypass -File tmp/auto_create_pr.ps1
# This script will:
# - verify GITHUB_TOKEN exists in the environment
# - POST a PR to GitHub using Invoke-RestMethod and print the full response (masked)
# - not echo the raw token

$token = $env:GITHUB_TOKEN
if (-not $token -or $token.Trim() -eq '') {
    Write-Error "GITHUB_TOKEN not found in environment. Aborting."
    exit 2
}

$repo = "Zorentha/football-betting-app"
$api = "https://api.github.com/repos/$repo/pulls"

$body = @{
    title = "Make OpenAI expected output tokens configurable and remove hardcoded cap"
    head  = "feature/openai-expected-output-tokens-rebased"
    base  = "main"
    body  = "See PR_DESCRIPTION.md in repository for full details."
}

$headers = @{
    Authorization = "token $token"
    Accept = "application/vnd.github+json"
    "User-Agent" = "repo-automation-script"
}

try {
    Write-Output "Creating pull request (head: $($body.head) -> base: $($body.base))..."
    $response = Invoke-RestMethod -Uri $api -Method Post -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) -ErrorAction Stop
    Write-Output "PR created successfully."
    # Print only relevant parts and mask token presence
    $out = [PSCustomObject]@{
        html_url = $response.html_url
        number   = $response.number
        title    = $response.title
        state    = $response.state
    }
    $out | ConvertTo-Json
} catch {
    Write-Error "API request failed: $($_.Exception.Message)"
    if ($_.Exception.Response -ne $null) {
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $text = $reader.ReadToEnd()
            Write-Output "Response body:"
            Write-Output $text
        } catch {
            Write-Output "Failed to read response body."
        }
    }
    exit 1
}
