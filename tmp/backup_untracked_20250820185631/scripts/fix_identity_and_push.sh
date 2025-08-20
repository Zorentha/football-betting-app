#!/usr/bin/env bash
# Helper: set git user identity (global) and retry push script.
# Usage (in Git Bash from project root):
#   bash scripts/fix_identity_and_push.sh "Full Name" "email@example.com"
#
# Example:
#   bash scripts/fix_identity_and_push.sh "Łukasz Skrzypkowski" "lukasz.skrzypkowski@gmail.com"

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: bash scripts/fix_identity_and_push.sh \"Full Name\" \"email@example.com\""
  exit 1
fi

FULLNAME="$1"
EMAIL="$2"

echo "Setting git identity:"
git config --global user.name "$FULLNAME"
git config --global user.email "$EMAIL"

echo "Git identity set:"
git config --global user.name
git config --global user.email

echo
echo "Now retrying push helper..."
bash scripts/run_push_with_url.sh
