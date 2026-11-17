# CLAUDE.md — BP Digital Banking (primary source of permanent instructions)

> **Read this file and the relevant documents BEFORE starting any task.**
> Do not repeat analysis or decisions already documented. Do not change approved architecture, names, or
> technologies without a real technical justification. Work in finished deliverables.

## 0. PROJECT LANGUAGE POLICY (permanent)
All project artifacts must be written in **professional technical English**. This includes:
source code and inline comments; documentation and README files; Architecture Decision Records (ADRs);
architecture diagrams and diagram labels; PlantUML and Structurizr DSL descriptions; API documentation;
API error messages and validation messages; test names and descriptions; test fixtures with human-readable
content; git commit messages; WORKLOG entries; deployment documentation; cost and operational reports;
the final architecture PDF; and any artifacts created in the future.

- **Never switch back to Spanish unless explicitly instructed.**
- Use consistent English terminology across all architecture levels and code.
- Preserve existing identifiers, API routes, database schemas, event names, and technical contracts unless
  changing them is strictly necessary.

## 1. Exercise objective
Design and implement a **reference digital-banking architecture** for the fictitious entity **BP**, deployable
on **AWS** with an equivalent **local Docker** environment for a functional PoC. The platform is a layer of
**experience, orchestration, and security**; the **Core Banking system is the source of truth** for balances,
movements, and transactions.

## 2. Scope and deliverables
1. **C4** diagrams (C1/C2/C3) + sequence diagrams. *(done)*
2. **AWS** deployment architecture. *(documented)*
3. **Docker Compose** local environment + NestJS backend. *(PoC v1 done)*
4. **React SPA** + tests.
5. Technical documentation, **ADRs**, compliance notes, cost and security.
6. Final professional **PDF** in English.
7. **GitHub** repository preparation.

**Priority PoC (do not build a full bank):** authentication, customer/movement queries, idempotent simulated
transfer, simulated Core, cache, events, notifications, audit, failure handling.

## 3. Approved technology stack
| Layer | Local | AWS |
|-------|-------|-----|
| Web SPA | React + TypeScript | S3 + CloudFront |
| Mobile | React Native + TypeScript | — |
| Backend | NestJS + TypeScript (hexagonal) | ECS Fargate |
| Operational persistence | PostgreSQL | Aurora PostgreSQL |
| Cache / session | Redis | ElastiCache |
| Messaging | RabbitMQ | EventBridge + SQS |
| Identity | Keycloak | Existing OIDC IdP |
| Core (simulated) | WireMock | Real Core Banking |
| Audit (retention) | *(not simulated)* | S3 Object Lock (WORM) |
| Observability | OTel + Jaeger + Grafana | CloudWatch + X-Ray |

Formal decisions and justifications: [`docs/architecture/DECISIONS.md`](docs/architecture/DECISIONS.md).

## 4. AWS architecture and local equivalent
- **Edge:** CloudFront + WAF → API Gateway (mobile/API) and BFF (web). Local: Traefik/gateway + BFF; the edge is **not simulated**.
- **Domains:** customer, account-product, movements, transfer, payment, onboarding, notification, audit.
- **Integration:** `bp-core-integration` (ACL to the Core) and `bp-complementary-integration`.
- **Data:** PostgreSQL (ACID operational store), Redis (cache/session), event bus; operational audit in Postgres + WORM archive.
- **Equivalences and differences:** see the architecture matrix. **HA/DR and security guarantees that the local environment cannot provide are not simulated.**

## 5. `bp-*` naming conventions
Services/containers in **kebab-case with the `bp-` prefix**. Canonical names (use identically across diagrams, docs, and code):
```
bp-web-spa, bp-mobile-app, bp-edge, bp-api-gateway, bp-bff-web, bp-identity-adapter,
bp-customer-service, bp-account-product-service, bp-movements-service,
bp-transfer-service, bp-payment-service, bp-core-integration, bp-complementary-integration,
bp-onboarding-service, bp-notification-service, bp-audit-service,
bp-db-postgres, bp-cache-redis, bp-event-bus, bp-audit-archive
```

## 6. Event conventions `bp.<domain>.<fact>.vN`
Common envelope: `eventId, occurredAt, correlationId, idempotencyKey, producer, schemaVersion, payload`.
Canonical events: `bp.transfer.requested/confirmed/failed/unknown.v1`,
`bp.payment.requested/confirmed/failed.v1`, `bp.onboarding.verified/rejected.v1`,
`bp.auth.login.succeeded/failed.v1`, `bp.auth.stepup.required/completed.v1`,
`bp.security.suspicious.v1`, `bp.notification.sent/failed.v1`.
Delivery is **at-least-once** (Outbox) → **idempotent consumers** keyed by `eventId`.

## 7. Selected architectural patterns
Hexagonal, DDD, Modular (few services per domain), BFF, API Gateway, Anti-Corruption Layer,
selective CQRS (movements read only), Cache-Aside, Transactional Outbox, Idempotency Key,
Circuit Breaker, Retry + backoff (idempotent only), Bulkhead, Event-Driven (informational, not transactional).
**No** distributed Saga and **no** full Event Sourcing (the Core is transactional).

## 8. Security and banking-integrity rules
- Web SPA keeps **no tokens in the browser**: BFF with HttpOnly/Secure/SameSite cookie + CSRF. Mobile: Authorization Code + **PKCE**.
- **MFA + step-up** for sensitive operations. Each service validates the token (JWKS), scopes, and **source-account authorization** (interbank: destination ownership is **not** validated — ADR-0021).
- Financial commands: mandatory **Idempotency-Key**, **explicit states** (PENDING→SUBMITTED→CONFIRMED/REJECTED/UNKNOWN), **timeouts**, **no unsafe retries**, **reconciliation** for UNKNOWN.
- **`HTTP 200 ≠ settled`**. **The queue does not replace the Core's transactional guarantees.** Separate financial commands from informational events.
- **Onboarding** biometrics (1:1 + liveness) ≠ **subsequent** biometrics (OS/passkeys); **no biometric templates are stored**.
- Append-only audit with **hash chaining** + **WORM** archive; **minimization** of sensitive data.
- East-west mTLS; KMS encryption at rest; secrets in Secrets Manager. **Do not invent** HA/DR/security guarantees or Core/IdP capabilities.

## 9. Diagram and documentation locations
```
CLAUDE.md                          # this file
docs/WORKLOG.md                    # chronological history (append-only)
docs/API.md                        # API reference
docs/TESTING.md                    # test inventory and real results
docs/architecture/
  workspace.dsl                    # SINGLE SOURCE of the C4 model (Structurizr)
  DECISIONS.md                     # ADRs
  README.md                        # diagram guide + render + validation index
  exports/                         # PlantUML C4 (renderable copy synced with the DSL)
  sequences/                       # PlantUML sequence diagrams
  deployment/                      # AWS deployment (PlantUML C4 Deployment) + README
  rendered/                        # generated images (SVG/PNG) — visually verified
  validate.mjs                     # lightweight validator (Node, no dependencies)
  HA-DR-OBSERVABILITY.md           # failures, SLO/RTO/RPO, metrics, alarms, runbooks
  COSTS.md                         # cost formulas + FinOps (no invented prices)
apps/ packages/ infrastructure/    # PoC monorepo (see README.md)
```

### Render and validation (real tools)
- Render: Docker image `plantuml/plantuml` (`-tsvg`/`-tpng`), offline (stdlib `<C4/...>`).
- DSL syntax validation: `structurizr/structurizr validate -w workspace.dsl` (the classic `structurizr/cli` is deprecated/empty).
- Integrity validation: `node docs/architecture/validate.mjs`.
- Do not send diagrams to public render servers.

## 10. Rules for generating code and documentation
1. `workspace.dsl` is the **single source** of the C4 model; the `exports/` `.puml` files are kept in sync (no two independent models).
2. Reuse the canonical `bp-*` and event names in every artifact.
3. Before modifying an existing file, **review its content**.
4. Keep diagrams, code, and documentation **in sync**.
5. Do not implement unnecessary services. Do not duplicate documentation.
6. Document each relevant decision as an ADR (≥2 justifications + alternatives).

## 11. Quality criteria
- Consistent names and contracts across levels and deliverables.
- C1→C2→C3 traceability and down to the code.
- Honest validations: real **PASS/FAIL/NOT RUN**; no unexecuted tests or renders.
- Security and financial integrity over unnecessary complexity.

## 12. Workflow
1. Read `CLAUDE.md` + relevant docs. 2. Execute the deliverable. 3. Sync diagrams/docs/code.
4. Validate (and record the real result). 5. Update `docs/WORKLOG.md`. 6. Do not ask for confirmation on
decisions already made; stop only on a critical blocker.

## 13. Constraints and open decisions
- **P-Core-01 (ADR-0022, Proposed):** does the Core support idempotency propagation and/or operation-status
  lookup by reference? Required to safely reconcile UNKNOWN.
- **P-Core-02:** balance volatility → cache policy/TTL for balances.
- **P-01 (jurisdiction/compliance):** with no defined jurisdiction, **no compliance is claimed** (PCI-DSS/GDPR/local).
- No IdP capabilities beyond **standard OIDC** (PKCE, JWKS, refresh, MFA) are assumed.

---

## Current Project State
_Updated: 2026-11-17_

- **Completed deliverables:**
  - Stage 1 — Requirements analysis (in conversation history).
  - Stage 2 — Logical design and stack (formalized in ADRs).
  - **C4 diagrams (C1, C2, C3-Transfer, C3-CoreIntegration)**: `workspace.dsl` + PlantUML exports + README.
  - Project memory: `CLAUDE.md`, `docs/WORKLOG.md`, `docs/architecture/DECISIONS.md`.
  - Consistency corrections (idempotency/Outbox/audit in PostgreSQL; DynamoDB as an AWS alternative; operational vs. WORM audit; source-account authorization).
  - **Sequence diagrams (7)** in `docs/architecture/sequences/`.
  - **Real render (2026-11-17):** 15 logical/sequence diagrams + AWS deployment in `rendered/` (SVG/PNG); DSL validated with `structurizr/structurizr`; C2/C3/deployment visually inspected.
  - **AWS infrastructure (documentation):** `deployment/` (Multi-AZ diagram + README), `HA-DR-OBSERVABILITY.md`, `COSTS.md`.
  - **Functional local PoC (pnpm monorepo):** `apps/api` (hexagonal NestJS), `packages/{contracts,domain,shared}`, `infrastructure/` (Docker+mocks+keycloak+scripts), `docker-compose.yml`. **28 unit tests PASS**, **12 HTTP checks PASS** against real Docker infra (see `docs/TESTING.md`). Root README + `docs/API.md`.
  - **English-only migration** (2026-11-17, ADR-0028): language policy adopted; all code, docs, diagrams (DSL/PlantUML), ADRs, API docs, messages, and test names translated to English; diagrams re-rendered.
  - **React SPA** (`apps/web`, Vite+TS): SignIn, Dashboard, Accounts, AccountDetail (movements+pagination), Transfers (step-up/duplicate-submit handling), Audit. `vite build` **PASS** (live UI click-through NOT RUN — no browser here).
  - **Real Keycloak auth**: BFF session guard (cookie→Redis→JWKS) + CSRF; validated by `auth.e2e-spec.ts` (**4/4 PASS**, real token, bypass off). Interactive browser flow documented, NOT RUN.
  - **Reconciliation** (ADR-0029): `POST /internal/reconcile` (internal-token guard + Postgres advisory lock + attempt recording + events + audit); validated by E2E.
  - **E2E suite** (`apps/api/test/`): functional **17/17 PASS**, real-auth **4/4 PASS**.
  - **Final delivery (2026-11-17):** professional **PDF** at `docs/deliverables/BP-Banking-Solution-Architecture.pdf` (35 pages, 29 sections, all C4 + 7 sequences + AWS deployment, 15-criteria matrix) built from `report.html` via weasyprint and **visually verified**; **CI workflow** (`.github/workflows/ci.yml`); repo initialized with a clean commit (no secrets); README with PDF/diagram links and known limitations.
- **Active deliverable:** none — final submission prepared locally (awaiting GitHub publication: create repo + add remote + push).
- **Next task:** Publish to GitHub (steps documented in the final report); optional IaC (CDK/Terraform) and mobile app.
- **Risks and blockers:**
  - **P-Core-01** (Core operation-status lookup) — open; does not block design, conditions reconciliation in production.
  - Interactive OIDC browser flow and SPA live UI — NOT RUN here (no browser automation); backend auth is validated.
  - GitHub publication pending (no remote/`gh` in this environment) — prepared locally, steps documented.
