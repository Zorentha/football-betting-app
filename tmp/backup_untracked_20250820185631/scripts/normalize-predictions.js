import { databaseService } from '../src/services/databaseService.js';

function normalizeBettingTipsArray(tips, predictedScore) {
  const parsed = [];
  for (const t of tips) {
    if (typeof t === 'string') {
      const m = t.match(/correct score\s*[:\-]?\s*(\d+)[\s\-:x](\d+)/i) || t.match(/^\s*(\d+)\s*[-:]\s*(\d+)\s*$/);
      if (m) {
        const h = Number(m[1]), a = Number(m[2]);
        if (predictedScore && (predictedScore.home !== h || predictedScore.away !== a)) {
          parsed.push(`Correct score ${predictedScore.home}-${predictedScore.away} (normalized)`);
          continue;
        }
        parsed.push(`Correct score ${h}-${a}`);
        continue;
      }
      parsed.push(t);
    } else if (t && typeof t === 'object') {
      parsed.push(t);
    } else {
      parsed.push(String(t));
    }
  }
  return parsed;
}

(async () => {
  try {
    await databaseService.initialize();
    console.log('Connected to DB.');

    const rows = await databaseService.db.all('SELECT * FROM match_predictions');
    console.log(`Found ${rows.length} prediction(s). Scanning for inconsistent betting tips...`);

    let updated = 0;
    for (const row of rows) {
      try {
        const fixtureId = row.fixture_id;
        const predictedScore = {
          home: Number(row.predicted_home_score) || 0,
          away: Number(row.predicted_away_score) || 0
        };

        let tips = [];
        try {
          tips = JSON.parse(row.betting_tips || '[]');
        } catch (e) {
          // if it's a string with spaces, split heuristically
          tips = (row.betting_tips || '').split(/\s*[,;]\s*/).filter(Boolean);
        }

        const hasCorrectScore = tips.some(t => {
          if (typeof t === 'string') {
            return /correct score/i.test(t) || /^\s*\d+\s*[-:]\s*\d+\s*$/.test(t);
          }
          return false;
        });

        if (!hasCorrectScore) continue;

        const normalized = normalizeBettingTipsArray(tips, predictedScore);

        // If normalized differs, save a new prediction row (replace)
        if (JSON.stringify(normalized) !== JSON.stringify(tips)) {
          const predictionObj = {
            probabilities: {
              homeWin: Number(row.home_win_probability) || 0,
              draw: Number(row.draw_probability) || 0,
              awayWin: Number(row.away_win_probability) || 0
            },
            predictedScore,
            confidence: row.confidence_level || 'unknown',
            confidencePercentage: Number(row.confidence_percentage) || null,
            keyFactors: (() => {
              try { return JSON.parse(row.key_factors || '[]'); } catch (e) { return []; }
            })(),
            bettingTips: normalized
          };

          // Use savePrediction which will delete existing and insert new row
          await databaseService.savePrediction(fixtureId, predictionObj);
          updated++;
          console.log(`Normalized prediction for fixture ${fixtureId} and re-saved.`);
        }
      } catch (e) {
        console.warn('Error processing row id', row.id, e.message || e);
      }
    }

    console.log(`Normalization complete. Updated: ${updated} prediction(s).`);
    await databaseService.close();
    process.exit(0);
  } catch (e) {
    console.error('Fatal error:', e);
    try { await databaseService.close(); } catch {}
    process.exit(1);
  }
})();
