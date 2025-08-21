#!/usr/bin/env bash
# Safe one-shot script to merge main into feature/openai-expected-output-tokens
# Usage (from repository root in Git Bash):
#   bash scripts/run_merge.sh
#
# This script:
#  - fetches origin
#  - updates local main
#  - creates a backup branch for the feature branch
#  - merges origin/main into the feature branch using --allow-unrelated-histories
#  - detects merge conflicts and instructs you how to resolve them
#  - pushes the merged feature branch to origin
#
# IMPORTANT: Review conflicts manually if any appear. Do NOT run this if you are unsure.

set -euo pipefail

FEATURE_BRANCH="feature/openai-expected-output-tokens"
BASE_BRANCH="main"
ORIGIN="origin"

timestamp() {
  date +%Y%m%d-%H%M%S
}

echo "Repository root: $(pwd)"
echo "Feature branch: $FEATURE_BRANCH"
echo "Base branch to merge from: $BASE_BRANCH"
echo "Remote: $ORIGIN"
echo

# 1) Fetch
echo "Fetching latest from remote..."
git fetch "$ORIGIN"

# 2) Ensure local base branch is up-to-date
echo "Checking out and updating $BASE_BRANCH..."
git checkout "$BASE_BRANCH"
git pull "$ORIGIN" "$BASE_BRANCH"

# 3) Switch to feature branch (must exist locally, otherwise try to fetch)
if git show-ref --verify --quiet "refs/heads/$FEATURE_BRANCH"; then
  git checkout "$FEATURE_BRANCH"
else
  echo "Local branch $FEATURE_BRANCH not found. Attempting to fetch remote branch..."
  git fetch "$ORIGIN" "$FEATURE_BRANCH":"$FEATURE_BRANCH" || {
    echo "Failed to fetch $FEATURE_BRANCH from $ORIGIN. Aborting."
    exit 2
  }
  git checkout "$FEATURE_BRANCH"
fi

# 4) Backup current feature branch
BACKUP_BRANCH="backup-${FEATURE_BRANCH}-before-merge-$(timestamp)"
echo "Creating backup branch: $BACKUP_BRANCH"
git branch "$BACKUP_BRANCH"

# 5) Merge base into feature allowing unrelated histories
echo "Merging $ORIGIN/$BASE_BRANCH into $FEATURE_BRANCH (allowing unrelated histories)..."
# Use --no-edit to avoid opening an editor if merge commit created
set +e
git merge "$ORIGIN/$BASE_BRANCH" --allow-unrelated-histories --no-edit
MERGE_EXIT=$?
set -e

if [ $MERGE_EXIT -ne 0 ]; then
  echo
  echo "Merge returned non-zero exit code ($MERGE_EXIT). This usually means there are merge conflicts."
  echo "Run 'git status' to see conflicted files, then resolve conflicts, 'git add <file>' and 'git commit' to finish the merge."
  echo "If you want to abort the merge and restore the feature branch, run: git merge --abort && git checkout $BACKUP_BRANCH"
  exit $MERGE_EXIT
fi

# 6) Detect unresolved conflicts (safety)
if git ls-files -u | grep -q '^'; then
  echo
  echo "Unresolved merge conflicts detected (git ls-files -u returned entries)."
  echo "Resolve conflicts, then run:"
  echo "  git add <files>"
  echo "  git commit"
  echo "After resolving, push with:"
  echo "  git push $ORIGIN $FEATURE_BRANCH"
  exit 3
fi

# 7) Push merged feature branch
echo "Pushing merged branch to remote: $ORIGIN/$FEATURE_BRANCH"
git push "$ORIGIN" "$FEATURE_BRANCH"

echo
echo "Merge complete. Backup branch created: $BACKUP_BRANCH"
echo "If everything looks good, open the PR in the browser or create/refresh it via gh."
