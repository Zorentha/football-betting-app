# Developer Guide — Football Betting App

This guide contains useful commands and checklists for developers working with the Football Betting App.

## Quick Start Commands

### Local Development Setup
```bash
npm ci
npm run serve-api
npm run dev
```

### Running Unit Tests
```bash
node scripts/unit_test_validateAI.js
```

### Running E2E Tests
```bash
node scripts/confirm_and_save_test.mjs
# Ensure backend is running before executing E2E tests
```

## CI/CD Workflow Commands

### Triggering Workflow Locally with GitHub CLI
```bash
gh workflow run ci-cd.yml --ref main
gh run list --workflow=ci-cd.yml --limit 10
gh run view <run-id> --log
```

## Security Commands

### Secret Scanning
```bash
docker run --rm -v "$(pwd)":/repo zricethezav/gitleaks:8.2.7 detect --source /repo
```

## Useful Scripts

### Restart Scripts
- `scripts/restart-all.ps1` - Restart all services
- `scripts/restart-frontend.ps1` - Restart frontend only

### Analysis Scripts
- `scripts/run_openai_analyze_post.mjs` - Helper for calling OpenAI analyze
- `scripts/check_openai.mjs` - Check OpenAI integration

### Retry Scripts
- `scripts/retry-error-analyses.js` - Retry failed analyses
- `scripts/retry-timeout-fixtures.js` - Retry after timeouts

### Database Scripts
- `scripts/query_saved_prediction.js` - Query saved predictions
- `scripts/dump-predictions.js` - Dump predictions to file

### Calibration Scripts
- `scripts/train-calibrator.js` - Train the probability calibrator
- `scripts/eval-calibration.js` - Evaluate calibration performance

## Debugging and Diagnostics

### Checking Match Data
- `scripts/check-today-fixture.js` - Check today's fixtures
- `scripts/find-fixture-by-teams.js` - Find fixture by team names
- `scripts/check-match-results.js` - Check match results
- `scripts/check-odds.js` - Check market odds

### Prediction Analysis
- `scripts/check-pred-vs-results.js` - Compare predictions with actual results
- `scripts/debug-accuracy.js` - Debug prediction accuracy
- `scripts/generate-analysis-report.js` - Generate analysis report

### Inspection Scripts
- `scripts/inspect-prediction-1393286.js` - Inspect specific prediction
- `scripts/inspect-matches-with-predictions.js` - Inspect matches with predictions

## Development Checklist

### Before Committing
- [ ] Run unit tests: `node scripts/unit_test_validateAI.js`
- [ ] Ensure no temporary files are staged
- [ ] Check that environment variables are not hardcoded
- [ ] Verify that the application builds successfully

### Before Creating Pull Request
- [ ] Ensure all tests pass
- [ ] Update documentation if needed
- [ ] Check code style and formatting
- [ ] Verify that no secrets are included in the code

### After Merge to Main
- [ ] Monitor CI/CD workflow execution
- [ ] Check deployment status if auto-deploy is enabled
- [ ] Verify that the application is functioning correctly in production
