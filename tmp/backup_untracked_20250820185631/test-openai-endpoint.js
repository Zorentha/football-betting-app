// Test endpointu OpenAI
import axios from 'axios';

async function testOpenAI() {
  try {
    const response = await axios.post('http://localhost:3001/api/betting/openai/analyze', {
      prompt: 'Przeanalizuj tę predykcję: Mecz A vs B, predykcja 1-0, rzeczywisty wynik 2-1',
      maxTokens: 200
    });
    
    console.log('✅ Endpoint OpenAI działa');
    console.log('Odpowiedź:', response.data.response.substring(0, 100) + '...');
    
  } catch (error) {
    console.error('❌ Błąd endpointu OpenAI:', error.response?.data || error.message);
  }
}

testOpenAI();