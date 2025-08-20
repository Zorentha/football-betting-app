import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async function() {
  const dbPath = path.join(__dirname, '../database/football_betting.db');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    // Find predictions where predicted score equals actual result
    const exactMatches = await db.all(`
      SELECT
        p.id as prediction_id,
        p.fixture_id,
        p.predicted_home_score,
        p.predicted_away_score,
        p.ai_model,
        p.prediction_hash,
        p.prediction_date,
        r.home_score,
        r.away_score,
        r.result_date
      FROM match_predictions p
      JOIN match_results r ON p.fixture_id = r.fixture_id
      WHERE p.predicted_home_score = r.home_score
        AND p.predicted_away_score = r.away_score
      ORDER BY p.prediction_date DESC
      LIMIT 200
    `);

    // Of those, which were written after the result was recorded?
    const writtenAfter = exactMatches.filter(row => {
      if (!row.prediction_date || !row.result_date) return false;
      const pd = new Date(row.prediction_date).getTime();
      const rd = new Date(row.result_date).getTime();
      return pd >= rd;
    });

    console.log('=== Exact predicted == actual (up to 200 rows) ===');
    console.log(JSON.stringify(exactMatches, null, 2));

    console.log('\n=== Subset: predictions written at or after result_date ===');
    console.log(JSON.stringify(writtenAfter, null, 2));

    // Also list predictions where ai_model is 'reconstructed' or starts with 'from_tmp'
    const synthesized = await db.all(`
      SELECT id as prediction_id, fixture_id, ai_model, prediction_hash, prediction_date
      FROM match_predictions
      WHERE ai_model LIKE 'reconstructed' OR ai_model LIKE 'from_tmp:%'
      ORDER BY prediction_date DESC
      LIMIT 200
    `);
    console.log('\n=== Predictions marked as reconstructed / from_tmp ===');
    console.log(JSON.stringify(synthesized, null, 2));

    // Close
    await db.close();
  } catch (err) {
    console.error('Error checking predictions vs results:', err);
    try { await db.close(); } catch(e) {}
    process.exit(1);
  }
})();
