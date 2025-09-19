# PowerShell script to push changes to GitHub repository
# Usage: 
#   pwsh -File scripts/push-to-github.ps1 -CommitMessage "Your commit message"
#   or
#   pwsh -File scripts/push-to-github.ps1 (will prompt for commit message)

param(
    [Parameter(Mandatory=$false)]
    [string]$CommitMessage = ""
)

# Set error action preference to stop on errors
$ErrorActionPreference = "Stop"

# Check if we're in a git repository
try {
    $gitStatus = git status --porcelain 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "This directory is not a git repository or git is not installed."
        exit 1
    }
} catch {
    Write-Error "Git command failed. Please ensure Git is installed and accessible."
    exit 1
}

# Check for changes
$changes = git status --porcelain
if ([string]::IsNullOrWhiteSpace($changes)) {
    Write-Host "No changes to commit."
    exit 0
}

# Get commit message if not provided
if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
    $CommitMessage = Read-Host "Enter commit message"
    if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
        Write-Error "Commit message is required."
        exit 1
    }
}

try {
    # Add all changes
    Write-Host "Adding all changes..."
    git add .
    
    # Commit changes
    Write-Host "Committing changes with message: $CommitMessage"
    git commit -m "$CommitMessage"
    
    # Push to remote repository
    Write-Host "Pushing to remote repository..."
    git push origin main
    
    Write-Host "Successfully pushed changes to GitHub!" -ForegroundColor Green
} catch {
    Write-Error "Failed to push changes to GitHub. Error: $_"
    exit 1
}
