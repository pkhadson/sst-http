#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/.." && pwd)"

if [ ! -f "$REPO_ROOT/dist/cli.js" ]; then
  echo "==> Building sst-http CLI"
  pnpm -C "$REPO_ROOT" run build
fi

examples=(
  "http"
  "bus-publisher"
  "bus-receiver"
)

for example in "${examples[@]}"; do
  echo "==> Deploying $example"
  (
    cd "$ROOT_DIR/$example"
    if [ ! -d "node_modules" ]; then
      pnpm install
    fi
    node "$REPO_ROOT/dist/cli.js" scan --project tsconfig.json --glob "src/**/*.ts" --out routes.manifest.json
    pnpm exec sst deploy
  )
done
