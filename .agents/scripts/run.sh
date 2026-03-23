#!/usr/bin/env bash
# Launch an agent in an isolated container.
#
# Usage:
#   ./.agents/scripts/run.sh                          # interactive claude session
#   ./.agents/scripts/run.sh "implement feature X"    # non-interactive task
#   ./.agents/scripts/run.sh --build                  # rebuild image first
#   ./.agents/scripts/run.sh --build "implement X"    # rebuild + task
#   ./.agents/scripts/run.sh --no-loop "test task"    # skip PR watch loop

set -euo pipefail
cd "$(dirname "$0")/../.."

BUILD_FLAG=""
TASK=""
NO_LOOP=""

for arg in "$@"; do
  case "$arg" in
    --build) BUILD_FLAG="--build" ;;
    --no-loop) NO_LOOP="1" ;;
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

exec docker compose -f .agents/container/docker-compose.yml run --rm $BUILD_FLAG agent
