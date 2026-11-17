#!/usr/bin/env bash
# Starts the BP local infrastructure (without the API; the API runs on the host or with --profile app).
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "==> Starting infrastructure (postgres, redis, rabbitmq, wiremock, keycloak)..."
docker compose up -d postgres redis rabbitmq wiremock-core wiremock-complementary keycloak

echo "==> Waiting for data-service health..."
services=(postgres redis rabbitmq wiremock-core wiremock-complementary)
for s in "${services[@]}"; do
  printf "   %s" "$s"
  for i in $(seq 1 30); do
    status=$(docker inspect --format '{{.State.Health.Status}}' "bp-banking-${s}-1" 2>/dev/null || echo "starting")
    if [ "$status" = "healthy" ]; then echo " -> healthy"; break; fi
    printf "."
    sleep 2
    if [ "$i" = "30" ]; then echo " -> TIMEOUT ($status)"; fi
  done
done

echo "==> Infra ready. Next: 'pnpm migrate' and 'pnpm seed', then 'pnpm api:dev'."
