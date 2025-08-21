# Projekt - System Bazy Danych Meczów

## Przegląd

System bazy danych SQLite do przechowywania kompletnych analiz AI meczów piłkarskich wraz z rzeczywistymi wynikami. System umożliwia porównanie predykcji z rzeczywistymi wynikami oraz budowanie bazy danych do przyszłych analiz AI. Kluczowym elementem jest zapisywanie szczegółowych analiz player vs player oraz wszystkich statystyk używanych przez ChatGPT-5.

## Architektura

### Struktura bazy danych
- **SQLite** jako główna baza danych (lekka, bez konieczności serwera)
- **Tabele relacyjne** z kluczami obcymi dla integralności danych
- **Indeksy** dla optymalizacji zapytań
- **JSON fields** dla złożonych danych (czynniki kluczowe, tipy)

### Integracja z istniejącym systemem
- **DatabaseService** jako warstwa abstrakcji
- **Automatyczne zapisywanie** podczas analizy AI
- **Endpoint API** do pobierania statystyk i historii
- **Cron job** do aktualizacji wyników

## Komponenty i Interfejsy

### 1. Schema Bazy Danych

#### Tabela `matches`
```sql
CREATE TABLE matches (
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
```

#### Tabela `match_predictions`
```sql
CREATE TABLE match_predictions (
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
    prediction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fixture_id) REFERENCES matches(fixture_id)
);
```

#### Tabela `match_results`
```sql
CREATE TABLE match_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER NOT NULL,
    home_score INTEGER NOT NULL,
    away_score INTEGER NOT NULL,
    match_status TEXT NOT NULL,
    winner TEXT, -- home, away, draw
    total_goals INTEGER NOT NULL,
    first_half_home INTEGER,
    first_half_away INTEGER,
    result_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fixture_id) REFERENCES matches(fixture_id)
);
```

#### Tabela `player_matchups`
```sql
CREATE TABLE player_matchups (
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
```

#### Tabela `prediction_accuracy`
```sql
CREATE TABLE prediction_accuracy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER NOT NULL,
    result_correct BOOLEAN NOT NULL,
    score_correct BOOLEAN NOT NULL,
    probability_accuracy REAL,
    confidence_justified BOOLEAN,
    total_goals_correct BOOLEAN,
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fixture_id) REFERENCES matches(fixture_id)
);
```

#### Tabela `team_form_data`
```sql
CREATE TABLE team_form_data (
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
```

### 2. DatabaseService

#### Główne metody:
- `initialize()` - inicjalizacja bazy danych i schema
- `saveMatch(matchData)` - zapisywanie podstawowych danych meczu
- `savePrediction(fixtureId, prediction)` - zapisywanie predykcji AI
- `savePlayerMatchups(fixtureId, matchups)` - zapisywanie pojedynków player vs player
- `saveTeamForm(fixtureId, homeTeam, awayTeam, homeForm, awayForm)` - zapisywanie formy drużyn
- `saveMatchResult(fixtureId, result)` - zapisywanie wyniku po meczu
- `calculatePredictionAccuracy(fixtureId)` - obliczanie dokładności predykcji
- `getAccuracyStats()` - pobieranie statystyk dokładności
- `getMatchesWithPredictions(limit)` - pobieranie historii z predykcjami

### 3. API Endpoints

#### Nowe endpointy:
- `GET /api/betting/accuracy-stats` - statystyki dokładności predykcji
- `GET /api/betting/prediction-history` - historia predykcji z wynikami
- `POST /api/betting/update-results` - masowa aktualizacja wyników meczów

#### Modyfikacja istniejącego:
- `POST /api/betting/analyze/:fixtureId` - rozszerzony o zapisywanie do bazy

### 4. Integracja z OpenAI Analysis Service

#### Rozszerzenie analyzeMatch():
- Automatyczne zapisywanie kompletnej analizy do bazy
- Zapisywanie pojedynków player vs player gdy są składy
- Zapisywanie wszystkich statystyk używanych w analizie
- Obsługa błędów bazy danych bez przerywania analizy

## Modele Danych

### MatchData
```javascript
{
  fixture: {
    id: number,
    date: string,
    venue: object,
    status: object
  },
  teams: {
    home: { id: number, name: string },
    away: { id: number, name: string }
  },
  league: {
    id: number,
    name: string
  }
}
```

### PredictionData
```javascript
{
  probabilities: {
    homeWin: number,
    draw: number,
    awayWin: number
  },
  predictedScore: {
    home: number,
    away: number
  },
  confidence: string,
  confidencePercentage: number,
  keyFactors: string[],
  bettingTips: object[]
}
```

### PlayerMatchup
```javascript
{
  category: string,
  homePlayer: string,
  homePlayerPos: string,
  awayPlayer: string,
  awayPlayerPos: string,
  description: string,
  advantage: string
}
```

## Obsługa Błędów

### Strategia błędów:
1. **Graceful degradation** - błędy bazy nie przerywają analizy AI
2. **Logging** - wszystkie błędy są logowane z kontekstem
3. **Retry logic** - ponowne próby dla błędów przejściowych
4. **Fallback** - podstawowe dane są zawsze zapisywane

### Typy błędów:
- **Database connection errors** - problemy z połączeniem SQLite
- **Schema errors** - błędy struktury bazy danych
- **Data validation errors** - nieprawidłowe dane wejściowe
- **Foreign key constraints** - naruszenie integralności danych

## Strategia Testowania

### Unit Tests:
- **DatabaseService methods** - testowanie wszystkich metod CRUD
- **Data validation** - testowanie walidacji danych wejściowych
- **Error handling** - testowanie obsługi błędów
- **Accuracy calculations** - testowanie obliczeń dokładności

### Integration Tests:
- **API endpoints** - testowanie nowych endpointów
- **Database schema** - testowanie integralności bazy
- **OpenAI integration** - testowanie zapisywania podczas analizy
- **Results update flow** - testowanie aktualizacji wyników

### Performance Tests:
- **Large dataset handling** - testowanie z dużą ilością danych
- **Query optimization** - testowanie wydajności zapytań
- **Concurrent access** - testowanie równoczesnego dostępu

## Bezpieczeństwo

### Zabezpieczenia:
- **SQL Injection prevention** - używanie prepared statements
- **Input validation** - walidacja wszystkich danych wejściowych
- **Access control** - ograniczenie dostępu do endpointów
- **Data sanitization** - czyszczenie danych przed zapisem

### Backup i Recovery:
- **Automatic backups** - regularne kopie zapasowe bazy
- **Data export** - możliwość eksportu danych do JSON
- **Recovery procedures** - procedury odzyskiwania danych

## Wydajność

### Optymalizacje:
- **Database indexes** - indeksy na często używanych kolumnach
- **Query optimization** - optymalizacja zapytań SQL
- **Connection pooling** - zarządzanie połączeniami
- **Caching** - cache'owanie często używanych danych

### Monitoring:
- **Query performance** - monitorowanie wydajności zapytań
- **Database size** - monitorowanie rozmiaru bazy
- **Error rates** - monitorowanie częstości błędów
- **Response times** - monitorowanie czasów odpowiedzi