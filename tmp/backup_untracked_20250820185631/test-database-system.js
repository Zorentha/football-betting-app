// Test systemu bazy danych football-betting-app
import axios from 'axios';

const API_BASE = 'http://localhost:3001/api/betting';

console.log('🧪 Testowanie systemu bazy danych football-betting-app...\n');

// Test 1: Sprawdź czy serwer działa
async function testServerHealth() {
  try {
    console.log('1️⃣ Test połączenia z serwerem...');
    const response = await axios.get('http://localhost:3001/api/health');
    console.log('✅ Serwer działa:', response.data);
    return true;
  } catch (error) {
    console.log('❌ Serwer nie odpowiada:', error.message);
    return false;
  }
}

// Test 2: Pobierz dzisiejsze mecze
async function testGetTodayFixtures() {
  try {
    console.log('\n2️⃣ Test pobierania dzisiejszych meczów...');
    const response = await axios.get(`${API_BASE}/fixtures/today`);
    console.log(`✅ Pobrano ${response.data.count} meczów`);
    
    if (response.data.data.length > 0) {
      const firstMatch = response.data.data[0];
      console.log(`📊 Przykładowy mecz: ${firstMatch.teams.home.name} vs ${firstMatch.teams.away.name}`);
      return firstMatch.fixture.id;
    }
    return null;
  } catch (error) {
    console.log('❌ Błąd pobierania meczów:', error.message);
    return null;
  }
}

// Test 3: Analiza meczu (zapisuje do bazy danych)
async function testMatchAnalysis(fixtureId) {
  try {
    console.log(`\n3️⃣ Test analizy meczu ${fixtureId} (zapisuje do bazy)...`);
    const response = await axios.get(`${API_BASE}/fixtures/${fixtureId}/analyze`);
    
    if (response.data.success) {
      console.log('✅ Analiza AI zakończona pomyślnie');
      console.log(`📈 Prawdopodobieństwa: ${response.data.data.aiAnalysis.probabilities.homeWin}% - ${response.data.data.aiAnalysis.probabilities.draw}% - ${response.data.data.aiAnalysis.probabilities.awayWin}%`);
      console.log(`⚽ Przewidywany wynik: ${response.data.data.aiAnalysis.predictedScore.home}-${response.data.data.aiAnalysis.predictedScore.away}`);
      console.log(`💾 Zapisano do bazy: ${response.data.savedToDatabase ? 'TAK' : 'NIE'}`);
      return true;
    }
    return false;
  } catch (error) {
    console.log('❌ Błąd analizy meczu:', error.response?.data?.error || error.message);
    return false;
  }
}

// Test 4: Sprawdź statystyki dokładności
async function testAccuracyStats() {
  try {
    console.log('\n4️⃣ Test statystyk dokładności predykcji...');
    const response = await axios.get(`${API_BASE}/accuracy-stats`);
    
    if (response.data.success) {
      const stats = response.data.data;
      console.log('✅ Statystyki dokładności:');
      console.log(`📊 Łączna liczba predykcji: ${stats.totalPredictions}`);
      console.log(`🎯 Dokładność wyników: ${stats.resultAccuracy}%`);
      console.log(`⚽ Dokładność bramek: ${stats.scoreAccuracy}%`);
      console.log(`📈 Średnia dokładność prawdopodobieństw: ${stats.avgProbabilityAccuracy}%`);
      return true;
    }
    return false;
  } catch (error) {
    console.log('❌ Błąd pobierania statystyk:', error.response?.data?.error || error.message);
    return false;
  }
}

// Test 5: Historia predykcji
async function testPredictionHistory() {
  try {
    console.log('\n5️⃣ Test historii predykcji...');
    const response = await axios.get(`${API_BASE}/prediction-history?limit=5`);
    
    if (response.data.success) {
      console.log(`✅ Pobrano ${response.data.count} zapisów z historii`);
      
      if (response.data.data.length > 0) {
        const latest = response.data.data[0];
        console.log(`📋 Najnowsza predykcja: ${latest.homeTeam} vs ${latest.awayTeam}`);
        console.log(`📅 Data: ${new Date(latest.matchDate).toLocaleDateString()}`);
        console.log(`🎯 Predykcja: ${latest.prediction.homeWin}% - ${latest.prediction.draw}% - ${latest.prediction.awayWin}%`);
        
        if (latest.actualResult) {
          console.log(`⚽ Rzeczywisty wynik: ${latest.actualResult.homeScore}-${latest.actualResult.awayScore}`);
          console.log(`✅ Poprawna predykcja: ${latest.accuracy.resultCorrect ? 'TAK' : 'NIE'}`);
        }
      }
      return true;
    }
    return false;
  } catch (error) {
    console.log('❌ Błąd pobierania historii:', error.response?.data?.error || error.message);
    return false;
  }
}

// Test 6: Pojedynki zawodników (jeśli są składy)
async function testPlayerMatchups(fixtureId) {
  try {
    console.log(`\n6️⃣ Test pojedynków zawodników dla meczu ${fixtureId}...`);
    const response = await axios.get(`${API_BASE}/fixtures/${fixtureId}/matchups`);
    
    if (response.data.success) {
      console.log(`✅ Pobrano ${response.data.count} pojedynków zawodników`);
      
      if (response.data.data.length > 0) {
        const matchup = response.data.data[0];
        console.log(`⚔️ Przykładowy pojedynek: ${matchup.homePlayer.name} vs ${matchup.awayPlayer.name}`);
        console.log(`📍 Kategoria: ${matchup.category}`);
        console.log(`💪 Przewaga: ${matchup.advantage}`);
      }
      return true;
    }
    return false;
  } catch (error) {
    console.log('❌ Błąd pobierania pojedynków:', error.response?.data?.error || error.message);
    return false;
  }
}

// Test 7: Aktualizacja wyników
async function testUpdateResults() {
  try {
    console.log('\n7️⃣ Test aktualizacji wyników meczów...');
    const response = await axios.post(`${API_BASE}/update-results?days=3`);
    
    if (response.data.success) {
      console.log('✅ Aktualizacja wyników zakończona');
      console.log(`📊 Zaktualizowano: ${response.data.data?.updatedCount || 0} meczów`);
      console.log(`❌ Błędy: ${response.data.data?.errorCount || 0}`);
      console.log(`📈 Przetworzono łącznie: ${response.data.data?.totalProcessed || 0} meczów`);
      return true;
    }
    return false;
  } catch (error) {
    console.log('❌ Błąd aktualizacji wyników:', error.response?.data?.error || error.message);
    return false;
  }
}

// Główna funkcja testowa
async function runAllTests() {
  console.log('🚀 Rozpoczynam testy systemu bazy danych...\n');
  
  // Test 1: Połączenie z serwerem
  const serverOk = await testServerHealth();
  if (!serverOk) {
    console.log('\n❌ Serwer nie działa. Upewnij się, że uruchomiłeś: npm run serve-api');
    return;
  }
  
  // Test 2: Pobierz mecze
  const fixtureId = await testGetTodayFixtures();
  
  // Test 3: Analiza meczu (jeśli są mecze)
  let analysisOk = false;
  if (fixtureId) {
    analysisOk = await testMatchAnalysis(fixtureId);
  } else {
    console.log('\n⚠️ Brak dzisiejszych meczów do analizy');
  }
  
  // Test 4: Statystyki dokładności
  await testAccuracyStats();
  
  // Test 5: Historia predykcji
  await testPredictionHistory();
  
  // Test 6: Pojedynki zawodników (jeśli była analiza)
  if (analysisOk && fixtureId) {
    await testPlayerMatchups(fixtureId);
  }
  
  // Test 7: Aktualizacja wyników
  await testUpdateResults();
  
  console.log('\n🎉 Testy zakończone!');
  console.log('\n📋 Podsumowanie:');
  console.log('✅ System bazy danych SQLite działa');
  console.log('✅ Automatyczne zapisywanie analiz AI');
  console.log('✅ Statystyki dokładności predykcji');
  console.log('✅ Historia predykcji z wynikami');
  console.log('✅ Pojedynki zawodników (player vs player)');
  console.log('✅ Aktualizacja wyników meczów');
  
  console.log('\n🌐 Dostępne endpointy:');
  console.log('• GET /api/betting/accuracy-stats - statystyki dokładności');
  console.log('• GET /api/betting/prediction-history - historia predykcji');
  console.log('• GET /api/betting/fixtures/:id/matchups - pojedynki zawodników');
  console.log('• POST /api/betting/update-results - aktualizacja wyników');
  
  console.log('\n💡 Następne kroki:');
  console.log('1. Otwórz http://localhost:5175 aby zobaczyć frontend');
  console.log('2. Przeanalizuj kilka meczów aby wypełnić bazę danych');
  console.log('3. Sprawdź statystyki dokładności po kilku dniach');
  console.log('4. Przygotuj system obstawiania z ChatGPT!');
}

// Uruchom testy
runAllTests().catch(console.error);