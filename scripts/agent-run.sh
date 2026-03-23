#!/usr/bin/env bash
# Launch an agent in an isolated container.
#
# Usage:
#   ./scripts/agent-run.sh                          # interactive claude session
#   ./scripts/agent-run.sh "implement feature X"    # non-interactive task
#   ./scripts/agent-run.sh --build                  # rebuild image first
#   ./scripts/agent-run.sh --build "implement X"    # rebuild + task

set -euo pipefail
cd "$(dirname "$0")/.."

BUILD_FLAG=""
TASK=""

for arg in "$@"; do
  case "$arg" in
    --build) BUILD_FLAG="--build" ;;
    *) TASK="$arg" ;;
  esac
done

# Validate prerequisites
CLAUDE_CREDS="$HOME/.claude/.credentials.json"
if [ ! -f "$CLAUDE_CREDS" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Error: No Claude credentials found. Log in with 'claude' first, or set ANTHROPIC_API_KEY." >&2
  exit 1
fi

PEM_FILE="$HOME/.config/github-apps/kiosk-kit-agent.pem"
if [ ! -f "$PEM_FILE" ]; then
  echo "Error: GitHub App PEM not found at $PEM_FILE" >&2
  exit 1
fi

export AGENT_TASK="$TASK"

exec docker compose -f docker-compose.agent.yml run --rm $BUILD_FLAG agent
