# ⚽ Football Betting App - Dokumentacja Projektu

## 📋 Spis Treści
- [Cel Projektu](#cel-projektu)
- [Obecny Stan](#obecny-stan)
- [Architektura Systemu](#architektura-systemu)
- [Funkcjonalności](#funkcjonalności)
- [Instalacja i Uruchomienie](#instalacja-i-uruchomienie)
- [API Dokumentacja](#api-dokumentacja)
- [Struktura Projektu](#struktura-projektu)
- [Konfiguracja](#konfiguracja)
- [Rozwiązywanie Problemów](#rozwiązywanie-problemów)

---

## 🎯 Cel Projektu

**Football Betting App** to zaawansowana aplikacja do analizy meczów piłkarskich z wykorzystaniem sztucznej inteligencji. Głównym celem jest:

### 🎪 Główne Założenia:
1. **Inteligentne Predykcje** - Wykorzystanie AI (OpenAI GPT-4) do analizy meczów i przewidywania wyników
2. **Walidacja Składów** - Predykcje zapisywane tylko gdy składy wyjściowe są potwierdzone
3. **Analiza Dokładności** - Automatyczne porównywanie predykcji z rzeczywistymi wynikami
4. **Samoanaliza AI** - System analizuje własną dokładność i identyfikuje obszary do poprawy
5. **Kompleksowa Analiza** - Uwzględnienie formy drużyn, składów, statystyk zawodników i warunków pogodowych

### 🎯 Docelowi Użytkownicy:
- Analitycy sportowi
- Entuzjaści piłki nożnej
- Osoby zainteresowane predykcjami sportowymi
- Badacze skuteczności AI w sporcie

---

## 📊 Obecny Stan Projektu

### ✅ **ZAIMPLEMENTOWANE FUNKCJONALNOŚCI**

#### 🏗️ **Backend (Node.js + Express)**
- **API Football Integration** - Pobieranie danych meczów z API-Sports.io
- **OpenAI Integration** - GPT-4 do analizy i predykcji
- **SQLite Database** - Przechowywanie predykcji, wyników i statystyk
- **RESTful API** - Kompletne endpointy dla wszystkich funkcjonalności
- **Fallback System** - Działanie bez OpenAI (analiza statystyczna)

#### 🎨 **Frontend (React + Vite)**
- **3 Główne Zakładki**:
  - 🏟️ **Mecze** - Lista aktualnych meczów
  - 🤖 **Analiza AI** - Szczegółowa analiza wybranego meczu
  - 📊 **Analiza Wyników** - Porównanie predykcji z wynikami
- **Responsywny Design** - Działa na wszystkich urządzeniach
- **Real-time Updates** - Automatyczne odświeżanie danych

#### 🗄️ **System Bazy Danych**
- **9 Tabel SQLite**:
  - `matches` - Podstawowe dane meczów
  - `match_predictions` - Predykcje AI
  - `match_results` - Rzeczywiste wyniki
  - `prediction_accuracy` - Obliczona dokładność
  - `team_form_data` - Forma drużyn
  - `player_matchups` - Pojedynki zawodników
  - `player_season_stats` - Statystyki sezonowe
  - `player_match_stats` - Statystyki meczowe
  - `sqlite_sequence` - Sekwencje SQLite

### 🎯 **KLUCZOWE WYMAGANIA SPEŁNIONE**

#### 1. **Predykcje tylko przy potwierdzonych składach** ✅
```javascript
// System sprawdza składy przed zapisem
hasConfirmedLineups(lineups) {
  // Minimum 11 zawodników na drużynę
  const homeHasPlayers = homeLineup.startXI && homeLineup.startXI.length >= 11;
  const awayHasPlayers = awayLineup.startXI && awayLineup.startXI.length >= 11;
  return homeHasPlayers && awayHasPlayers;
}
```

#### 2. **Automatyczna aktualizacja wyników** ✅
```javascript
// Endpoint do pobierania wyników zakończonych meczów
POST /api/betting/update-results
// Automatycznie oblicza dokładność predykcji
```

#### 3. **System odświeżania analiz** ✅
```javascript
// Czyszczenie cache wymusza nowe analizy
POST /api/betting/cache/clear
```

#### 4. **Analiza dokładności przez AI** ✅
```javascript
// AI analizuje własne predykcje
POST /api/betting/openai/analyze
```

---

## 🏗️ Architektura Systemu

### 📐 **Architektura Ogólna**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   External APIs │
│   (React)       │◄──►│   (Node.js)     │◄──►│                 │
│   Port: 5175    │    │   Port: 3001    │    │ • API-Sports.io │
└─────────────────┘    └─────────────────┘    │ • OpenAI GPT-4  │
                                │              │ • OpenWeather   │
                                ▼              └─────────────────┘
                       ┌─────────────────┐
                       │   SQLite DB     │
                       │   (Local File)  │
                       └─────────────────┘
```

### 🔄 **Przepływ Danych**
1. **Pobieranie Meczów** → API-Sports.io → Backend → Frontend
2. **Analiza Meczu** → Backend → OpenAI → Analiza → Baza Danych
3. **Walidacja Składów** → Sprawdzenie składów → Zapis predykcji (jeśli składy OK)
4. **Aktualizacja Wyników** → API-Sports.io → Porównanie → Statystyki dokładności
5. **Analiza AI** → OpenAI analizuje własne predykcje → Raport dokładności

---

## ⚙️ Funkcjonalności

### 🏟️ **Zakładka "Mecze"**
- Lista dzisiejszych i nadchodzących meczów
- Filtrowanie po ligach i datach
- Przycisk "Analizuj" dla każdego meczu
- Status składów (potwierdzone/niepotwierdzone)
- Informacje o meczach (drużyny, czas, stadion)

### 🤖 **Zakładka "Analiza AI"**
- Szczegółowa analiza wybranego meczu
- Predykcje wyników z prawdopodobieństwami
- Analiza formy drużyn (ostatnie 5 meczów)
- Pojedynki zawodników (gdy składy dostępne)
- Warunki pogodowe
- Poziom pewności AI
- Rekomendacje zakładów

### 📊 **Zakładka "Analiza Wyników"**
- Lista zakończonych meczów z predykcjami
- Porównanie przewidywań z rzeczywistymi wynikami
- Statystyki dokładności (ogólne i szczegółowe)
- Przycisk "Analiza AI" dla każdej predykcji
- Wizualne wskaźniki poprawności
- Meta-analiza przez OpenAI

### 🔧 **Funkcjonalności Techniczne**
- **Cache System** - 10-minutowy cache analiz z możliwością czyszczenia
- **Fallback Analysis** - Działanie bez OpenAI
- **Error Handling** - Graceful degradation przy błędach
- **Logging** - Szczegółowe logi wszystkich operacji
- **Database Backup** - Automatyczne kopie zapasowe
- **API Rate Limiting** - Ochrona przed przekroczeniem limitów

---

## 🚀 Instalacja i Uruchomienie

### 📋 **Wymagania**
- Node.js 18+ 
- npm lub yarn
- Klucz API do API-Sports.io
- Klucz OpenAI (opcjonalny)

### 🔧 **Instalacja**
```bash
# Klonowanie repozytorium
git clone <repository-url>
cd football-betting-app

# Instalacja zależności
npm install

# Konfiguracja zmiennych środowiskowych
cp .env.example .env
# Edytuj .env z własnymi kluczami API
```

### ⚙️ **Konfiguracja .env**
```env
# API Football Configuration
API_FOOTBALL_KEY=your_api_football_key_here
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io

# OpenAI API (opcjonalny - fallback dostępny)
OPENAI_API_KEY=your_openai_key_here

# OpenAI output token hint (optional)
# If set, this value reserves an expected number of output tokens when estimating request budget.
# Leave empty or unset to allow no hard cap (be aware of potential cost implications).
# Example: OPENAI_EXPECTED_OUTPUT_TOKENS=1200
OPENAI_EXPECTED_OUTPUT_TOKENS=

# OpenWeatherMap API (opcjonalny)
OPENWEATHERMAP_API_KEY=your_weather_key_here

# Server Configuration
PORT=3001
NODE_ENV=development
```

### 🏃 **Uruchomienie**
```bash
# Terminal 1 - Backend
node server.js

# Terminal 2 - Frontend (nowe okno terminala)
npm run dev

# Dostęp do aplikacji
# Frontend: http://localhost:5175
# Backend API: http://localhost:3001
```

---

## 📡 API Dokumentacja

### 🏟️ **Endpointy Meczów**
```http
GET /api/betting/fixtures/today
# Zwraca dzisiejsze mecze

GET /api/betting/fixtures/upcoming  
# Zwraca nadchodzące mecze

GET /api/betting/fixtures/:id
# Szczegóły konkretnego meczu

GET /api/betting/fixtures/:id/analyze
# Analiza meczu z zapisem do bazy (jeśli składy potwierdzone)
```

### 🤖 **Endpointy AI i Analiz**
```http
POST /api/betting/cache/clear
# Czyści cache analiz

POST /api/betting/openai/analyze
# Analiza predykcji przez OpenAI
Body: { "prompt": "...", "maxTokens": 1000 }

POST /api/betting/update-results
# Automatyczna aktualizacja wyników zakończonych meczów
```

### 📊 **Endpointy Statystyk**
```http
GET /api/betting/accuracy-stats
# Ogólne statystyki dokładności

GET /api/betting/prediction-history?limit=20
# Historia predykcji z wynikami

GET /api/betting/accuracy-stats/by-league
# Statystyki według lig
```

### 🧪 **Endpointy Testowe**
```http
POST /api/betting/fixtures/:id/simulate-result
# Symulacja wyniku meczu (do testów)
Body: { "homeScore": 2, "awayScore": 1 }

GET /api/betting/test
# Test połączenia z API
```

---

## 📁 Struktura Projektu

```
football-betting-app/
├── 📁 src/
│   ├── 📁 components/          # Komponenty React
│   │   ├── App.jsx            # Główny komponent z zakładkami
│   │   ├── MatchList.jsx      # Lista meczów
│   │   ├── MatchAnalysis.jsx  # Analiza meczu
│   │   ├── ResultsAnalysis.jsx # NOWA: Analiza wyników
│   │   ├── MatchDetails.jsx   # Szczegóły meczu
│   │   ├── Header.jsx         # Nagłówek aplikacji
│   │   └── ...               # Inne komponenty
│   ├── 📁 services/           # Serwisy biznesowe
│   │   ├── footballDataService.js    # Integracja z API Football
│   │   ├── openaiAnalysisService.js  # Integracja z OpenAI
│   │   └── databaseService.js        # Obsługa bazy danych
│   └── 📁 routes/             # Endpointy API
│       └── bettingRoutes.js   # Wszystkie endpointy
├── 📁 database/               # Baza danych
│   ├── schema.sql            # Struktura tabel
│   └── football_betting.db   # Plik bazy SQLite
├── 📁 .kiro/specs/           # Specyfikacje Kiro
│   └── match-database-system/ # Spec systemu bazy danych
├── 📄 server.js              # Główny serwer Express
├── 📄 package.json           # Zależności projektu
├── 📄 .env                   # Zmienne środowiskowe
└── 📄 README.md              # Ta dokumentacja
```

---

## 🗄️ Schema Bazy Danych

### 📊 **Główne Tabele**
```sql
-- Mecze
CREATE TABLE matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER UNIQUE NOT NULL,
    home_team_id INTEGER NOT NULL,
    home_team_name TEXT NOT NULL,
    away_team_id INTEGER NOT NULL,
    away_team_name TEXT NOT NULL,
    league_id INTEGER NOT NULL,
    league_name TEXT NOT NULL,
    match_date TEXT NOT NULL,
    venue TEXT,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Predykcje AI
CREATE TABLE match_predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER NOT NULL,
    home_win_probability INTEGER NOT NULL,
    draw_probability INTEGER NOT NULL,
    away_win_probability INTEGER NOT NULL,
    predicted_home_score INTEGER NOT NULL,
    predicted_away_score INTEGER NOT NULL,
    confidence_level TEXT NOT NULL,
    ai_model TEXT NOT NULL,
    prediction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fixture_id) REFERENCES matches (fixture_id)
);

-- Rzeczywiste wyniki
CREATE TABLE match_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER NOT NULL,
    home_score INTEGER NOT NULL,
    away_score INTEGER NOT NULL,
    halftime_home_score INTEGER,
    halftime_away_score INTEGER,
    winner TEXT NOT NULL,
    result_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fixture_id) REFERENCES matches (fixture_id)
);

-- Dokładność predykcji
CREATE TABLE prediction_accuracy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER NOT NULL,
    result_correct BOOLEAN NOT NULL,
    score_correct BOOLEAN NOT NULL,
    total_goals_correct BOOLEAN NOT NULL,
    probability_accuracy REAL NOT NULL,
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fixture_id) REFERENCES matches (fixture_id)
);
```

---

## 🔧 Konfiguracja

### 🌍 **Zmienne Środowiskowe**
| Zmienna | Wymagana | Opis |
|---------|----------|------|
| `API_FOOTBALL_KEY` | ✅ | Klucz do API-Sports.io |
| `OPENAI_API_KEY` | ❌ | Klucz OpenAI (fallback dostępny) |
| `OPENWEATHERMAP_API_KEY` | ❌ | Klucz do pogody |
| `PORT` | ❌ | Port serwera (domyślnie 3001) |
| `NODE_ENV` | ❌ | Środowisko (development/production) |

### ⚙️ **Konfiguracja API**
```javascript
// footballDataService.js
const API_CONFIG = {
  baseURL: 'https://v3.football.api-sports.io',
  headers: {
    'X-RapidAPI-Key': process.env.API_FOOTBALL_KEY,
    'X-RapidAPI-Host': 'v3.football.api-sports.io'
  },
  timeout: 10000
};

// openaiAnalysisService.js
const OPENAI_CONFIG = {
  model: 'gpt-4',
  maxTokens: 2000,
  temperature: 0.7,
  cacheTimeout: 600000 // 10 minut
};
```

---

## 🐛 Rozwiązywanie Problemów

### ❌ **Częste Problemy**

#### 1. **Pusta strona w przeglądarce**
```bash
# Sprawdź czy serwery działają
curl http://localhost:3001/api/betting/test
curl http://localhost:5175

# Sprawdź logi w konsoli przeglądarki (F12)
# Zrestartuj serwery
```

#### 2. **Błąd "Cannot connect to API"**
```bash
# Sprawdź klucz API Football
echo $API_FOOTBALL_KEY

# Sprawdź limit zapytań API
curl -H "X-RapidAPI-Key: YOUR_KEY" \
     "https://v3.football.api-sports.io/status"
```

#### 3. **Baza danych nie działa**
```bash
# Sprawdź czy plik bazy istnieje
ls -la database/football_betting.db

# Zainicjalizuj bazę ponownie
node -e "
const { databaseService } = require('./src/services/databaseService.js');
databaseService.initialize().then(() => console.log('OK'));
"
```

#### 4. **OpenAI nie działa**
```bash
# Sprawdź klucz OpenAI
echo $OPENAI_API_KEY

# System ma fallback - sprawdź logi
# Fallback analiza działa bez OpenAI
```

### 🔧 **Narzędzia Diagnostyczne**
```bash
# Test kompletnego systemu
node test-complete-system.js

# Test bazy danych
node debug-database-connection.js

# Test endpointu OpenAI
node test-openai-endpoint.js

# Sprawdź zawartość bazy
node inspect-database-content.js
```

---

## 📈 Obecny Stan Danych

### 🗄️ **Baza Danych**
- **Rozmiar**: 167,936 bajtów
- **Tabele**: 9 tabel zainicjalizowanych
- **Predykcje**: 2 mecze z predykcjami
- **Status**: ✅ Działająca

### 📊 **Przykładowe Dane**
```json
{
  "fixture_id": 1380412,
  "match": "Górnik Zabrze vs Nieciecza",
  "prediction": "1-2",
  "probabilities": "17% - 22% - 61%",
  "confidence": "medium",
  "status": "Zapisane w bazie"
}
```

---

## 🚀 Roadmapa Rozwoju

### 🎯 **Planowane Funkcjonalności**
- [ ] **Dashboard Analytics** - Zaawansowane statystyki i wykresy
- [ ] **User Accounts** - System kont użytkowników
- [ ] **Betting Integration** - Integracja z bukmacherami
- [ ] **Mobile App** - Aplikacja mobilna
- [ ] **Real-time Notifications** - Powiadomienia o meczach
- [ ] **Machine Learning** - Własne modele ML
- [ ] **Social Features** - Udostępnianie predykcji
- [ ] **API Public** - Publiczne API dla deweloperów

### 🔧 **Ulepszenia Techniczne**
- [ ] **Docker Support** - Konteneryzacja aplikacji
- [ ] **CI/CD Pipeline** - Automatyczne wdrażanie
- [ ] **PostgreSQL** - Migracja z SQLite
- [ ] **Redis Cache** - Zaawansowany cache
- [ ] **Monitoring** - Logi i metryki
- [ ] **Testing** - Unit i integration testy
- [ ] **Documentation** - API docs z Swagger

---

## 👥 Zespół i Kontakt

### 🧑‍💻 **Deweloper**
- **Główny Developer**: Kiro AI Assistant
- **Technologie**: Node.js, React, SQLite, OpenAI
- **Wsparcie**: Kiro IDE Environment

### 📞 **Wsparcie**
- **Issues**: GitHub Issues
- **Dokumentacja**: Ten plik README.md
- **Testy**: Pliki test-*.js w głównym katalogu

---

## 📄 Licencja

Ten projekt jest rozwijany w środowisku Kiro IDE jako demonstracja możliwości AI w analizie sportowej.

---

**Status Projektu**: 🟢 **AKTYWNY ROZWÓJ**  
**Ostatnia Aktualizacja**: 2025-01-08  
**Wersja**: 2.0 - Complete System with Lineup Validation & Results Analysis

---

*Dokumentacja wygenerowana automatycznie przez Kiro AI Assistant*
