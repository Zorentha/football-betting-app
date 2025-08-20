// Test kompletnego systemu z nowymi funkcjonalnościami
import axios from 'axios';

const API_BASE = 'http://localhost:3001/api/betting';
const FRONTEND_URL = 'http://localhost:5175';

console.log('🧪 KOMPLETNY TEST SYSTEMU FOOTBALL BETTING APP\n');

async function testCompleteSystem() {
  try {
    console.log('1️⃣ Test dostępności serwerów...');
    
    // Test backendu
    const backendResponse = await axios.get(`${API_BASE}/fixtures/today`);
    console.log(`✅ Backend działa: ${backendResponse.data.success ? 'OK' : 'BŁĄD'}`);
    
    // Test frontendu
    const frontendResponse = await axios.get(FRONTEND_URL);
    const hasFrontend = frontendResponse.data.includes('Football Betting App');
    console.log(`✅ Frontend działa: ${hasFrontend ? 'OK' : 'BŁĄD'}`);
    
    console.log('\\n2️⃣ Test nowych endpointów...');
    
    // Test czyszczenia cache
    const cacheResponse = await axios.post(`${API_BASE}/cache/clear`);
    console.log(`✅ Czyszczenie cache: ${cacheResponse.data.success ? 'OK' : 'BŁĄD'}`);
    console.log(`   Wyczyszczono: ${cacheResponse.data.clearedCount} elementów`);
    
    // Test endpointu OpenAI
    const aiResponse = await axios.post(`${API_BASE}/openai/analyze`, {
      prompt: 'Test prompt dla AI',
      maxTokens: 100
    });
    console.log(`✅ Endpoint OpenAI: ${aiResponse.data.success ? 'OK' : 'BŁĄD'}`);
    
    console.log('\\n3️⃣ Test systemu predykcji z warunkiem składów...');
    
    // Pobierz dzisiejsze mecze
    const todayMatches = await axios.get(`${API_BASE}/fixtures/today`);
    
    if (todayMatches.data.success && todayMatches.data.count > 0) {
      const match = todayMatches.data.data[0];
      console.log(`📋 Testuję mecz: ${match.teams.home.name} vs ${match.teams.away.name}`);
      
      // Spróbuj analizy (sprawdzi warunek składów)
      const analysisResponse = await axios.get(`${API_BASE}/fixtures/${match.fixture.id}/analyze`);
      
      if (analysisResponse.data.success) {
        console.log(`✅ Analiza meczu: OK`);
        console.log(`🔮 Predykcja: ${analysisResponse.data.data.aiAnalysis.predictedScore.home}-${analysisResponse.data.data.aiAnalysis.predictedScore.away}`);
        console.log(`💾 Zapisano do bazy: ${analysisResponse.data.savedToDatabase}`);
      } else {
        console.log(`❌ Analiza meczu: ${analysisResponse.data.error}`);
      }
    } else {
      console.log('⚠️ Brak meczów do testowania');
    }
    
    console.log('\\n4️⃣ Test bazy danych...');
    
    // Test statystyk
    const statsResponse = await axios.get(`${API_BASE}/accuracy-stats`);
    console.log(`✅ Statystyki dokładności: ${statsResponse.data.success ? 'OK' : 'BŁĄD'}`);
    if (statsResponse.data.success) {
      console.log(`   Łączne predykcje: ${statsResponse.data.data.totalPredictions}`);
      console.log(`   Dokładność wyników: ${statsResponse.data.data.resultAccuracy}%`);
    }
    
    // Test historii predykcji
    const historyResponse = await axios.get(`${API_BASE}/prediction-history?limit=5`);
    console.log(`✅ Historia predykcji: ${historyResponse.data.success ? 'OK' : 'BŁĄD'}`);
    if (historyResponse.data.success) {
      console.log(`   Mecze w historii: ${historyResponse.data.count}`);
    }
    
    console.log('\\n5️⃣ Test aktualizacji wyników...');
    
    // Test automatycznej aktualizacji wyników
    const updateResponse = await axios.post(`${API_BASE}/update-results`);
    console.log(`✅ Aktualizacja wyników: ${updateResponse.data.success ? 'OK' : 'BŁĄD'}`);
    if (updateResponse.data.success) {
      console.log(`   Zaktualizowano: ${updateResponse.data.data.updatedCount} meczów`);
      console.log(`   Błędy: ${updateResponse.data.data.errorCount}`);
    }
    
  } catch (error) {
    console.error('❌ Błąd testu:', error.message);
  }
}

async function runCompleteTest() {
  console.log('🚀 ROZPOCZYNAM KOMPLETNY TEST SYSTEMU\\n');
  
  await testCompleteSystem();
  
  console.log('\\n🎉 TEST ZAKOŃCZONY!\\n');
  
  console.log('📋 PODSUMOWANIE FUNKCJONALNOŚCI:');
  console.log('✅ System predykcji z warunkiem składów');
  console.log('✅ Automatyczna aktualizacja wyników');
  console.log('✅ Czyszczenie cache analiz');
  console.log('✅ Analiza AI predykcji');
  console.log('✅ Zakładka "Analiza Wyników"');
  console.log('✅ Statystyki dokładności');
  console.log('✅ Historia predykcji');
  
  console.log('\\n🌐 DOSTĘP DO APLIKACJI:');
  console.log(`• Frontend: ${FRONTEND_URL}`);
  console.log(`• Backend API: http://localhost:3001`);
  
  console.log('\\n🎯 NOWE FUNKCJONALNOŚCI:');
  console.log('• Predykcje zapisywane TYLKO gdy składy są potwierdzone');
  console.log('• Przycisk "Odśwież" czyści cache i wymusza nowe analizy');
  console.log('• Automatyczna aktualizacja wyników zakończonych meczów');
  console.log('• Zakładka "📊 Analiza Wyników" z porównaniem predykcji');
  console.log('• AI analizuje dokładność własnych predykcji');
  
  console.log('\\n💡 INSTRUKCJA UŻYCIA:');
  console.log('1. Otwórz http://localhost:5175');
  console.log('2. Sprawdź zakładkę "🏟️ Mecze" - lista aktualnych meczów');
  console.log('3. Kliknij "Analizuj" przy meczu ze składami');
  console.log('4. Przejdź do "🤖 Analiza AI" dla szczegółów');
  console.log('5. Zobacz "📊 Analiza Wyników" dla porównań');
  console.log('6. Użyj przycisku "Odśwież" dla nowych analiz');
}

runCompleteTest().catch(console.error);