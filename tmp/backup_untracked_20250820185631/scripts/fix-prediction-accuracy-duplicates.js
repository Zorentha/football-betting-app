import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const dbPath = path.join(__dirname, '../database/football_betting.db');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });

  console.log('✅ Połączono z bazą:', dbPath);

  const beforeTotal = await db.get(`SELECT COUNT(*) as cnt FROM prediction_accuracy`);
  const beforeDistinct = await db.get(`SELECT COUNT(DISTINCT fixture_id) as cnt FROM prediction_accuracy`);

  console.log(`Przed: total rows = ${beforeTotal.cnt}, distinct fixture_id = ${beforeDistinct.cnt}`);

  try {
    await db.exec('BEGIN TRANSACTION;');

    // Create aggregated temporary table
    await db.exec(`
      CREATE TEMP TABLE IF NOT EXISTS __agg_prediction_accuracy AS
      SELECT
        fixture_id,
        MAX(CASE WHEN result_correct = 1 THEN 1 ELSE 0 END) as result_correct,
        MAX(CASE WHEN score_correct = 1 THEN 1 ELSE 0 END) as score_correct,
        AVG(CASE WHEN probability_accuracy IS NOT NULL THEN probability_accuracy ELSE 0 END) as probability_accuracy,
        MAX(CASE WHEN confidence_justified = 1 THEN 1 ELSE 0 END) as confidence_justified,
        MAX(CASE WHEN total_goals_correct = 1 THEN 1 ELSE 0 END) as total_goals_correct
      FROM prediction_accuracy
      GROUP BY fixture_id;
    `);

    // Delete existing rows
    await db.exec(`DELETE FROM prediction_accuracy;`);

    // Insert aggregated rows back
    await db.exec(`
      INSERT INTO prediction_accuracy (
        fixture_id, result_correct, score_correct, probability_accuracy, confidence_justified, total_goals_correct, calculated_at
      )
      SELECT
        fixture_id,
        result_correct,
        score_correct,
        probability_accuracy,
        confidence_justified,
        total_goals_correct,
        CURRENT_TIMESTAMP
      FROM __agg_prediction_accuracy;
    `);

    // Drop temp table
    await db.exec(`DROP TABLE IF EXISTS __agg_prediction_accuracy;`);

    // Create unique index to prevent future duplicates
    await db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_prediction_accuracy_fixture
      ON prediction_accuracy(fixture_id);
    `);

    await db.exec('COMMIT;');

    const afterTotal = await db.get(`SELECT COUNT(*) as cnt FROM prediction_accuracy`);
    const afterDistinct = await db.get(`SELECT COUNT(DISTINCT fixture_id) as cnt FROM prediction_accuracy`);

    console.log(`Po: total rows = ${afterTotal.cnt}, distinct fixture_id = ${afterDistinct.cnt}`);
    console.log('✅ Udało się zredukować prediction_accuracy do 1 wiersza na fixture_id i utworzyć unikalny indeks.');
  } catch (err) {
    try { await db.exec('ROLLBACK;'); } catch (_) {}
    console.error('❌ Błąd podczas deduplikacji prediction_accuracy:', err.message || err);
    process.exit(1);
  } finally {
    await db.close();
    console.log('🔒 Połączenie z bazą zamknięte');
  }
}

run().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
