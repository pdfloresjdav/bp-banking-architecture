#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
bash infrastructure/scripts/down.sh
bash infrastructure/scripts/up.sh
