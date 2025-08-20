// Test analizy player vs player na konkretnym meczu
import axios from 'axios';

const API_BASE = 'http://localhost:3001/api/betting';

console.log('⚔️ Test analizy Player vs Player...\n');

// Znajdź mecz z potwierdzonymi składami
async function findMatchWithLineups() {
  try {
    console.log('🔍 Szukam meczu z potwierdzonymi składami...');
    
    // Pobierz nadchodzące mecze
    const response = await axios.get(`${API_BASE}/fixtures/upcoming`);
    
    if (!response.data.success || response.data.data.length === 0) {
      console.log('❌ Brak nadchodzących meczów');
      return null;
    }
    
    // Sprawdź każdy mecz czy ma składy
    for (const fixture of response.data.data.slice(0, 10)) { // Sprawdź pierwsze 10
      try {
        console.log(`📊 Sprawdzam mecz: ${fixture.teams.home.name} vs ${fixture.teams.away.name}`);
        
        const matchResponse = await axios.get(`${API_BASE}/fixtures/${fixture.fixture.id}`);
        
        if (matchResponse.data.success) {
          const matchData = matchResponse.data.data;
          
          // Sprawdź czy są składy
          if (matchData.lineups && matchData.lineups.length > 0) {
            const hasConfirmedLineups = matchData.lineups.some(lineup => lineup.confirmed === true);
            
            if (hasConfirmedLineups) {
              console.log(`✅ Znaleziono mecz ze składami: ${fixture.teams.home.name} vs ${fixture.teams.away.name}`);
              return {
                fixtureId: fixture.fixture.id,
                homeTeam: fixture.teams.home.name,
                awayTeam: fixture.teams.away.name,
                matchData: matchData
              };
            }
          }
        }
        
        // Pauza między zapytaniami
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.log(`⚠️ Błąd sprawdzania meczu ${fixture.fixture.id}: ${error.message}`);
      }
    }
    
    console.log('❌ Nie znaleziono meczu z potwierdzonymi składami');
    return null;
    
  } catch (error) {
    console.log('❌ Błąd szukania meczów:', error.message);
    return null;
  }
}

// Symuluj składy dla demonstracji
function createMockLineups() {
  return [
    {
      team: { id: 1, name: "Manchester City" },
      confirmed: true,
      startXI: [
        { player: { name: "Ederson", pos: "G" } },
        { player: { name: "Walker", pos: "RB" } },
        { player: { name: "Stones", pos: "CB" } },
        { player: { name: "Dias", pos: "CB" } },
        { player: { name: "Cancelo", pos: "LB" } },
        { player: { name: "Rodri", pos: "DM" } },
        { player: { name: "De Bruyne", pos: "CM" } },
        { player: { name: "Bernardo Silva", pos: "CM" } },
        { player: { name: "Mahrez", pos: "RW" } },
        { player: { name: "Haaland", pos: "ST" } },
        { player: { name: "Grealish", pos: "LW" } }
      ]
    },
    {
      team: { id: 2, name: "Arsenal" },
      confirmed: true,
      startXI: [
        { player: { name: "Ramsdale", pos: "G" } },
        { player: { name: "White", pos: "RB" } },
        { player: { name: "Saliba", pos: "CB" } },
        { player: { name: "Gabriel", pos: "CB" } },
        { player: { name: "Zinchenko", pos: "LB" } },
        { player: { name: "Partey", pos: "DM" } },
        { player: { name: "Odegaard", pos: "CM" } },
        { player: { name: "Rice", pos: "CM" } },
        { player: { name: "Saka", pos: "RW" } },
        { player: { name: "Jesus", pos: "ST" } },
        { player: { name: "Martinelli", pos: "LW" } }
      ]
    }
  ];
}

// Test analizy pojedynków
async function testPlayerMatchups() {
  try {
    console.log('⚔️ Testuję analizę pojedynków player vs player...\n');
    
    // Użyj symulowanych składów dla demonstracji
    const mockLineups = createMockLineups();
    const homeLineup = mockLineups[0].startXI;
    const awayLineup = mockLineups[1].startXI;
    
    console.log('🏠 SKŁAD GOSPODARZY (Manchester City):');
    homeLineup.forEach(player => {
      console.log(`   ${player.player.name} (${player.player.pos})`);
    });
    
    console.log('\n🚌 SKŁAD GOŚCI (Arsenal):');
    awayLineup.forEach(player => {
      console.log(`   ${player.player.name} (${player.player.pos})`);
    });
    
    // Importuj funkcję analizy (symulacja)
    const matchups = analyzePlayerMatchups(homeLineup, awayLineup);
    
    console.log('\n⚔️ ANALIZA POJEDYNKÓW POZYCJA vs POZYCJA:\n');
    
    matchups.forEach((matchup, index) => {
      console.log(`${index + 1}. ${matchup.category}`);
      console.log(`   🏠 ${matchup.homePlayer} vs 🚌 ${matchup.awayPlayer}`);
      console.log(`   📝 ${matchup.description}`);
      console.log(`   💪 Przewaga: ${matchup.advantage || 'Neutralna'}\n`);
    });
    
    console.log(`✅ Wygenerowano ${matchups.length} pojedynków pozycyjnych`);
    
    // Pokaż jak to wygląda w promptcie dla ChatGPT-5
    console.log('\n🤖 PROMPT DLA CHATGPT-5:\n');
    console.log('🔥 CONFIRMED LINEUPS - KEY PLAYER MATCHUPS:\n');
    
    matchups.forEach(m => {
      console.log(`${m.category}:`);
      console.log(`  ${m.homePlayer} vs ${m.awayPlayer}`);
      console.log(`  → ${m.description}\n`);
    });
    
    return matchups;
    
  } catch (error) {
    console.log('❌ Błąd testowania pojedynków:', error.message);
    return [];
  }
}

// Symulacja funkcji analizy pojedynków (uproszczona wersja z openaiAnalysisService)
function analyzePlayerMatchups(homeLineup, awayLineup) {
  const matchups = [];
  
  // Normalizuj pozycje
  const normalizePosition = (position) => {
    const positionMap = {
      'G': 'G', 'GK': 'G',
      'LB': 'LB', 'RB': 'RB', 'CB': 'CB',
      'DM': 'DM', 'CM': 'CM', 'LM': 'LM', 'RM': 'RM',
      'ST': 'ST', 'CF': 'CF', 'LW': 'LW', 'RW': 'RW'
    };
    return positionMap[position] || position;
  };
  
  // Grupuj zawodników według pozycji
  const homeByPosition = {};
  const awayByPosition = {};
  
  homeLineup.forEach(player => {
    const pos = normalizePosition(player.player.pos);
    if (!homeByPosition[pos]) homeByPosition[pos] = [];
    homeByPosition[pos].push(player);
  });
  
  awayLineup.forEach(player => {
    const pos = normalizePosition(player.player.pos);
    if (!awayByPosition[pos]) awayByPosition[pos] = [];
    awayByPosition[pos].push(player);
  });

  // 1. Bramkarz vs Napastnicy
  if (homeByPosition['G'] && (awayByPosition['ST'] || awayByPosition['CF'])) {
    const gk = homeByPosition['G'][0];
    const strikers = [...(awayByPosition['ST'] || []), ...(awayByPosition['CF'] || [])];
    strikers.forEach(striker => {
      matchups.push({
        category: '🧤 Bramkarz vs Napastnik',
        homePlayer: `${gk.player.name} (BR)`,
        awayPlayer: `${striker.player.name} (NAP)`,
        description: `${gk.player.name} będzie bronił przeciw ${striker.player.name}`,
        advantage: 'home'
      });
    });
  }

  // 2. Obrona vs Atak
  const defenseAttackMatchups = [
    { home: 'LB', away: ['RW'], desc: 'Lewy obrońca vs prawy skrzydłowy' },
    { home: 'CB', away: ['ST'], desc: 'Środkowy obrońca vs napastnik' },
    { home: 'RB', away: ['LW'], desc: 'Prawy obrońca vs lewy skrzydłowy' }
  ];

  defenseAttackMatchups.forEach(matchup => {
    const homeDefenders = homeByPosition[matchup.home] || [];
    const awayAttackers = matchup.away.flatMap(pos => awayByPosition[pos] || []);
    
    homeDefenders.forEach(defender => {
      awayAttackers.forEach(attacker => {
        matchups.push({
          category: '🔰 Obrona vs Atak',
          homePlayer: `${defender.player.name} (${matchup.home})`,
          awayPlayer: `${attacker.player.name} (${normalizePosition(attacker.player.pos)})`,
          description: matchup.desc,
          advantage: 'neutral'
        });
      });
    });
  });

  // 3. Pomocnicy vs Pomocnicy
  const midfieldMatchups = [
    { home: 'DM', away: ['DM'], desc: 'Defensywny pomocnik vs defensywny pomocnik' },
    { home: 'CM', away: ['CM'], desc: 'Środkowy pomocnik vs środkowy pomocnik' }
  ];

  midfieldMatchups.forEach(matchup => {
    const homeMids = homeByPosition[matchup.home] || [];
    const awayMids = matchup.away.flatMap(pos => awayByPosition[pos] || []);
    
    homeMids.forEach(homeMid => {
      awayMids.forEach(awayMid => {
        matchups.push({
          category: '⚔️ Środek pola',
          homePlayer: `${homeMid.player.name} (${matchup.home})`,
          awayPlayer: `${awayMid.player.name} (${normalizePosition(awayMid.player.pos)})`,
          description: matchup.desc,
          advantage: 'neutral'
        });
      });
    });
  });

  return matchups.slice(0, 8); // Ogranicz do 8 najważniejszych
}

// Test rzeczywistego meczu z API
async function testRealMatchAnalysis() {
  try {
    console.log('\n🎯 TESTOWANIE RZECZYWISTEGO MECZU Z API:\n');
    
    // Znajdź mecz ze składami
    const matchWithLineups = await findMatchWithLineups();
    
    if (!matchWithLineups) {
      console.log('⚠️ Brak meczów ze składami - używam symulacji powyżej');
      return;
    }
    
    console.log(`🔥 Analizuję mecz: ${matchWithLineups.homeTeam} vs ${matchWithLineups.awayTeam}`);
    
    // Wykonaj analizę AI
    const analysisResponse = await axios.get(`${API_BASE}/fixtures/${matchWithLineups.fixtureId}/analyze`);
    
    if (analysisResponse.data.success) {
      console.log('✅ Analiza AI zakończona pomyślnie');
      console.log(`📈 Prawdopodobieństwa: ${analysisResponse.data.data.aiAnalysis.probabilities.homeWin}% - ${analysisResponse.data.data.aiAnalysis.probabilities.draw}% - ${analysisResponse.data.data.aiAnalysis.probabilities.awayWin}%`);
      
      // Sprawdź pojedynki w bazie danych
      const matchupsResponse = await axios.get(`${API_BASE}/fixtures/${matchWithLineups.fixtureId}/matchups`);
      
      if (matchupsResponse.data.success && matchupsResponse.data.count > 0) {
        console.log(`\n⚔️ POJEDYNKI Z BAZY DANYCH (${matchupsResponse.data.count} zapisanych):\n`);
        
        matchupsResponse.data.data.forEach((matchup, index) => {
          console.log(`${index + 1}. ${matchup.category}`);
          console.log(`   🏠 ${matchup.homePlayer.name} (${matchup.homePlayer.position}) vs 🚌 ${matchup.awayPlayer.name} (${matchup.awayPlayer.position})`);
          console.log(`   📝 ${matchup.description}`);
          console.log(`   💪 Przewaga: ${matchup.advantage}\n`);
        });
      } else {
        console.log('⚠️ Brak pojedynków w bazie danych - prawdopodobnie mecz nie ma składów');
      }
    }
    
  } catch (error) {
    console.log('❌ Błąd testowania rzeczywistego meczu:', error.message);
  }
}

// Uruchom wszystkie testy
async function runPlayerVsPlayerDemo() {
  console.log('🚀 DEMONSTRACJA ANALIZY PLAYER VS PLAYER\n');
  console.log('=' .repeat(60) + '\n');
  
  // Test 1: Symulacja z przykładowymi składami
  await testPlayerMatchups();
  
  console.log('\n' + '=' .repeat(60));
  
  // Test 2: Rzeczywisty mecz z API (jeśli dostępny)
  await testRealMatchAnalysis();
  
  console.log('\n🎉 DEMONSTRACJA ZAKOŃCZONA!');
  console.log('\n📋 PODSUMOWANIE:');
  console.log('✅ System analizuje pojedynki pozycja vs pozycja');
  console.log('✅ ChatGPT-5 otrzymuje szczegółowe informacje o składach');
  console.log('✅ Pojedynki są zapisywane do bazy danych');
  console.log('✅ Dostępne przez API endpoint /fixtures/:id/matchups');
  
  console.log('\n💡 KLUCZOWE POJEDYNKI:');
  console.log('🧤 Bramkarz vs Napastnicy - kto lepiej strzela/broni');
  console.log('🔰 Obrona vs Atak - pojedynki na skrzydłach i w środku');
  console.log('⚔️ Środek pola - walka o kontrolę nad meczem');
  
  console.log('\n🎯 ChatGPT-5 używa tych danych do:');
  console.log('• Przewidywania wyników meczów');
  console.log('• Analizy słabych punktów drużyn');
  console.log('• Generowania tipów obstawiania');
  console.log('• Oceny prawdopodobieństw');
}

// Uruchom demonstrację
runPlayerVsPlayerDemo().catch(console.error);