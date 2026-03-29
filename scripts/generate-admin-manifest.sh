#!/usr/bin/env bash
# Generate a JSON manifest of SHA256 hashes for all kiosk-admin build output files.
# Usage: scripts/generate-admin-manifest.sh [dist-dir]
# Output: JSON object mapping relative file paths to SHA256 hex hashes.
#
# Example output:
#   {"index.html":"abc...","assets/index-CWRnqJxn.js":"def..."}
#
# CI embeds this in the GitHub release body as:
#   <!-- admin-manifest:{"index.html":"abc...","assets/index-CWRnqJxn.js":"def..."} -->

set -euo pipefail

DIST_DIR="${1:-packages/kiosk-admin/dist}"

if [ ! -d "$DIST_DIR" ]; then
  echo "Error: dist directory not found at $DIST_DIR" >&2
  echo "Run 'pnpm --filter @kioskkit/kiosk-admin build' first." >&2
  exit 1
fi

# Build JSON object from all files in dist
first=true
printf '{'
find "$DIST_DIR" -type f | sort | while IFS= read -r file; do
  rel="${file#"$DIST_DIR"/}"
  hash=$(sha256sum "$file" | cut -d' ' -f1)
  if [ "$first" = true ]; then
    first=false
  else
    printf ','
  fi
  printf '"%s":"%s"' "$rel" "$hash"
done
printf '}'
