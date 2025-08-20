#!/usr/bin/env bash
set -euo pipefail
COMPOSE_FILE=${1:-docker-compose.yml}
DB_SERVICE=${2:-db}

echo "Locating container id for service '$DB_SERVICE'..."
CONTAINER_ID=$(docker compose -f "$COMPOSE_FILE" ps -q "$DB_SERVICE")
if [ -z "$CONTAINER_ID" ]; then
  echo "DB container not found. Is the compose stack up? Try scripts/dev_up.sh" >&2
  exit 1
fi

# Default envfile path .env
if [ -f .env ]; then
  # attempt to extract root password
  MYSQL_ROOT_PASSWORD=$(grep -E '^MYSQL_ROOT_PASSWORD=' .env | cut -d'=' -f2- | tr -d '"')
fi

if [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
  echo "Could not find MYSQL_ROOT_PASSWORD in .env. Provide it via env or edit this script." >&2
  exit 1
fi

echo "Seeding DB using container $CONTAINER_ID..."
docker exec -i "$CONTAINER_ID" sh -c "mysql -u root -p'$MYSQL_ROOT_PASSWORD' < /docker-entrypoint-initdb.d/init.sql" || {
  echo "Direct import into container failed, attempting to copy file and import..."
  docker cp db/init.sql "$CONTAINER_ID":/tmp/init.sql
  docker exec -i "$CONTAINER_ID" sh -c "mysql -u root -p'$MYSQL_ROOT_PASSWORD' < /tmp/init.sql"
}
echo "DB seeded."
