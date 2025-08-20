Instrukcja: utworzenie repozytorium na GitHub i wypchnięcie projektu poprzez HTTPS
========================================================================

Krótki plan:
1. Stwórz repo na GitHub przez stronę web.
2. Skonfiguruj lokalne repo (jeśli nie jest zainicjowane) lub połącz istniejący folder z remote.
3. Stwórz branch, zacommituj zmiany i wypchnij na GitHub.
4. (Opcjonalnie) utwórz PR.

A. Utworzenie repozytorium na GitHub (web)
- Zaloguj się na github.com.
- Kliknij zielony przycisk "New" (lub przejdź na https://github.com/new).
- Wypełnij:
  - Repository name: np. football-betting-app
  - Public / Private — wybierz według potrzeb
  - Nie zaznaczaj "Initialize this repository with a README" jeśli chcesz wypchnąć istniejący projekt (możesz, ale potem trzeba będzie pull/merge).
- Kliknij "Create repository".
- Skopiuj HTTPS URL repo (powinien wyglądać jak https://github.com/USERNAME/REPO.git).

B. Autoryzacja (HTTPS) — uwagi
- Git przy próbie push/pop przez HTTPS poprosi o dane:
  - Username: Twój login GitHub
  - Password: od maja 2021 GitHub wymaga PAT zamiast hasła. Wygeneruj Personal Access Token z zakresem "repo".
- Alternatywnie zainstaluj i skonfiguruj Git Credential Manager (zazwyczaj instalator Git na Windows go instaluje) lub użyj GitHub CLI: gh auth login

C. Komendy do uruchomienia w Twoim repo (Git Bash / PowerShell)
1) (Opcjonalne) Sprawdź, czy masz git:
   git --version

2) Przejdź do katalogu projektu:
   cd /c/Users/lukas/zorentha-ai/football-betting-app
   (Dostosuj ścieżkę jeśli inna)

3) Jeśli folder NIE jest repozytorium (brak .git) — zainicjuj:
   git init

4) Dodaj zdalny origin (wklej zamiast <HTTPS_URL> URL skopiowany z GitHub):
   git remote add origin <HTTPS_URL>
   Przykład:
   git remote add origin https://github.com/TwojUzytkownik/football-betting-app.git

5) Stwórz branch roboczy i przełącz się na niego:
   git checkout -b feature/openai-expected-output-tokens

6) Dodaj pliki i commit:
   git add src/components/AIAnalysis.jsx src/components/MatchCard.jsx src/services/openaiAnalysisService.js README.md .env.example PR_DESCRIPTION.md .github/workflows/ci.yml
   git commit -m "feat(openai): make expected output tokens configurable; show per-tip probabilities and calibrationVersion; add CI"

7) Wypchnij branch na remote:
   git push -u origin feature/openai-expected-output-tokens

   - Jeśli poprosi o login/password:
     - Login: Twój login GitHub
     - Password: wklej Personal Access Token (PAT) z GitHub zamiast hasła.

D. Jeżeli chcesz, aby główna gałąź na zdalnym miała nazwę main i jeszcze jej nie ma:
- Przy pierwszym pushu możesz zamiast wypychania brancha pushnąć main:
  git branch -M main
  git push -u origin main

E. Utworzenie Pull Request (PR)
- Po wypchnięciu branchu możesz:
  - Użyć GitHub web: otworzyć repo, zobaczysz podpowiedź do utworzenia PR z tej gałęzi.
  - Lub użyć GitHub CLI:
    gh pr create --fill --title "Make OpenAI expected output tokens configurable and remove hardcoded cap" --body-file PR_DESCRIPTION.md

F. Typowe problemy i jak je rozwiązać
- "fatal: not a git repository" — upewnij się, że jesteś w katalogu projektu z .git lub uruchom git init i dodaj origin.
- "Authentication failed" przy push — użyj PAT zamiast hasła lub skonfiguruj gh auth login.
- Konflikty przy push — wykonaj git pull --rebase origin main (lub odpowiednia gałąź), rozwiąż konflikty, commit i push.

G. Szybkie komendy do kopiowania (cały blok do wklejenia w terminal po utworzeniu repo na GitHub i po instalacji GIT)
cd /c/Users/lukas/zorentha-ai/football-betting-app
git init
git remote add origin https://github.com/TwojUzytkownik/football-betting-app.git
git checkout -b feature/openai-expected-output-tokens
git add src/components/AIAnalysis.jsx src/components/MatchCard.jsx src/services/openaiAnalysisService.js README.md .env.example PR_DESCRIPTION.md .github/workflows/ci.yml
git commit -m "feat(openai): make expected output tokens configurable; show per-tip probabilities and calibrationVersion; add CI"
git push -u origin feature/openai-expected-output-tokens

H. Po wykonaniu
- Napisz "zrobione" lub wklej wynik terminala, jeśli pojawiły się błędy — pomogę rozwiązać.
- Gdy PR będzie stworzony, mogę pomóc sformułować opis PR lub dodać ewentualne poprawki.

Powodzenia — daj znać, co się wydarzy po wykonaniu powyższych komend.
