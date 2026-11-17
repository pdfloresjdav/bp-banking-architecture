#!/usr/bin/env bash
# Stops the BP infrastructure (keeps volumes unless --volumes is passed).
set -euo pipefail
cd "$(dirname "$0")/../.."
if [ "${1:-}" = "--volumes" ]; then
  echo "==> Stopping and REMOVING BP volumes..."
  docker compose down --volumes
else
  echo "==> Stopping BP infrastructure (volumes kept)..."
  docker compose down
fi
