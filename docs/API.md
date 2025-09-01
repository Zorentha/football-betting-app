API — Football Betting App
==========================

Krótki przegląd
---------------
API dostarcza endpointy do pobierania fixture'ów, odczytu zapisanych analiz, uruchamiania dev-analiz OpenAI oraz potwierdzenia i zapisu predykcji do bazy. Główna zasada: surową odpowiedź modelu pokazujemy użytkownikowi przed zapisem; zapis do DB następuje dopiero po Confirm & Save.

Autoryzacja
-----------
- W środowisku deweloperskim endpointy są dostępne bez auth (dev). W środowisku produkcyjnym należy dodać warstwę auth (JWT/API key/HTTP basic) przed exposed endpoints.
- OpenAI API key trzymamy po stronie serwera (w .env / GitHub Secrets). Nigdy nie przekazujemy OPENAI_API_KEY do klienta.

Formaty i konwencje
------------------
- Wszystkie odpowiedzi JSON: { success: boolean, data?: any, error?: string, details?: any }
- Probabilities: integer percentages (0-100), suma 3‑way powinna wynosić 100.
- Per‑tip probabilities: integer percentages normalized to sum 100 across tips (validateAndNormalizeAIAnalysis wykonuje normalizację).
- PredictedScore: { home: number, away: number } — używane też do synchronizacji "Correct score" w bettingTips.
- Force reanalysis: do endpointu analiz dodaj query param ?force=1 aby wymusić ponowne wywołanie OpenAI nawet jeżeli zapisana analiza istnieje.

Lista endpointów
----------------

1) GET /api/health
- Opis: prosty healthcheck.
- Response:
  200 OK
  {
    "success": true,
    "data": { "status": "ok" }
  }

2) GET /api/betting/fixtures/today
- Opis: zwraca listę fixture'ów na dziś (oraz nearby days), oraz — jeżeli istnieje — podłącza zapisane skróty analiz AI (aiAnalysis) dla każdego fixture.
- Query:
  - none
- Response:
  200 OK
  {
    "success": true,
    "data": [ { fixture }, ... ],
    "count": <number>
  }
- Każdy fixture może zawierać:
  aiAnalysis: {
    probabilities: { homeWin, draw, awayWin },
    predictedScore: { home, away },
    confidence,
    keyFactors: [...],
    bettingTips: [...]
  }

3) GET /api/betting/fixtures/all-today
- Opis: podobne do /today, ale bardziej rozbudowane (wszystkie liga/fields) — używane do debug/list overview.
- Response: jak wyżej plus count/leagues.

4) GET /api/betting/fixtures/:fixtureId/analysis
- Opis: ZWRACA JEDYNIE ZAPISANĄ analizę z DB; NIE wywołuje OpenAI. Użyteczne, by nie uruchamiać modelu przy każdym wejściu na stronę meczu.
- Query:
  - ?force=1 — (opcjonalne) wymusza reanalysis; gdy obecna analiza istnieje, normalnie endpoint zwraca ją i nie dzwoni do OpenAI.
- Responses:
  - 200 OK
    { success: true, data: { fixtureId, teams, aiAnalysis }, fromDatabase: true }
  - 404 Not Found (no saved analysis)
    { success: false, error: 'Brak zapisanej analizy dla tego meczu' }
- Notes:
  - Endpoint przed zwróceniem uruchamia validateAndNormalizeAIAnalysis oraz lokalne syncPredictedScore/normalizeBettingTips/rebalanceProbabilities (server-side sanitization).

5) POST /api/betting/openai/analyze
- Opis: DEV endpoint — wykonuje analizę z custom prompt lub prebuilt prompt (analyzeMatch) i zwraca surową odpowiedź modelu oraz znormalizowaną strukturę.
- Body:
  {
    "prompt": "<string or object: optional fields for fixture context>"
  }
- Response:
  200 OK
  {
    "success": true,
    "data": {
      "raw": { ... },           // surowa odpowiedź OpenAI (raw model output)
      "normalized": { ... }     // wynik po validateAndNormalizeAIAnalysis (probabilities, bettingTips, predictedScore, metadata)
    }
  }
- Uwaga: endpoint nie zapisuje nic do DB. Funkcja analyzeWithCustomPrompt obsługuje retry/timeout i strict annotate fallback.

6) POST /api/betting/openai/clear-cache
- Opis: DEV endpoint — czyści in-memory cache openaiAnalysisService.
- Response:
  200 OK
  { success: true, cleared: <number_of_entries_cleared> }

7) POST /api/betting/fixtures/:fixtureId/confirm-save
- Opis: Kluczowy endpoint — użytkownik potwierdza surową odpowiedź i proszę o zapis do DB.
- Body:
  {
    "prediction": {
      "probabilities": { "homeWin": 50, "draw": 30, "awayWin": 20 },
      "predictedScore": { "home": 1, "away": 1 },
      "confidence": "high",
      "confidencePercentage": 82,
      "bettingTips": [
        { "type": "Both teams to score", "probability": 40, "reasoning": "..." },
        ...
      ],
      "keyFactors": [ "team news", "form" ],
      "prediction_metadata": { "model": "gpt-5", "prompt_version": "v2" },
      "calibration_version": "cal-v1"
    }
  }
- Response:
  - 200 OK
    { success: true, savedId: <db_row_id> }
  - 400 Bad Request (missing prediction or invalid shape)
    { success: false, error: 'prediction.probabilities is required' }
  - 500 Internal Error (DB fail)
    { success: false, error: 'Failed to save prediction to DB' }
- Notes:
  - Backend zakłada, że klient już pokazał surową odpowiedź i użytkownik ją zatwierdził. Backend nie ponownie wywołuje OpenAI w tym kroku.
  - databaseService.savePrediction odpowiednio serializuje betting_tips i prediction_metadata do JSON w kolumnach DB.

Dodatkowe zasady i przykłady
---------------------------

- Normalizacja per-tip:
  - Per‑tip probabilities powinny być liczbami całkowitymi i sumować ~100. Jeśli model zwróci wartości w innych formatach, server-side validateAndNormalizeAIAnalysis:
    - sparsuje liczby,
    - jeśli suma == 0 -> rozdzieli równo,
    - jeśli suma > 0 -> przeskaluje do 100 i dopasuje rounding drift.

- Konsystencja predictedScore vs 3-way:
  - Jeśli predictedScore sugeruje remis, serwis zapewnia, że draw probability będzie najwyższe (bump + renormalize).

- Raw output:
  - Frontend powinien umożliwić "Show raw AI output" (tekst) przed confirm. Surowy JSON jest zapisywany lokalnie w tmp/ (lub przesyłany do klienta przez /openai/analyze endpoint).

- Przykładowy curl — uruchomienie dev analyze:
  curl -X POST "http://localhost:3001/api/betting/openai/analyze" \
    -H "Content-Type: application/json" \
    -d '{"prompt":"Analyze fixture XYZ with confirmed lineups..."}'

- Przykładowy curl — confirm & save:
  curl -X POST "http://localhost:3001/api/betting/fixtures/1380415/confirm-save" \
    -H "Content-Type: application/json" \
    -d '{"prediction":{ "probabilities": {"homeWin":55,"draw":25,"awayWin":20}, "predictedScore":{"home":2,"away":1}, "bettingTips":[{"type":"Over 2.5","probability":60,"reasoning":"..." }]}}'

Błędy i kody odpowiedzi
-----------------------
- 200 OK — success: true
- 400 Bad Request — brak wymaganych danych (np. brak prediction w confirm-save)
- 404 Not Found — brak zapisanej analizy (GET /fixtures/:id/analysis)
- 500 Internal Server Error — błąd serwera (DB, OpenAI timeout, itp.)
- W przypadku błędów OpenAI: serwis stosuje retry / exponential backoff; jeśli nadal błąd -> zwraca 500 z opisem.

Lokalizacja implementacji
-------------------------
- routing: src/routes/bettingRoutes.js
- OpenAI + parsing/normalizacja: src/services/openaiAnalysisService.js
- DB persistence: src/services/databaseService.js
- Frontend components (consume API): src/components/AIAnalysis.jsx, src/components/ConfirmSaveModal.jsx

Rate limiting / koszty
----------------------
- Każde wywołanie OpenAI generuje koszty — zadbaj o cache i nie wywołuj modelu przy każdym renderze (użyj saved analysis i ?force=1 do wymuszenia).
- Rozważ wprowadzenie rate limitów po stronie serwera (np. 1 request/fixture/minute) i soft-quotas per-ip / per-user.

Debug & test
------------
- Użyj POST /api/betting/openai/analyze do ręcznego testowania promptów i surowych outputów.
- Użyj POST /api/betting/openai/clear-cache aby wymusić ponowną analizę w testach.
- W środowisku CI testy uruchamiają node scripts/unit_test_validateAI.js — sprawdza validateAndNormalizeAIAnalysis.

Uwagi końcowe
-------------
Ta specyfikacja jest wystarczająco szczegółowa do integracji frontendu oraz do przygotowania klienta API. Jeśli chcesz, mogę dorzucić:
- OpenAPI/Swagger spec (yaml/json),
- przykładowe payloady i odpowiedzi w plikach tmp/example_payloads/,
- przykładowe testy integracyjne (supertest/mocha).
