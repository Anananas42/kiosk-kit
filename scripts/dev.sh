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

  echo "Starting Postgres..."
  docker compose up -d

  echo "Waiting for Postgres to be healthy..."
  SECONDS=0
  until pg_isready -h localhost -p 5433 -q 2>/dev/null; do
    if (( SECONDS >= 30 )); then
      echo "Error: Postgres did not become healthy within 30 seconds." >&2
      exit 1
    fi
    sleep 1
  done
  echo "✓ Postgres ready"

  echo "Pushing database schema..."
  if ! pnpm --filter @kioskkit/web-server run db:push; then
    echo "Error: Failed to push database schema." >&2
    echo "Check your DATABASE_URL in .env and ensure Postgres is accessible." >&2
    exit 1
  fi
  echo "✓ Schema pushed"
fi

echo "Starting dev servers..."

case "$PROFILE" in
  all)
    exec turbo dev
    ;;
  web)
    exec turbo dev --filter=@kioskkit/web-server --filter=@kioskkit/web-client --filter=@kioskkit/admin-client
    ;;
  kiosk)
    exec turbo dev --filter=@kioskkit/kiosk-server --filter=@kioskkit/kiosk-client --filter=@kioskkit/kiosk-admin
    ;;
  landing)
    exec turbo dev --filter=@kioskkit/landing
    ;;
  *)
    echo "Unknown profile: $PROFILE" >&2
    echo "Usage: $0 [all|web|kiosk|landing]" >&2
    exit 1
    ;;
esac
