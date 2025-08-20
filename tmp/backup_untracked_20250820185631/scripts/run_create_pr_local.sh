#!/usr/bin/env bash
# One-line curl commands to create the PR.
# USAGE (Git Bash / WSL):
#   export GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXX"
#   bash scripts/run_create_pr_local.sh
#
# USAGE (PowerShell):
#   $env:GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXX"
#   bash scripts/run_create_pr_local.sh
#
# The script prints both the Git Bash curl and the PowerShell curl variant.
# It does NOT contain any token. Set GITHUB_TOKEN in your shell before running.

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "NOTE: GITHUB_TOKEN not set in environment. Set it before running."
  echo
fi

echo "=== Git Bash / Unix-style curl (single line) ==="
echo "export GITHUB_TOKEN=\"<YOUR_PAT_HERE>\" && curl -v -H \"Authorization: token \$GITHUB_TOKEN\" -H \"Accept: application/vnd.github+json\" -d '{\"title\":\"Make OpenAI expected output tokens configurable and remove hardcoded cap\",\"head\":\"feature/openai-expected-output-tokens\",\"base\":\"main\",\"body\":\"See PR_DESCRIPTION.md in repository for full details.\"}' https://api.github.com/repos/Zorentha/football-betting-app/pulls"
echo
echo "=== PowerShell curl.exe (single line) ==="
echo '$env:GITHUB_TOKEN = "<YOUR_PAT_HERE>"; curl.exe -v -H "Authorization: token $env:GITHUB_TOKEN" -H "Accept: application/vnd.github+json" -d '\''{"title":"Make OpenAI expected output tokens configurable and remove hardcoded cap","head":"feature/openai-expected-output-tokens","base":"main","body":"See PR_DESCRIPTION.md in repository for full details."}'\'' https://api.github.com/repos/Zorentha/football-betting-app/pulls'
echo
echo "To actually run (Git Bash):"
echo "  export GITHUB_TOKEN=\"<YOUR_PAT>\" && curl -v -H \"Authorization: token \$GITHUB_TOKEN\" -H \"Accept: application/vnd.github+json\" -d '{\"title\":\"Make OpenAI expected output tokens configurable and remove hardcoded cap\",\"head\":\"feature/openai-expected-output-tokens\",\"base\":\"main\",\"body\":\"See PR_DESCRIPTION.md in repository for full details.\"}' https://api.github.com/repos/Zorentha/football-betting-app/pulls"
echo
echo "To run in PowerShell:"
echo '  $env:GITHUB_TOKEN = "<YOUR_PAT>"; curl.exe -v -H "Authorization: token $env:GITHUB_TOKEN" -H "Accept: application/vnd.github+json" -d '\''{"title":"Make OpenAI expected output tokens configurable and remove hardcoded cap","head":"feature/openai-expected-output-tokens","base":"main","body":"See PR_DESCRIPTION.md in repository for full details."}'\'' https://api.github.com/repos/Zorentha/football-betting-app/pulls'
