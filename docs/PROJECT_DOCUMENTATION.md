Football Betting App — Kompleksowa dokumentacja projektu
=======================================================

Spis treści
----------
1. Cel projektu
2. Szybkie uruchomienie (dev)
3. Architektura systemu — komponenty i przepływy
4. Kluczowe pliki i lokalizacje (mapa repo)
5. Integracja z OpenAI — szczegóły implementacji
6. Walidacja, normalizacja i kalibracja wyników
7. Baza danych i schemat
8. Endpointy API (lista i opis)
9. Frontend — komponenty i UX flow
10. Skrypty pomocnicze i testy
11. CI/CD — GitHub Actions (diagnostyka i rozwiązania problemów)
12. Bezpieczeństwo i incydent wycieku sekretów
13. Dalsze kroki i rekomendowana lista zadań
14. Przydatne polecenia i checklisty

1) Cel projektu
---------------
Aplikacja ma wspierać analizę meczów piłkarskich i produkcję prognoz bettingowych wykorzystując model LLM (w produkcji: ChatGPT‑5). Wyniki generowane przez model to:
- 3‑way probabilities (home / draw / away) w integerach procentowych,
- predictedScore (np. "1-1"),
- per‑tip bettingTips — lista typów z probability (integer) i reasoning,
- metadata: confidence, keyFactors, calibration_version, ai_model, surowa odpowiedź modelu.

Ważne założenia:
- Surową odpowiedź modelu pokazujemy użytkownikowi przed zapisaniem do DB.
- Zapis do DB następuje dopiero po ręcznym potwierdzeniu użytkownika (Confirm & Save).
- Analizy nie są ponownie uruchamiane po kliknięciu meczu, jeśli już istnieje zapis w DB — wymuszenie ?force=1.

2) Szybkie uruchomienie (dev)
-----------------------------
Wymagania:
- Node.js (LTS), npm
- SQLite (w repo są pliki DB ale produkcyjnie konfiguruj osobny DB)
- Plik .env (na podstawie .env.example):
  - OPENAI_API_KEY=sk-...
  - API_FOOTBALL_KEY=...
  - PORT (opcjonalnie)

Kroki:
1. Instalacja:
   npm ci
2. Uruchom backend:
   npm run serve-api
3. Uruchom frontend (dev):
   npm run dev
4. Dev smoke page (dev helper):
   - Otwórz stronę dev (vite) i użyj "Show AI Analysis (dev)" aby zobaczyć przykładowy plik tmp/annotate_strict_parsed_1435547.json
5. Testy jednostkowe:
   node scripts/unit_test_validateAI.js
6. E2E (headless confirm & save):
   node scripts/confirm_and_save_test.mjs
   (upewnij się, że backend jest uruchomiony)

3) Architektura systemu — komponenty i przepływy
-----------------------------------------------
- FootballDataService (src/services/footballDataService.js)
  - Pobiera metadane meczów, składy i statystyki.
- OpenAIAnalysisService (src/services/openaiAnalysisService.js)
  - Buduje prompt, komunikuje się z OpenAI, parsuje i waliduje JSON, stosuje retry i timeout.
  - Zawiera strict annotate fallback (jeśli bettingTips nie są valid -> ponowny prompt wymuszający poprawny JSON).
  - Opcjonalnie zapisuje surowe odpowiedzi w tmp/ dla audytu.
- Routes (src/routes/bettingRoutes.js)
  - Główne endpointy API do pobierania i potwierdzania analiz.
  - Logika: przy żądaniu analiz najpierw sprawdza DB — zwraca istniejącą analizę; only force triggers reanalysis.
- DatabaseService (src/services/databaseService.js)
  - Operacje CRUD na SQLite; savePrediction zapisuje prediction, metadata i calibration_version.
- Frontend
  - Minimalny React + Vite; ConfirmSaveModal.jsx wyświetla surową analizę i umożliwia Confirm & Save.
- Jobs / Cron
  - Skrypty serwera sprawdzające potwierdzone składy i kolejkujące analizy (server.js + helper scripts).

4) Kluczowe pliki i lokalizacje (mapa repo)
-------------------------------------------
- server.js — entrypoint backendu
- src/routes/bettingRoutes.js — trasy API
- src/services/openaiAnalysisService.js — integracja OpenAI + parsing + normalizacja + annotate fallback
- src/services/databaseService.js — SQLite persistence (database/football_betting.db)
- src/services/footballDataService.js — pobieranie danych meczowych
- src/components/ConfirmSaveModal.jsx — modal potwierdzenia zapisu
- src/components/AIAnalysis.jsx — komponent wyświetlający AI analysis
- scripts/ — wiele skryptów do diagnostyki, migracji, testów i batch-runów
- database/schema.sql — schemat bazy
- tmp/ — artefakty tymczasowe (powinny być ignorowane w git; większość plików przeniesiona do .gitignore)
- .github/workflows/ci-cd.yml — główny workflow CI
- README.md, docs/ — dokumentacja

5) Integracja z OpenAI — szczegóły implementacji
------------------------------------------------
Główne punkty:
- Service: src/services/openaiAnalysisService.js
  - _callOpenAI: używa AbortController (timeout domyślny), retry z exponential backoff + jitter.
  - Model + messages -> body; nie używa hardcoded b.max_tokens domyślnie. Jeśli chcesz limit, ustaw env OPENAI_EXPECTED_OUTPUT_TOKENS.
  - safeParseJSONFromText: ekstrakcja JSON z odpowiedzi modelu i fallbackowe próby oczyszczania.
  - strict annotate fallback: jeśli bettingTips nie zawierają integer probability -> drugi, restrykcyjny prompt wymuszający czysty JSON array.
- Przechowywanie:
  - Surowa odpowiedź może być zapisana do tmp/annotate_strict_run_result.json (audyt).
- Koszty/tokens:
  - Brak twardego limitu tokenów w kodzie -> kontroluj poprzez env/limity w produkcji ze względu na koszty.

6) Walidacja, normalizacja i kalibracja wyników
-----------------------------------------------
- validateAndNormalizeAIAnalysis:
  - Konwertuje wartości do numeric/int, normalizuje sumę 3‑way probabilities do 100.
  - Per‑tip probabilities: jeśli suma == 0 -> rozkład równy; jeśli >0 -> skalowanie do 100 i dopasowanie reszty największemu typowi.
  - Spójność z predictedScore: jeżeli predictedScore wskazuje remis, ensure draw probability >= others (bump + proporcjonalne skalowanie).
- applyCalibration(probs, calibrator):
  - Możliwość temperature scaling (pow(p, 1/temp)), normalizacja i zaokrąglenia.
  - calibration_version przechowywane z predykcją.

7) Baza danych i schemat
------------------------
- Plik: database/football_betting.db (SQLite)
- Schemat: database/schema.sql
- Główne tabele (skrót):
  - fixtures
  - predictions: columns include fixture_id, probabilities (JSON), predictedScore, betting_tips (JSON), prediction_metadata (JSON), calibration_version, ai_model, created_at
- Operacje: src/services/databaseService.js -> savePrediction(fixtureId, predictionObject)

8) Endpointy API (lista i opis)
-------------------------------
- GET /api/health
- GET /api/betting/fixtures/:fixtureId/analysis
  - Zwraca zapisaną analizę z DB; nie uruchamia OpenAI jeśli analiza istnieje (unless ?force=1).
- POST /api/betting/openai/analyze
  - Dev endpoint — uruchamia analizę z custom prompt.
- POST /api/betting/openai/clear-cache
  - Dev endpoint — czyści cache in-memory.
- POST /api/betting/fixtures/:fixtureId/confirm-save
  - Confirm & Save — zapisuje predykcję do DB po akceptacji użytkownika.

9) Frontend — komponenty i UX flow
----------------------------------
- index.html zawiera prosty dev helper do podglądu tmp artifacts.
- Kluczowe komponenty:
  - AIAnalysis.jsx — wyświetla wynik AI, three‑way probabilities i per‑tip percentages.
  - ConfirmSaveModal.jsx — modal pokazujący surową odpowiedź modelu + normalized view; przycisk Confirm zapisuje do DB.
  - MatchCard / MatchDetails — miejsca, gdzie integrujemy ConfirmSaveModal (zalecane).
- UX:
  - Użytkownik otwiera analizę meczu → widzi trzy‑way % i per‑tip % → może kliknąć "Show raw AI output" → następnie "Confirm & Save" → backend zapisuje.

## 10) Skrypty pomocnicze i testy

Wybrane skrypty:
- scripts/unit_test_validateAI.js — testy walidacji/normalizacji
- scripts/confirm_and_save_test.mjs — e2e symulacja Confirm & Save
- scripts/run_openai_analyze_post.mjs — helper do wywoływania OpenAI analyze
- scripts/train-calibrator.js, scripts/eval-calibration.js — trening i ewaluacja kalibratora
- scripts/retry-error-analyses.js — retry failed analyses
- scripts/retry-timeout-fixtures.js — retry po timeoutach
- scripts/restart-all.ps1 / scripts/restart-frontend.ps1 — local restart helper dla dev
- scripts/push-to-github.ps1 — PowerShell script do pushowania zmian do GitHuba

Więcej informacji o skryptach PowerShell do pushowania zmian dostępne są w [docs/PUSH_TO_GITHUB_POWERSHELL.md](PUSH_TO_GITHUB_POWERSHELL.md).

11) CI/CD — GitHub Actions (diagnostyka i rozwiązania problemów)
----------------------------------------------------------------
Plik workflow: .github/workflows/ci-cd.yml
Główne kroki:
- actions/checkout@v4 z parametrem path: repo (aby wymusić checkout w $GITHUB_WORKSPACE/repo)
- Debug job (debug-workspace) aby zobaczyć konkretne ścieżki na runnerze
- Krok instalacji używa npm --prefix "$GITHUB_WORKSPACE/repo" ci || install
- DODATKOWY fallback: jeśli package.json nie jest widoczny, workflow klonuje repo do /home/runner/work/checked_repo i instaluje tam

Jak diagnozować ENOENT: package.json not found
- Uruchom workflow (workflow_dispatch) — sprawdź output joba debug-workspace
- W logach szukaj:
  - wartość GITHUB_WORKSPACE
  - pełne listingi /home/runner/work i $GITHUB_WORKSPACE/repo
  - wynik find /home/runner/work -type f -name package.json
- Możliwe remedia:
  - dopasować actions/checkout path (path: repo) lub użyć ręcznego clone jako głównej ścieżki instalacji
  - użyć npm --prefix z pathem wykrytym w logach
  - upewnić się, że workflow nie wykonuje dodatkowych checkoutów w innych jobach (nested checkout)

12) Bezpieczeństwo i incydent wycieku sekretów
----------------------------------------------
Zaobserwowano artefakty tmp i ślady tokena w historii PR. Działania przeprowadzone i rekomendacje:
- Co zrobiono:
  - Przygotowano tmp/rotate_secrets_and_cleanup_instructions.md i tmp/why_key_considered_leaked.md
  - Tymczasowe pliki przeniesiono do .gitignore i usunięto z indeksu
- Natychmiastowe zalecenia:
  - ROTATE/REVOKE kluczy (OpenAI, GitHub secrets) — priorytet HIGH
  - Po rotacji: opcjonalnie użyć git-filter-repo / BFG do usunięcia sekretu z historii — wymaga koordynacji (force push)
  - Włączyć skan sekretów w CI (gitleaks)
  - Włączyć branch protection i wymagane status checks
- Skrypty przygotowane: tmp/ (instrukcje + skrypty do git-filter-repo), nie wykonujemy force-push bez Twojej aprobaty

13) Dalsze kroki i rekomendowana lista zadań
--------------------------------------------
Priorytety:
- [ ] (HIGH) Rotate/Revoke OpenAI key i zaktualizować CI secrets
- [ ] (HIGH) Dodać skan sekretów do CI (gitleaks)
- [x] (DONE) Dodać tmp/ do .gitignore i usunąć artefakty
- [ ] (MED) Zintegrować ConfirmSaveModal z React SPA (MatchDetails)
- [ ] (MED) Dodać monitoring strict-fallback (licznik + alert)
- [ ] (MED) Zintegrować market blending (odczyt odds i blendWeight)
- [ ] (LOW) Usunąć debug kroki z workflow po potwierdzeniu zielonego runa

14) Przydatne polecenia / checklisty
-----------------------------------
Szczegółowe polecenia i checklisty dla developerów zostały przeniesione do osobnego dokumentu:
- [Developer Guide](DEVELOPER_GUIDE.md) - Przydatne polecenia, skrypty i checklisty dla developerów

Kontakt/uwagi końcowe
--------------------
Ten dokument ma być centralnym źródłem wiedzy o projekcie. Mogę:
- Rozbić dokument na odrębne pliki w /docs (ARCHITECTURE.md, DEPLOYMENT.md, SECURITY.md, API.md).
- Przygotować PR z cleanupem workflow (usunięcie debug dodatkowych kroków) gdy potwierdzisz zielony run.
- Wykonać skrypt do bezpiecznego przygotowania git-filter-repo (bez force-push) i instrukcję krok‑po‑kroku.

Jeżeli chcesz, przygotuję teraz:
- Rozbicie na pliki docs/ARCHITECTURE.md, docs/SECURITY.md, docs/DEPLOYMENT.md (wybierz opcję), lub
- Zrobienie pełnego audit report: commity/linia kodu gdzie wprowadzono zmienne dot. OpenAI tokena i tmp writes (uruchomię git grep i zapiszę output do tmp/).
