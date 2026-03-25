#!/usr/bin/env bash
# Launch an agent in an isolated container.
#
# Usage:
#   ./dev/agents/scripts/run.sh                          # interactive claude session
#   ./dev/agents/scripts/run.sh "implement feature X"    # non-interactive task
#   ./dev/agents/scripts/run.sh --build                  # rebuild image first
#   ./dev/agents/scripts/run.sh --build "implement X"    # rebuild + task
#   ./dev/agents/scripts/run.sh --no-loop "test task"    # skip PR watch loop
#   ./dev/agents/scripts/run.sh --docker "task"          # start with Docker (DinD) sidecar

set -euo pipefail
cd "$(dirname "$0")/../.."

BUILD_FLAG=""
TASK=""
NO_LOOP=""
DOCKER_PROFILE=""

for arg in "$@"; do
  case "$arg" in
    --build) BUILD_FLAG="--build" ;;
    --no-loop) NO_LOOP="1" ;;
    --docker) DOCKER_PROFILE="--profile docker" ;;
    *) TASK="$arg" ;;
  esac
done

# Validate prerequisites
CLAUDE_CREDS="$HOME/.claude/.credentials.json"
if [ ! -f "$CLAUDE_CREDS" ]; then
  echo "Error: No Claude credentials found at $CLAUDE_CREDS. Log in with 'claude' first." >&2
  exit 1
fi

PEM_FILE="$HOME/.config/github-apps/kiosk-kit-agent.pem"
if [ ! -f "$PEM_FILE" ]; then
  echo "Error: GitHub App PEM not found at $PEM_FILE" >&2
  exit 1
fi

export AGENT_TASK="$TASK"
export AGENT_NO_LOOP="${NO_LOOP}"

exec docker compose -f dev/agents/container/docker-compose.yml $DOCKER_PROFILE run --rm $BUILD_FLAG agent
