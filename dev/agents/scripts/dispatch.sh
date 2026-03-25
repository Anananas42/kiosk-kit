#!/usr/bin/env bash
# Dispatch an agent container and clean up after it exits.
#
# Usage:
#   AGENT_TASK="implement feature X" ./dev/agents/scripts/dispatch.sh my-project
#
# The script starts the compose project in a tmux session named after the
# project. The session waits for the agent to finish, tears down containers
# and volumes, then exits. Returns immediately — attach with:
#   tmux attach -t <project-name>

set -euo pipefail
cd "$(dirname "$0")/../.."

COMPOSE_FILE="dev/agents/container/docker-compose.yml"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

PROJECT="${1:?Usage: AGENT_TASK=\"...\" $0 <project-name>}"

# Kill any existing tmux session with the same name
tmux kill-session -t "$PROJECT" 2>/dev/null || true

log "Starting ${PROJECT}..."
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up --build -d

# Start a tmux session that waits for the agent, cleans up, then exits
tmux new-session -d -s "$PROJECT" "
  echo '[$(date '+%Y-%m-%d %H:%M:%S')] Watching ${PROJECT}...'
  cd '$(pwd)'
  EXIT_CODE=0
  docker compose -p '${PROJECT}' -f '${COMPOSE_FILE}' wait agent || EXIT_CODE=\$?
  echo \"\"
  echo \"Agent exited with code \$EXIT_CODE. Cleaning up...\"
  docker compose -p '${PROJECT}' -f '${COMPOSE_FILE}' down -v
  echo 'Done. Press enter to close.'
  read
"

log "Dispatched. Attach with: tmux attach -t ${PROJECT}"
