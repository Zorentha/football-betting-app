import fs from 'fs/promises';
import fetch from 'node-fetch';
import path from 'path';

async function run() {
  try {
    const parsedPath = path.resolve('tmp/annotate_strict_parsed_1435547.json');
    const raw = await fs.readFile(parsedPath, 'utf8');
    const doc = JSON.parse(raw);

    const fixtureId = (doc.meta && doc.meta.fixture_hint) ? String(doc.meta.fixture_hint) : '1435547';
    // Build prediction object compatible with databaseService.savePrediction()
    const aiAnalysis = {
      probabilities: {
        homeWin: doc.normalized_bettingTips ? 0 : 34, // placeholder if no 3-way; primary flow expects probabilities object
        draw: 0,
        awayWin: 0
      },
      predictedScore: { home: 0, away: 0 },
      confidence: 'medium',
      keyFactors: doc.keyFactors || [],
      bettingTips: doc.normalized_bettingTips || doc.parsed_bettingTips || [],
      prediction_metadata: { source: 'confirm_and_save_test', note: 'E2E confirm-save test using parsed betting tips' },
      calibration_version: 'test-1'
    };

    // If the parsed file doesn't include a three-way probabilities object, set a fallback distribution:
    if (!doc.probabilities && Array.isArray(aiAnalysis.bettingTips) && aiAnalysis.bettingTips.length > 0) {
      // Derive a simple 3-way heuristic: if any tip contains "correct score" or a score-like string choose draw/moderate
      const sumTip = aiAnalysis.bettingTips.reduce((s,t)=>s + (Number(t.probability)||0),0);
      // fallback: 34/33/33
      aiAnalysis.probabilities = { homeWin: 34, draw: 33, awayWin: 33 };
    } else if (doc.probabilities) {
      aiAnalysis.probabilities = {
        homeWin: doc.probabilities.homeWin || 0,
        draw: doc.probabilities.draw || 0,
        awayWin: doc.probabilities.awayWin || 0
      };
    }

    // If normalized_bettingTips exists we preserved it already
    console.log('About to POST confirm-save for fixture', fixtureId);
    const url = `http://localhost:3002/api/betting/fixtures/${fixtureId}/confirm-save`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prediction: aiAnalysis }),
    });

    const j = await res.json().catch(() => ({ raw: 'non-json response' }));
    console.log('Response status:', res.status);
    console.log('Response body:', JSON.stringify(j, null, 2));

    if (res.ok && j && j.success) {
      console.log('Confirm & Save succeeded, savedId =', j.savedId);
      process.exit(0);
    } else {
      console.error('Confirm & Save failed:', j);
      process.exit(2);
    }
  } catch (err) {
    console.error('ERROR in confirm_and_save_test.mjs:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();
