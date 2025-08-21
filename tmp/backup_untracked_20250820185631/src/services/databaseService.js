import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseService {
  constructor() {
    this.db = null;
  }

  // Inicjalizuj bazę danych
  async initialize() {
    try {
      // Utwórz folder database jeśli nie istnieje
      const dbDir = path.join(__dirname, '../../database');
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Otwórz bazę danych
      this.db = await open({
        filename: path.join(dbDir, 'football_betting.db'),
        driver: sqlite3.Database
      });

      // Wykonaj schema
      const schemaPath = path.join(dbDir, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await this.db.exec(schema);
        console.log('✅ Baza danych zainicjalizowana');

        // Cleanup any existing duplicate predictions: keep only the latest prediction per fixture
        try {
          await this.db.exec(`
            DELETE FROM match_predictions
            WHERE id NOT IN (
              SELECT max_id FROM (
                SELECT MAX(id) AS max_id
                FROM match_predictions
                GROUP BY fixture_id
              )
            );
          `);
          // Ensure a unique index on fixture_id exists so future duplicates are prevented at DB level
          await this.db.exec(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_predictions_fixture_id
            ON match_predictions(fixture_id);
          `);
          // Ensure prediction_accuracy has at most one row per fixture_id so upserts behave correctly.
          await this.db.exec(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_prediction_accuracy_fixture
            ON prediction_accuracy(fixture_id);
          `);
          console.log('🧹 Usunięto duplikaty predykcji i zapewniono unikalne indeksy (predictions & prediction_accuracy)');
        } catch (cleanupErr) {
          console.warn('⚠️ Nie udało się wykonać czyszczenia duplikatów predykcji lub utworzenia indeksów:', cleanupErr.message);
        }

      } else {
        throw new Error('Plik schema.sql nie został znaleziony');
      }

      return this.db;
    } catch (error) {
      console.error('❌ Błąd inicjalizacji bazy danych:', error);
      throw error;
    }
  }

  // Sprawdź czy baza jest połączona
  isConnected() {
    return this.db !== null;
  }

  // Zamknij połączenie z bazą
  async close() {
    if (this.db) {
      await this.db.close();
      this.db = null;
      console.log('🔒 Połączenie z bazą danych zamknięte');
    }
  }

  // Metoda pomocnicza do obsługi błędów
  handleError(operation, error) {
    console.error(`❌ BŁĄD BAZY DANYCH podczas ${operation}:`, error);
    console.error(`❌ Stack trace:`, error.stack);
    // Nie rzucamy błędu - graceful degradation
    return null;
  }

  // Metoda pomocnicza do walidacji danych
  validateFixtureId(fixtureId) {
    if (!fixtureId || isNaN(fixtureId)) {
      throw new Error('Nieprawidłowy fixture_id');
    }
    return parseInt(fixtureId);
  }

  // Zapisz mecz do bazy
  async saveMatch(matchData) {
    if (!this.isConnected()) {
      return this.handleError('zapisywania meczu', new Error('Brak połączenia z bazą'));
    }

    try {
      const { fixture, teams, league } = matchData;
      const result = await this.db.run(`
        INSERT OR REPLACE INTO matches (
          fixture_id, home_team_id, home_team_name, away_team_id, away_team_name,
          league_id, league_name, match_date, venue, status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        fixture.id,
        teams.home.id,
        teams.home.name,
        teams.away.id,
        teams.away.name,
        league.id,
        league.name,
        fixture.date,
        fixture.venue?.name || null,
        fixture.status.short
      ]);

      console.log(`✅ Zapisano mecz: ${teams.home.name} vs ${teams.away.name}`);
      return result.lastID;
    } catch (error) {
      return this.handleError('zapisywania meczu', error);
    }
  }

  // Zapisz predykcję AI
  async savePrediction(fixtureId, prediction) {
    if (!this.isConnected()) {
      return this.handleError('zapisywania predykcji', new Error('Brak połączenia z bazą'));
    }

    try {
      const validFixtureId = this.validateFixtureId(fixtureId);
      
      // Oblicz confidence_percentage na podstawie confidence_level
      const confidencePercentage = prediction.confidence === 'high' ? 85 :
                                  prediction.confidence === 'medium' ? 65 : 45;

      // Use a transaction to atomically remove old prediction and insert the new one.
      // This reduces the chance of duplicates in concurrent scenarios.
      await this.db.run('BEGIN TRANSACTION');

      await this.db.run('DELETE FROM match_predictions WHERE fixture_id = ?', [validFixtureId]);

      // Use a simple timestamp-based prediction_hash to help uniqueness/versioning.
      const predictionHash = String(Date.now());

      // Prepare metadata and calibration version if available
      const predictionMetadata = prediction.prediction_metadata || prediction.predictionMetadata || null;
      const calibrationVersion = prediction.calibrationVersion || prediction.calibration_version || null;

      const result = await this.db.run(`
        INSERT INTO match_predictions (
          fixture_id, home_win_probability, draw_probability, away_win_probability,
          predicted_home_score, predicted_away_score, confidence_level, confidence_percentage,
          key_factors, betting_tips, prediction_metadata, calibration_version, ai_model, prediction_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        validFixtureId,
        prediction.probabilities?.homeWin ?? 0,
        prediction.probabilities?.draw ?? 0,
        prediction.probabilities?.awayWin ?? 0,
        (prediction.predictedScore && typeof prediction.predictedScore.home === 'number') ? prediction.predictedScore.home : 0,
        (prediction.predictedScore && typeof prediction.predictedScore.away === 'number') ? prediction.predictedScore.away : 0,
        prediction.confidence || 'unknown',
        confidencePercentage,
        JSON.stringify(prediction.keyFactors || []),
        JSON.stringify(prediction.bettingTips || []),
        predictionMetadata ? JSON.stringify(predictionMetadata) : null,
        calibrationVersion,
        'ChatGPT-5',
        predictionHash
      ]);

      await this.db.run('COMMIT');

      console.log(`✅ Zapisano predykcję dla meczu ${validFixtureId}`);
      return result.lastID;
    } catch (error) {
      try {
        await this.db.run('ROLLBACK');
      } catch (rbErr) {
        console.warn('⚠️ Błąd podczas rollback:', rbErr.message);
      }
      return this.handleError('zapisywania predykcji', error);
    }
  }

  // Zapisz formę drużyn
  async saveTeamForm(fixtureId, homeTeam, awayTeam, homeForm, awayForm) {
    if (!this.isConnected()) {
      return this.handleError('zapisywania formy drużyn', new Error('Brak połączenia z bazą'));
    }

    try {
      const validFixtureId = this.validateFixtureId(fixtureId);

      // Oblicz statystyki dla gospodarzy
      const homeStats = this.calculateTeamStats(homeForm);
      await this.db.run(`
        INSERT OR REPLACE INTO team_form_data (
          fixture_id, team_id, team_name, is_home, points_last_5, goals_for_last_5,
          goals_against_last_5, avg_goals_for, avg_goals_against, win_rate, form_string
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        validFixtureId, homeTeam.id, homeTeam.name, true,
        homeStats.points, homeStats.goalsFor, homeStats.goalsAgainst,
        homeStats.avgGoalsFor, homeStats.avgGoalsAgainst, homeStats.winRate,
        homeStats.formString
      ]);

      // Oblicz statystyki dla gości
      const awayStats = this.calculateTeamStats(awayForm);
      await this.db.run(`
        INSERT OR REPLACE INTO team_form_data (
          fixture_id, team_id, team_name, is_home, points_last_5, goals_for_last_5,
          goals_against_last_5, avg_goals_for, avg_goals_against, win_rate, form_string
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        validFixtureId, awayTeam.id, awayTeam.name, false,
        awayStats.points, awayStats.goalsFor, awayStats.goalsAgainst,
        awayStats.avgGoalsFor, awayStats.avgGoalsAgainst, awayStats.winRate,
        awayStats.formString
      ]);

      console.log(`✅ Zapisano formę drużyn dla meczu ${validFixtureId}`);
      return true;
    } catch (error) {
      return this.handleError('zapisywania formy drużyn', error);
    }
  }

  // Pomocnicza funkcja do obliczania statystyk drużyny
  calculateTeamStats(form) {
    if (!form || form.length === 0) {
      return {
        points: 0, goalsFor: 0, goalsAgainst: 0,
        avgGoalsFor: 0, avgGoalsAgainst: 0, winRate: 0,
        formString: ''
      };
    }

    const points = form.reduce((sum, match) => 
      sum + (match.result === 'W' ? 3 : match.result === 'D' ? 1 : 0), 0
    );
    const wins = form.filter(m => m.result === 'W').length;
    const goalsFor = form.reduce((sum, match) => sum + match.goalsFor, 0);
    const goalsAgainst = form.reduce((sum, match) => sum + match.goalsAgainst, 0);

    return {
      points,
      goalsFor,
      goalsAgainst,
      avgGoalsFor: goalsFor / form.length,
      avgGoalsAgainst: goalsAgainst / form.length,
      winRate: (wins / form.length) * 100,
      formString: form.map(m => m.result).join('')
    };
  }

  // Zapisz pojedynki zawodników
  async savePlayerMatchups(fixtureId, matchups) {
    if (!this.isConnected()) {
      return this.handleError('zapisywania pojedynków', new Error('Brak połączenia z bazą'));
    }

    try {
      const validFixtureId = this.validateFixtureId(fixtureId);

      // Usuń stare pojedynki dla tego meczu
      await this.db.run('DELETE FROM player_matchups WHERE fixture_id = ?', [validFixtureId]);

      // Zapisz nowe pojedynki
      for (const matchup of matchups) {
        // parsePlayerInfo returns { playerName, playerPos }
        // map them to local variables expected by the DB insert
        const { playerName: homePlayerName, playerPos: homePlayerPos } = this.parsePlayerInfo(matchup.homePlayer);
        const { playerName: awayPlayerName, playerPos: awayPlayerPos } = this.parsePlayerInfo(matchup.awayPlayer);

        await this.db.run(`
          INSERT INTO player_matchups (
            fixture_id, category, home_player_name, home_player_position,
            away_player_name, away_player_position, matchup_description, advantage_prediction
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          validFixtureId,
          matchup.category,
          homePlayerName,
          homePlayerPos,
          awayPlayerName,
          awayPlayerPos,
          matchup.description,
          this.predictAdvantage(matchup)
        ]);
      }

      console.log(`✅ Zapisano ${matchups.length} pojedynków dla meczu ${validFixtureId}`);
      return true;
    } catch (error) {
      return this.handleError('zapisywania pojedynków', error);
    }
  }

  // Pomocnicza funkcja do parsowania informacji o zawodniku
  parsePlayerInfo(playerString) {
    // Format: "Nazwisko (POZ)" lub "Nazwisko"
    const match = playerString.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (match) {
      return {
        playerName: match[1].trim(),
        playerPos: match[2].trim()
      };
    }
    return {
      playerName: playerString.trim(),
      playerPos: 'Unknown'
    };
  }

  // Pomocnicza funkcja do przewidywania przewagi w pojedynku
  predictAdvantage(matchup) {
    // Prosta logika przewidywania przewagi na podstawie kategorii
    if (matchup.category.includes('Bramkarz')) {
      return 'home'; // Bramkarz ma przewagę u siebie
    } else if (matchup.category.includes('Obrona')) {
      return 'neutral'; // Obrona vs atak - neutralne
    } else if (matchup.category.includes('Środek')) {
      return 'neutral'; // Środek pola - neutralne
    }
    return 'neutral';
  }

  // Walidacja danych pojedynków
  validateMatchupData(matchup) {
    if (!matchup.category || !matchup.homePlayer || !matchup.awayPlayer) {
      throw new Error('Niepełne dane pojedynku');
    }
    if (!matchup.description) {
      throw new Error('Brak opisu pojedynku');
    }
    return true;
  }

  // Zapisz wynik meczu (po zakończeniu)
  async saveMatchResult(fixtureId, result) {
    if (!this.isConnected()) {
      return this.handleError('zapisywania wyniku', new Error('Brak połączenia z bazą'));
    }

    try {
      const validFixtureId = this.validateFixtureId(fixtureId);
      
      const winner = result.goals.home > result.goals.away ? 'home' :
                    result.goals.away > result.goals.home ? 'away' : 'draw';

      await this.db.run(`
        INSERT OR REPLACE INTO match_results (
          fixture_id, home_score, away_score, match_status, winner, total_goals,
          first_half_home, first_half_away
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        validFixtureId,
        result.goals.home,
        result.goals.away,
        result.fixture.status.short,
        winner,
        result.goals.home + result.goals.away,
        result.score?.halftime?.home || null,
        result.score?.halftime?.away || null
      ]);

      console.log(`✅ Zapisano wynik meczu ${validFixtureId}: ${result.goals.home}-${result.goals.away}`);
      
      // Oblicz dokładność predykcji
      await this.calculatePredictionAccuracy(validFixtureId);
      
      return true;
    } catch (error) {
      return this.handleError('zapisywania wyniku', error);
    }
  }

  // Oblicz dokładność predykcji
  async calculatePredictionAccuracy(fixtureId) {
    if (!this.isConnected()) {
      return this.handleError('obliczania dokładności', new Error('Brak połączenia z bazą'));
    }

    try {
      const validFixtureId = this.validateFixtureId(fixtureId);

      const prediction = await this.db.get(
        'SELECT * FROM match_predictions WHERE fixture_id = ?', 
        [validFixtureId]
      );
      const result = await this.db.get(
        'SELECT * FROM match_results WHERE fixture_id = ?', 
        [validFixtureId]
      );

      if (!prediction || !result) {
        console.log(`⚠️ Brak predykcji lub wyniku dla meczu ${validFixtureId}`);
        return false;
      }

      // Sprawdź dokładność
      const resultCorrect = this.checkResultPrediction(prediction, result);
      const scoreCorrect = (prediction.predicted_home_score === result.home_score && 
                           prediction.predicted_away_score === result.away_score);
      const totalGoalsCorrect = (prediction.predicted_home_score + prediction.predicted_away_score === result.total_goals);
      const probabilityAccuracy = this.calculateProbabilityAccuracy(prediction, result);

      // Use an upsert so repeated calculations for the same fixture_id replace the previous row
      // instead of inserting additional rows and inflating aggregates.
      await this.db.run(`
        INSERT INTO prediction_accuracy (
          fixture_id, result_correct, score_correct, probability_accuracy,
          confidence_justified, total_goals_correct
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(fixture_id) DO UPDATE SET
          result_correct = excluded.result_correct,
          score_correct = excluded.score_correct,
          probability_accuracy = excluded.probability_accuracy,
          confidence_justified = excluded.confidence_justified,
          total_goals_correct = excluded.total_goals_correct,
          calculated_at = CURRENT_TIMESTAMP
      `, [
        validFixtureId, resultCorrect ? 1 : 0, scoreCorrect ? 1 : 0, probabilityAccuracy,
        resultCorrect ? 1 : 0, totalGoalsCorrect ? 1 : 0
      ]);

      console.log(`✅ Obliczono dokładność predykcji dla meczu ${validFixtureId}`);
      return true;
    } catch (error) {
      return this.handleError('obliczania dokładności', error);
    }
  }

  // Sprawdź czy przewidziano poprawny wynik
  checkResultPrediction(prediction, result) {
    const predictedWinner = prediction.home_win_probability > prediction.away_win_probability && 
                           prediction.home_win_probability > prediction.draw_probability ? 'home' :
                           prediction.away_win_probability > prediction.draw_probability ? 'away' : 'draw';
    return predictedWinner === result.winner;
  }

  // Oblicz dokładność prawdopodobieństw
  calculateProbabilityAccuracy(prediction, result) {
    const predictedProb = result.winner === 'home' ? prediction.home_win_probability :
                         result.winner === 'away' ? prediction.away_win_probability :
                         prediction.draw_probability;
    
    // Zwróć dokładność jako wartość od 0 do 1 (im wyższa tym lepsza)
    return predictedProb / 100;
  }

  // Pobierz statystyki dokładności (liczone tylko dla aktualnych / ostatnich predykcji zapisanych w match_predictions)
  async getAccuracyStats() {
    if (!this.isConnected()) {
      return this.handleError('pobierania statystyk', new Error('Brak połączenia z bazą'));
    }

    try {
      // Problem: w bazie mogą istnieć wielokrotne wpisy w prediction_accuracy dla jednego fixture_id,
      // co powoduje przeszacowanie SUM() po JOIN. Najbezpieczniej jest najpierw zredukować wiersze
      // prediction_accuracy do pojedynczego rekordu na fixture_id (np. agregując MAX dla pól boolean),
      // a następnie policzyć metryki na zbiorze unikalnych predykcji.
      const stats = await this.db.get(`
        SELECT
          COUNT(*) as total_predictions,
          SUM(CASE WHEN pa.result_correct = 1 THEN 1 ELSE 0 END) as correct_results,
          SUM(CASE WHEN pa.score_correct = 1 THEN 1 ELSE 0 END) as correct_scores,
          AVG(CASE WHEN pa.probability_accuracy IS NOT NULL THEN pa.probability_accuracy ELSE 0 END) as avg_probability_accuracy,
          SUM(CASE WHEN pa.total_goals_correct = 1 THEN 1 ELSE 0 END) as correct_total_goals
        FROM (
          SELECT 
            p.fixture_id,
            MAX(CASE WHEN a.result_correct = 1 THEN 1 ELSE 0 END) as result_correct,
            MAX(CASE WHEN a.score_correct = 1 THEN 1 ELSE 0 END) as score_correct,
            AVG(a.probability_accuracy) as probability_accuracy,
            MAX(CASE WHEN a.total_goals_correct = 1 THEN 1 ELSE 0 END) as total_goals_correct
          FROM match_predictions p
          LEFT JOIN prediction_accuracy a ON p.fixture_id = a.fixture_id
          GROUP BY p.fixture_id
        ) pa
      `);

      const total = stats.total_predictions || 0;
      return {
        // totalPredictions to liczba aktualnych, unikalnych predykcji w tabeli match_predictions
        totalPredictions: total,
        resultAccuracy: total ? (stats.correct_results / total * 100) : 0,
        scoreAccuracy: total ? (stats.correct_scores / total * 100) : 0,
        goalAccuracy: total ? (stats.correct_total_goals / total * 100) : 0,
        // avg_probability_accuracy zwracane przez SQL to wartość 0..1 (ponieważ w DB zapisujemy REAL 0..1),
        // dlatego mnożymy przez 100, aby frontend otrzymał wartość w procentach (0..100).
        avgProbabilityAccuracy: (stats.avg_probability_accuracy || 0) * 100
      };
    } catch (error) {
      return this.handleError('pobierania statystyk', error);
    }
  }

  // Pobierz mecze z predykcjami
  async getMatchesWithPredictions(limit = 50) {
    if (!this.isConnected()) {
      return this.handleError('pobierania meczów', new Error('Brak połączenia z bazą'));
    }

    try {
      // Zwracamy tylko mecze, które mają aktualną predykcję w match_predictions.
      // Upewniamy się, że przyłączamy TYLKO najnowszy wynik z match_results (jeśli istnieje),
      // ponieważ w tabeli match_results mogą być liczne, historyczne wiersze dla tego samego fixture_id.
      // Dzięki temu unikamy duplikowania wierszy (jedna linia per match).
      return await this.db.all(`
        SELECT 
          m.*,
          p.home_win_probability,
          p.draw_probability,
          p.away_win_probability,
          p.predicted_home_score,
          p.predicted_away_score,
          p.confidence_level,
          p.prediction_date,
          r.home_score as actual_home_score,
          r.away_score as actual_away_score,
          r.winner as actual_winner,
          a.result_correct,
          a.score_correct
        FROM matches m
        INNER JOIN match_predictions p 
          ON p.id = (
            SELECT id FROM match_predictions
            WHERE fixture_id = m.fixture_id
            ORDER BY prediction_date DESC, id DESC
            LIMIT 1
          )
        LEFT JOIN match_results r
          ON r.id = (
            SELECT id FROM match_results
            WHERE fixture_id = m.fixture_id
            ORDER BY result_date DESC, id DESC
            LIMIT 1
          )
        LEFT JOIN prediction_accuracy a ON m.fixture_id = a.fixture_id
        ORDER BY m.match_date DESC
        LIMIT ?
      `, [limit]);
    } catch (error) {
      return this.handleError('pobierania meczów', error) || [];
    }
  }

  // Pobierz najnowszą predykcję dla danego fixture_id
  async getPredictionByFixture(fixtureId) {
    if (!this.isConnected()) {
      return this.handleError('pobierania predykcji', new Error('Brak połączenia z bazą'));
    }
    try {
      const validFixtureId = this.validateFixtureId(fixtureId);
      const row = await this.db.get(`
        SELECT *
        FROM match_predictions
        WHERE fixture_id = ?
        ORDER BY prediction_date DESC, id DESC
        LIMIT 1
      `, [validFixtureId]);
      return row || null;
    } catch (error) {
      return this.handleError('pobierania predykcji', error);
    }
  }

  // Pobierz szczegółowe statystyki według lig
  async getAccuracyByLeague() {
    if (!this.isConnected()) {
      return this.handleError('pobierania statystyk lig', new Error('Brak połączenia z bazą'));
    }

    try {
      return await this.db.all(`
        SELECT 
          m.league_name,
          COUNT(*) as total_matches,
          AVG(CASE WHEN a.result_correct = 1 THEN 1.0 ELSE 0.0 END) * 100 as accuracy_rate,
          AVG(a.probability_accuracy) * 100 as avg_probability_accuracy
        FROM matches m
        JOIN prediction_accuracy a ON m.fixture_id = a.fixture_id
        GROUP BY m.league_id, m.league_name
        HAVING total_matches >= 3
        ORDER BY accuracy_rate DESC
      `);
    } catch (error) {
      return this.handleError('pobierania statystyk lig', error) || [];
    }
  }

  // Pobierz najlepsze predykcje
  async getBestPredictions(limit = 10) {
    if (!this.isConnected()) {
      return this.handleError('pobierania najlepszych predykcji', new Error('Brak połączenia z bazą'));
    }

    try {
      return await this.db.all(`
        SELECT 
          m.home_team_name,
          m.away_team_name,
          m.match_date,
          p.predicted_home_score,
          p.predicted_away_score,
          r.home_score as actual_home_score,
          r.away_score as actual_away_score,
          a.probability_accuracy,
          a.result_correct,
          a.score_correct
        FROM matches m
        JOIN match_predictions p ON m.fixture_id = p.fixture_id
        JOIN match_results r ON m.fixture_id = r.fixture_id
        JOIN prediction_accuracy a ON m.fixture_id = a.fixture_id
        WHERE a.result_correct = 1
        ORDER BY a.probability_accuracy DESC
        LIMIT ?
      `, [limit]);
    } catch (error) {
      return this.handleError('pobierania najlepszych predykcji', error) || [];
    }
  }

  // Pobierz pojedynki dla meczu
  async getPlayerMatchups(fixtureId) {
    if (!this.isConnected()) {
      return this.handleError('pobierania pojedynków', new Error('Brak połączenia z bazą'));
    }

    try {
      const validFixtureId = this.validateFixtureId(fixtureId);
      
      return await this.db.all(`
        SELECT *
        FROM player_matchups
        WHERE fixture_id = ?
        ORDER BY category, id
      `, [validFixtureId]);
    } catch (error) {
      return this.handleError('pobierania pojedynków', error) || [];
    }
  }

  // Zapisz statystyki sezonowe zawodników
  async savePlayerSeasonStats(teamPlayers, teamId, teamName, season = new Date().getFullYear()) {
    if (!this.isConnected()) {
      return this.handleError('zapisywania statystyk sezonowych', new Error('Brak połączenia z bazą'));
    }

    try {
      let savedCount = 0;

      for (const playerData of teamPlayers) {
        const player = playerData.player;
        const stats = playerData.statistics[0]; // Pierwsze statystyki (główna liga)

        if (!stats) continue;

        await this.db.run(`
          INSERT OR REPLACE INTO player_season_stats (
            player_id, player_name, team_id, team_name, season, position,
            appearances, goals, assists, yellow_cards, red_cards, minutes_played,
            rating, shots_total, shots_on_target, passes_total, passes_accuracy,
            tackles_total, blocks_total, interceptions_total, duels_total, duels_won,
            dribbles_attempts, dribbles_success, fouls_drawn, fouls_committed, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          player.id,
          player.name,
          teamId,
          teamName,
          season,
          stats.games?.position || 'Unknown',
          stats.games?.appearences || 0,
          stats.goals?.total || 0,
          stats.goals?.assists || 0,
          stats.cards?.yellow || 0,
          stats.cards?.red || 0,
          stats.games?.minutes || 0,
          stats.games?.rating ? parseFloat(stats.games.rating) : 0,
          stats.shots?.total || 0,
          stats.shots?.on || 0,
          stats.passes?.total || 0,
          stats.passes?.accuracy || 0,
          stats.tackles?.total || 0,
          stats.tackles?.blocks || 0,
          stats.tackles?.interceptions || 0,
          stats.duels?.total || 0,
          stats.duels?.won || 0,
          stats.dribbles?.attempts || 0,
          stats.dribbles?.success || 0,
          stats.fouls?.drawn || 0,
          stats.fouls?.committed || 0
        ]);

        savedCount++;
      }

      console.log(`✅ Zapisano statystyki sezonowe ${savedCount} zawodników dla drużyny ${teamName}`);
      return savedCount;
    } catch (error) {
      return this.handleError('zapisywania statystyk sezonowych', error);
    }
  }

  // Zapisz statystyki zawodników z meczu
  async savePlayerMatchStats(fixtureId, playerStats) {
    if (!this.isConnected()) {
      return this.handleError('zapisywania statystyk meczowych', new Error('Brak połączenia z bazą'));
    }

    try {
      const validFixtureId = this.validateFixtureId(fixtureId);
      let savedCount = 0;

      for (const teamData of playerStats) {
        const teamId = teamData.team.id;
        
        for (const playerData of teamData.players) {
          const player = playerData.player;
          const stats = playerData.statistics[0]; // Pierwsze statystyki

          if (!stats) continue;

          await this.db.run(`
            INSERT OR REPLACE INTO player_match_stats (
              fixture_id, player_id, player_name, team_id, position,
              minutes_played, rating, goals, assists, shots_total, shots_on_target,
              passes_total, passes_accuracy, key_passes, tackles_total, blocks_total,
              interceptions_total, duels_total, duels_won, dribbles_attempts, dribbles_success,
              fouls_drawn, fouls_committed, yellow_cards, red_cards
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            validFixtureId,
            player.id,
            player.name,
            teamId,
            stats.games?.position || 'Unknown',
            stats.games?.minutes || 0,
            stats.games?.rating ? parseFloat(stats.games.rating) : 0,
            stats.goals?.total || 0,
            stats.goals?.assists || 0,
            stats.shots?.total || 0,
            stats.shots?.on || 0,
            stats.passes?.total || 0,
            stats.passes?.accuracy || 0,
            stats.passes?.key || 0,
            stats.tackles?.total || 0,
            stats.tackles?.blocks || 0,
            stats.tackles?.interceptions || 0,
            stats.duels?.total || 0,
            stats.duels?.won || 0,
            stats.dribbles?.attempts || 0,
            stats.dribbles?.success || 0,
            stats.fouls?.drawn || 0,
            stats.fouls?.committed || 0,
            stats.cards?.yellow || 0,
            stats.cards?.red || 0
          ]);

          savedCount++;
        }
      }

      console.log(`✅ Zapisano statystyki meczowe ${savedCount} zawodników dla meczu ${validFixtureId}`);
      return savedCount;
    } catch (error) {
      return this.handleError('zapisywania statystyk meczowych', error);
    }
  }

  // Pobierz statystyki sezonowe zawodników dla drużyny
  async getPlayerSeasonStats(teamId, season = new Date().getFullYear()) {
    if (!this.isConnected()) {
      return this.handleError('pobierania statystyk sezonowych', new Error('Brak połączenia z bazą'));
    }

    try {
      return await this.db.all(`
        SELECT *
        FROM player_season_stats
        WHERE team_id = ? AND season = ?
        ORDER BY appearances DESC, goals DESC
      `, [teamId, season]);
    } catch (error) {
      return this.handleError('pobierania statystyk sezonowych', error) || [];
    }
  }

  // Pobierz statystyki meczowe zawodników
  async getPlayerMatchStats(fixtureId) {
    if (!this.isConnected()) {
      return this.handleError('pobierania statystyk meczowych', new Error('Brak połączenia z bazą'));
    }

    try {
      const validFixtureId = this.validateFixtureId(fixtureId);
      
      return await this.db.all(`
        SELECT *
        FROM player_match_stats
        WHERE fixture_id = ?
        ORDER BY team_id, rating DESC
      `, [validFixtureId]);
    } catch (error) {
      return this.handleError('pobierania statystyk meczowych', error) || [];
    }
  }
}

export const databaseService = new DatabaseService();
