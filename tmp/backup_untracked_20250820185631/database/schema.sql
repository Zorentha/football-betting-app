-- Football Betting Database Schema
-- Baza danych do przechowywania analiz AI i wyników meczów
-- Wersja: 1.0
-- Data: 2025-01-08

-- Tabela głównych danych meczów
CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER UNIQUE NOT NULL,
    home_team_id INTEGER NOT NULL,
    home_team_name TEXT NOT NULL,
    away_team_id INTEGER NOT NULL,
    away_team_name TEXT NOT NULL,
    league_id INTEGER NOT NULL,
    league_name TEXT NOT NULL,
    match_date DATETIME NOT NULL,
    venue TEXT,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela predykcji AI (przed meczem)
CREATE TABLE IF NOT EXISTS match_predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER NOT NULL,
    home_win_probability INTEGER NOT NULL,
    draw_probability INTEGER NOT NULL,
    away_win_probability INTEGER NOT NULL,
    predicted_home_score INTEGER NOT NULL,
    predicted_away_score INTEGER NOT NULL,
    confidence_level TEXT NOT NULL,
    confidence_percentage INTEGER NOT NULL,
    key_factors TEXT NOT NULL, -- JSON array
    betting_tips TEXT NOT NULL, -- JSON array
    ai_model TEXT DEFAULT 'ChatGPT-5',
    prediction_hash TEXT, -- added to enable deduplication/versioning
    prediction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fixture_id) REFERENCES matches(fixture_id)
);

-- Tabela rzeczywistych wyników (po meczu)
CREATE TABLE IF NOT EXISTS match_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER NOT NULL,
    home_score INTEGER NOT NULL,
    away_score INTEGER NOT NULL,
    match_status TEXT NOT NULL, -- FT, AET, PEN, etc.
    winner TEXT, -- home, away, draw
    total_goals INTEGER NOT NULL,
    first_half_home INTEGER,
    first_half_away INTEGER,
    result_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fixture_id) REFERENCES matches(fixture_id)
);

-- Tabela pojedynków zawodników (player vs player)
CREATE TABLE IF NOT EXISTS player_matchups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER NOT NULL,
    category TEXT NOT NULL, -- goalkeeper_vs_forwards, defense_vs_attack, etc.
    home_player_id INTEGER,
    home_player_name TEXT NOT NULL,
    home_player_position TEXT NOT NULL,
    away_player_id INTEGER,
    away_player_name TEXT NOT NULL,
    away_player_position TEXT NOT NULL,
    matchup_description TEXT NOT NULL,
    advantage_prediction TEXT, -- home, away, neutral
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fixture_id) REFERENCES matches(fixture_id)
);

-- Tabela dokładności predykcji
CREATE TABLE IF NOT EXISTS prediction_accuracy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER NOT NULL,
    result_correct BOOLEAN NOT NULL, -- czy przewidziano zwycięzcę
    score_correct BOOLEAN NOT NULL, -- czy przewidziano dokładny wynik
    probability_accuracy REAL, -- jak blisko były prawdopodobieństwa
    confidence_justified BOOLEAN, -- czy poziom pewności był uzasadniony
    total_goals_correct BOOLEAN, -- czy przewidziano liczbę bramek
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fixture_id) REFERENCES matches(fixture_id)
);

-- Tabela statystyk drużyn (do analizy AI)
CREATE TABLE IF NOT EXISTS team_form_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    team_name TEXT NOT NULL,
    is_home BOOLEAN NOT NULL,
    points_last_5 INTEGER NOT NULL,
    goals_for_last_5 INTEGER NOT NULL,
    goals_against_last_5 INTEGER NOT NULL,
    avg_goals_for REAL NOT NULL,
    avg_goals_against REAL NOT NULL,
    win_rate REAL NOT NULL,
    form_string TEXT NOT NULL, -- WWDLW
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fixture_id) REFERENCES matches(fixture_id)
);

-- Tabela statystyk zawodników (sezonowych)
CREATE TABLE IF NOT EXISTS player_season_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    team_id INTEGER NOT NULL,
    team_name TEXT NOT NULL,
    season INTEGER NOT NULL,
    position TEXT NOT NULL,
    appearances INTEGER DEFAULT 0,
    goals INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,
    minutes_played INTEGER DEFAULT 0,
    rating REAL DEFAULT 0,
    shots_total INTEGER DEFAULT 0,
    shots_on_target INTEGER DEFAULT 0,
    passes_total INTEGER DEFAULT 0,
    passes_accuracy REAL DEFAULT 0,
    tackles_total INTEGER DEFAULT 0,
    blocks_total INTEGER DEFAULT 0,
    interceptions_total INTEGER DEFAULT 0,
    duels_total INTEGER DEFAULT 0,
    duels_won INTEGER DEFAULT 0,
    dribbles_attempts INTEGER DEFAULT 0,
    dribbles_success INTEGER DEFAULT 0,
    fouls_drawn INTEGER DEFAULT 0,
    fouls_committed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, team_id, season)
);

-- Tabela statystyk zawodników z konkretnego meczu
CREATE TABLE IF NOT EXISTS player_match_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    team_id INTEGER NOT NULL,
    position TEXT NOT NULL,
    minutes_played INTEGER DEFAULT 0,
    rating REAL DEFAULT 0,
    goals INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    shots_total INTEGER DEFAULT 0,
    shots_on_target INTEGER DEFAULT 0,
    passes_total INTEGER DEFAULT 0,
    passes_accuracy REAL DEFAULT 0,
    key_passes INTEGER DEFAULT 0,
    tackles_total INTEGER DEFAULT 0,
    blocks_total INTEGER DEFAULT 0,
    interceptions_total INTEGER DEFAULT 0,
    duels_total INTEGER DEFAULT 0,
    duels_won INTEGER DEFAULT 0,
    dribbles_attempts INTEGER DEFAULT 0,
    dribbles_success INTEGER DEFAULT 0,
    fouls_drawn INTEGER DEFAULT 0,
    fouls_committed INTEGER DEFAULT 0,
    yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fixture_id) REFERENCES matches(fixture_id),
    UNIQUE(fixture_id, player_id)
);

-- Indeksy dla lepszej wydajności
CREATE INDEX IF NOT EXISTS idx_matches_fixture_id ON matches(fixture_id);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date);
CREATE INDEX IF NOT EXISTS idx_matches_league ON matches(league_id);
CREATE INDEX IF NOT EXISTS idx_matches_teams ON matches(home_team_id, away_team_id);

CREATE INDEX IF NOT EXISTS idx_predictions_fixture_id ON match_predictions(fixture_id);
CREATE INDEX IF NOT EXISTS idx_predictions_date ON match_predictions(prediction_date);
CREATE INDEX IF NOT EXISTS idx_predictions_confidence ON match_predictions(confidence_level);

-- Unikalny indeks na fixture_id + prediction_hash, zapobiega identycznym predykcjom
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_fixture_prediction_hash
ON match_predictions(fixture_id, prediction_hash);

CREATE INDEX IF NOT EXISTS idx_results_fixture_id ON match_results(fixture_id);
CREATE INDEX IF NOT EXISTS idx_results_date ON match_results(result_date);
CREATE INDEX IF NOT EXISTS idx_results_winner ON match_results(winner);

CREATE INDEX IF NOT EXISTS idx_matchups_fixture_id ON player_matchups(fixture_id);
CREATE INDEX IF NOT EXISTS idx_matchups_category ON player_matchups(category);
CREATE INDEX IF NOT EXISTS idx_matchups_advantage ON player_matchups(advantage_prediction);

CREATE INDEX IF NOT EXISTS idx_accuracy_fixture_id ON prediction_accuracy(fixture_id);
CREATE INDEX IF NOT EXISTS idx_accuracy_result_correct ON prediction_accuracy(result_correct);
CREATE INDEX IF NOT EXISTS idx_accuracy_score_correct ON prediction_accuracy(score_correct);

CREATE INDEX IF NOT EXISTS idx_team_form_fixture_id ON team_form_data(fixture_id);
CREATE INDEX IF NOT EXISTS idx_team_form_team ON team_form_data(team_id);
CREATE INDEX IF NOT EXISTS idx_team_form_home ON team_form_data(is_home);

CREATE INDEX IF NOT EXISTS idx_player_season_player ON player_season_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_season_team ON player_season_stats(team_id);
CREATE INDEX IF NOT EXISTS idx_player_season_season ON player_season_stats(season);

CREATE INDEX IF NOT EXISTS idx_player_match_fixture ON player_match_stats(fixture_id);
CREATE INDEX IF NOT EXISTS idx_player_match_player ON player_match_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_match_team ON player_match_stats(team_id);

-- Triggery do automatycznej aktualizacji timestampów
CREATE TRIGGER IF NOT EXISTS update_matches_timestamp 
    AFTER UPDATE ON matches
    FOR EACH ROW
    BEGIN
        UPDATE matches SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Widoki dla często używanych zapytań
CREATE VIEW IF NOT EXISTS matches_with_predictions AS
SELECT 
    m.*,
    p.home_win_probability,
    p.draw_probability,
    p.away_win_probability,
    p.predicted_home_score,
    p.predicted_away_score,
    p.confidence_level,
    p.ai_model,
    p.prediction_date
FROM matches m
LEFT JOIN match_predictions p ON m.fixture_id = p.fixture_id;

CREATE VIEW IF NOT EXISTS matches_with_results AS
SELECT 
    m.*,
    r.home_score,
    r.away_score,
    r.winner,
    r.total_goals,
    r.match_status as result_status,
    r.result_date
FROM matches m
LEFT JOIN match_results r ON m.fixture_id = r.fixture_id;

CREATE VIEW IF NOT EXISTS prediction_performance AS
SELECT 
    p.*,
    r.home_score as actual_home_score,
    r.away_score as actual_away_score,
    r.winner as actual_winner,
    a.result_correct,
    a.score_correct,
    a.probability_accuracy,
    a.total_goals_correct
FROM match_predictions p
LEFT JOIN match_results r ON p.fixture_id = r.fixture_id
LEFT JOIN prediction_accuracy a ON p.fixture_id = a.fixture_id;

-- Funkcje pomocnicze (SQLite nie ma stored procedures, ale można używać w aplikacji)
-- Te zapytania będą używane w DatabaseService

-- Zapytanie do obliczania ogólnych statystyk dokładności
-- SELECT 
--     COUNT(*) as total_predictions,
--     SUM(CASE WHEN result_correct = 1 THEN 1 ELSE 0 END) as correct_results,
--     SUM(CASE WHEN score_correct = 1 THEN 1 ELSE 0 END) as correct_scores,
--     AVG(probability_accuracy) as avg_probability_accuracy,
--     SUM(CASE WHEN total_goals_correct = 1 THEN 1 ELSE 0 END) as correct_total_goals
-- FROM prediction_accuracy;

-- Zapytanie do pobierania najlepszych predykcji
-- SELECT * FROM prediction_performance 
-- WHERE result_correct = 1 
-- ORDER BY probability_accuracy DESC 
-- LIMIT 10;

-- Zapytanie do analizy wydajności według lig
-- SELECT 
--     m.league_name,
--     COUNT(*) as total_matches,
--     AVG(CASE WHEN a.result_correct = 1 THEN 1.0 ELSE 0.0 END) as accuracy_rate
-- FROM matches m
-- JOIN prediction_accuracy a ON m.fixture_id = a.fixture_id
-- GROUP BY m.league_id, m.league_name
-- ORDER BY accuracy_rate DESC;
