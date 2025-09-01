SECURITY — Football Betting App
===============================

Cel dokumentu
------------
Zawiera instrukcje bezpieczeństwa, wykrywania i reagowania na wyciek sekretów, rekomendacje dla CI/CD, oraz praktyczne kroki do bezpiecznego oczyszczenia repo i zarządzania kluczami.

1) Szybka diagnoza incydentu
----------------------------
Jeżeli odkryjesz, że klucz (np. OPENAI_API_KEY) trafił do repo lub tmp/:
- Natychmiast ROTATE/REVOKE klucza w usłudze (OpenAI, API provider).
- Usuń klucz z GitHub Secrets i zastąp nowym po rotacji.
- Nie wykonuj git powtarzalnego rebase/force-push zanim klucz zostanie zrotowany (aby nie rozpropagować go dalej).
- Sporządź raport: commit hash, pliki, zakres wystąpienia (tmp/pr_merge_analysis.txt i tmp/why_key_considered_leaked.md mogą zawierać pomocne notatki).

2) Natychmiastowe działania (krok po kroku)
-------------------------------------------
1. ROTATE/REVOKE:
   - Zaloguj się do panelu OpenAI (lub innego providera) i revoke/rotate API key.
   - Stwórz nowy klucz do użytku i zaktualizuj lokalne .env (jeśli potrzeba).
2. Zaktualizuj CI/CD secrets:
   - W GitHub: Settings -> Secrets and variables -> Actions -> Dodaj nowy SECRET, usuń stary.
3. Komunikacja:
   - Poinformuj zespół i zainteresowane strony o incydencie (która usługa, zakres, czy klucz używany w buildach).
4. Audyt:
   - Użyj gitleaks/trufflehog do lokalnego skanowania repo:
     docker run --rm -v "$(pwd)":/repo zricethezav/gitleaks:8.2.7 detect --source /repo
   - Alternatywnie: zainstaluj gitleaks i uruchom: gitleaks detect --source .

3) Usuwanie sekretu z historii (opcjonalne, ryzykowne)
-----------------------------------------------------
Uwaga: Ten krok modyfikuje historię i wymaga koordynacji (force push). Wykonaj go tylko po rotacji klucza i po poinformowaniu zespołu.

Opcja A — git-filter-repo (zalecane):
- Przygotuj plik sensitive-words.txt zawierający sekret (cały token) lub pattern.
- Polecenia (lokalnie, zanim zrobisz force push):
  git clone --mirror git@github.com:OWNER/REPO.git
  cd REPO.git
  git-filter-repo --replace-refs delete-no-add --invert-paths --paths-from-file ../sensitive-words.txt
  # Sprawdź wynik, przetestuj na kopii
  git push --force --all
  git push --force --tags

Opcja B — BFG Repo-Cleaner:
- Przygotuj plik secrets.txt (token per line)
- bfg --replace-text secrets.txt REPO.git
- git push --force

Po każdym force-push:
- Poinformuj współpracowników aby zrobili fresh clone (nie pull), lub daj instrukcję rebase manualny.

4) CI: wykrywanie sekretów i zabezpieczenia (zalecane)
-----------------------------------------------------
- Dodaj gitleaks jako job w GitHub Actions (fail on detection) lub w pre-commit hooks.
- Przykład (schemat):
  - name: gitleaks scan
    uses: zgtya/gitleaks-action@v1
    with:
      args: detect --source .

- Wymagaj status checków i code review na branch protection dla main:
  - Włącz: require PR reviews, require status checks, include administrators.

5) Zarządzanie sekretami w CI
-----------------------------
- Używaj GitHub Secrets lub innego secret managera (Vault, AWS Secrets Manager).
- Nie commituj .env z prawdziwymi wartościami.
- W workflow używaj secrets via: ${{ secrets.OPENAI_API_KEY }}; nie zapisuj ich do artifactów ani logów.
- Ustaw maskowanie wartości w logach: GitHub automatycznie maskuje secrets, ale unikaj echo ${{ secrets.* }}.

6) Dobre praktyki kodowe i operacyjne
-------------------------------------
- Nie zapisuj raw API keys do tmp/; jeśli musisz zapisać payloady, sanitize -> zapisz tylko obcięte tokeny.
- Zamiast pełnego tokena w logach, zapisuj fingerprint (ostatnie 4 znaki).
- Włącz rotację kluczy co określony interwał (np. 90 dni) i automatyzuj aktualizację nasłuchując w vault.
- Ogranicz uprawnienia kluczy (scopes): minimalne potrzebne.

7) Monitoring i alerty
----------------------
- Dodaj metrici i alerty dla:
  - liczby strict-fallbacks z OpenAI (może wskazywać regresję w prompt engineering),
  - nietypowego surge w wykorzystaniu tokenów,
  - nieudanych prób rejestracji sekretów w CI.
- Integruj z PagerDuty/Slack dla natychmiastowych powiadomień.

8) Narzędzia i skrypty przygotowane w repo
------------------------------------------
- tmp/rotate_secrets_and_cleanup_instructions.md — instrukcja rotacji i oczyszczenia historii (przygotowana).
- tmp/resolve_secret_and_rebase_instructions.txt — checklista kroków do wykonania wraz z przykładowymi poleceniami.
- scripts/ (można dodać): przygotowanie sensitive-words.txt automatycznie przy rozpoznaniu patternu.

9) Post-incident checklist
--------------------------
- [ ] Key rotated/revoked
- [ ] New key set in GitHub Secrets
- [ ] CI scan (gitleaks) uruchomiony i brak wykrytych sekretów
- [ ] Historia oczyszczona (jeśli wybrano) i zespół poinformowany
- [ ] Branch protection + required checks włączone
- [ ] Monitoring kosztów OpenAI i alerty ustawione

10) Kontakt i odpowiedzialność
------------------------------
- Osoba odpowiedzialna za incydent: [ustaw w zespole]
- Komunikat wewnętrzny: zawiera krótki opis incydentu, zakres, podjęte akcje i rekomendowane kroki dalsze.

Załączniki i pomocnicze polecenia
--------------------------------
- gitleaks:
  docker run --rm -v "$(pwd)":/repo zricethezav/gitleaks:8.2.7 detect --source /repo
- git-filter-repo install / docs:
  https://github.com/newren/git-filter-repo
- BFG:
  https://rtyley.github.io/bfg-repo-cleaner/
