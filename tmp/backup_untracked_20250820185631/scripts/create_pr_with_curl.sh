#!/usr/bin/env bash
# Create a GitHub Pull Request using curl and a local PR_DESCRIPTION.md
# Usage (locally in Git Bash or WSL, from project root):
# 1) export GITHUB_TOKEN="your_personal_access_token_here"
#    (or set it in PowerShell: $env:GITHUB_TOKEN="your_pat")
# 2) bash scripts/create_pr_with_curl.sh
#
# Notes:
# - The script reads PR title/body and posts to the GitHub REST API.
# - It requires Python to be available (used to escape the description safely).
# - Do NOT paste your PAT into a chat. Keep it local and secret.

set -euo pipefail

# Configuration (edit if needed)
REPO="Zorentha/football-betting-app"
HEAD="feature/openai-expected-output-tokens"
BASE="main"
TITLE="Make OpenAI expected output tokens configurable and remove hardcoded cap"
BODY_FILE="PR_DESCRIPTION.md"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "ERROR: GITHUB_TOKEN not set. Export your PAT into GITHUB_TOKEN and re-run."
  echo "Example (Git Bash): export GITHUB_TOKEN=\"ghp_xxx...\""
  exit 1
fi

if [ ! -f "$BODY_FILE" ]; then
  echo "ERROR: $BODY_FILE not found in current directory. Create it or adjust BODY_FILE variable."
  exit 2
fi

# Read and JSON-escape the PR body using Python (safe handling of newlines/quotes)
BODY_JSON=$(python - <<PY
import json,sys,io
text = open("$BODY_FILE", "r", encoding="utf-8").read()
print(json.dumps(text))
PY
)

# Construct payload
read -r -d '' PAYLOAD <<EOF
{
  "title": "$(echo "$TITLE" | sed 's/"/\\"/g')",
  "head": "$HEAD",
  "base": "$BASE",
  "body": $BODY_JSON
}
EOF

# Create PR via GitHub REST API
API_URL="https://api.github.com/repos/$REPO/pulls"

echo "Creating PR on $REPO (head: $HEAD -> base: $BASE)..."
resp=$(curl -sS -H "Authorization: token $GITHUB_TOKEN" \
               -H "Accept: application/vnd.github+json" \
               -d "$PAYLOAD" \
               "$API_URL")

# Print response summary
echo
echo "GitHub API response:"
echo "$resp" | python -m json.tool || echo "$resp"

# Try to extract PR URL
PR_URL=$(echo "$resp" | python - <<PY
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('html_url',''))
except:
    pass
PY
)

if [ -n "$PR_URL" ]; then
  echo
  echo "PR created: $PR_URL"
else
  echo
  echo "PR creation failed or API returned no html_url. Inspect the JSON above for details."
fi
