# Installing Git on Windows

This guide provides step-by-step instructions for installing Git on Windows systems.

## Prerequisites

- Windows 7 or later (64-bit recommended)
- Administrator privileges for installation

## Installation Steps

1. **Download Git for Windows**
   - Visit the official Git website: https://git-scm.com/download/win
   - The download should start automatically. If not, click on the "Click here to download" link

2. **Run the Installer**
   - Locate the downloaded `.exe` file (typically in your Downloads folder)
   - Double-click the file to start the installation process
   - If prompted by User Account Control, click "Yes" to allow the installer to make changes

3. **Installation Wizard Configuration**
   - Select the installation directory (default is usually fine)
   - Choose components to install:
     - Git Bash Here (recommended)
     - Git GUI Here (optional)
     - Git LFS (optional but recommended)
     - Associate .git* configuration files with default text editor (recommended)
   - Select the default editor (we recommend "Use Visual Studio Code as Git's default editor")
   - Adjust PATH environment:
     - Select "Git from the command line and also from 3rd-party software" (recommended)
   - Choose the SSH executable:
     - "Use bundled OpenSSH" (recommended)
   - Choose HTTPS transport backend:
     - "Use the OpenSSL library" (recommended)
   - Configure line ending conversions:
     - "Checkout Windows-style, commit Unix-style line endings" (recommended)
   - Configure terminal emulator:
     - "Use Windows' default console window" or "Use MinTTY" (both work, MinTTY is more feature-rich)

4. **Complete Installation**
   - Click through the remaining options with default settings
   - Click "Install" and wait for the process to complete
   - Click "Finish" when installation is complete

## Verify Installation

1. Open Command Prompt, PowerShell, or Git Bash
2. Run the following command:
   ```bash
   git --version
   ```
3. You should see output similar to:
   ```
   git version 2.x.x.windows.1
   ```

## Basic Git Configuration

After installation, configure your Git identity:

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

## Additional Resources

- [Git Documentation](https://git-scm.com/doc)
- [Git Book](https://git-scm.com/book/en/v2)
- [GitHub Git Cheat Sheet](https://training.github.com/downloads/github-git-cheat-sheet/)
