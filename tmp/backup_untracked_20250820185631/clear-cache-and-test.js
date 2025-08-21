// Wyczyść cache i przetestuj zapisywanie
import axios from 'axios';

async function clearCacheAndTest() {
  try {
    console.log('🧹 Czyszczenie cache i test zapisywania...\n');
    
    // Restart serwera aby wyczyścić cache w pamięci
    console.log('🔄 Restartuj serwer aby wyczyścić cache');
    console.log('Naciśnij Enter gdy serwer będzie gotowy...');
    
    // Poczekaj na input użytkownika
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', async () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      
      console.log('\\n🧪 Testuję analizę po restarcie...');
      
      try {
        const response = await axios.get('http://localhost:3001/api/betting/fixtures/1380412/analyze');
        
        if (response.data.success) {
          console.log('✅ Analiza zakończona');
          console.log(`🔮 Predykcja: ${response.data.data.aiAnalysis.predictedScore.home}-${response.data.data.aiAnalysis.predictedScore.away}`);
          console.log(`💾 Zapisano do bazy: ${response.data.savedToDatabase}`);
        } else {
          console.log('❌ Błąd analizy:', response.data.error);
        }
      } catch (error) {
        console.error('❌ Błąd połączenia:', error.message);
      }
      
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Błąd:', error);
  }
}

clearCacheAndTest();