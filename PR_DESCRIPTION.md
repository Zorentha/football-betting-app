Title: Make OpenAI expected output tokens configurable and remove hardcoded cap

Summary:
- Removed hardcoded 1200 token cap in src/services/openaiAnalysisService.js.
- Made expected output tokens configurable via OPENAI_EXPECTED_OUTPUT_TOKENS.
- Updated README.md and added .env.example documenting the new env var.
- Ran unit tests to verify no regressions.

Files changed:
- src/services/openaiAnalysisService.js
- README.md
- .env.example
- PR_DESCRIPTION.md (this file)

Testing:
- Unit tests: node scripts/run-unit-tests.js (all passed)
- Verified annotate flow and DB save workflow for fixture 1435547 (manual inspection)

Notes:
- OPENAI_EXPECTED_OUTPUT_TOKENS is optional. If unset, no hard cap is imposed; be aware of potential OpenAI API cost increases.
