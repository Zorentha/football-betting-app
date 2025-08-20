// Sprawdź zawartość bazy danych
import { databaseService } from './src/services/databaseService.js';

async function checkDatabase() {
  try {
    await databaseService.initialize();
    
    console.log('🔍 Sprawdzanie zawartości bazy danych...\n');
    
    // Sprawdź tabele
    const tables = await databaseService.db.all(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
    `);
    
    console.log('📋 Dostępne tabele:');
    tables.forEach(table => {
      console.log(`  • ${table.name}`);
    });
    
    // Sprawdź mecze
    const matches = await databaseService.db.all('SELECT * FROM matches LIMIT 5');
    console.log(`\n⚽ Mecze w bazie: ${matches.length}`);
    if (matches.length > 0) {
      matches.forEach(match => {
        console.log(`  • ${match.fixture_id}: ${match.home_team_name} vs ${match.away_team_name}`);
      });
    }
    
    // Sprawdź predykcje
    const predictions = await databaseService.db.all('SELECT * FROM match_predictions LIMIT 5');
    console.log(`\n🔮 Predykcje w bazie: ${predictions.length}`);
    if (predictions.length > 0) {
      predictions.forEach(pred => {
        console.log(`  • Mecz ${pred.fixture_id}: ${pred.predicted_home_score}-${pred.predicted_away_score} (${pred.confidence_level})`);
      });
    }
    
    // Sprawdź wyniki
    const results = await databaseService.db.all('SELECT * FROM match_results LIMIT 5');
    console.log(`\n📊 Wyniki w bazie: ${results.length}`);
    if (results.length > 0) {
      results.forEach(result => {
        console.log(`  • Mecz ${result.fixture_id}: ${result.home_score}-${result.away_score}`);
      });
    }
    
    // Sprawdź dokładność
    const accuracy = await databaseService.db.all('SELECT * FROM prediction_accuracy LIMIT 5');
    console.log(`\n🎯 Dokładność w bazie: ${accuracy.length}`);
    if (accuracy.length > 0) {
      accuracy.forEach(acc => {
        console.log(`  • Mecz ${acc.fixture_id}: Wynik ${acc.result_correct ? '✅' : '❌'}, Dokładny ${acc.score_correct ? '✅' : '❌'}`);
      });
    }
    
    await databaseService.close();
    
  } catch (error) {
    console.error('❌ Błąd:', error);
  }
}

checkDatabase();