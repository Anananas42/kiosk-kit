#!/usr/bin/env bash
# build-app-bundle.sh — Build a cross-compiled app bundle tarball for Pi devices.
#
# Produces a .tar.gz that can be pushed to a device via the app-update flow
# (POST /api/app/upload → app-update.sh extracts and swaps it into place).
#
# Prerequisites: Docker, Node.js, pnpm, readelf
#
# Usage:
#   ./build-app-bundle.sh [VERSION]
#
#   VERSION defaults to the current git describe (e.g. v0.1.0-3-gabcdef).
#
# Output:
#   .output/app-bundle-<VERSION>.tar.gz
#   .output/app-bundle-<VERSION>.tar.gz.sha256

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

VERSION="${1:-$(git -C "$REPO_ROOT" describe --tags --always --dirty 2>/dev/null || echo "dev")}"

# shellcheck source=lib/build-app.sh
source "$SCRIPT_DIR/lib/build-app.sh"

APP_STAGE="$SCRIPT_DIR/.work/app-stage"
OUTPUT_DIR="$SCRIPT_DIR/.output"
BUNDLE_NAME="app-bundle-${VERSION}.tar.gz"
BUNDLE_PATH="$OUTPUT_DIR/$BUNDLE_NAME"

# --- Build ---

build_app_stage "$REPO_ROOT" "$APP_STAGE"

# --- Package ---

echo "==> Creating app bundle tarball..."
mkdir -p "$OUTPUT_DIR"

tar -czf "$BUNDLE_PATH" -C "$APP_STAGE" .

# --- Checksum ---

SHA256=$(sha256sum "$BUNDLE_PATH" | cut -d' ' -f1)
echo "$SHA256  $BUNDLE_NAME" > "$BUNDLE_PATH.sha256"

SIZE=$(du -h "$BUNDLE_PATH" | cut -f1)
echo ""
echo "==> App bundle ready:"
echo "    File:     $BUNDLE_PATH"
echo "    Version:  $VERSION"
echo "    Size:     $SIZE"
echo "    SHA256:   $SHA256"
