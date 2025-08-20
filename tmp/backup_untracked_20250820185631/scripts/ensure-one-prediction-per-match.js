import fs from 'fs';
import path from 'path';
import { databaseService } from '../src/services/databaseService.js';

const TMP_DIR = path.join(process.cwd(), 'tmp_analysis_all');

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function tryExtractFromTmp(obj) {
  // Defensive extraction for common shapes
  const out = {
    home_win_probability: null,
    draw_probability: null,
    away_win_probability: null,
    predicted_home_score: null,
    predicted_away_score: null,
    confidence_level: null,
    keyFactors: [],
    bettingTips: []
  };

  if (!obj || typeof obj !== 'object') return out;

  const ai = obj.aiAnalysis || obj.analysis || obj;
  if (ai) {
    const probs = ai.probabilities || ai.probs || ai.probability || ai.predictions || {};
    out.home_win_probability = safeNumber(probs.homeWin ?? probs.home_win ?? probs.home ?? probs.home_win_probability, null);
    out.draw_probability = safeNumber(probs.draw ?? probs.draw_probability ?? probs.draw_prob, null);
    out.away_win_probability = safeNumber(probs.awayWin ?? probs.away_win ?? probs.away ?? probs.away_win_probability, null);

    const ps = ai.predictedScore || ai.predicted_score || ai.predicted || ai.predictedScoreText;
    if (ps) {
      out.predicted_home_score = safeNumber(ps.home ?? ps.home_score ?? (ps[0] ?? null), null);
      out.predicted_away_score = safeNumber(ps.away ?? ps.away_score ?? (ps[1] ?? null), null);
    }

    out.confidence_level = ai.confidence || ai.confidence_level || ai.conf || null;
    out.keyFactors = ai.keyFactors || ai.key_factors || ai.key_factors_list || [];
    out.bettingTips = ai.bettingTips || ai.betting_tips || ai.bettingTipsList || [];
  }

  return out;
}

async function ensureOnePredictionPerMatch() {
  try {
    await databaseService.initialize();

    const matches = await databaseService.db.all(`SELECT fixture_id FROM matches`);
    console.log(`🔁 Znaleziono ${matches.length} wpisów w matches — zapewniam 1 predykcję na fixture.`);

    let processed = 0;
    for (const row of matches) {
      const fixtureId = row.fixture_id;
      // Check if there is an existing prediction (take latest)
      const existing = await databaseService.db.get(
        'SELECT * FROM match_predictions WHERE fixture_id = ? ORDER BY prediction_date DESC, id DESC LIMIT 1',
        [fixtureId]
      );

      if (existing) {
        // Replace with itself to ensure single row (REPLACE INTO using existing id)
        await databaseService.db.run(`
          REPLACE INTO match_predictions (
            id, fixture_id, home_win_probability, draw_probability, away_win_probability,
            predicted_home_score, predicted_away_score, confidence_level, confidence_percentage,
            key_factors, betting_tips, ai_model, prediction_hash, prediction_date
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT prediction_date FROM match_predictions WHERE id = ?), CURRENT_TIMESTAMP)
          )
        `, [
          existing.id,
          fixtureId,
          existing.home_win_probability ?? 0,
          existing.draw_probability ?? 0,
          existing.away_win_probability ?? 0,
          existing.predicted_home_score ?? 0,
          existing.predicted_away_score ?? 0,
          existing.confidence_level || 'unknown',
          existing.confidence_percentage || (existing.confidence_level === 'high' ? 85 : existing.confidence_level === 'medium' ? 65 : 45),
          existing.key_factors || '[]',
          existing.betting_tips || '[]',
          existing.ai_model || 'existing',
          existing.prediction_hash || String(Date.now()),
          existing.id
        ]);
      } else {
        // Try to find tmp_analysis_all file
        const candidates = [
          path.join(TMP_DIR, `tmp_analysis_${fixtureId}.json`),
          path.join(TMP_DIR, `tmp_analysis_${fixtureId}_error.json`)
        ];
        let used = null;
        let extracted = null;

        for (const c of candidates) {
          if (fs.existsSync(c)) {
            try {
              const txt = fs.readFileSync(c, 'utf8');
              const parsed = JSON.parse(txt);
              extracted = tryExtractFromTmp(parsed);
              used = c;
              break;
            } catch (e) {
              // ignore parse error and continue
            }
          }
        }

        // If not found in tmp, try to use prediction_accuracy / match_results to synthesize
        if (!extracted) {
          // Do NOT synthesize predicted scores from match_results — predictions must come from AI or tmp_analysis.
          // We may consult prediction_accuracy to bias probabilities conservatively, but we will NOT copy final results
          // into predicted_home_score/predicted_away_score. Leave predicted scores as placeholders (0) and mark source.
          const acc = await databaseService.db.get(
            'SELECT probability_accuracy FROM prediction_accuracy WHERE fixture_id = ?',
            [fixtureId]
          );

          extracted = {
            home_win_probability: 33,
            draw_probability: 34,
            away_win_probability: 33,
            predicted_home_score: 0,
            predicted_away_score: 0,
            confidence_level: 'medium',
            keyFactors: [],
            bettingTips: []
          };

          if (acc && typeof acc.probability_accuracy === 'number') {
            const p = Math.round((acc.probability_accuracy || 0) * 100);
            // Apply a conservative bias based on historical accuracy but DO NOT copy match_results.
            // This is intentionally mild so reconstructed probabilities are not treated as real AI predictions.
            if (p >= 60) {
              extracted.home_win_probability = Math.min(90, Math.round(33 + (p - 50) / 2));
              extracted.draw_probability = Math.max(5, Math.round(extracted.draw_probability));
              extracted.away_win_probability = Math.max(5, 100 - extracted.home_win_probability - extracted.draw_probability);
            }
          }
        }

        // Insert REPLACE
        await databaseService.db.run(`
          INSERT OR REPLACE INTO match_predictions (
            fixture_id, home_win_probability, draw_probability, away_win_probability,
            predicted_home_score, predicted_away_score, confidence_level, confidence_percentage,
            key_factors, betting_tips, ai_model, prediction_hash, prediction_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          fixtureId,
          extracted.home_win_probability ?? 33,
          extracted.draw_probability ?? 34,
          extracted.away_win_probability ?? 33,
          extracted.predicted_home_score ?? 0,
          extracted.predicted_away_score ?? 0,
          extracted.confidence_level || 'medium',
          extracted.confidence_level === 'high' ? 85 : extracted.confidence_level === 'medium' ? 65 : 45,
          JSON.stringify(extracted.keyFactors || []),
          JSON.stringify(extracted.bettingTips || []),
          used ? `from_tmp:${path.basename(used)}` : 'reconstructed',
          String(Date.now())
        ]);
      }

      processed++;
      if (processed % 100 === 0) console.log(`  • Przetworzono ${processed} meczów...`);
    }

    const counts = await databaseService.db.get(`
      SELECT
        (SELECT COUNT(DISTINCT fixture_id) FROM match_results) as distinct_results,
        (SELECT COUNT(*) FROM matches) as matches_count,
        (SELECT COUNT(*) FROM match_predictions) as predictions_count,
        (SELECT COUNT(DISTINCT fixture_id) FROM match_predictions) as distinct_predictions
    `);

    console.log(`✅ Zakończono. matches: ${counts.matches_count}, distinct_result_fixtures: ${counts.distinct_results}, match_predictions total: ${counts.predictions_count}, distinct_predictions: ${counts.distinct_predictions}`);

    await databaseService.close();
  } catch (err) {
    console.error('❌ Błąd:', err);
    try { await databaseService.close(); } catch(e) {}
    process.exit(1);
  }
}

ensureOnePredictionPerMatch();
