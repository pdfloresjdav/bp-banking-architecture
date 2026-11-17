# BP Digital Banking — Tests (real results)

Last execution: 2026-11-17. Honest results: **PASS / FAIL / NOT RUN**.

## Unit tests (Jest) — executed
```bash
pnpm test        # domain + api
```
| Suite | Tests | Result |
|-------|-------|--------|
| `@bp/domain` (transfer state machine, idempotency, cache-aside, audit hashing) | 17 | **PASS** |
| `@bp/api` (TransferService mandatory scenarios, NotificationHandler) | 11 | **PASS** |
| **Total** | **28** | **PASS** |

## E2E tests (Supertest) — executed
Infrastructure (postgres, redis, rabbitmq, wiremock) **healthy**; migrations + seed applied. Each run resets
state (TRUNCATE operational tables + Redis flush) for isolation.

### Functional e2e — `apps/api/test/app.e2e-spec.ts` (DEV_AUTH_BYPASS=true) — **17/17 PASS**
Requires Docker. Run: `pnpm --filter @bp/api test:e2e`.

| # | Mandatory scenario | Result |
|---|--------------------|--------|
| 1 | Health endpoint (public) | **PASS** |
| 2 | Customer profile | **PASS** |
| 3 | Accounts | **PASS** |
| 4 | Account-ownership authorization (403 for another account) | **PASS** |
| 5 | Movement history: cache MISS then HIT | **PASS** |
| 6 | Successful transfer → CONFIRMED | **PASS** |
| 7 | Rejected transfer → REJECTED | **PASS** |
| 8 | Core timeout → UNKNOWN | **PASS** |
| 9 | Idempotent replay (same key → same transferId) | **PASS** |
| 10 | Idempotency conflict (different payload → 409) | **PASS** |
| 11 | Step-up required (missing stepup → 401) | **PASS** |
| 12 | Idempotency-Key required → 400 | **PASS** |
| 13 | Outbox persistence (events marked SENT) | **PASS** |
| 14 | Audit record creation | **PASS** |
| 15 | Notification processing (email + push from events) | **PASS** |
| 16 | Reconciliation endpoint requires the internal token (401) | **PASS** |
| 17 | Reconciliation resolves UNKNOWN without re-executing the command (+ attempt recorded) | **PASS** |

### Real authentication e2e — `apps/api/test/auth.e2e-spec.ts` (DEV_AUTH_BYPASS=false) — **4/4 PASS**
Requires Docker + Keycloak (realm `bp` with the TEST-ONLY `bp-test` client).
Run: `DEV_AUTH_BYPASS=false pnpm --filter @bp/api exec jest --config test/jest-e2e.config.js test/auth.e2e-spec.ts --runInBand --forceExit`.

| # | Scenario | Result |
|---|----------|--------|
| 1 | Obtains a real access token from Keycloak | **PASS** |
| 2 | Request without a token → 401 | **PASS** |
| 3 | Invalid token → 401 | **PASS** |
| 4 | Valid Keycloak token accepted (backend JWKS verification) → 200 | **PASS** |

## Diagram validation — executed
| Validation | Tool | Result |
|------------|------|--------|
| Real DSL syntax | `structurizr/structurizr validate` (Docker) | **PASS** |
| Model referential integrity | `node docs/architecture/validate.mjs` | **PASS** (0 errors, 1 known warning: `transfer` connects via its components) |
| Render C4 + sequences + deployment | `plantuml/plantuml` (Docker) → SVG/PNG | **PASS** (17 images, no errors) |

## Builds / type checks — executed
| Target | Result |
|--------|--------|
| `pnpm --filter @bp/api typecheck` (tsc) | **PASS** |
| `pnpm --filter @bp/web build` (tsc --noEmit + vite build) | **PASS** (44 modules) |
| Shared packages build (`contracts`, `domain`, `shared`) | **PASS** |
| `docker compose config` | **PASS** (6 images) |

## NOT RUN — documented
- **Interactive OIDC/Keycloak browser flow (Authorization Code + PKCE via the BFF, end-to-end in a browser):**
  the BFF (`bp-bff-web`) and Keycloak realm are implemented/configured, and **backend token verification is
  validated** by `auth.e2e-spec.ts` (real token + JWKS, bypass off). The full browser click-through was **NOT RUN**
  (no browser automation in this environment). Manual steps: `pnpm env:up`, `pnpm api:dev`, `pnpm --filter @bp/web dev`,
  open http://localhost:5173, click Sign in → Keycloak (`demo`/`demo`).
- **SPA live UI click-through:** the SPA compiles and builds (`vite build` PASS) but the running UI was **NOT RUN**
  (no browser here).
- **Live notification-provider DLQ:** covered by a unit test; a live `NOTIFY_FAIL=email` run is **NOT RUN**.
- **Mobile app:** reserved (later phase).

## Notes / fixes found during validation
- RabbitMQ binding `bp.transfer.*` (topic `*` = one word) did not match `bp.transfer.confirmed.v1` (4 words) →
  fixed to `bp.transfer.#`. Verified: notifications record email+push SENT.
- E2E isolation: the operational DB and Redis persist across runs → added TRUNCATE + `flushdb` in `beforeAll`.

## Final-delivery validation — executed
| Check | Result |
|-------|--------|
| PDF generated (`docs/deliverables/BP-Banking-Solution-Architecture.pdf`, weasyprint) | **PASS** (35 pages, valid/opens) |
| PDF visual inspection (cover, TOC page numbers, tables, C2 landscape diagram, ADR table, 15-criteria page) | **PASS** |
| PDF English-only, no broken images, C4 + 7 sequences + AWS deployment embedded | **PASS** |
| CI workflow present (`.github/workflows/ci.yml`) | **PASS** (not executed on GitHub here) |
| Repository secret scan (no `.env`, keys, certs, dumps, real secrets) | **PASS** |
| Clean local commit (`git init` → `main`, 157 files, PDF included) | **PASS** |

## Reproduce
```bash
corepack pnpm install
pnpm env:up && pnpm migrate && pnpm seed
pnpm test
pnpm --filter @bp/api test:e2e
DEV_AUTH_BYPASS=false pnpm --filter @bp/api exec jest --config test/jest-e2e.config.js test/auth.e2e-spec.ts --runInBand --forceExit
# Regenerate the PDF:
docker run --rm -v "$PWD":/data ghcr.io/weasyprint/weasyprint:latest \
  /data/docs/deliverables/report.html /data/docs/deliverables/BP-Banking-Solution-Architecture.pdf
```
