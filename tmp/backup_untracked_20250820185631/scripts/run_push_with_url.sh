#!/usr/bin/env bash
# Helper: update scripts/push_changes_https.sh with your HTTPS repo URL and run it.
# Usage (in Git Bash from project root):
#   bash scripts/run_push_with_url.sh
#
# This script will:
# 1) Replace the placeholder REPO_URL in scripts/push_changes_https.sh with the provided HTTPS URL
# 2) Execute scripts/push_changes_https.sh which will init/add remote/create branch/commit/push
#
# NOTE: Ensure you have edited nothing else or that scripts/push_changes_https.sh exists.
# The script will create a backup scripts/push_changes_https.sh.bak before modifying.

set -euo pipefail

# --- Edit the URL below if you want to hardcode a different one ---
REPO_URL="https://github.com/Zorentha/football-betting-app.git"
# ---------------------------------------------------------------

if [[ -z "$REPO_URL" || "$REPO_URL" == *"YourUser"* ]]; then
  echo "ERROR: REPO_URL is not set correctly in this script. Edit the REPO_URL variable inside this file."
  exit 1
fi

echo "Using repo URL: $REPO_URL"

if [ ! -f "scripts/push_changes_https.sh" ]; then
  echo "ERROR: scripts/push_changes_https.sh not found. Aborting."
  exit 2
fi

# Backup original
cp scripts/push_changes_https.sh scripts/push_changes_https.sh.bak

# Replace REPO_URL line (POSIX-compatible)
# This replaces the first occurrence of REPO_URL="..." with the desired URL
awk -v url="$REPO_URL" '{
  if (!done && $0 ~ /^REPO_URL=/) {
    print "REPO_URL=\"" url "\""
    done=1
  } else {
    print $0
  }
}' scripts/push_changes_https.sh.bak > scripts/push_changes_https.sh

chmod +x scripts/push_changes_https.sh

echo "Updated scripts/push_changes_https.sh with provided URL and made executable."
echo "Now running the push script. You may be prompted for GitHub credentials (username + PAT)."

bash scripts/push_changes_https.sh
