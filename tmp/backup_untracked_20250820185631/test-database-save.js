// Test zapisywania danych do bazy podczas analizy
import axios from 'axios';
import { databaseService } from './src/services/databaseService.js';

async function testDatabaseSave() {
  try {
    console.log('🧪 Test zapisywania danych do bazy podczas analizy...\n');
    
    const fixtureId = 1380412; // Górnik - Nieciecza
    
    // Sprawdź stan bazy przed analizą
    await databaseService.initialize();
    
    console.log('📊 Stan bazy PRZED analizą:');
    const matchesBefore = await databaseService.db.all('SELECT COUNT(*) as count FROM matches');
    const predictionsBefore = await databaseService.db.all('SELECT COUNT(*) as count FROM match_predictions');
    console.log(`  • Mecze: ${matchesBefore[0].count}`);
    console.log(`  • Predykcje: ${predictionsBefore[0].count}`);
    
    await databaseService.close();
    
    // Wykonaj analizę
    console.log('\\n🤖 Wykonuję analizę AI...');
    const response = await axios.get(`http://localhost:3001/api/betting/fixtures/${fixtureId}/analyze`);
    
    if (response.data.success) {
      console.log('✅ Analiza zakończona pomyślnie');
      console.log(`🔮 Predykcja: ${response.data.data.aiAnalysis.predictedScore.home}-${response.data.data.aiAnalysis.predictedScore.away}`);
      console.log(`📊 Prawdopodobieństwa: ${response.data.data.aiAnalysis.probabilities.homeWin}% - ${response.data.data.aiAnalysis.probabilities.draw}% - ${response.data.data.aiAnalysis.probabilities.awayWin}%`);
      console.log(`💾 Zapisano do bazy: ${response.data.savedToDatabase}`);
    } else {
      console.log('❌ Błąd analizy:', response.data.error);
      return;
    }
    
    // Sprawdź stan bazy po analizie
    await databaseService.initialize();
    
    console.log('\\n📊 Stan bazy PO analizie:');
    const matchesAfter = await databaseService.db.all('SELECT COUNT(*) as count FROM matches');
    const predictionsAfter = await databaseService.db.all('SELECT COUNT(*) as count FROM match_predictions');
    const teamFormAfter = await databaseService.db.all('SELECT COUNT(*) as count FROM team_form_data');
    
    console.log(`  • Mecze: ${matchesAfter[0].count} (było: ${matchesBefore[0].count})`);
    console.log(`  • Predykcje: ${predictionsAfter[0].count} (było: ${predictionsBefore[0].count})`);
    console.log(`  • Forma drużyn: ${teamFormAfter[0].count}`);
    
    // Sprawdź konkretne dane
    const match = await databaseService.db.get('SELECT * FROM matches WHERE fixture_id = ?', [fixtureId]);
    const prediction = await databaseService.db.get('SELECT * FROM match_predictions WHERE fixture_id = ?', [fixtureId]);
    
    if (match) {
      console.log('\\n⚽ ZAPISANY MECZ:');
      console.log(`  • ${match.home_team_name} vs ${match.away_team_name}`);
      console.log(`  • Liga: ${match.league_name}`);
      console.log(`  • Data: ${match.match_date}`);
    } else {
      console.log('\\n❌ Mecz nie został zapisany');
    }
    
    if (prediction) {
      console.log('\\n🔮 ZAPISANA PREDYKCJA:');
      console.log(`  • Przewidywany wynik: ${prediction.predicted_home_score}-${prediction.predicted_away_score}`);
      console.log(`  • Prawdopodobieństwa: ${prediction.home_win_probability}% - ${prediction.draw_probability}% - ${prediction.away_win_probability}%`);
      console.log(`  • Poziom pewności: ${prediction.confidence_level}`);
    } else {
      console.log('\\n❌ Predykcja nie została zapisana');
    }
    
    await databaseService.close();
    
    // Podsumowanie
    console.log('\\n📋 PODSUMOWANIE:');
    const matchesSaved = matchesAfter[0].count - matchesBefore[0].count;
    const predictionsSaved = predictionsAfter[0].count - predictionsBefore[0].count;
    
    console.log(`✅ Zapisano ${matchesSaved} meczów`);
    console.log(`✅ Zapisano ${predictionsSaved} predykcji`);
    
    if (matchesSaved > 0 && predictionsSaved > 0) {
      console.log('🎉 System zapisywania działa poprawnie!');
    } else {
      console.log('⚠️ System zapisywania wymaga naprawy');
    }
    
  } catch (error) {
    console.error('❌ Błąd testu:', error.message);
  }
}

testDatabaseSave();