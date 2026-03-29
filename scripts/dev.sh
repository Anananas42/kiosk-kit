#!/usr/bin/env bash
set -euo pipefail

# Load environment variables from root .env
if [ -f .env ]; then
  set -a
  source .env
  set +a
else
  echo "Warning: No .env file found. Copy .env.example to get started:" >&2
  echo "  cp .env.example .env" >&2
  echo "" >&2
fi

PROFILE="${1:-all}"

needs_postgres() {
  [[ "$PROFILE" == "all" || "$PROFILE" == "web" ]]
}

if needs_postgres; then
  if ! command -v docker &>/dev/null; then
    echo "Error: Docker is required for the '$PROFILE' profile but is not installed." >&2
    exit 1
  fi

  if [ -z "${DATABASE_URL:-}" ]; then
    echo "Error: DATABASE_URL is not set." >&2
    echo "" >&2
    echo "Your root .env is missing required variables." >&2
    echo "Copy .env.example to .env and fill in the values:" >&2
    echo "  cp .env.example .env" >&2
    exit 1
  fi

  printf "  Postgres ..."
  if ! docker compose -f dev/docker-compose.yml up -d --wait 2>&1 | tail -1 > /dev/null; then
    echo " FAILED"
    echo "Error: Could not start Postgres via docker compose." >&2
    exit 1
  fi

  SECONDS=0
  until pg_isready -h localhost -p 5433 -q 2>/dev/null; do
    if (( SECONDS >= 30 )); then
      echo " FAILED"
      echo "Error: Postgres did not become healthy within 30 seconds." >&2
      exit 1
    fi
    sleep 1
  done
  echo " ready"

  printf "  Schema ..."
  DB_PUSH_OUTPUT=$(pnpm --filter @kioskkit/web-server run --silent db:push 2>&1) || {
    echo " FAILED"
    echo "$DB_PUSH_OUTPUT" >&2
    echo "" >&2
    echo "Check your DATABASE_URL in .env and ensure Postgres is accessible." >&2
    exit 1
  }
  echo " pushed"

  printf "  Test user ..."
  pnpm --filter @kioskkit/web-server run --silent db:seed-test-user > /dev/null 2>&1 || true
  echo " seeded"
fi

export TURBO_NO_UPDATE_NOTIFIER=1

echo ""
echo "Dev servers ($PROFILE):"
echo ""

case "$PROFILE" in
  all)
    echo "  web-server     → http://localhost:3002"
    echo "  web-client     → http://localhost:5174"
    echo "  web-admin      → http://localhost:5175"
    echo "  kiosk-server   → http://localhost:3001"
    echo "  kiosk-client   → http://localhost:5173"
    echo "  kiosk-admin    → http://localhost:5176"
    echo "  landing        → http://localhost:4321"
    echo ""
    exec pnpm exec turbo dev --output-logs=errors-only
    ;;
  web)
    echo "  web-server     → http://localhost:3002"
    echo "  web-client     → http://localhost:5174"
    echo "  web-admin      → http://localhost:5175"
    echo ""
    exec pnpm exec turbo dev --filter=@kioskkit/web-server --filter=@kioskkit/web-client --filter=@kioskkit/web-admin --output-logs=errors-only
    ;;
  kiosk)
    echo "  kiosk-server   → http://localhost:3001"
    echo "  kiosk-client   → http://localhost:5173"
    echo "  kiosk-admin    → http://localhost:5176"
    echo ""
    exec pnpm exec turbo dev --filter=@kioskkit/kiosk-server --filter=@kioskkit/kiosk-client --filter=@kioskkit/kiosk-admin --output-logs=errors-only
    ;;
  kiosk-emu)
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    EMU_DIR="$SCRIPT_DIR/../dev/pi-emulator"

    if [[ ! -f "$EMU_DIR/.output/golden.qcow2" ]]; then
      echo "Error: Golden image not found. Build it first:" >&2
      echo "  ./dev/pi-emulator/build-image.sh" >&2
      exit 1
    fi

    cleanup_emu() {
      echo ""
      echo "Shutting down Pi emulator..."
      if [[ -f "$EMU_DIR/.work/run/qemu.pid" ]]; then
        kill "$(cat "$EMU_DIR/.work/run/qemu.pid")" 2>/dev/null || true
      fi
    }
    trap cleanup_emu EXIT INT TERM

    "$EMU_DIR/run.sh" --bg

    echo "  kiosk (Pi emu)  → http://localhost:${PI_EMU_KIOSK_PORT:-3001}"
    echo "  ssh              → ssh -p ${PI_EMU_SSH_PORT:-2222} pi@localhost"
    echo ""
    echo "Waiting for kiosk server..."

    SECONDS=0
    until curl -sf -o /dev/null "http://localhost:${PI_EMU_KIOSK_PORT:-3001}/api/health" 2>/dev/null; do
      if (( SECONDS >= 120 )); then
        echo "Error: Kiosk server did not become healthy within 120 seconds." >&2
        exit 1
      fi
      sleep 2
    done
    echo "Kiosk server ready. Press Ctrl-C to stop."
    echo ""

    # Keep running until interrupted
    while true; do sleep 60; done
    ;;
  landing)
    echo "  landing        → http://localhost:4321"
    echo ""
    exec pnpm exec turbo dev --filter=@kioskkit/landing --output-logs=errors-only
    ;;
  *)
    echo "Unknown profile: $PROFILE" >&2
    echo "Usage: $0 [all|web|kiosk|kiosk-emu|landing]" >&2
    exit 1
    ;;
esac
