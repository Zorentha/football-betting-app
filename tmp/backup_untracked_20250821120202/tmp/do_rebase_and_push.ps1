# Robust PowerShell script: backup untracked files, create rebased branch from origin/main,
# apply patch if present, commit, rename branch and push to origin.
# Safe to run from repo root. This script uses explicit git.exe path.
$gitPath = 'C:\Program Files\Git\cmd\git.exe'

Write-Output "Using git: $gitPath"

# 1) Backup untracked files
$ts = (Get-Date).ToString('yyyyMMddHHmmss')
$backupDir = Join-Path 'tmp' ("backup_untracked_$ts")
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Write-Output "Backup directory: $backupDir"

try {
  $untracked = & $gitPath ls-files --others --exclude-standard 2>$null
} catch {
  Write-Error "git ls-files failed: $($_.Exception.Message)"
  exit 1
}

if ($untracked -and $untracked.Trim() -ne '') {
  $lines = $untracked -split "`n"
  foreach ($line in $lines) {
    $f = $line.Trim()
    if (-not [string]::IsNullOrWhiteSpace($f)) {
      $dest = Join-Path $backupDir $f
      $destDir = Split-Path $dest -Parent
      if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
      try {
        Move-Item -Path $f -Destination $dest -Force
        Write-Output "Moved: $f -> $dest"
      } catch {
        Write-Output "Failed to move $f : $($_.Exception.Message)"
      }
    }
  }
} else {
  Write-Output "No untracked files to move."
}

# 2) Fetch origin
Write-Output "Fetching origin..."
& $gitPath fetch origin

# 3) Create tmp_pr_base from origin/main (force create)
Write-Output "Creating/updating tmp_pr_base from origin/main..."
$checkoutResult = & $gitPath checkout -B tmp_pr_base origin/main 2>&1
Write-Output $checkoutResult

# 4) Apply feature patch if available
$patchPath = 'tmp/feature-openai-expected-output-tokens.patch'
if (Test-Path $patchPath) {
  Write-Output "Patch found: $patchPath - attempting to apply..."
  try {
    & $gitPath apply --whitespace=nowarn $patchPath 2>&1 | ForEach-Object { Write-Output $_ }
    Write-Output "Patch apply attempted (check staged changes)."
  } catch {
    Write-Output "Patch apply failed or returned non-zero; continuing."
  }
} else {
  Write-Output "No patch file present at $patchPath - skipping."
}

# 5) Stage changes
Write-Output "Staging all changes..."
& $gitPath add -A

# 6) Commit if staged changes exist
$staged = & $gitPath diff --cached --name-only
if ($staged -and $staged.Trim() -ne '') {
  Write-Output "Staged files:"
  $staged -split "`n" | ForEach-Object { Write-Output "  $_" }
  Write-Output "Creating commit..."
  & $gitPath commit -m "chore(rebase): create PR branch based on main with feature changes" 2>&1 | ForEach-Object { Write-Output $_ }
} else {
  Write-Output "No staged changes to commit."
}

# 7) Rename branch to feature/openai-expected-output-tokens-rebased
$targetBranch = 'feature/openai-expected-output-tokens-rebased'
Write-Output "Renaming current branch to $targetBranch..."
& $gitPath branch -M $targetBranch 2>&1 | ForEach-Object { Write-Output $_ }

# 8) Push with force-with-lease
Write-Output "Pushing $targetBranch to origin with --force-with-lease..."
try {
  & $gitPath push -u origin $targetBranch --force-with-lease 2>&1 | ForEach-Object { Write-Output $_ }
  Write-Output "Push completed."
} catch {
  Write-Error "Push failed: $($_.Exception.Message)"
  exit 1
}

Write-Output "DONE: rebased branch pushed to origin ($targetBranch)."
