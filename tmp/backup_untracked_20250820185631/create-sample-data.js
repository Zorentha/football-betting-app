import { databaseService } from './src/services/databaseService.js';

async function main() {
  try {
    console.log('🔧 Inicjalizuję bazę danych...');
    await databaseService.initialize();

    const fixtureId = 999999; // przykładowe ID testowe

    // Przykladowe drużyny
    const homeTeam = { id: 1001, name: 'Test City' };
    const awayTeam = { id: 2002, name: 'Test United' };
    const league = { id: 55, name: 'Test League' };

    // Przykładowa forma (ostatnie 5 meczów)
    const homeForm = [
      { result: 'W', goalsFor: 3, goalsAgainst: 1, opponent: 'A', venue: 'H' },
      { result: 'W', goalsFor: 2, goalsAgainst: 0, opponent: 'B', venue: 'H' },
      { result: 'D', goalsFor: 1, goalsAgainst: 1, opponent: 'C', venue: 'A' },
      { result: 'L', goalsFor: 0, goalsAgainst: 1, opponent: 'D', venue: 'A' },
      { result: 'W', goalsFor: 2, goalsAgainst: 1, opponent: 'E', venue: 'H' }
    ];

    const awayForm = [
      { result: 'L', goalsFor: 0, goalsAgainst: 2, opponent: 'F', venue: 'A' },
      { result: 'D', goalsFor: 1, goalsAgainst: 1, opponent: 'G', venue: 'H' },
      { result: 'W', goalsFor: 2, goalsAgainst: 1, opponent: 'H', venue: 'A' },
      { result: 'L', goalsFor: 0, goalsAgainst: 3, opponent: 'I', venue: 'A' },
      { result: 'D', goalsFor: 1, goalsAgainst: 1, opponent: 'J', venue: 'H' }
    ];

    // Potwierdzone składy (startXI) - minimalne uproszczenie dla testu
    const homeStartXI = [
      { player: { id: 1, name: 'Home GK', pos: 'G' } },
      { player: { id: 2, name: 'Home RB', pos: 'RB' } },
      { player: { id: 3, name: 'Home CB1', pos: 'CB' } },
      { player: { id: 4, name: 'Home CB2', pos: 'CB' } },
      { player: { id: 5, name: 'Home LB', pos: 'LB' } },
      { player: { id: 6, name: 'Home DM', pos: 'DM' } },
      { player: { id: 7, name: 'Home CM1', pos: 'CM' } },
      { player: { id: 8, name: 'Home CM2', pos: 'CM' } },
      { player: { id: 9, name: 'Home RW', pos: 'RW' } },
      { player: { id: 10, name: 'Home ST', pos: 'ST' } },
      { player: { id: 11, name: 'Home LW', pos: 'LW' } }
    ];

    const awayStartXI = [
      { player: { id: 21, name: 'Away GK', pos: 'G' } },
      { player: { id: 22, name: 'Away RB', pos: 'RB' } },
      { player: { id: 23, name: 'Away CB1', pos: 'CB' } },
      { player: { id: 24, name: 'Away CB2', pos: 'CB' } },
      { player: { id: 25, name: 'Away LB', pos: 'LB' } },
      { player: { id: 26, name: 'Away DM', pos: 'DM' } },
      { player: { id: 27, name: 'Away CM1', pos: 'CM' } },
      { player: { id: 28, name: 'Away CM2', pos: 'CM' } },
      { player: { id: 29, name: 'Away RW', pos: 'RW' } },
      { player: { id: 30, name: 'Away ST', pos: 'ST' } },
      { player: { id: 31, name: 'Away LW', pos: 'LW' } }
    ];

    // Lineups entries resembling API structure (team.id + startXI + confirmed)
    const lineups = [
      { team: { id: homeTeam.id }, startXI: homeStartXI, confirmed: true },
      { team: { id: awayTeam.id }, startXI: awayStartXI, confirmed: true }
    ];

    // Team players season stats (minimalny przykład)
    const teamPlayersHome = homeStartXI.map(p => ({
      player: { id: p.player.id, name: p.player.name },
      statistics: [{
        games: { appearences: 10, position: p.player.pos, minutes: 900, rating: '7.2' },
        goals: { total: p.player.pos === 'ST' ? 6 : 0, assists: 1 },
        passes: { total: 100, accuracy: 85 },
        tackles: { total: 5 }
      }]
    }));

    const teamPlayersAway = awayStartXI.map(p => ({
      player: { id: p.player.id, name: p.player.name },
      statistics: [{
        games: { appearences: 12, position: p.player.pos, minutes: 1100, rating: '6,8' },
        goals: { total: p.player.pos === 'ST' ? 4 : 0, assists: 2 },
        passes: { total: 90, accuracy: 82 },
        tackles: { total: 6 }
      }]
    }));

    // Player matchups (derived)
    const playerMatchups = [
      { category: '🧤 Bramkarz vs Napastnik', homePlayer: 'Home GK (G)', awayPlayer: 'Away ST (ST)', description: 'Home GK will face Away ST' },
      { category: '🔰 Obrona vs Atak', homePlayer: 'Home CB1 (CB)', awayPlayer: 'Away ST (ST)', description: 'Center back vs striker' }
    ];

    // Save match
    console.log('💾 Zapisuję mecz do bazy...');
    await databaseService.saveMatch({
      fixture: { id: fixtureId, date: new Date().toISOString(), venue: { name: 'Test Stadium' }, status: { short: 'NS' } },
      teams: { home: homeTeam, away: awayTeam },
      league
    });

    // Save team form
    console.log('📊 Zapisuję formę drużyn...');
    await databaseService.saveTeamForm(fixtureId, homeTeam, awayTeam, homeForm, awayForm);

    // Save player matchups
    console.log('⚔️ Zapisuję pojedynki zawodników...');
    // Transform playerMatchups into expected structure used by savePlayerMatchups (homePlayer/awayPlayer strings)
    const matchupsForDb = playerMatchups.map(m => ({
      category: m.category,
      homePlayer: m.homePlayer,
      awayPlayer: m.awayPlayer,
      description: m.description
    }));
    await databaseService.savePlayerMatchups(fixtureId, matchupsForDb);

    // Save player season stats
    console.log('📈 Zapisuję statystyki sezonowe zawodników (home)...');
    await databaseService.savePlayerSeasonStats(teamPlayersHome, homeTeam.id, homeTeam.name);

    console.log('📈 Zapisuję statystyki sezonowe zawodników (away)...');
    await databaseService.savePlayerSeasonStats(teamPlayersAway, awayTeam.id, awayTeam.name);

    // Save a prediction (using fallback-like structure)
    const prediction = {
      probabilities: { homeWin: 60, draw: 20, awayWin: 20 },
      predictedScore: { home: 2, away: 1 },
      confidence: 'medium',
      keyFactors: ['Home better form', 'Away fragile defense'],
      bettingTips: [{ type: 'Wygrana Test City', probability: 60, reasoning: 'Forma gospodarzy' }]
    };

    console.log('🔮 Zapisuję przykładową predykcję...');
    await databaseService.savePrediction(fixtureId, prediction);

    console.log('✅ Sample dane zostały dodane do bazy.');

    // Close DB
    await databaseService.close();
    console.log('🔚 Gotowe.');
  } catch (err) {
    console.error('❌ Błąd w create-sample-data:', err);
  }
}

main();
