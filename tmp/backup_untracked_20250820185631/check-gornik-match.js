// Sprawdź mecz Górnik - Nieciecza w bazie danych
import { databaseService } from './src/services/databaseService.js';

async function checkGornikMatch() {
  try {
    await databaseService.initialize();
    
    const fixtureId = 1380412; // Górnik - Nieciecza
    
    console.log(`🔍 Sprawdzanie meczu ${fixtureId} (Górnik - Nieciecza)...\n`);
    
    // Sprawdź mecz
    const match = await databaseService.db.get(
      'SELECT * FROM matches WHERE fixture_id = ?', 
      [fixtureId]
    );
    
    if (match) {
      console.log('⚽ MECZ W BAZIE:');
      console.log(`  • ${match.home_team_name} vs ${match.away_team_name}`);
      console.log(`  • Data: ${match.match_date}`);
      console.log(`  • Liga: ${match.league_name}`);
      console.log(`  • Status: ${match.status}`);
    } else {
      console.log('❌ Mecz nie został znaleziony w bazie');
    }
    
    // Sprawdź predykcję
    const prediction = await databaseService.db.get(
      'SELECT * FROM match_predictions WHERE fixture_id = ?', 
      [fixtureId]
    );
    
    if (prediction) {
      console.log('\\n🔮 PREDYKCJA AI:');
      console.log(`  • Przewidywany wynik: ${prediction.predicted_home_score}-${prediction.predicted_away_score}`);
      console.log(`  • Prawdopodobieństwa: ${prediction.home_win_probability}% - ${prediction.draw_probability}% - ${prediction.away_win_probability}%`);
      console.log(`  • Poziom pewności: ${prediction.confidence_level}`);
      console.log(`  • Model: ${prediction.ai_model}`);
    } else {
      console.log('\\n❌ Predykcja nie została znaleziona w bazie');
    }
    
    // Sprawdź formę drużyn
    const teamForm = await databaseService.db.all(
      'SELECT * FROM team_form_data WHERE fixture_id = ?', 
      [fixtureId]
    );
    
    if (teamForm.length > 0) {
      console.log('\\n📊 FORMA DRUŻYN:');
      teamForm.forEach(form => {
        console.log(`  • ${form.team_name} (${form.is_home ? 'gospodarze' : 'goście'}): ${form.points_last_5} pkt, forma: ${form.form_string}`);
      });
    } else {
      console.log('\\n❌ Forma drużyn nie została znaleziona w bazie');
    }
    
    // Sprawdź pojedynki zawodników
    const matchups = await databaseService.db.all(
      'SELECT * FROM player_matchups WHERE fixture_id = ?', 
      [fixtureId]
    );
    
    if (matchups.length > 0) {
      console.log(`\\n⚔️ POJEDYNKI ZAWODNIKÓW (${matchups.length}):`);
      matchups.slice(0, 3).forEach(matchup => {
        console.log(`  • ${matchup.category}: ${matchup.home_player_name} vs ${matchup.away_player_name}`);
      });
      if (matchups.length > 3) {
        console.log(`  • ... i ${matchups.length - 3} więcej`);
      }
    } else {
      console.log('\\n❌ Pojedynki zawodników nie zostały znalezione w bazie');
    }
    
    await databaseService.close();
    
  } catch (error) {
    console.error('❌ Błąd:', error);
  }
}

checkGornikMatch();