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

  const totalPredAcc = await db.get(`SELECT COUNT(*) as cnt FROM prediction_accuracy`);
  const distinctPredAcc = await db.get(`SELECT COUNT(DISTINCT fixture_id) as cnt FROM prediction_accuracy`);
  const sumResultCorrect = await db.get(`SELECT SUM(CASE WHEN result_correct = 1 THEN 1 ELSE 0 END) as sum_res FROM prediction_accuracy`);
  const sumScoreCorrect = await db.get(`SELECT SUM(CASE WHEN score_correct = 1 THEN 1 ELSE 0 END) as sum_score FROM prediction_accuracy`);
  const sumTotalGoals = await db.get(`SELECT SUM(CASE WHEN total_goals_correct = 1 THEN 1 ELSE 0 END) as sum_goals FROM prediction_accuracy`);
  const avgProb = await db.get(`SELECT AVG(probability_accuracy) as avg_prob FROM prediction_accuracy`);

  const predsTotal = await db.get(`SELECT COUNT(*) as cnt FROM match_predictions`);
  const predsDistinct = await db.get(`SELECT COUNT(DISTINCT fixture_id) as cnt FROM match_predictions`);

  console.log('');
  console.log('📊 prediction_accuracy total rows:', totalPredAcc.cnt);
  console.log('📊 prediction_accuracy distinct fixture_id:', distinctPredAcc.cnt);
  console.log('📊 SUM result_correct (raw rows):', sumResultCorrect.sum_res || 0);
  console.log('📊 SUM score_correct (raw rows):', sumScoreCorrect.sum_score || 0);
  console.log('📊 SUM total_goals_correct (raw rows):', sumTotalGoals.sum_goals || 0);
  console.log('📊 AVG probability_accuracy (raw rows):', avgProb.avg_prob);

  console.log('');
  console.log('📊 match_predictions total rows:', predsTotal.cnt);
  console.log('📊 match_predictions distinct fixture_id:', predsDistinct.cnt);

  console.log('\n🔎 Count of prediction_accuracy rows per fixture_id (top 50 by count):');
  const perFixture = await db.all(`
    SELECT fixture_id, COUNT(*) as cnt,
      SUM(CASE WHEN result_correct = 1 THEN 1 ELSE 0 END) as res_sum,
      SUM(CASE WHEN score_correct = 1 THEN 1 ELSE 0 END) as score_sum,
      AVG(probability_accuracy) as avg_prob
    FROM prediction_accuracy
    GROUP BY fixture_id
    ORDER BY cnt DESC
    LIMIT 50
  `);

  perFixture.forEach(r => {
    console.log(`fixture_id=${r.fixture_id} rows=${r.cnt} result_sum=${r.res_sum} score_sum=${r.score_sum} avg_prob=${r.avg_prob}`);
  });

  await db.close();
  console.log('\n🔒 Done.');
}

run().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
