# RUNBOOK - Local demo & test flow

Goal: start services, seed DB, run tests, view UI.

## Prereqs
- Docker & docker compose (Compose v2+)
- Python 3.11 virtualenv (optional)
- .env file with MYSQL_ROOT_PASSWORD and other env vars (see `.env.example`)

## Quick local demo (recommended)
1. Start stack:
   ```bash
   ./scripts/dev_up.sh docker-compose.yml
