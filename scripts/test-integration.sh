#!/usr/bin/env bash
# Runs integration smoke tests against the QEMU Pi emulator.
# Usage: ./scripts/test-integration.sh
#
# Prerequisites: QEMU installed, golden image built (see dev/pi-emulator/README.md)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

exec "$REPO_ROOT/dev/pi-emulator/test.sh" "$@"
