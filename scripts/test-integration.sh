#!/usr/bin/env bash
# Runs integration tests against the kiosk Pi simulator.
# Usage: ./scripts/test-integration.sh
set -euo pipefail

COMPOSE_FILE="dev/docker-compose.yml"
EXIT_CODE=0

echo "==> Starting kiosk-sim container..."
docker compose -f "$COMPOSE_FILE" up -d --build kiosk-sim

echo "==> Waiting for health check..."
TIMEOUT=120
ELAPSED=0
until curl -sf http://localhost:3001/api/health > /dev/null 2>&1; do
    if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
        echo "ERROR: kiosk-sim not healthy after ${TIMEOUT}s"
        docker compose -f "$COMPOSE_FILE" logs kiosk-sim
        docker compose -f "$COMPOSE_FILE" down
        exit 1
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done
echo "==> kiosk-sim is healthy"

echo "==> Running integration tests..."
pnpm vitest run --config dev/kiosk-sim/tests/vitest.config.ts || EXIT_CODE=$?

echo "==> Stopping containers..."
docker compose -f "$COMPOSE_FILE" down

exit $EXIT_CODE
