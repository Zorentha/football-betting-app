# Plan Implementacji - System Bazy Danych Meczów

- [x] 1. Utworzenie struktury bazy danych SQLite


  - Stworzenie pliku schema.sql z definicjami wszystkich tabel
  - Dodanie indeksów dla optymalizacji wydajności
  - Utworzenie relacji między tabelami z kluczami obcymi
  - _Wymagania: 1.1, 2.1, 5.1_





- [ ] 2. Implementacja DatabaseService
- [ ] 2.1 Stworzenie podstawowej klasy DatabaseService
  - Implementacja metody initialize() do inicjalizacji bazy SQLite
  - Dodanie obsługi błędów połączenia z bazą danych


  - Stworzenie metod pomocniczych do zarządzania połączeniem
  - _Wymagania: 1.1, 1.4_

- [x] 2.2 Implementacja metod zapisywania danych meczów


  - Stworzenie metody saveMatch() do zapisywania podstawowych danych meczu
  - Implementacja metody savePrediction() do zapisywania predykcji AI
  - Dodanie metody saveTeamForm() do zapisywania statystyk formy drużyn
  - _Wymagania: 1.1, 1.2, 2.1, 2.4_



- [ ] 2.3 Implementacja zapisywania pojedynków player vs player
  - Stworzenie metody savePlayerMatchups() do zapisywania analiz pozycyjnych
  - Implementacja logiki mapowania pozycji zawodników


  - Dodanie walidacji danych pojedynków przed zapisem
  - _Wymagania: 5.1, 5.2, 5.3, 5.4_

- [ ] 2.4 Implementacja aktualizacji wyników meczów
  - Stworzenie metody saveMatchResult() do zapisywania rzeczywistych wyników


  - Implementacja metody calculatePredictionAccuracy() do obliczania dokładności
  - Dodanie logiki porównywania predykcji z rzeczywistymi wynikami


  - _Wymagania: 3.1, 3.2, 3.3, 3.4_




- [ ] 2.5 Implementacja metod pobierania statystyk
  - Stworzenie metody getAccuracyStats() do pobierania statystyk dokładności
  - Implementacja metody getMatchesWithPredictions() do pobierania historii
  - Dodanie metod pomocniczych do obliczeń statystycznych



  - _Wymagania: 4.1, 4.2, 4.3, 4.4, 7.1, 7.2_

- [ ] 3. Integracja z istniejącym systemem
- [x] 3.1 Dodanie zależności SQLite do package.json



  - Instalacja pakietów sqlite3 i sqlite
  - Aktualizacja package.json z nowymi zależnościami
  - Testowanie instalacji zależności
  - _Wymagania: 1.1_





- [ ] 3.2 Modyfikacja OpenAI Analysis Service
  - Dodanie importu DatabaseService do openaiAnalysisService
  - Integracja zapisywania danych podczas analizy meczu
  - Dodanie obsługi błędów bazy danych bez przerywania analizy


  - _Wymagania: 1.1, 1.2, 1.3, 5.1_

- [ ] 3.3 Aktualizacja endpointu analizy meczu
  - Modyfikacja /api/betting/analyze/:fixtureId do zapisywania w bazie



  - Dodanie logiki zapisywania pojedynków player vs player gdy są składy
  - Implementacja zapisywania wszystkich statystyk używanych w analizie
  - _Wymagania: 1.1, 1.2, 2.1, 5.1_




- [ ] 3.4 Inicjalizacja bazy danych w server.js
  - Dodanie importu DatabaseService do głównego pliku serwera
  - Implementacja inicjalizacji bazy danych przy starcie aplikacji
  - Dodanie obsługi błędów inicjalizacji z graceful shutdown
  - _Wymagania: 1.1_

- [ ] 4. Implementacja nowych endpointów API
- [ ] 4.1 Endpoint statystyk dokładności predykcji
  - Stworzenie GET /api/betting/accuracy-stats
  - Implementacja zwracania procentu poprawnych predykcji wyników
  - Dodanie szczegółowych statystyk dokładności przewidywanych bramek
  - _Wymagania: 4.1, 4.2, 4.3_

- [ ] 4.2 Endpoint historii predykcji
  - Stworzenie GET /api/betting/prediction-history
  - Implementacja pobierania listy wszystkich predykcji z wynikami
  - Dodanie paginacji i filtrowania wyników
  - _Wymagania: 4.4, 7.1_

- [ ] 4.3 Endpoint masowej aktualizacji wyników
  - Stworzenie POST /api/betting/update-results
  - Implementacja pobierania zakończonych meczów z ostatnich 7 dni
  - Dodanie automatycznego obliczania dokładności dla każdego meczu
  - _Wymagania: 6.1, 6.2, 6.3, 6.4_

- [ ] 5. Rozszerzenie FootballDataService
- [ ] 5.1 Implementacja metody pobierania zakończonych meczów
  - Stworzenie metody getFinishedMatches() w FootballDataService
  - Dodanie filtrowania tylko ważnych lig
  - Implementacja pobierania meczów z określonego zakresu dat
  - _Wymagania: 6.1, 6.2_

- [ ] 6. Testowanie i walidacja systemu
- [ ] 6.1 Testowanie zapisywania kompletnych analiz
  - Stworzenie testów dla zapisywania meczów ze składami
  - Testowanie zapisywania pojedynków player vs player
  - Walidacja poprawności zapisanych danych predykcji
  - _Wymagania: 1.1, 1.2, 5.1_

- [ ] 6.2 Testowanie aktualizacji wyników i dokładności
  - Testowanie zapisywania rzeczywistych wyników meczów
  - Walidacja obliczeń dokładności predykcji
  - Testowanie porównywania przewidywanych wyników z rzeczywistymi
  - _Wymagania: 3.1, 3.2, 3.3, 3.4_

- [ ] 6.3 Testowanie endpointów API
  - Testowanie endpointu statystyk dokładności
  - Testowanie endpointu historii predykcji
  - Walidacja endpointu masowej aktualizacji wyników
  - _Wymagania: 4.1, 4.2, 4.3, 4.4, 6.4_

- [ ] 7. Optymalizacja i finalizacja
- [ ] 7.1 Optymalizacja wydajności bazy danych
  - Dodanie indeksów na często używanych kolumnach
  - Optymalizacja zapytań SQL dla lepszej wydajności
  - Testowanie wydajności z większą ilością danych
  - _Wymagania: 7.3, 7.4_

- [ ] 7.2 Implementacja obsługi błędów i logowania
  - Dodanie szczegółowego logowania operacji bazy danych
  - Implementacja graceful degradation przy błędach bazy
  - Dodanie retry logic dla błędów przejściowych
  - _Wymagania: 1.4, 3.1, 3.2_

- [ ] 7.3 Dokumentacja i przykłady użycia
  - Stworzenie dokumentacji API dla nowych endpointów
  - Dodanie przykładów użycia DatabaseService
  - Utworzenie instrukcji konfiguracji bazy danych
  - _Wymagania: 7.1, 7.2, 7.3, 7.4_