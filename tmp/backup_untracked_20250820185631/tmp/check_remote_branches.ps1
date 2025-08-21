# PowerShell script to inspect remote branch SHAs, merge-base and recent commits
# Usage: Open PowerShell in repo root and run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tmp/check_remote_branches.ps1
#
# This script calls git.exe directly from Program Files to avoid PATH/quoting issues.

$git = 'C:\Program Files\Git\cmd\git.exe'

Write-Host "Running git from: $git"
Write-Host "ls-remote (feature, main):"
& $git ls-remote origin refs/heads/feature/openai-expected-output-tokens refs/heads/main
Write-Host '---'

Write-Host "Fetching origin..."
& $git fetch origin
Write-Host '---'

Write-Host "=== Remote SHAs ==="
try {
    $fsha = & $git rev-parse --verify origin/feature/openai-expected-output-tokens 2>$null
    if ($fsha) { Write-Host "origin/feature: $fsha" } else { Write-Host "origin/feature not found" }
} catch {
    Write-Host "origin/feature not found"
}
try {
    $msha = & $git rev-parse --verify origin/main 2>$null
    if ($msha) { Write-Host "origin/main: $msha" } else { Write-Host "origin/main not found" }
} catch {
    Write-Host "origin/main not found"
}
Write-Host '---'

Write-Host "=== merge-base (common ancestor) ==="
try {
    $mb = & $git merge-base --all origin/feature/openai-expected-output-tokens origin/main 2>$null
    if ($mb) {
        Write-Host "merge-base(s):"
        Write-Host $mb
    } else {
        Write-Host "No common ancestor (merge-base empty)"
    }
} catch {
    Write-Host "No common ancestor (merge-base empty)"
}
Write-Host '---'

Write-Host "=== Last 5 commits on origin/feature/openai-expected-output-tokens ==="
try {
    & $git log --oneline origin/feature/openai-expected-output-tokens -n 5
} catch {
    Write-Host "no log"
}
Write-Host '---'

Write-Host "=== Last 5 commits on origin/main ==="
try {
    & $git log --oneline origin/main -n 5
} catch {
    Write-Host "no log"
}
Write-Host '---'
