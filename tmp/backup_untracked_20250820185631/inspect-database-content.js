// Sprawdź zawartość bazy danych szczegółowo
import { databaseService } from './src/services/databaseService.js';

async function inspectDatabase() {
  try {
    await databaseService.initialize();
    
    console.log('🔍 Szczegółowa inspekcja bazy danych...\n');
    
    // Sprawdź wszystkie tabele i ich zawartość
    const tables = ['matches', 'match_predictions', 'match_results', 'team_form_data', 'player_matchups'];
    
    for (const table of tables) {
      console.log(`📋 Tabela: ${table}`);
      
      try {
        const count = await databaseService.db.get(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   Liczba rekordów: ${count.count}`);
        
        if (count.count > 0) {
          const sample = await databaseService.db.all(`SELECT * FROM ${table} LIMIT 3`);
          console.log('   Przykładowe rekordy:');
          sample.forEach((record, index) => {
            console.log(`     ${index + 1}. ${JSON.stringify(record, null, 2).substring(0, 200)}...`);
          });
        }
      } catch (error) {
        console.log(`   ❌ Błąd odczytu: ${error.message}`);
      }
      
      console.log('');
    }
    
    // Sprawdź czy są jakieś dane dla fixture_id 1380412
    console.log('🎯 Sprawdzanie danych dla meczu 1380412:');
    
    const matchCheck = await databaseService.db.get('SELECT * FROM matches WHERE fixture_id = ?', [1380412]);
    console.log(`   Mecz: ${matchCheck ? 'ZNALEZIONY' : 'BRAK'}`);
    if (matchCheck) {
      console.log(`     ${matchCheck.home_team_name} vs ${matchCheck.away_team_name}`);
    }
    
    const predictionCheck = await databaseService.db.get('SELECT * FROM match_predictions WHERE fixture_id = ?', [1380412]);
    console.log(`   Predykcja: ${predictionCheck ? 'ZNALEZIONA' : 'BRAK'}`);
    if (predictionCheck) {
      console.log(`     ${predictionCheck.predicted_home_score}-${predictionCheck.predicted_away_score}`);
    }
    
    // Sprawdź wszystkie fixture_id w bazie
    console.log('\\n🆔 Wszystkie fixture_id w bazie:');
    const allFixtures = await databaseService.db.all(`
      SELECT DISTINCT fixture_id, 
             (SELECT home_team_name || ' vs ' || away_team_name FROM matches WHERE matches.fixture_id = m.fixture_id) as match_name
      FROM (
        SELECT fixture_id FROM matches
        UNION
        SELECT fixture_id FROM match_predictions
        UNION
        SELECT fixture_id FROM match_results
      ) m
      ORDER BY fixture_id
    `);
    
    allFixtures.forEach(fixture => {
      console.log(`   • ${fixture.fixture_id}: ${fixture.match_name || 'Brak nazwy'}`);
    });
    
    await databaseService.close();
    
  } catch (error) {
    console.error('❌ Błąd inspekcji:', error);
  }
}

inspectDatabase();