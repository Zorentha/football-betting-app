#!/usr/bin/env bash
set -euo pipefail

# Deploy script for staging
# Usage:
#   Set environment variables or export them inline:
#     OPENAI_API_KEY=sk-... API_FOOTBALL_KEY=... ./scripts/deploy_staging.sh
#   Or run without env vars if .env exists in the deploy path on the server.
#
# This script is intended to be run on the staging host (or via SSH from CI).
# It pulls the latest image (latest tag) and restarts docker compose.

IMAGE="ghcr.io/<OWNER>/football-betting-app:latest"
COMPOSE_FILE="docker-compose.staging.yml"
DEPLOY_DIR="${DEPLOY_DIR:-/srv/football-betting-app}"

echo "Deploy script starting..."
echo "Deploy dir: $DEPLOY_DIR"
echo "Compose file: $COMPOSE_FILE"
echo "Image: $IMAGE"

mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

# If env vars provided to the script, write .env for docker-compose
if [ -n "${OPENAI_API_KEY:-}" ] || [ -n "${API_FOOTBALL_KEY:-}" ]; then
  echo "Writing .env from provided environment variables..."
  cat > .env <<EOF
OPENAI_API_KEY=${OPENAI_API_KEY:-}
API_FOOTBALL_KEY=${API_FOOTBALL_KEY:-}
PORT=${PORT:-3001}
EOF
  echo ".env written (not committed)."
fi

# Pull and run container
echo "Pulling image $IMAGE ..."
docker pull "$IMAGE" || true

echo "Ensuring docker-compose file exists..."
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "ERROR: $COMPOSE_FILE not found in $DEPLOY_DIR. Please copy docker-compose.staging.yml into the deploy dir."
  exit 2
fi

echo "Starting docker compose..."
docker compose -f "$COMPOSE_FILE" pull || true
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo "Waiting 5 seconds for services to start..."
sleep 5

echo "Container status:"
docker compose -f "$COMPOSE_FILE" ps

echo "Health check (http://localhost:3001/api/health):"
if curl -sSf http://localhost:3001/api/health >/dev/null 2>&1; then
  echo "Health check OK"
else
  echo "Health check failed — please inspect logs: docker compose -f $COMPOSE_FILE logs --tail=200"
  exit 3
fi

echo "Deploy completed successfully."
