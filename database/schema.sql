-- Minimal schema required for saving annotated predictions and related data.
-- This file is intentionally minimal but includes the columns used by
-- src/services/databaseService.js when saving predictions and computing accuracy.

PRAGMA foreign_keys = ON;

-- Matches table (basic)
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id INTEGER UNIQUE,
  home_team_id INTEGER,
  home_team_name TEXT,
  away_team_id INTEGER,
  away_team_name TEXT,
  league_id INTEGER,
  league_name TEXT,
  match_date TEXT,
  venue TEXT,
  status TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Match predictions (primary table for saved AI predictions)
CREATE TABLE IF NOT EXISTS match_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id INTEGER,
  home_win_probability INTEGER,
  draw_probability INTEGER,
  away_win_probability INTEGER,
  predicted_home_score INTEGER,
  predicted_away_score INTEGER,
  confidence_level TEXT,
  confidence_percentage INTEGER,
  key_factors TEXT,
  betting_tips TEXT,
  prediction_metadata TEXT,
  calibration_version TEXT,
  ai_model TEXT,
  prediction_hash TEXT,
  prediction_date DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Prediction accuracy table (stores computed accuracy metrics)
CREATE TABLE IF NOT EXISTS prediction_accuracy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id INTEGER,
  result_correct INTEGER,
  score_correct INTEGER,
  probability_accuracy REAL,
  confidence_justified INTEGER,
  total_goals_correct INTEGER,
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Player matchups
CREATE TABLE IF NOT EXISTS player_matchups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id INTEGER,
  category TEXT,
  home_player_name TEXT,
  home_player_position TEXT,
  away_player_name TEXT,
  away_player_position TEXT,
  matchup_description TEXT,
  advantage_prediction TEXT
);

-- Team form/stats summary table (minimal)
CREATE TABLE IF NOT EXISTS team_form_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id INTEGER,
  team_id INTEGER,
  team_name TEXT,
  is_home INTEGER,
  points_last_5 INTEGER,
  goals_for_last_5 INTEGER,
  goals_against_last_5 INTEGER,
  avg_goals_for REAL,
  avg_goals_against REAL,
  win_rate REAL,
  form_string TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Player match stats (minimal)
CREATE TABLE IF NOT EXISTS player_match_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixture_id INTEGER,
  player_id INTEGER,
  player_name TEXT,
  team_id INTEGER,
  position TEXT,
  minutes_played INTEGER,
  rating REAL,
  goals INTEGER,
  assists INTEGER,
  shots_total INTEGER,
  shots_on_target INTEGER,
  passes_total INTEGER,
  passes_accuracy REAL,
  key_passes INTEGER,
  tackles_total INTEGER,
  blocks_total INTEGER,
  interceptions_total INTEGER,
  duels_total INTEGER,
  duels_won INTEGER,
  dribbles_attempts INTEGER,
  dribbles_success INTEGER,
  fouls_drawn INTEGER,
  fouls_committed INTEGER,
  yellow_cards INTEGER,
  red_cards INTEGER
);

-- Useful indexes to speed up lookups and enforce uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_predictions_fixture_id ON match_predictions(fixture_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_prediction_accuracy_fixture ON prediction_accuracy(fixture_id);
CREATE INDEX IF NOT EXISTS idx_matches_fixture_id ON matches(fixture_id);
CREATE INDEX IF NOT EXISTS idx_player_matchups_fixture_id ON player_matchups(fixture_id);
