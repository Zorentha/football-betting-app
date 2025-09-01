import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function main() {
  const fixtureId = process.argv[2] ? Number(process.argv[2]) : 1435547;
  const dbFile = 'database/football_betting.db';

  try {
    const db = await open({ filename: dbFile, driver: sqlite3.Database });
    const row = await db.get(
      'SELECT id, fixture_id, ai_model, prediction_date, home_win_probability, draw_probability, away_win_probability, predicted_home_score, predicted_away_score, confidence_level, confidence_percentage, betting_tips, prediction_metadata FROM match_predictions WHERE fixture_id = ? ORDER BY id DESC LIMIT 1',
      fixtureId
    );
    if (!row) {
      console.error(JSON.stringify({ error: 'not_found', fixtureId }, null, 2));
      process.exit(1);
    }
    // betting_tips is stored as JSON string; try to parse it for nicer output
    try {
      row.betting_tips = JSON.parse(row.betting_tips);
    } catch (e) {
      // leave as-is
    }
    // prediction_metadata may be JSON string
    try {
      row.prediction_metadata = JSON.parse(row.prediction_metadata);
    } catch (e) {}
    console.log(JSON.stringify(row, null, 2));
    await db.close();
  } catch (err) {
    console.error(JSON.stringify({ error: String(err) }, null, 2));
    process.exit(2);
  }
}

main();
