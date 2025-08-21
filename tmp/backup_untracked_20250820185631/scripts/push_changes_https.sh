#!/usr/bin/env bash
# Script to initialize remote (HTTPS), create branch, commit and push changes.
# Usage:
#   1) Edit REPO_URL below and set it to your GitHub HTTPS URL:
#        REPO_URL="https://github.com/YourUser/your-repo.git"
#   2) Run in Git Bash from project root:
#        bash scripts/push_changes_https.sh
#
# Notes:
# - Git will prompt for credentials for HTTPS pushes (username + PAT as password)
# - This script is idempotent for adding origin (it will set remote URL if already present)

set -euo pipefail

# --- EDIT THIS: paste your repo HTTPS URL here ---
REPO_URL="https://github.com/Zorentha/football-betting-app.git"
# -------------------------------------------------

if [[ -z "$REPO_URL" || "$REPO_URL" == *"YourUser"* ]]; then
  echo "ERROR: Please edit scripts/push_changes_https.sh and set REPO_URL to your repository HTTPS URL."
  exit 1
fi

# Ensure we're in the project root (assumes script invoked from repo root or via full path)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "Working directory: $PROJECT_ROOT"
echo "Using remote: $REPO_URL"

# Initialize git if needed
if [ ! -d ".git" ]; then
  echo "No .git folder detected -> initializing local git repo"
  git init
else
  echo ".git exists -> skipping git init"
fi

# Add or update remote origin
if git remote | grep -q '^origin$'; then
  echo "Remote 'origin' exists -> setting URL to $REPO_URL"
  git remote set-url origin "$REPO_URL"
else
  echo "Adding remote 'origin' -> $REPO_URL"
  git remote add origin "$REPO_URL"
fi

# Create and switch to branch
BRANCH="feature/openai-expected-output-tokens"
echo "Creating and switching to branch: $BRANCH"
git checkout -B "$BRANCH"

# Stage files (adjust list if you only want a subset)
git add src/components/AIAnalysis.jsx src/components/MatchCard.jsx src/services/openaiAnalysisService.js README.md .env.example PR_DESCRIPTION.md .github/workflows/ci.yml || true

# If there are staged changes, commit them
if ! git diff --cached --quiet; then
  echo "Committing staged changes..."
  git commit -m "feat(openai): make expected output tokens configurable; show per-tip probabilities and calibrationVersion; add CI"
else
  echo "No staged changes to commit."
fi

# Push branch to origin (HTTPS will prompt for credentials if needed)
echo "Pushing branch to origin (you may be prompted for GitHub credentials / PAT)..."
git push -u origin "$BRANCH"

echo
echo "Done. Branch pushed: $BRANCH"
echo "Next: open a Pull Request on GitHub or run:"
echo "  gh pr create --fill --title \"Make OpenAI expected output tokens configurable and remove hardcoded cap\" --body-file PR_DESCRIPTION.md"
