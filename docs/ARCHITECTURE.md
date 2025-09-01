ARCHITECTURE — Football Betting App
===================================

Cel dokumentu
------------
Szczegółowy opis architektury aplikacji: komponenty serwisów, przepływy danych, miejsca integracji z zewnętrznymi usługami (OpenAI, API Football), oraz zależności między warstwami (backend, frontend, baza danych, skrypty batch).

1. Wysoki poziom — komponenty
-----------------------------
- Backend (Node.js + Express)
  - Entrypoint: server.js
  - Routery: src/routes/bettingRoutes.js
  - Serwisy: src/services/*
    - openaiAnalysisService.js — integracja z OpenAI, parsing, normalizacja, fallback annotate
    - databaseService.js — operacje CRUD na SQLite (database/football_betting.db)
    - footballDataService.js — pobieranie danych meczowych / składy / statystyki
- Frontend (React + Vite)
  - Komponenty: src/components/*
    - AIAnalysis.jsx — wyświetlanie wyników AI (3‑way, per‑tip)
    - ConfirmSaveModal.jsx — surowy output + confirm & save flow
    - MatchCard / MatchDetails — integracja modalów i wywołań API
- Cron / Jobs / Scripts
  - Skrypty w scripts/ — batchy, retrysy, trening kalibratora, e2e (confirm_and_save_test.mjs)
  - Server scheduler (server.js) — okresowo sprawdza składy i uruchamia analizy gdy potwierdzone
- Baza danych
  - SQLite (database/football_betting.db)
  - Schemat: database/schema.sql
- CI/CD
  - .github/workflows/ci-cd.yml — build, test, docker build & push, plus debug joby
- Artefakty tymczasowe
  - tmp/ — surowe odpowiedzi, payloady, debug output (powinny być ignorowane w git)

2. Przepływ danych — podstawowy scenariusz
-----------------------------------------
1. Źródła danych:
   - footballDataService pobiera fixturey oraz potwierdzone składy (API Football lub inny provider).
2. Wyzwalanie analizy:
   - Ręczne: użytkownik wybiera fixture w UI -> otwiera modal AIAnalysis -> może wywołać surową analizę (dev)
   - Automatyczne: cron/scheduler wykrywa potwierdzone składy i kolejkuje task analyzeMatch.
3. OpenAIAnalysisService:
   - Buduje prompt z kontekstem (teams, history, avgGoals, confirmed lineups, market odds jeśli dostępne).
   - Wywołuje OpenAI z _callOpenAI (retry + timeout).
   - Parsuje odpowiedź przez safeParseJSONFromText.
   - Jeżeli bettingTips są niezgodne -> strict annotate fallback: dodatkowe wywołanie z restrykcyjnym promptem żądającym poprawnego JSON.
   - Waliduje i normalizuje output (validateAndNormalizeAIAnalysis).
   - Zwraca strukturę z: probabilities (3-way), predictedScore, bettingTips, confidence, keyFactors, metadata (calibration_version, ai_model).
4. Persistencja:
   - Po akceptacji użytkownika endpoint POST /fixtures/:id/confirm-save wywołuje savePrediction w databaseService.
   - Prediction zapisuje surowe pola oraz metadata i calibration_version.
5. Konsumpcja w UI:
   - Komponenty wyświetlają three‑way % i per‑tip % (integery).
   - Surowy output jest dostępny w modalu przed zapisem.

3. Detale: OpenAIIntegration
----------------------------
- Plik: src/services/openaiAnalysisService.js
- _callOpenAI:
  - Mechanizmy: AbortController -> timeout (np. 30s), retry z exponential backoff + jitter.
  - Budowanie body: model, messages, temperature (domyślnie 0.2). Nie ustawiamy b.max_tokens na stałe — używamy env OPENAI_EXPECTED_OUTPUT_TOKENS jeśli chcesz limit.
- Parsowanie:
  - safeParseJSONFromText — ekstrakcja JSON z odpowiedzi, heurystyki czyszczące.
  - Jeśli odpowiedź nie zawiera Required structure (bettingTips[i].probability jako integer) -> strict annotate fallback:
    - Wysyłamy drugi prompt, żądając dokładnego JSON array z obiektami {type, probability (int), reasoning}.
    - Wynik fallback zapisujemy (tmp/annotate_strict_run_result.json) do celu audytu.
- Normalizacja:
  - validateAndNormalizeAIAnalysis: konwersja na liczby, normalizacja 3‑way do sumy 100, normalizacja per‑tip do sumy 100, spójność z predictedScore.
  - applyCalibration: temperature scaling + normalization + rounding + fix rounding drift.

4. Walka z błędami i retry
--------------------------
- Timeout & AbortController: przerywamy długie requesty do OpenAI, zwracamy odpowiedni error do caller.
- Retry/backoff: kilka prób z rosnącymi opóźnieniami i jitterem; na niektóre kody błędów (rate limit / 5xx) retry.
- Strict annotate fallback: szczególny przypadek: model zwraca niepoprawny JSON -> wymuszamy czysty JSON.
- Logowanie i tmp artifacts: zapisy surowych odpowiedzi do tmp/ (audyt, debugging).

5. Integracja z rynkiem (odczyt kursów)
--------------------------------------
- Obecnie: opcjonalne pobieranie odds w footballDataService lub osobny skrypt.
- Plan: blend market probs z AI predictions — implementacja applyCalibration powinna przyjmować opcjonalne marketProbs i blendWeight.

6. Bezpieczeństwo architektury
------------------------------
- Secrets (OPENAI_API_KEY, API_FOOTBALL_KEY) - trzymane w .env lokalnie i w GitHub Secrets dla CI.
- Tymczasowe artefakty zawierające surowe response powinny być ignorowane w .gitignore.
- Nie wykonywać git history rewrite przed rotacją/sekwencją revokacji kluczy.

7. Scalability & Production Notes
---------------------------------
- DB: SQLite obecnie użyteczne do prototypu; dla produkcji rozważyć Postgres (skalowanie, backups).
- OpenAI usage: monitor token usage, wprowadzić soft limits (env) i alerty kosztowe.
- Concurrency: kolejka z ograniczeniem równoległych wywołań OpenAI (rate limiting).
- Observability: metrici: liczba strict-fallback, latencje OpenAI, liczba retry, sukcesy zapisu do DB.

8. Przydatne odnośniki i pliki
------------------------------
- src/services/openaiAnalysisService.js
- src/routes/bettingRoutes.js
- src/services/databaseService.js
- scripts/* (lista skryptów batch)
- .github/workflows/ci-cd.yml
- docs/PROJECT_DOCUMENTATION.md (dokument nadrzędny)

Uwagi końcowe
------------
Ten dokument opisuje architekturę na poziomie projektowym; po zapisaniu mogę:
- wygenerować diagramy (mermaid) do docs/,
- rozbić plik na mniejsze rozdziały,
- dodać przykładowe payloady request/response i sekwencje wywołań (przykładowy JSON zwracany przez OpenAI).
