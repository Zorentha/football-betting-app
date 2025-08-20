import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { FootballDataService } from './src/services/footballDataService.js';
import { createBettingRoutes } from './src/routes/bettingRoutes.js';
import { databaseService } from './src/services/databaseService.js';
import { openaiAnalysisService } from './src/services/openaiAnalysisService.js';

console.log('Environment variables:', {
  API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY ? 'SET' : 'NOT SET',
  API_FOOTBALL_BASE_URL: process.env.API_FOOTBALL_BASE_URL,
  PORT: process.env.PORT
});

// Tworzymy instancję po załadowaniu zmiennych środowiskowych
const footballDataService = new FootballDataService();
const bettingRoutes = createBettingRoutes(footballDataService);

const app = express();
const PORT = process.env.PORT || 3001;

// Inicjalizuj bazę danych
async function initializeDatabase() {
  try {
    await databaseService.initialize();
    console.log('🗄️ Baza danych gotowa');
  } catch (error) {
    console.error('❌ Błąd inicjalizacji bazy danych:', error);
    console.error('⚠️ Aplikacja będzie działać bez bazy danych');
    // Nie przerywamy - aplikacja może działać bez bazy
  }
}

// Inicjalizuj bazę przy starcie
await initializeDatabase();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/betting', bettingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

 // Cron job - aktualizacja danych co 10 minut
cron.schedule('*/10 * * * *', async () => {
  console.log('Aktualizacja danych meczowych...');
  try {
    await footballDataService.updateUpcomingFixtures();
    console.log('Dane zaktualizowane pomyślnie');
  } catch (error) {
    console.error('Błąd podczas aktualizacji danych:', error);
  }
});

/*
  Cron: aktualizacja wyników zakończonych meczów — teraz oparta na meczach,
  które mamy zapisane w bazie (z predykcjami), zamiast pobierać tylko z "ważnych lig".
*/
cron.schedule('*/10 * * * *', async () => {
  console.log('🔄 Cron: aktualizacja wyników zakończonych meczów (z bazy predykcji)...');
  try {
    // Pobierz mecze, dla których mamy zapisane predykcje w bazie
    const matchesWithPredictions = await databaseService.getMatchesWithPredictions(500);
    if (!matchesWithPredictions || matchesWithPredictions.length === 0) {
      console.log('Cron: brak meczów z predykcjami do zaktualizowania');
      return;
    }

    let updatedCount = 0;
    for (const m of matchesWithPredictions) {
      try {
        const fixtureId = m.fixture_id || m.fixtureId || m.fixtureId;
        if (!fixtureId) continue;

        // Pobierz aktualny status meczu z API (nie filtrujemy po "ważnych ligach")
        const matchData = await footballDataService.getFixtureById(fixtureId);
        if (!matchData) continue;

        if (matchData.fixture && matchData.fixture.status && matchData.fixture.status.short === 'FT') {
          // Zapisz wynik do bazy (saveMatchResult obsługuje kalkulacje dokładności)
          const saved = await databaseService.saveMatchResult(fixtureId, matchData);
          if (saved) {
            updatedCount++;
            console.log(`Cron: zapisano wynik meczu ${fixtureId}`);
          }
        }
      } catch (err) {
        console.error(`Cron: błąd przetwarzania meczu ${m.fixture_id || m.fixtureId}:`, err.message || err);
      }
    }

    console.log(`Cron: zakończono aktualizację wyników. Zaktualizowano: ${updatedCount}`);
  } catch (error) {
    console.error('Cron: błąd podczas aktualizacji wyników:', error);
  }
});

 // Cron job — sprawdź składy i uruchom analizę AI tylko gdy składy są potwierdzone.
 // Reguła: sprawdzaj co 10 minut mecze rozpoczynające się w ciągu najbliższych 30 minut.
cron.schedule('*/10 * * * *', async () => {
  console.log('🔁 Cron: sprawdzam składy dla meczów rozpoczynających się w ciągu 30 minut (uruchamiam analizę AI tylko gdy składy potwierdzone)...');
  try {
    const fixtures = await footballDataService.getUpcomingFixtures();
    const now = new Date();

    for (const f of fixtures) {
      const fixtureId = f?.fixture?.id || f?.fixture_id;
      if (!fixtureId) continue;

      const start = new Date(f.fixture.date);
      const diffMs = start - now;

      // Rozpoczynamy sprawdzanie od 30 minut przed meczem do momentu kick-off (<=30min && >=0)
      if (diffMs <= 30 * 60 * 1000 && diffMs >= 0) {
        try {
          // Jeśli mamy już zapisaną predykcję dla tego meczu — pomiń (unikaj duplikatów)
          let existing = null;
          try {
            if (databaseService.db) {
              existing = await databaseService.db.get('SELECT id FROM match_predictions WHERE fixture_id = ?', [fixtureId]);
            }
          } catch (e) {
            console.warn('Cron: błąd przy sprawdzaniu istniejącej predykcji:', e.message || e);
          }
          if (existing && existing.id) {
            console.log(`Cron: predykcja już istnieje dla fixture ${fixtureId} — pomijam`);
            continue;
          }

          // Pobierz składy i sprawdź czy są potwierdzone
          const lineups = await footballDataService.getFixtureLineups(fixtureId);
          const hasConfirmed = openaiAnalysisService.hasConfirmedLineups(lineups);

          if (!hasConfirmed) {
            console.log(`Cron: składy niepotwierdzone dla ${fixtureId} — sprawdzę ponownie przy następnym cyklu`);
            continue;
          }

          console.log(`Cron: składy potwierdzone dla ${fixtureId} — pobieram pełne dane i uruchamiam analizę AI`);
          const matchData = await footballDataService.getCompleteMatchData(fixtureId);
          if (!matchData) {
            console.warn(`Cron: brak pełnych danych meczu ${fixtureId} (pomijam)`);
            continue;
          }

          try {
            await openaiAnalysisService.analyzeMatch(
              matchData.teams.home,
              matchData.teams.away,
              matchData.teamForm.home,
              matchData.teamForm.away,
              matchData.lineups,
              matchData.players,
              matchData.teamPlayers,
              matchData.weather,
              fixtureId
            );
            console.log(`Cron: analiza AI zakończona dla meczu ${fixtureId}`);
          } catch (err) {
            console.error(`Cron: błąd analizy AI dla meczu ${fixtureId}:`, err.message || err);
          }
        } catch (innerErr) {
          console.error(`Cron: błąd przetwarzania meczu ${fixtureId}:`, innerErr.message || innerErr);
        }
      }
    }
  } catch (err) {
    console.error('Cron: błąd podczas sprawdzania składów dla analiz:', err.message || err);
  }
});

 // Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Zamykanie aplikacji...');
  try {
    await databaseService.close();
    console.log('✅ Baza danych zamknięta');
  } catch (error) {
    console.error('❌ Błąd zamykania bazy:', error);
  }
  process.exit(0);
});

// Global error handlers - zapobiegają zamknięciu procesu przy nieobsłużonych błędach z zewnętrznych serwisów (OpenAI itp.)
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Nieobsłużony błąd obietnicy (unhandledRejection):', reason);
  // Nie zamykamy procesu automatycznie w środowisku deweloperskim - logujemy i kontynuujemy.
});

process.on('uncaughtException', (err) => {
  console.error('❌ Nieobsłużony wyjątek (uncaughtException):', err);
  // Próba zamknięcia zasobów; w produkcji warto rozważyć restart procesu.
  try {
    if (databaseService && typeof databaseService.close === 'function') {
      databaseService.close().catch(e => console.error('❌ Błąd podczas zamykania bazy po uncaughtException:', e));
    }
  } catch (e) {
    console.error('❌ Błąd podczas obsługi uncaughtException:', e);
  }
});

/*
  Start server with retry when port is already in use.
  This wraps app.listen in a Promise and attempts to start on the next ports
  (PORT, PORT+1, ...) up to `maxAttempts`.
*/
function startServerOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);
    server.on('listening', () => {
      console.log(`🚀 Serwer działa na porcie ${port}`);
      console.log(`📊 API Football połączone`);
      console.log(`💾 Baza danych SQLite zainicjalizowana`);
      resolve(server);
    });
    server.on('error', (err) => {
      reject({ err, port, server });
    });
  });
}

(async () => {
  const basePort = Number(PORT) || 3001;
  const maxAttempts = 10;
  let currentPort = basePort;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await startServerOnPort(currentPort);
      // Successfully started
      break;
    } catch (payload) {
      const { err, port } = payload;
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`⚠️ Port ${port} zajęty. Pr próbuję następnego portu...`);
        currentPort = port + 1;
        // small delay before retry
        await new Promise(r => setTimeout(r, 250));
        continue;
      } else {
        console.error('❌ Nieoczekiwany błąd podczas uruchamiania serwera:', err);
        process.exit(1);
      }
    }
  }

  // If after attempts server not started, inform and exit
  try {
    // verify if server is listening by trying to bind ephemeral check
    // (if we reached this point without breaking, assume failure)
    // Note: If server successfully started above, we already broke the loop.
    // Otherwise, exit with failure after logging.
    // Find open port attempt: if currentPort >= basePort + maxAttempts -> failure
    if (currentPort >= basePort + maxAttempts) {
      console.error(`❌ Nie udało się uruchomić serwera na portach ${basePort}..${basePort + maxAttempts - 1}`);
      process.exit(1);
    }
  } catch (e) {
    console.error('❌ Błąd sprawdzania stanu serwera:', e);
    process.exit(1);
  }
})();
