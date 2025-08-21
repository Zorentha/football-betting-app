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
    const rows = await db.all(`
      SELECT
        id,
        fixture_id,
        home_win_probability,
        draw_probability,
        away_win_probability,
        predicted_home_score,
        predicted_away_score,
        confidence_level,
        ai_model,
        prediction_hash,
        prediction_date
      FROM match_predictions
      ORDER BY prediction_date DESC, id DESC
      LIMIT 200
    `);

    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('Error querying match_predictions:', err);
    process.exit(1);
  } finally {
    await db.close();
  }
})();
