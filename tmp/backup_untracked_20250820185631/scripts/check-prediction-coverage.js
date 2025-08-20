import { databaseService } from '../src/services/databaseService.js';

async function checkCoverage() {
  try {
    await databaseService.initialize();

    const totalResults = await databaseService.db.get(`SELECT COUNT(*) as cnt FROM match_results`);
    const distinctResultFixtures = await databaseService.db.get(`SELECT COUNT(DISTINCT fixture_id) as cnt FROM match_results`);
    const totalPredictions = await databaseService.db.get(`SELECT COUNT(*) as cnt FROM match_predictions`);
    const distinctPredictionFixtures = await databaseService.db.get(`SELECT COUNT(DISTINCT fixture_id) as cnt FROM match_predictions`);

    console.log(`📊 match_results total rows: ${totalResults.cnt}`);
    console.log(`📊 distinct fixture_id in match_results: ${distinctResultFixtures.cnt}`);
    console.log(`📊 match_predictions total rows: ${totalPredictions.cnt}`);
    console.log(`📊 distinct fixture_id in match_predictions: ${distinctPredictionFixtures.cnt}`);

    // List fixtures in results that don't have a prediction
    const missing = await databaseService.db.all(`
      SELECT DISTINCT r.fixture_id
      FROM match_results r
      LEFT JOIN match_predictions p ON r.fixture_id = p.fixture_id
      WHERE p.fixture_id IS NULL
      LIMIT 200
    `);

    console.log(`\n⚠️ Fixtures with results but missing prediction (sample up to 200): ${missing.length}`);
    if (missing.length > 0) {
      console.log(missing.map(m => m.fixture_id).join(', '));
    }

    // List fixtures in predictions not present in matches table (sanity)
    const predsNoMatch = await databaseService.db.all(`
      SELECT DISTINCT p.fixture_id
      FROM match_predictions p
      LEFT JOIN matches m ON p.fixture_id = m.fixture_id
      WHERE m.fixture_id IS NULL
      LIMIT 200
    `);

    console.log(`\nℹ️ Predictions without matches (sample up to 200): ${predsNoMatch.length}`);
    if (predsNoMatch.length > 0) {
      console.log(predsNoMatch.map(p => p.fixture_id).join(', '));
    }

    await databaseService.close();
  } catch (err) {
    console.error('❌ Błąd podczas sprawdzania pokrycia predykcji:', err);
    try { await databaseService.close(); } catch(e) {}
    process.exit(1);
  }
}

checkCoverage();
