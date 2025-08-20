#!/usr/bin/env bash
set -euo pipefail
COMPOSE_FILE=${1:-docker-compose.yml}

echo "Bringing up compose stack ($COMPOSE_FILE)..."
docker compose -f "$COMPOSE_FILE" up -d --build

# Wait for backend health
URL="http://localhost:5000/health"
echo "Waiting for backend health at $URL..."
for i in $(seq 1 60); do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    echo "Backend healthy"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo "Backend did not become healthy in time."
docker compose -f "$COMPOSE_FILE" logs --no-color
exit 1
