#!/usr/bin/env bash
# build-app.sh — Build the kiosk app bundle for arm64 (host-side, native speed).
#
# Shared by build-sd-image.sh and build-app-bundle.sh. Source this file and call
# build_app_stage().
#
# Usage:
#   source lib/build-app.sh
#   build_app_stage /path/to/repo /path/to/staging-dir

# Guard against double-sourcing
[[ -n "${_BUILD_APP_LOADED:-}" ]] && return 0
_BUILD_APP_LOADED=1

# build_app_stage REPO_ROOT APP_STAGE
#
# Copies kiosk packages into APP_STAGE, installs dependencies, builds for
# production, prunes devDependencies, and cross-compiles better-sqlite3 for
# arm64. On success APP_STAGE contains a deployment-ready tree.
build_app_stage() {
  local repo_root="$1"
  local app_stage="$2"

  echo "==> Building application on host (native speed)..."
  rm -rf "$app_stage"
  mkdir -p "$app_stage"

  # Include-list: only files needed on the Pi. Everything else is excluded.
  rsync -a --delete \
    --include='package.json' \
    --include='pnpm-lock.yaml' \
    --include='pnpm-workspace.yaml' \
    --include='turbo.json' \
    --include='tsconfig.base.json' \
    --include='packages/' \
    --include='packages/kiosk-server/***' \
    --include='packages/kiosk-client/***' \
    --include='packages/kiosk-admin/***' \
    --include='packages/shared/***' \
    --include='packages/ui/***' \
    --exclude='**/node_modules' \
    --exclude='*' \
    "$repo_root/" "$app_stage/"

  node -e "
    const pkg = require('$app_stage/package.json');
    delete pkg.devDependencies;
    delete pkg.scripts.prepare;
    require('fs').writeFileSync('$app_stage/package.json', JSON.stringify(pkg, null, 2) + '\n');
  "

  (cd "$app_stage" && pnpm install --no-frozen-lockfile \
    --filter @kioskkit/kiosk-server \
    --filter @kioskkit/kiosk-client \
    --filter @kioskkit/kiosk-admin \
    --filter @kioskkit/shared \
    --filter @kioskkit/ui) || { echo "ERROR: Host pnpm install failed" >&2; return 1; }

  (cd "$app_stage" && NODE_ENV=production pnpm \
    --filter @kioskkit/shared \
    --filter @kioskkit/ui \
    --filter @kioskkit/kiosk-server \
    --filter @kioskkit/kiosk-client \
    --filter @kioskkit/kiosk-admin \
    build) || { echo "ERROR: Host pnpm build failed" >&2; return 1; }

  (cd "$app_stage" && CI=true pnpm install --no-frozen-lockfile --prod \
    --filter @kioskkit/kiosk-server \
    --filter @kioskkit/kiosk-client \
    --filter @kioskkit/kiosk-admin \
    --filter @kioskkit/shared \
    --filter @kioskkit/ui) || { echo "ERROR: Host pnpm prune failed" >&2; return 1; }

  # Cross-compile better-sqlite3 for arm64 inside a Bookworm container so the
  # binary links against the same glibc as Pi OS (2.36), not the host's newer one.
  echo "==> Cross-compiling better-sqlite3 for arm64 (Bookworm container)..."
  local bs3_dir
  bs3_dir=$(echo "$app_stage"/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3)
  [[ -d "$bs3_dir" ]] || { echo "ERROR: better-sqlite3 not found in staging dir" >&2; return 1; }
  local bs3_rel="${bs3_dir#"$app_stage"/}"
  docker run --rm \
    -v "$app_stage:/src" \
    -w "/src/$bs3_rel" \
    node:24-bookworm-slim bash -c '
      apt-get update -qq && \
      apt-get install -y -qq --no-install-recommends \
        gcc g++ gcc-aarch64-linux-gnu g++-aarch64-linux-gnu \
        python3 make >/dev/null 2>&1 && \
      rm -rf build && \
      CC=aarch64-linux-gnu-gcc CXX=aarch64-linux-gnu-g++ \
      CC_host=gcc CXX_host=g++ \
      npx --yes node-gyp rebuild --arch=arm64
    ' || { echo "ERROR: better-sqlite3 cross-compilation failed" >&2; return 1; }

  # Verify the binary won't hit a glibc mismatch on the Pi at runtime.
  # Pi OS Bookworm ships glibc 2.36 — fail loudly if the binary needs newer.
  local pi_os_glibc="2.36"
  local bs3_node="$bs3_dir/build/Release/better_sqlite3.node"
  local max_glibc
  max_glibc=$(readelf -V "$bs3_node" 2>/dev/null \
    | grep -oP 'GLIBC_\K[0-9.]+' | sort -V | tail -1)
  if [ -n "$max_glibc" ] && [ "$(printf '%s\n%s' "$pi_os_glibc" "$max_glibc" | sort -V | tail -1)" != "$pi_os_glibc" ]; then
    echo "ERROR: better_sqlite3.node requires GLIBC_$max_glibc but Pi OS has GLIBC_$pi_os_glibc" >&2
    echo "       The cross-compile container's glibc is too new for the target." >&2
    return 1
  fi
  echo "    glibc check passed (binary needs GLIBC_$max_glibc, Pi has GLIBC_$pi_os_glibc)"

  echo "==> Host build complete."
}
