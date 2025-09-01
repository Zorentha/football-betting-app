DEPLOYMENT — Football Betting App
================================

Cel dokumentu
------------
Instrukcja wdrożenia aplikacji (staging/production). Zawiera opcje: Docker (recommended), docker-compose, systemd, GitHub Actions (CI/CD), konfigurację środowiska, kroków migracji DB, backupów oraz praktyczne wskazówki dotyczące bezpieczeństwa i rollback.

Założenia
---------
- Repo zawiera Dockerfile i docker-compose.staging.yml.
- W środowisku produkcyjnym rekomendowane użycie registry GHCR (ghcr.io) lub innego prywatnego rejestru.
- Sekrety przechowywane w GitHub Secrets lub systemie typu Vault.
- Dla prototypu używany jest SQLite; w produkcji zalecany Postgres lub inny RDBMS.

1. Przygotowanie środowiska
---------------------------
Wymagane:
- Docker >= 20.x
- docker-compose (jeśli używasz docker-compose)
- GitHub Actions (po stronie CI)
- (Opcjonalnie) systemd dla hostów nieużywających kontenerów

Ustawienia środowiskowe (.env)
- Skopiuj .env.example -> .env (lokalnie), lub ustaw secrets:
  - OPENAI_API_KEY
  - API_FOOTBALL_KEY
  - NODE_ENV=production
  - PORT (np. 3000)
  - DATABASE_URL (jeśli używasz Postgres, np. postgres://user:pass@host:5432/db)
  - DEPLOY_* (DEPLOY_HOST, DEPLOY_USER) dla SSH deploy (jeśli potrzebne)

2. Build & push obrazu Docker (lokalnie)
----------------------------------------
1. Zbuduj:
   docker build -t ghcr.io/<OWNER>/football-betting-app:latest .
2. Zaloguj się do GHCR:
   echo $CR_PAT | docker login ghcr.io -u <OWNER> --password-stdin
   (CR_PAT = personal access token with packages:write)
3. Push:
   docker push ghcr.io/<OWNER>/football-betting-app:latest

3. GitHub Actions — automatyczny build & publish
------------------------------------------------
Repo zawiera workflow .github/workflows/ci-cd.yml który:
- buduje obraz,
- testuje (uruchamia scripts/unit_test_validateAI.js),
- pushuje do GHCR,
- (opcjonalnie) deploy via SSH jeśli ustawione env DEPLOY_ON_PUSH=true oraz secrets DEPLOY_SSH_KEY, DEPLOY_HOST, DEPLOY_USER, DEPLOY_PATH.

Wskazówki:
- Upewnij się, że secrets w repo zawierają GHCR credentials i nowe OPENAI key.
- Dla prywatnych repo akcja docker/build-push-action użyje ${{ secrets.GITHUB_TOKEN }} do push (upewnij się, że permissions są ustawione).

4. Deploy na serwer (docker-compose)
-----------------------------------
Przykład: katalog na serwerze /opt/football-betting-app zawiera docker-compose.staging.yml.

1. SSH do hosta:
   ssh deploy_user@your-host
2. Pull obrazu:
   docker pull ghcr.io/<OWNER>/football-betting-app:latest
3. Zaktualizuj .env na serwerze (upewnij się, że zawiera poprawne wartości)
4. Uruchom:
   docker compose -f docker-compose.staging.yml up -d --remove-orphans
5. Sprawdź logi i status:
   docker compose -f docker-compose.staging.yml ps
   docker compose -f docker-compose.staging.yml logs -f

Rollback:
- Jeśli potrzebny rollback do poprzedniego obrazu:
  docker pull ghcr.io/<OWNER>/football-betting-app:<previous-tag>
  docker compose -f docker-compose.staging.yml up -d --no-deps --build

5. Deploy bez kontenerów (systemd)
----------------------------------
(Jeśli nie używasz Dockera)
1. Na serwerze zainstaluj Node.js (LTS) i zależności.
2. Skonfiguruj process manager (pm2 lub systemd):
   - pm2 start server.js --name football-betting-app --env production
   - lub utwórz unit file systemd:
     /etc/systemd/system/football-betting-app.service
3. Uruchom i włącz:
   systemctl daemon-reload
   systemctl enable --now football-betting-app

6. Migrations / Database
------------------------
Obecnie repo używa SQLite (database/football_betting.db). Dla produkcji:
- Migracja do Postgres:
  - Przygotuj DATABASE_URL w .env
  - W scripts/ można znaleźć migracje SQL lub napisać migrator (knex/TypeORM/Flyway)
- Backup:
  - SQLite: kopiuj plik DB i archiwizuj (cron + rsync)
  - Postgres: pg_dump regularnie + retention policy

7. Secrets i konfiguracja w CI
------------------------------
- W GitHub Settings -> Secrets and variables -> Actions dodaj:
  - OPENAI_API_KEY
  - API_FOOTBALL_KEY
  - GHCR_PAT (jeśli potrzebujesz do push)
  - DEPLOY_SSH_KEY (private key) jeśli używasz appleboy/ssh-action
- Nie wypisuj secrets w logach. Unikaj echo ${{ secrets.* }}

8. Healthchecks i monitorowanie
-------------------------------
- Endpoint: GET /api/health (upewnij się, że działa).
- Monitoruj:
  - latencje OpenAI calls, retry rate, strict-fallback counts
  - wykorzystanie tokenów (może eksportować do Prometheus)
- Alerty: Slack/PagerDuty na wysokie koszty lub spike w retry/error rate.

9. CI Debugging (ENOENT: package.json not found)
------------------------------------------------
- Wprowadzone debug joby (debug-workspace) w workflow: pokażą GITHUB_WORKSPACE i listing /home/runner/work.
- Jeśli workflow nadal nie znajduje package.json:
  - Sprawdź output debug-workspace: znajdziesz dokładną ścieżkę do package.json.
  - Alternatywa: użyj fallback clone ustawiony w workflow — klon repo do /home/runner/work/checked_repo i instalacja tam.
- Po potwierdzeniu, usuń debug kroki i commituj czystą wersję workflow.

10. Continuous deployment — przykładowy flow
-------------------------------------------
- main branch merge -> GitHub Actions build & test -> push image to GHCR -> SSH deploy do staging (option) -> manual promote to production (recommended)
- Alternatywa: użyj orchestratora (Kubernetes) z image tags + deployment rollouts.

11. Best practices
------------------
- Testuj deployy na staging przed production.
- Automatyczna rotacja kluczy i ograniczenie ich uprawnień.
- Regularne backups DB i przechowywanie w bezpiecznym miejscu.
- Upewnij się, że DB nie jest w obrazie dockerowym (mount volume).

12. Przykładowe komendy ułatwiające operacje
--------------------------------------------
- Build & push:
  docker build -t ghcr.io/<OWNER>/football-betting-app:$GITHUB_SHA .
  docker push ghcr.io/<OWNER>/football-betting-app:$GITHUB_SHA
- Restart po deploy:
  docker compose -f docker-compose.staging.yml pull
  docker compose -f docker-compose.staging.yml up -d --remove-orphans

13. Checklist przed deployem na production
------------------------------------------
- [ ] Wszystkie testy jednostkowe i e2e green
- [ ] Secrets zrotowane i ustawione w CI
- [ ] Healthcheck endpoint działa
- [ ] Backup DB wykonany
- [ ] Monitoring / alerty skonfigurowane

Załączniki
---------
- docker-compose.staging.yml (w repo)
- .github/workflows/ci-cd.yml (CI)
- tmp/ci_trigger_instructions.md (instrukcje debug run)
