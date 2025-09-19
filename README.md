# Football Betting App

A comprehensive application for football match analysis and betting prediction generation using LLMs (ChatGPT-5 in production). The app fetches football match data, analyzes it using AI, and generates betting predictions with probabilities and reasoning.

## Key Features

- **AI-Powered Analysis**: Uses OpenAI's GPT models to analyze football matches and generate betting predictions
- **Manual Confirmation**: Raw AI output is shown to users before saving to database
- **Data Integration**: Fetches match data, lineups, and statistics from football data providers
- **Flexible Architecture**: Node.js backend with React frontend, SQLite database (easily replaceable with PostgreSQL)
- **Batch Processing**: Scripts for running analyses on multiple matches
- **Error Handling**: Robust retry mechanisms with exponential backoff for API calls
- **Calibration**: Temperature scaling and probability normalization for more accurate predictions

## Quick Setup

1. **Requirements**:
   - Node.js (LTS version)
   - npm
   - OpenAI API key
   - Football data API key (API-Football or similar)

2. **Installation**:
   ```bash
   npm ci
   ```

3. **Environment Configuration**:
   Copy `.env.example` to `.env` and fill in your API keys:
   ```bash
   cp .env.example .env
   # Edit .env file with your actual keys
   ```

4. **Run Backend**:
   ```bash
   npm run serve-api
   ```

5. **Run Frontend (Development)**:
   ```bash
   npm run dev
   ```

## Documentation

Detailed documentation is available in the `docs/` directory:

- [Project Documentation](docs/PROJECT_DOCUMENTATION.md) - Complete overview of the project
- [Architecture](docs/ARCHITECTURE.md) - System components and data flows
- [API Reference](docs/API.md) - Endpoint specifications and usage
- [Deployment Guide](docs/DEPLOYMENT.md) - Instructions for deploying the application
- [Security Guidelines](docs/SECURITY.md) - Security practices and incident response

## Development Scripts

The `scripts/` directory contains various helper scripts for development, testing, and maintenance:

- Unit tests: `node scripts/unit_test_validateAI.js`
- E2E tests: `node scripts/confirm_and_save_test.mjs`
- Retry failed analyses: `node scripts/retry-error-analyses.js`
- Generate analysis reports: `node scripts/generate-analysis-report.js`
- Push changes to GitHub: `pwsh -File scripts/push-to-github.ps1 -CommitMessage "Your message"`

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
