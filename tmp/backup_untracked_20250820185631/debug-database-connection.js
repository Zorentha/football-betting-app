// Debug połączenia z bazą danych
import { databaseService } from './src/services/databaseService.js';

async function debugConnection() {
  try {
    console.log('🔍 Debug połączenia z bazą danych...\n');
    
    console.log('1️⃣ Sprawdzam czy baza jest połączona:');
    console.log(`   isConnected(): ${databaseService.isConnected()}`);
    
    if (!databaseService.isConnected()) {
      console.log('\\n2️⃣ Inicjalizuję bazę danych...');
      await databaseService.initialize();
      console.log(`   Po inicjalizacji: ${databaseService.isConnected()}`);
    }
    
    console.log('\\n3️⃣ Testuję proste zapytanie...');
    const tables = await databaseService.db.all(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
    `);
    console.log(`   Znaleziono ${tables.length} tabel:`);
    tables.forEach(table => {
      console.log(`     • ${table.name}`);
    });
    
    console.log('\\n4️⃣ Testuję zapisywanie prostego meczu...');
    const testMatchData = {
      fixture: { 
        id: 999999, 
        date: new Date().toISOString(),
        venue: { name: 'Test Stadium' },
        status: { short: 'NS' }
      },
      teams: {
        home: { id: 1, name: 'Test Home' },
        away: { id: 2, name: 'Test Away' }
      },
      league: { id: 1, name: 'Test League' }
    };
    
    const result = await databaseService.saveMatch(testMatchData);
    console.log(`   Wynik zapisywania: ${result}`);
    
    if (result) {
      console.log('\\n5️⃣ Sprawdzam czy mecz został zapisany...');
      const savedMatch = await databaseService.db.get(
        'SELECT * FROM matches WHERE fixture_id = ?', 
        [999999]
      );
      
      if (savedMatch) {
        console.log('   ✅ Mecz został zapisany:');
        console.log(`     • ${savedMatch.home_team_name} vs ${savedMatch.away_team_name}`);
        console.log(`     • Liga: ${savedMatch.league_name}`);
        
        // Usuń testowy mecz
        await databaseService.db.run('DELETE FROM matches WHERE fixture_id = ?', [999999]);
        console.log('   🧹 Testowy mecz usunięty');
      } else {
        console.log('   ❌ Mecz nie został znaleziony w bazie');
      }
    }
    
    await databaseService.close();
    
  } catch (error) {
    console.error('❌ Błąd debugowania:', error);
  }
}

debugConnection();