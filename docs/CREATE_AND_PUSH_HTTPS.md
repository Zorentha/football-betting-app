# Creating and Pushing Changes via HTTPS

This guide explains how to create a new repository and push changes to it using HTTPS authentication with GitHub.

## Prerequisites

- Git installed on your system
- GitHub account
- GitHub CLI installed (optional but recommended)

## Creating a New Repository

### Using GitHub Website

1. Go to https://github.com and log in to your account
2. Click the "+" icon in the top right corner and select "New repository"
3. Fill in the repository name and description
4. Choose if the repository should be Public or Private
5. Initialize with a README (optional)
6. Click "Create repository"

### Using GitHub CLI

1. Authenticate with GitHub CLI if you haven't already:
   ```bash
   gh auth login
   ```
2. Create a new repository:
   ```bash
   gh repo create <repository-name> --public/--private --clone
   ```

## HTTPS Authentication Setup

### Personal Access Token (PAT)

For HTTPS authentication, you'll need a Personal Access Token:

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Click "Generate new token" → "Fine-grained tokens" or "Tokens (classic)"
3. Give the token a name and set expiration
4. Select appropriate permissions (at minimum: `repo` scope for private repositories)
5. Click "Generate token"
6. Copy the token immediately as it won't be shown again

## Cloning Repository via HTTPS

1. Get the HTTPS clone URL from your GitHub repository page
2. Clone the repository:
   ```bash
   git clone https://github.com/<username>/<repository-name>.git
   cd <repository-name>
   ```

## Pushing Changes via HTTPS

1. Make changes to your files
2. Stage and commit your changes:
   ```bash
   git add .
   git commit -m "Your commit message"
   ```
3. Push changes to GitHub:
   ```bash
   git push origin main
   ```
4. When prompted for credentials:
   - Username: Your GitHub username
   - Password: Your Personal Access Token (not your GitHub password)

## Caching Credentials

To avoid entering credentials every time, you can cache them:

### Using Git Credential Manager

Git Credential Manager is included with Git for Windows:

```bash
git config --global credential.helper manager-core
```

### Using Credential Cache (Linux/macOS)

```bash
git config --global credential.helper cache
# Set cache timeout (optional, default is 15 minutes)
git config --global credential.helper 'cache --timeout=3600'
```

## Troubleshooting

### Authentication Issues

If you're having authentication problems:
1. Ensure you're using a Personal Access Token, not your password
2. Check that your token has the correct permissions
3. Verify your token hasn't expired

### Force Pushing

To force push changes (overwrites remote history):
```bash
git push --force origin main
```

**Warning**: Force pushing can overwrite changes made by others. Use with caution.

## Additional Resources

- [GitHub: Creating a new repository](https://docs.github.com/en/github/creating-cloning-and-archiving-repositories/creating-a-repository-on-github)
- [GitHub: About Personal Access Tokens](https://docs.github.com/en/github/authenticating-to-github/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [Git Credential Storage](https://git-scm.com/book/en/v2/Git-Tools-Credential-Storage)
