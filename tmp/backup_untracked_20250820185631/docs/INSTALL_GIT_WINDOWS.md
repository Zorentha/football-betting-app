Instrukcja instalacji Git na Windows (krok‑po‑kroku)
==================================================

Ten przewodnik przeprowadzi Cię przez instalację Git na Windows (instalator oficjalny), podstawową konfigurację i uruchomienie wcześniej przygotowanego skryptu do wypchnięcia zmian na GitHub przez HTTPS.

1) Pobierz instalator
- Otwórz: https://git-scm.com/download/win
- Pobierz instalator (exe) i uruchom go.

2) Przegląd opcji instalatora — zalecane wybory
Podczas instalacji pojawi się kilka ekranów z opcjami. Poniżej rekomendowane ustawienia (dla wygody pracy z VS Code i GitHub):

- Choosing the default editor used by Git
  - Wybierz: "Use Visual Studio Code as Git's default editor"
  - (Jeśli nie używasz VS Code, możesz wybrać Nano. Nie wybieraj Vim, jeśli go nie znasz.)

- Adjusting your PATH environment
  - Wybierz: "Git from the command line and also from 3rd-party software"
  - To doda git do PATH i pozwoli uruchamiać go z PowerShell/terminala.

- Choosing HTTPS/SSH library
  - Wybierz: "Use the bundled OpenSSH"
  - Prostsze i bez dodatkowej konfiguracji.

- Configuring the line ending conversions
  - Wybierz domyślnie: "Checkout Windows-style, commit Unix‑style line endings" (domyślne)
  - To najbezpieczniejsze ustawienie dla projektów cross-platform.

- Configuring the credential helper
  - Pozostaw domyślnie (Git Credential Manager) — ułatwia autoryzację HTTPS.

- Extra options
  - Możesz zostawić domyślne zaznaczenia (Enable file system caching itp.).

Po zakończeniu instalacji zamknij i ponownie otwórz terminal / VS Code (ważne — by PATH się zaktualizował).

3) Weryfikacja instalacji
Otwórz Git Bash lub PowerShell i wykonaj:
- git --version
  - Powinno zwrócić np. "git version 2.xx.x"
- git config --global user.name "Twoje Imię"
- git config --global user.email "twoj@email.pl"
- (opcjonalnie) ustaw VS Code jako edytor jeśli wcześniej nie ustawiłeś:
  - git config --global core.editor "code --wait"

4) Wygeneruj Personal Access Token (PAT) na GitHub (HTTPS auth)
- Wejdź na GitHub -> Settings -> Developer settings -> Personal access tokens -> Tokens (classic) -> Generate new token.
- Nadaj tokenowi nazwę, ustaw expiration (np. 90 dni) i zaznacz zakres "repo" (full control of private repositories) — dla public repo też wymagane do push.
- Wygeneruj token i skopiuj go (zapisz w bezpiecznym miejscu) — będzie potrzebny jako hasło przy push przez HTTPS.

5) Przygotowanie repo i push (skrypt)
- Upewnij się, że w katalogu projektu istnieją skrypty:
  - scripts/push_changes_https.sh
  - scripts/run_push_with_url.sh (ten plik już zawiera REPO_URL ustawiony na https://github.com/Zorentha/football-betting-app.git — jeśli chcesz zmienić url edytuj ten plik)
- Otwórz Git Bash w katalogu projektu (np. C:\Users\lukas\zorentha-ai\football-betting-app)

Uruchom jedną linię, która zaktualizuje skrypt i uruchomi push:
- bash scripts/run_push_with_url.sh

Uwaga:
- Jeśli terminal Windows nie rozpoznaje polecenia bash, uruchom "Git Bash" (program zainstalowany razem z Git). Wklej tam powyższą linię.

6) Co zrobi skrypt
- Zaktualizuje scripts/push_changes_https.sh z REPO_URL = https://github.com/Zorentha/football-betting-app.git
- Jeżeli folder nie jest repozytorium — wykona git init
- Ustawi origin na podany URL
- Utworzy branch feature/openai-expected-output-tokens
- Doda wskazane pliki, wykona commit (jeśli są zmiany) i wypchnie branch do origin
- Przy pushu zostaniesz poproszony o login GitHub i hasło — w polu hasło wklej wygenerowany PAT.

7) Jeśli coś pójdzie nie tak — typowe błędy i debug
- "git: The term 'git' is not recognized"
  - Zamknij i otwórz ponownie terminal/VS Code lub upewnij się, że zainstalowałeś Git i wybrałeś "Git from the command line..." w instalatorze.
- "bash: The term 'bash' is not recognized"
  - Użyj "Git Bash" zamiast PowerShell; skrót pojawia się w menu Start po instalacji Git.
- Authentication failed przy push
  - Upewnij się, że używasz PAT jako hasła, a nie standardowego hasła.
- Konflikty przy push (np. origin ma już pliki)
  - Wykonaj: git pull --rebase origin main (rozwiąż konflikty), potem git push

8) Po wypchnięciu
- Otwórz repo na GitHub — powinieneś widzieć nową gałąź feature/openai-expected-output-tokens
- Utwórz Pull Request z tej gałęzi do main (GitHub UI lub gh CLI)

9) Jeśli chcesz — mogę teraz:
- Przygotować komendę, którą wkleisz do Git Bash (gotowe), lub
- Napisać krótką checklistę co wkleić gdy pojawi się monit o hasło (PAT).  

Powodzenia — wklej tutaj output terminala (z Git Bash) jeśli coś się zepsuje, pomogę rozwiązać.
