Deployment — Staging / Production (Docker + GHCR + docker-compose)
================================================================

Cel
----
Instrukcja wdrożenia obrazu Docker wygenerowanego w CI oraz przykładowy skrypt do uruchomienia aplikacji w środowisku staging (docker-compose). Zawiera też wskazówki jak zautomatyzować deploy poprzez GitHub Actions lub ręcznie przez SSH.

Co zostało przygotowane (w repo)
--------------------------------
- Dockerfile — buduje aplikację (produkcyjny obraz).
- .github/workflows/ci-cd.yml — buduje i wypycha obraz do GHCR (GitHub Container Registry) na push do main.
- docker-compose.staging.yml — przykładowy compose, pobiera obraz z GHCR i uruchamia kontener.
- docs/PROJECT_DOCUMENTATION.md — dokumentacja projektu.
- tmp/rotate_secrets_and_cleanup_instructions.md — instrukcje bezpieczeństwa.

Przygotowanie przed wdrożeniem
------------------------------
1. Upewnij się, że obraz został zbudowany i wypchnięty do GHCR przez workflow:
   - Obraz: ghcr.io/<OWNER>/football-betting-app:latest
2. Dodaj zmienne środowiskowe na serwerze staging/prod:
   - OPENAI_API_KEY
   - API_FOOTBALL_KEY
   - (opcjonalnie) inne: PORT, DB paths, etc.
3. Na serwerze docelowym zainstaluj Docker i docker-compose.

Ręczny deploy (na serwerze staging)
-----------------------------------
1) Pobierz repo / utwórz katalog deploy:
   mkdir -p /srv/football-betting-app
   cd /srv/football-betting-app

2) Stwórz plik .env (zawierający sekrety) na serwerze:
   # example .env (NEVER commit this)
   OPENAI_API_KEY=sk-...
   API_FOOTBALL_KEY=...
   PORT=3001

3) W katalogu z docker-compose.staging.yml (skopiuj z repo) uruchom:
   export OPENAI_API_KEY='sk-...'
   export API_FOOTBALL_KEY='...'
   docker compose -f docker-compose.staging.yml pull
   docker compose -f docker-compose.staging.yml up -d

4) Sprawdź health:
   curl -f http://localhost:3001/api/health

Automatyczny deploy (opcjonalnie via GitHub Actions)
---------------------------------------------------
- Możesz dodać krok do workflow, który po sukcesie build&push wykona deploy via SSH:
  - Wygeneruj parę SSH i dodaj prywatny klucz jako GitHub Secret (DEPLOY_SSH_KEY).
  - Dodaj secret DEPLOY_HOST, DEPLOY_USER, DEPLOY_PATH.
- Przykładowy krok (pseudo):
  - name: Deploy to staging
    uses: appleboy/ssh-action@v0.1.7
    with:
      host: ${{ secrets.DEPLOY_HOST }}
      username: ${{ secrets.DEPLOY_USER }}
      key: ${{ secrets.DEPLOY_SSH_KEY }}
      script: |
        cd ${{ secrets.DEPLOY_PATH }}
        docker compose -f docker-compose.staging.yml pull
        docker compose -f docker-compose.staging.yml up -d

Przykładowy skrypt deploy_staging.sh (do umieszczenia na serwerze)
-----------------------------------------------------------------
#!/usr/bin/env bash
set -euo pipefail

# Usage:
# OPENAI_API_KEY=sk-... API_FOOTBALL_KEY=... ./deploy_staging.sh

IMAGE="ghcr.io/<OWNER>/football-betting-app:latest"
COMPOSE_FILE="docker-compose.staging.yml"
DEPLOY_DIR="/srv/football-betting-app"

mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

# Save .env if passed via environment (optional)
if [ -n "${OPENAI_API_KEY:-}" ]; then
  cat > .env <<EOF
OPENAI_API_KEY=${OPENAI_API_KEY}
API_FOOTBALL_KEY=${API_FOOTBALL_KEY:-}
PORT=3001
EOF
fi

# Pull and run
docker pull "$IMAGE"
docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
docker compose -f "$COMPOSE_FILE" ps

Security & Post‑deploy checks
-----------------------------
- After deployment, verify:
  - /api/health responds
  - logs: docker compose logs --tail=200
  - DB file permissions (if using persisted sqlite)
- Ensure secrets are stored in environment/secret manager, not in repo.
- Rotate keys if any were committed accidentally (see tmp/rotate_secrets_and_cleanup_instructions.md).
- Consider running smoke tests/end-to-end tests after deploy.

Rollbacks
---------
- To rollback to previous image (if you keep tags per CI), change image tag in docker-compose or use:
  docker compose -f docker-compose.staging.yml pull
  docker compose -f docker-compose.staging.yml up -d
  # or specify older image: docker compose set image football-betting-app ghcr.io/<OWNER>/football-betting-app:<tag>

Help & Automation I can provide
-------------------------------
I can:
- Create scripts/deploy_staging.sh in repo and commit it.
- Add SSH deploy step to the GitHub Actions workflow (requires secrets).
- Create a k8s manifest / helm chart if you prefer Kubernetes deployment.
- Add a staging CI job to run migrations/tests after deploy.

Wybierz co chcesz, żebym wygenerował teraz (np. "Create deploy script", "Add GH Actions SSH deploy step", "Create k8s manifests").
