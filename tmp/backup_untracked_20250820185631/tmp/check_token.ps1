# PowerShell script to check if GITHUB_TOKEN is present and print a masked version (safe)
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tmp/check_token.ps1
$t = $env:GITHUB_TOKEN
if ($t) {
    $len = $t.Length
    if ($len -gt 8) {
        $stars = -join (1..($len-8) | ForEach-Object {'*'})
        $masked = $t.Substring(0,4) + $stars + $t.Substring($len-4)
    } else {
        $masked = -join (1..$len | ForEach-Object {'*'})
    }
    Write-Output "GITHUB_TOKEN_PRESENT masked=$masked length=$len"
} else {
    Write-Output "GITHUB_TOKEN_MISSING"
}
