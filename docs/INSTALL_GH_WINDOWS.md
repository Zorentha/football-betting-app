# Installing GitHub CLI on Windows

This guide provides instructions for installing the GitHub CLI (gh) on Windows systems. GitHub CLI allows you to work with GitHub repositories directly from the command line.

## Prerequisites

- Windows 7 or later (64-bit recommended)
- Git already installed on your system
- Administrator privileges for installation

## Installation Methods

### Method 1: Using Chocolatey (Recommended)

1. If you don't have Chocolatey installed, install it first by following the official guide: https://chocolatey.org/install
2. Open Command Prompt or PowerShell as Administrator
3. Run the following command:
   ```bash
   choco install gh
   ```

### Method 2: Using Scoop

1. If you don't have Scoop installed, install it first:
   ```bash
   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
   irm get.scoop.sh | iex
   ```
2. Install GitHub CLI:
   ```bash
   scoop install gh
   ```

### Method 3: Manual Installation

1. Visit the GitHub CLI releases page: https://github.com/cli/cli/releases
2. Download the latest `.msi` file for Windows (e.g., `gh_*_windows_amd64.msi`)
3. Run the installer and follow the installation wizard
4. The installer will automatically add GitHub CLI to your PATH

## Verify Installation

1. Open Command Prompt, PowerShell, or Git Bash
2. Run the following command:
   ```bash
   gh --version
   ```
3. You should see output similar to:
   ```
   gh version 2.x.x (2025-xx-xx)
   https://github.com/cli/cli/releases/tag/v2.x.x
   ```

## Authentication

After installation, authenticate with your GitHub account:

```bash
gh auth login
```

Follow the prompts to:
1. Select "GitHub.com"
2. Choose your preferred authentication method (HTTPS or SSH)
3. Authenticate via browser or by entering a token

## Basic Usage

Some common GitHub CLI commands:

```bash
# View repository status
gh repo view

# Create a new issue
gh issue create --title "Bug report" --body "Description of the bug"

# List pull requests
gh pr list

# Create a pull request
gh pr create --title "Feature implementation" --body "Description of changes"

# Check out a pull request
gh pr checkout <pr-number>
```

## Additional Resources

- [GitHub CLI Documentation](https://cli.github.com/manual/)
- [GitHub CLI Installation Guide](https://github.com/cli/cli#installation)
- [GitHub CLI Quickstart](https://docs.github.com/en/github-cli/github-cli/quickstart)
