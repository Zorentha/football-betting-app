# Pushing Changes to GitHub using PowerShell

This guide explains how to use the PowerShell script to push changes to the GitHub repository.

## Prerequisites

- Git installed on your system
- PowerShell 7 or newer (pwsh)
- GitHub account with proper permissions to push to the repository
- Repository cloned via HTTPS

## PowerShell Script

The PowerShell script `scripts/push-to-github.ps1` automates the process of adding, committing, and pushing changes to the GitHub repository.

### Usage

#### With Commit Message Parameter

```powershell
pwsh -File scripts/push-to-github.ps1 -CommitMessage "Your commit message here"
```

#### Without Commit Message Parameter (Interactive)

```powershell
pwsh -File scripts/push-to-github.ps1
```

When run without the commit message parameter, the script will prompt you to enter a commit message.

### Script Functionality

1. Checks if the current directory is a Git repository
2. Verifies if there are any changes to commit
3. Adds all changes to the staging area
4. Commits the changes with the provided or entered commit message
5. Pushes the changes to the `main` branch of the remote repository

## Authentication

The script uses the existing Git authentication setup. Make sure you have configured your Git credentials properly:

### Using Git Credential Manager (Recommended)

Git Credential Manager is included with Git for Windows and will handle authentication automatically after the first login.

### Using Personal Access Token

If you need to authenticate with a Personal Access Token:

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate a new token with appropriate permissions (at minimum: `repo` scope)
3. When prompted for credentials during push:
   - Username: Your GitHub username
   - Password: Your Personal Access Token

## Caching Credentials

To avoid entering credentials every time, you can cache them:

### Using Git Credential Manager

```bash
git config --global credential.helper manager-core
```

## Troubleshooting

### Authentication Issues

If you're having authentication problems:
1. Ensure you're using a Personal Access Token, not your password
2. Check that your token has the correct permissions
3. Verify your token hasn't expired

### No Changes to Commit

If the script reports "No changes to commit," verify you have made changes to files:
```powershell
git status
```

### Push Rejected

If your push is rejected due to remote changes:
```powershell
git pull origin main
# Resolve any conflicts if they occur
pwsh -File scripts/push-to-github.ps1 -CommitMessage "Your commit message"
