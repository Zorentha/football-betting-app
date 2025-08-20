Instalacja GitHub CLI (gh) na Windows — krok po kroku
=====================================================

Szybka ścieżka: użyj winget (Windows 10/11) lub pobierz instalator ze strony GitHub CLI.

1) Instalacja (wybierz jedną metody)

A — winget (najprostsze, Windows 10/11)
- Otwórz PowerShell (jako zwykły użytkownik — nie musisz admina, ale jeśli winget nie działa, uruchom PowerShell jako Administrator).
- Uruchom:
  winget install --id GitHub.cli -e --source winget
- Po instalacji zamknij i otwórz nowy terminal (Git Bash / PowerShell).

B — instalator MSI (manualny)
- Pobierz instalator ze strony: https://github.com/cli/cli/releases/latest
  - Znajdź asset: GitHub CLI for Windows (msi) — np. gh_2.x.x_windows_amd64.msi
- Uruchom .msi i przejdź przez instalator (domyślne opcje są OK).
- Po instalacji zamknij i otwórz nowy terminal.

C — chocolatey (jeśli masz)
- choco install gh

2) Weryfikacja instalacji
- Otwórz nowy terminal (PowerShell lub Git Bash) i sprawdź:
  gh --version

3) Logowanie (auth)
- Najwygodniejszy sposób: logowanie przez przeglądarkę
  gh auth login
  - Wybierz GitHub.com
  - Choose HTTPS
  - Choose login with a web browser (web flow); postępuj zgodnie z instrukcjami w przeglądarce
- Alternatywnie możesz użyć PAT (jeśli wolisz):
  gh auth login --with-token < mytoken.txt
  (gdzie mytoken.txt zawiera PAT; polecenie zwykle lepiej wykonać z interaktywnego promptu)

4) Tworzenie PR z linii poleceń (po zalogowaniu gh)
- Przykładowa komenda, którą możesz wkleić (uruchom w katalogu projektu):
  gh pr create --fill --title "Make OpenAI expected output tokens configurable and remove hardcoded cap" --body-file PR_DESCRIPTION.md --head feature/openai-expected-output-tokens --base main

- Jeśli chcesz wybrać reviewers/labels w jednej komendzie:
  gh pr create --fill --title "..." --body-file PR_DESCRIPTION.md --head feature/openai-expected-output-tokens --base main --reviewer octocat --label "enhancement"

5) Jeśli pojawią się problemy
- Jeśli gh nie znajduje tokenu lub nie jesteś zalogowany: uruchom ponownie:
  gh auth status
  gh auth login
- Jeśli gh wydaje się zainstalowane, ale polecenie nie działa w Git Bash: zamknij i ponownie otwórz Git Bash (PATH się odświeży).
- Jeśli chcesz sprawdzić szczegóły pr przed utworzeniem, możesz użyć:
  gh pr view --web
  (otworzy przeglądarkę z widokiem PR)

6) Bezpieczeństwo
- Nie umieszczaj PAT w publicznych skryptach.
- Wygeneruj PAT z zakresem "repo" (lub ograniczonym) tylko jeśli potrzebujesz push przez HTTPS automatycznie.

7) Przykładowy minimalny workflow po instalacji gh:
- gh --version
- gh auth login  (wybierz web browser + HTTPS)
- gh pr create --fill --title "..." --body-file PR_DESCRIPTION.md --head feature/openai-expected-output-tokens --base main

Koniec. Jeśli chcesz, mogę teraz:
- Wygenerować gotową komendę "gh pr create ..." (już przygotowana) — wklej i uruchom w tym repo,
- Pomóc w konfiguracji reviewers/labels przy tworzeniu PR,
- Albo, jeśli napotkasz błąd po instalacji, wklej tutaj dokładne wyjście i pomogę debugować.
