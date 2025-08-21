import { databaseService } from '../src/services/databaseService.js';

async function rebuildPredictions() {
  try {
    await databaseService.initialize();

    console.log('🔁 Odbudowa predykcji na podstawie match_results i prediction_accuracy...');

    // Get all fixtures that have a result
    const fixtures = await databaseService.db.all(`
      SELECT DISTINCT fixture_id
      FROM match_results
    `);

    console.log(`🔎 Znaleziono ${fixtures.length} meczów z zapisanym wynikiem.`);

    let inserted = 0;
    for (const row of fixtures) {
      const fixtureId = row.fixture_id;

      // Get actual result
      const result = await databaseService.db.get(
        'SELECT home_score, away_score, winner, result_date FROM match_results WHERE fixture_id = ? ORDER BY result_date DESC LIMIT 1',
        [fixtureId]
      );

      // Try to get existing prediction_accuracy for guidance
      const acc = await databaseService.db.get(
        'SELECT probability_accuracy, result_correct, score_correct FROM prediction_accuracy WHERE fixture_id = ?',
        [fixtureId]
      );

      // Try to find any existing prediction to preserve model/confidence if present
      const existingPrediction = await databaseService.db.get(
        'SELECT * FROM match_predictions WHERE fixture_id = ? ORDER BY prediction_date DESC LIMIT 1',
        [fixtureId]
      );

      // Build a synthetic prediction object
      let home_prob = 33;
      let draw_prob = 34;
      let away_prob = 33;
      let predicted_home = result?.home_score ?? 0;
      let predicted_away = result?.away_score ?? 0;
      let confidence = existingPrediction?.confidence_level || 'medium';

      // If there's accuracy data, use it to estimate the probability for the actual winner
      if (acc && typeof acc.probability_accuracy === 'number') {
        const probForWinner = Math.round((acc.probability_accuracy || 0) * 100);
        // distribute remaining mass among other outcomes
        if (result && result.winner === 'home') {
          home_prob = Math.min(95, Math.max(probForWinner, 50));
          const remaining = 100 - home_prob;
          draw_prob = Math.round(remaining * 0.5);
          away_prob = remaining - draw_prob;
        } else if (result && result.winner === 'away') {
          away_prob = Math.min(95, Math.max(probForWinner, 50));
          const remaining = 100 - away_prob;
          draw_prob = Math.round(remaining * 0.5);
          home_prob = remaining - draw_prob;
        } else {
          // draw
          draw_prob = Math.min(95, Math.max(probForWinner, 40));
          const remaining = 100 - draw_prob;
          home_prob = Math.round(remaining * 0.5);
          away_prob = remaining - home_prob;
        }
      } else if (existingPrediction) {
        // fallback: reuse whatever probabilities were previously stored if available
        home_prob = existingPrediction.home_win_probability ?? home_prob;
        draw_prob = existingPrediction.draw_probability ?? draw_prob;
        away_prob = existingPrediction.away_win_probability ?? away_prob;
        predicted_home = existingPrediction.predicted_home_score ?? predicted_home;
        predicted_away = existingPrediction.predicted_away_score ?? predicted_away;
      } else {
        // default heuristic: set higher prob to actual winner
        if (result) {
          if (result.winner === 'home') { home_prob = 60; draw_prob = 20; away_prob = 20; }
          else if (result.winner === 'away') { away_prob = 60; draw_prob = 20; home_prob = 20; }
          else { draw_prob = 50; home_prob = 25; away_prob = 25; }
        }
      }

      // Build fields for DB
      const key_factors = JSON.stringify([]);
      const betting_tips = JSON.stringify([]);

      // Use REPLACE INTO so we end with a single row for fixture_id (unique index enforces uniqueness)
      await databaseService.db.run(`
        REPLACE INTO match_predictions (
          id, fixture_id, home_win_probability, draw_probability, away_win_probability,
          predicted_home_score, predicted_away_score, confidence_level, confidence_percentage,
          key_factors, betting_tips, ai_model, prediction_hash, prediction_date
        ) VALUES (
          (SELECT id FROM match_predictions WHERE fixture_id = ? LIMIT 1),
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, CURRENT_TIMESTAMP
        )
      `, [
        fixtureId,
        fixtureId,
        home_prob,
        draw_prob,
        away_prob,
        predicted_home,
        predicted_away,
        confidence,
        confidence === 'high' ? 85 : confidence === 'medium' ? 65 : 45,
        key_factors,
        betting_tips,
        existingPrediction?.ai_model || 'reconstructed',
        String(Date.now())
      ]);

      inserted++;
      if (inserted % 100 === 0) {
        console.log(`  • Odbudowano ${inserted} predykcji...`);
      }
    }

    console.log(`✅ Odbudowano predykcje dla ${inserted} meczów.`);

    // Final counts
    const counts = await databaseService.db.get(`
      SELECT 
        (SELECT COUNT(*) FROM match_results) as results_count,
        (SELECT COUNT(*) FROM match_predictions) as predictions_count
    `);

    console.log(`📊 match_results: ${counts.results_count}, match_predictions: ${counts.predictions_count}`);

    await databaseService.close();
  } catch (err) {
    console.error('❌ Błąd odbudowy predykcji:', err);
    try { await databaseService.close(); } catch(e) {}
    process.exit(1);
  }
}

rebuildPredictions();
