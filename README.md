# BP Digital Banking — local PoC

pnpm monorepo implementing BP's modular hexagonal architecture: a NestJS backend, a React SPA, and a local
Docker infrastructure (PostgreSQL, Redis, RabbitMQ, Keycloak, WireMock). Design and diagrams live in [`docs/`](docs/).

> **Fictitious data.** No real financial information, no connection to real banks, no real secrets.
> The Core Banking system is a **mock (WireMock)**. The source of financial truth does NOT live in this database.

## Final deliverable (PDF)
📄 **[BP-Banking-Solution-Architecture.pdf](docs/deliverables/BP-Banking-Solution-Architecture.pdf)** — the complete,
professional solution-architecture document (35 pages: executive summary, requirements, C4 diagrams, AWS deployment,
security, HA/DR, FinOps, PoC evidence, ADRs, evaluation-criteria traceability). Editable source: `docs/deliverables/report.html`.

## Architecture overview
BP is a domain-oriented, hexagonal, modular platform (a small set of decoupled services, not a microservice swarm)
with the **Core Banking system as the source of truth**. It provides a layer of experience, orchestration, and
security over the Core. Financial integrity is enforced with idempotency keys, explicit transaction states, a
Transactional Outbox, and reconciliation; `HTTP 200 ≠ settled` and the event queue never substitutes for the Core's
transactional guarantees. See the C4 model and diagrams:

- **Editable C4 source:** [`docs/architecture/workspace.dsl`](docs/architecture/workspace.dsl) (Structurizr) · PlantUML exports in [`docs/architecture/exports/`](docs/architecture/exports/)
- **Rendered diagrams (SVG/PNG):** [`docs/architecture/rendered/`](docs/architecture/rendered/) — C1 Context, C2 Containers, C3 Transfer, C3 Core Integration, AWS deployment, and 7 sequence diagrams
- **Decisions (ADRs):** [`docs/architecture/DECISIONS.md`](docs/architecture/DECISIONS.md) · **HA/DR & observability:** [`docs/architecture/HA-DR-OBSERVABILITY.md`](docs/architecture/HA-DR-OBSERVABILITY.md) · **Costs/FinOps:** [`docs/architecture/COSTS.md`](docs/architecture/COSTS.md)

## Technology stack
React + TypeScript (SPA) · React Native (mobile, reserved) · NestJS + TypeScript (backend, hexagonal) ·
PostgreSQL/Aurora · Redis/ElastiCache · RabbitMQ (local) / EventBridge+SQS (AWS) · Keycloak (local) / existing OIDC IdP ·
WireMock (Core) · ECS Fargate · CloudFront+WAF, API Gateway, Secrets Manager/KMS, S3 Object Lock. Rationale: `docs/architecture/DECISIONS.md`.

## Structure
```
apps/
  api/        # NestJS backend (hexagonal): identity/BFF, customer, accounts, movements,
              # transfers, core-integration, notifications, audit, events/outbox, reconciliation
  web/        # React + TypeScript + Vite SPA (dashboard, accounts, transfers, activity)
  mobile/     # (reserved) React Native
packages/
  contracts/  # DTOs and event catalog (bp.<domain>.<fact>.vN)
  domain/     # Pure core: TransferAggregate, idempotency, cache-aside, audit hashing, ports
  shared/     # correlationId, structured logger
infrastructure/
  docker/     # API Dockerfile
  mocks/      # WireMock (Core and complementary)
  keycloak/   # Realm bp (web/mobile PKCE clients, demo user, TEST-ONLY direct-grant client)
  scripts/    # up.sh / down.sh / restart.sh
docker-compose.yml
```

## Requirements
- Node ≥ 20, pnpm (via `corepack`), Docker Desktop.

## Exact commands

### 1) Install dependencies
```bash
corepack enable
corepack pnpm install
cp .env.example .env            # fictitious development values
```

### 2) Start the infrastructure (Docker)
```bash
pnpm env:up                     # postgres, redis, rabbitmq, wiremock x2, keycloak
# stop:     pnpm env:down         (keeps volumes)
# restart:  pnpm env:restart
# wipe volumes: bash infrastructure/scripts/down.sh --volumes
```
Data services (postgres/redis/rabbitmq) are exposed only on loopback (127.0.0.1).

### 3) Migrations and seed
```bash
pnpm migrate                    # creates the operational schema (idempotent)
pnpm seed                       # verifies connectivity (financial data lives in WireMock)
```

### 4) Run the API and the SPA
```bash
# API on the host (development):
pnpm api:dev                    # http://localhost:3001

# SPA (separate terminal):
pnpm --filter @bp/web dev       # http://localhost:5173 (proxies /api and /auth to the API)

# For HTTP tests without the IdP, with LOCAL-ONLY auth bypass:
DEV_AUTH_BYPASS=true pnpm --filter @bp/api start:dev

# Or the API as a container (app profile: builds image, migrates, starts):
docker compose --profile app up --build api
```

### 5) Tests
```bash
pnpm test                       # all unit tests (domain + api)
pnpm test:domain                # 17 domain tests
pnpm test:api                   # 11 use-case/consumer tests
# E2E (requires Docker infra up + migrations):
pnpm --filter @bp/api test:e2e                                   # functional e2e (DEV_AUTH_BYPASS)
DEV_AUTH_BYPASS=false pnpm --filter @bp/api exec jest \
  --config test/jest-e2e.config.js test/auth.e2e-spec.ts --runInBand --forceExit   # real Keycloak auth
```

### 6) Logs and status
```bash
pnpm env:logs                   # infrastructure logs (docker compose)
docker compose ps               # container status/health
```

### 7) Stop
```bash
pnpm env:down                   # stops infra (keeps volumes)
```

## Main endpoints
See [`docs/API.md`](docs/API.md). Summary:
- `GET /health`, `GET /health/live`
- `GET /v1/customers/me`
- `GET /v1/accounts`
- `GET /v1/accounts/:id/movements` (cache-aside; `_cache: HIT|MISS`)
- `POST /v1/transfers` (requires `Idempotency-Key` + step-up), `GET /v1/transfers/:id`
- `GET /v1/audit`
- BFF OIDC: `GET /auth/login`, `GET /auth/callback`, `GET /auth/session`, `POST /auth/logout`
- Internal (protected by `X-Internal-Token`): `POST /internal/reconcile`

## Authentication
- **Production:** existing OIDC IdP. **Local:** Keycloak (realm `bp`, user `demo`/`demo`).
- **Web:** BFF with OIDC Authorization Code + PKCE, tokens stored server-side in Redis, HttpOnly cookie + CSRF.
- **Mobile:** Authorization Code + PKCE (public client).
- `DEV_AUTH_BYPASS=true` enables a test user via the `x-debug-user` header for **local development only** (never in production).
- A TEST-ONLY `bp-test` Keycloak client (direct grant) exists solely for automated token-level auth tests; it must stay disabled in production.

## Mobile app (later phase)
`apps/mobile` is reserved. To connect it to local services: Android emulator uses `10.0.2.2`, iOS simulator uses
`localhost`, a physical device uses the host LAN IP; the Keycloak `issuer` must be reachable from the device.

## Ports
| Service | Port |
|---------|------|
| API | 3001 |
| Web (Vite) | 5173 |
| PostgreSQL | 5432 (loopback) |
| Redis | 6379 (loopback) |
| RabbitMQ / mgmt | 5672 / 15672 (loopback) |
| Keycloak | 8088 |
| WireMock Core | 8090 |
| WireMock Complementary | 8091 |

## Known limitations
- **Interactive OIDC browser login** (Authorization Code + PKCE click-through) and the **SPA live UI** were NOT run in this environment (no browser automation). Backend token verification against Keycloak JWKS is tested (`auth.e2e-spec.ts`).
- **P-Core-01 / ADR-0022:** the Core operation-status lookup is assumed; production reconciliation correctness depends on it.
- **HA/DR and the WORM audit archive** are production-target (AWS) and not simulated locally; local Docker tests do not prove Multi-AZ availability or DR.
- **CI/CD** workflow is provided; **IaC** (CDK/Terraform) and the **mobile app** are future work. **Compliance** is not asserted (undefined jurisdiction).

Implementation and test status: [`docs/TESTING.md`](docs/TESTING.md) and [`docs/WORKLOG.md`](docs/WORKLOG.md).
