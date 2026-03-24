#!/usr/bin/env bash
# Dispatch an agent container and clean up after it exits.
#
# Usage:
#   AGENT_TASK="implement feature X" ./.agents/scripts/dispatch.sh my-project
#
# The script starts the compose project, waits for the agent to finish,
# tears down all containers and volumes, then exits with the agent's code.

set -euo pipefail
cd "$(dirname "$0")/../.."

COMPOSE_FILE=".agents/container/docker-compose.yml"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

PROJECT="${1:?Usage: AGENT_TASK=\"...\" $0 <project-name>}"

log "Starting ${PROJECT}..."
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up --build -d

log "Waiting for agent to exit..."
EXIT_CODE=0
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" wait agent || EXIT_CODE=$?

log "Agent exited with code ${EXIT_CODE}. Cleaning up..."
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down -v

log "Done."
exit "$EXIT_CODE"
