# Architecture Decision Records (ADR) — BP Digital Banking

Per-ADR format: **Status · Context · Decision · Justifications (≥2) · Alternatives · Consequences/Trade-offs.**
Statuses: `Accepted` · `Proposed` · `Superseded`.

> Convention: no decision that depends on an unconfirmed Core or IdP capability is marked `Accepted`.

---

## ADR-0001 — AWS as the target cloud
- **Status:** Accepted
- **Context:** The exercise allows AWS or Azure; a reference cloud is required.
- **Decision:** AWS is the target cloud; Azure remains a valid, undeveloped alternative.
- **Justifications:** (1) Mature managed catalog for the required patterns (ECS, Aurora, EventBridge/SQS, WAF, KMS). (2) Dev/prod parity via containers (same image locally and on Fargate).
- **Alternatives:** Azure (AKS/Container Apps, Service Bus, Azure SQL) — functionally equivalent; set aside by focus, not capability.
- **Consequences:** Coupling to AWS services mitigated by ports/adapters (ADR-0014).

## ADR-0002 — React + TypeScript for the SPA
- **Status:** Accepted
- **Context:** Web SPA for digital banking.
- **Decision:** React + TypeScript.
- **Justifications:** (1) Shared types with the NestJS backend and RN mobile → less contract drift. (2) Flexibility for the BFF + cookies pattern without an imposed state framework.
- **Alternatives:** Angular (robust/opinionated; steeper curve and bundle, less type reuse).
- **Consequences:** Structure discipline must be enforced (the framework does not impose it).

## ADR-0003 — React Native + TypeScript for mobile
- **Status:** Accepted
- **Context:** Cross-platform mobile app.
- **Decision:** React Native + TypeScript.
- **Justifications:** (1) Language/type homogeneity with SPA and backend. (2) Mature access to Keychain/Keystore and passkeys for device biometrics.
- **Alternatives:** Flutter (excellent UI; Dart adds another language/talent, less reuse).
- **Consequences:** UI performance slightly below Flutter in extreme cases; acceptable.

## ADR-0004 — NestJS + TypeScript for the backend
- **Status:** Accepted
- **Context:** Domain services and ACL.
- **Decision:** NestJS + TypeScript with hexagonal architecture.
- **Justifications:** (1) Native modularity/DI mapping to DDD and ports/adapters. (2) TS homogeneity (shared DTOs/validators) accelerates the PoC.
- **Alternatives:** Spring Boot (very defensible banking standard; heavier ops) and ASP.NET Core (solid; different ecosystem). Hexagonal allows rewriting a service in Spring without breaking contracts.
- **Consequences:** For very demanding financial workloads, Spring could be reconsidered for specific services.

## ADR-0005 — ECS Fargate for compute
- **Status:** Accepted
- **Context:** Container execution with low operational overhead.
- **Decision:** ECS Fargate (Multi-AZ).
- **Justifications:** (1) No node management; integrated auto-healing and scaling. (2) Same artifact (image) as local Docker → real parity.
- **Alternatives:** EKS (operational over-engineering for this size); Lambda (cold starts, time limits, DB connections; reserved for event-driven glue).
- **Consequences:** Less flexibility than k8s; sufficient for the scope.

## ADR-0006 — PostgreSQL / Aurora PostgreSQL as the primary operational store
- **Status:** Accepted
- **Context:** Platform operational state (not the financial truth, which belongs to the Core).
- **Decision:** PostgreSQL locally; Aurora PostgreSQL on AWS.
- **Justifications:** (1) ACID transactionality and unique constraints for orders, idempotency, and Outbox. (2) Multi-AZ, replicas, and managed backups on Aurora.
- **Alternatives:** Plain RDS PostgreSQL (less HA/read scaling).
- **Consequences:** A single relational engine simplifies the PoC (see ADR-0019).

## ADR-0007 — Redis / ElastiCache for cache and sessions
- **Status:** Accepted
- **Context:** Low latency for frequent customers and the BFF session.
- **Decision:** Redis locally; ElastiCache on AWS.
- **Justifications:** (1) Cache-aside with TTL for profile/products/movements. (2) BFF session store and revocation list.
- **Alternatives:** In-process cache (not shared); Memcached (no structures or persistence).
- **Consequences:** Not the source of truth; requires disciplined invalidation.

## ADR-0008 — Local Keycloak + existing OIDC IdP in production
- **Status:** Accepted
- **Context:** No in-house IdP is built (constraint).
- **Decision:** Keycloak for local development; the existing OIDC IdP in production.
- **Justifications:** (1) Keycloak is OIDC-compliant (PKCE, MFA, realms) → reproduces the flow without inventing the real IdP's capabilities. (2) Interchangeable via standard OIDC configuration (issuer/JWKS).
- **Alternatives:** Cognito/Auth0 (would change the production IdP; out of scope).
- **Consequences:** No proprietary IdP features are assumed (standard OIDC only).

## ADR-0009 — OIDC Authorization Code + PKCE
- **Status:** Accepted
- **Context:** Public clients (SPA and mobile).
- **Decision:** Authorization Code + PKCE for web (via the BFF) and mobile.
- **Justifications:** (1) OAuth2 is authorization; OIDC provides identity. (2) PKCE removes the need for a client secret in public clients.
- **Alternatives:** Implicit flow (deprecated/insecure); ROPC (exposes credentials).
- **Consequences:** Requires refresh handling with rotation.

## ADR-0010 — BFF for the web SPA
- **Status:** Accepted
- **Context:** Token custody in a web app.
- **Decision:** BFF (`bp-bff-web`) with server-side tokens and an HttpOnly/Secure/SameSite cookie + CSRF.
- **Justifications:** (1) Tokens out of the browser → reduces XSS/refresh-theft surface. (2) Allows web experience aggregation.
- **Alternatives:** Tokens in memory/localStorage (XSS surface).
- **Consequences:** An additional container and server-side session management.

## ADR-0011 — RabbitMQ locally; EventBridge + SQS on AWS
- **Status:** Accepted
- **Context:** Decoupled messaging; avoid presenting false equivalences.
- **Decision:** RabbitMQ locally; EventBridge (routing) + SQS (work/DLQ) on AWS, behind an `EventBus` port.
- **Justifications:** (1) RabbitMQ covers the **semantics** (pub/sub, queues, DLQ, retries) needed to validate flows. (2) The port allows swapping the transport without touching the domain.
- **Alternatives:** SNS (simple fan-out, subsumed by EventBridge); LocalStack (only if validating the exact EventBridge/SQS format is required).
- **Consequences:** RabbitMQ is **not** a 1:1 equivalent of SNS+SQS+EventBridge; documented.

## ADR-0012 — WireMock to simulate the Core Banking system
- **Status:** Accepted
- **Context:** The Core is unavailable locally.
- **Decision:** WireMock as the Core simulator.
- **Justifications:** (1) Allows injecting latency, failures, and ambiguous responses (key for timeouts/UNKNOWN). (2) Versionable contracts.
- **Alternatives:** Custom mock in Node (more effort); real service (unavailable).
- **Consequences:** The mock does not reproduce real settlement; reconciliation is tested against simulated scenarios.

## ADR-0013 — Modular architecture with domain boundaries
- **Status:** Accepted
- **Context:** Avoid microservices by trend and avoid a boundaryless monolith.
- **Decision:** Few services aligned with bounded contexts (DDD); modules inside a service unless there is a scaling/security/lifecycle reason.
- **Justifications:** (1) Reduces unnecessary distributed complexity. (2) Maintains data ownership and C4 traceability.
- **Alternatives:** Fine-grained microservices (operational complexity); single monolith (coupling).
- **Consequences:** Customer/Accounts/Movements could be collapsed if the team is small (documented).

## ADR-0014 — Hexagonal Architecture and Anti-Corruption Layer
- **Status:** Accepted
- **Context:** Isolate the domain from infrastructure and from the legacy Core.
- **Decision:** Ports/adapters in each service; `bp-core-integration` as the single ACL to the Core.
- **Justifications:** (1) Swap transport/IdP/DB/framework without touching the domain. (2) Single point of resilience and idempotency toward the Core.
- **Alternatives:** Direct Core access from the domains (coupling and duplication).
- **Consequences:** An additional translation layer.

## ADR-0015 — Idempotency Keys on financial operations
- **Status:** Accepted
- **Context:** Safe retries without double processing.
- **Decision:** Mandatory `Idempotency-Key` on financial commands; uniqueness in PostgreSQL.
- **Justifications:** (1) Prevents duplicates on network/client retries. (2) Enables deterministic idempotent responses.
- **Alternatives:** Payload-hash deduplication (fragile); relying on the Core (unconfirmed capability).
- **Consequences:** The client must generate and resend the same key.

## ADR-0016 — Transactional Outbox
- **Status:** Accepted
- **Context:** Publish events without dual-write.
- **Decision:** Write the event to an Outbox table in the same TX as the state change; a relay publishes to the bus (at-least-once).
- **Justifications:** (1) State+event atomicity (no events lost). (2) Decouples the DB from the bus.
- **Alternatives:** Publish directly after commit (loss window); 2PC (complex/fragile).
- **Consequences:** At-least-once delivery → idempotent consumers.

## ADR-0017 — Reconciliation of financial operations
- **Status:** Accepted
- **Context:** UNKNOWN results (timeouts) against the Core.
- **Decision:** A periodic worker/endpoint that resolves UNKNOWN/PENDING orders by querying the Core status; no blind retries.
- **Justifications:** (1) `HTTP 200 ≠ settled`: the real state is determined by the Core. (2) Avoids double processing from unsafe retries.
- **Alternatives:** Automatic retry (duplicate risk); assuming success (financial risk).
- **Consequences:** Depends on a Core status lookup (see ADR-0022, Proposed). Implemented as a protected endpoint with a global advisory lock (see ADR-0029).

## ADR-0018 — Append-only audit: operational + protected retention
- **Status:** Accepted
- **Context:** Record successes, failures, auth attempts, rejections, and security events, with minimization.
- **Decision:** Append-only operational log with **hash chaining** in PostgreSQL (queryable) + export to a **protected WORM retention archive** (S3 Object Lock on AWS).
- **Justifications:** (1) Verifiable integrity (hash) and operational query. (2) Separate the operational store from the long-term immutable archive.
- **Alternatives:** Append-only table only (no WORM, weaker guarantee); QLDB (extra service, dropped for simplicity).
- **Consequences:** The WORM archive is **not simulated** locally; documented only.

## ADR-0019 — Idempotency/Outbox/operational audit in PostgreSQL; DynamoDB as an AWS alternative
- **Status:** Accepted (supersedes using DynamoDB as a mandatory dependency)
- **Context:** The initial design placed idempotency and audit in DynamoDB, adding an extra engine to the PoC.
- **Decision:** Idempotency (`UNIQUE`), Outbox, and operational audit live in PostgreSQL (one ACID TX). DynamoDB remains a **documented AWS alternative** (idempotency store with atomic condition + TTL, or high-volume audit), not a PoC dependency.
- **Justifications:** (1) A single ACID transaction avoids dual-write and race conditions between order, idempotency, and Outbox. (2) Simplifies the local PoC (one data engine) without losing guarantees.
- **Alternatives:** DynamoDB (excellent for idempotency via TTL/condition, but adds an engine and complicates the TX with the relational order).
- **Consequences:** If audit/idempotency volume grows significantly, that portion can be migrated to DynamoDB, keeping the port.

## ADR-0020 — Email and push notifications
- **Status:** Accepted
- **Context:** At least 2 notification mechanisms are required.
- **Decision:** Email and mobile push, triggered by business events (consumer), with idempotency by `eventId`.
- **Justifications:** (1) Covers the ≥2-channel requirement with standard banking channels. (2) Decoupled from the transactional path (does not block the operation).
- **Alternatives:** SMS (cost/deliverability; remains an optional third channel).
- **Consequences:** Real delivery is out of PoC scope (simulators).

## ADR-0021 — Source-account authorization (not destination ownership)
- **Status:** Accepted
- **Context:** In transfers, especially interbank ones, the destination can belong to another entity.
- **Decision:** The backend validates **source-account authorization** (the subject's ownership/permission). For interbank transfers, destination ownership is **not** validated.
- **Justifications:** (1) The customer does not own the interbank destination; requiring ownership would break the use case. (2) The relevant security control is that the subject can **debit** the source account. (3) Destination validity is determined by the Core/interbank network, not the platform.
- **Alternatives:** Validating ownership of both accounts (correct only for own-account transfers; incorrect for interbank).
- **Consequences:** For own-account transfers, both accounts are validated as belonging to the subject (special case).

## ADR-0022 — Core operation-status lookup (`getOperationStatus`)
- **Status:** Proposed (depends on P-Core-01; not marked Accepted)
- **Context:** Reconciliation (ADR-0017) requires querying the real status of an operation by reference.
- **Decision (proposed):** Assume the Core exposes idempotency propagation and/or a status lookup by reference.
- **Justifications:** (1) Without it, UNKNOWN cannot be safely resolved. (2) It is common practice in transactional cores.
- **Alternatives:** File/batch reconciliation from the Core (if there is no status API).
- **Consequences:** **Potential blocker** if the Core offers neither; business confirmation is required.

## ADR-0023 — Core connectivity via VPN IPsec / Direct Connect
- **Status:** Accepted (approach); the concrete choice is Pending (depends on the Core link)
- **Context:** The Core Banking system resides outside AWS (on-prem or another DC); private, secure connectivity is required.
- **Decision:** A private hybrid link: **VPN IPsec** as the baseline and **Direct Connect** when stable, predictable bandwidth/latency is needed. BP↔Core traffic is encrypted (mTLS over the tunnel). The Core is **not** represented inside AWS.
- **Justifications:** (1) Avoids exposing the Core to the Internet; keeps financial traffic on a private network. (2) Direct Connect offers predictable latency/throughput for transactional workloads; VPN allows starting without physical provisioning.
- **Alternatives:** Public Core exposure (unacceptable); VPN only (may not meet latency); Direct Connect only (cost/lead time too high for the PoC).
- **Consequences:** The final choice depends on the Core link's volume and SLA (to confirm with Core infrastructure).

## ADR-0024 — Disaster Recovery strategy (Backup & Restore / Pilot Light)
- **Status:** Proposed (depends on RTO/RPO validated with the business — P-05)
- **Context:** DR is required for a regional outage; the PoC does not deploy multi-region.
- **Decision (proposed):** Baseline **Backup & Restore** (Aurora snapshots + PITR, replicated artifacts and IaC), with a **Pilot Light** option (Aurora Global Database + minimal infra in a secondary region + Route 53 failover) if the RTO requires it.
- **Justifications:** (1) Backup & Restore is the lowest cost and meets the RPO with PITR. (2) Pilot Light reduces the RTO by keeping a warm replica, without the cost of active-active.
- **Alternatives:** Warm standby / multi-site active-active (better RTO, higher cost; oversized until objectives are validated).
- **Consequences:** Requires game days to measure real RTO/RPO; no guaranteed DR is claimed.

## ADR-0025 — Deployment diagram in PlantUML C4 Deployment (separate from the logical model)
- **Status:** Accepted
- **Context:** Infrastructure deployment is a separate concern from the logical C4 model (single source in `workspace.dsl`).
- **Decision:** Keep the deployment as PlantUML C4 Deployment under `docs/architecture/deployment/`, versionable and renderable offline with the same toolchain (`plantuml/plantuml` image).
- **Justifications:** (1) Avoids mixing infrastructure with the logical model, keeping each source clear. (2) It renders offline without external libraries (stdlib `<C4/C4_Deployment>`), unlike AWS icon libraries that require remote includes.
- **Alternatives:** Structurizr Deployment View (valid; deferred to avoid complicating the export); AWS icon library in PlantUML (requires remote includeurl, not offline).
- **Consequences:** Consistency with the logical model is maintained by the `bp-*` naming convention, not by a single file.

## ADR-0026 — PoC runtime via ts-node + DEV_AUTH_BYPASS for HTTP testing
- **Status:** Accepted (PoC only)
- **Context:** The API must run and be validated locally without friction, and HTTP flows must be testable without Keycloak's interactive login.
- **Decision:** The API runs with **ts-node (transpile-only)** on host or container. A `DEV_AUTH_BYPASS` flag, when `true`, injects a test user via the `x-debug-user` header (and `x-debug-stepup`). It is **never** enabled in production.
- **Justifications:** (1) Enables reproducible HTTP tests of the financial flows without standing up the full OIDC flow on each run. (2) ts-node avoids a build step for the PoC while keeping a single TS source.
- **Alternatives:** Compile to JS (slower to iterate); require real OIDC login on every test (fragile for CI/smoke).
- **Consequences:** The interactive OIDC/Keycloak browser flow remains pending interactive validation; the bypass must be disabled and config-guarded in real environments. Real token-level authentication is validated by `apps/api/test/auth.e2e-spec.ts` (bypass off, real Keycloak token + JWKS).

## ADR-0027 — Persistence with TypeORM DataSource + explicit SQL (no decorated entities)
- **Status:** Accepted
- **Context:** ACID transactionality is needed for order + idempotency (UNIQUE) + Outbox, with low mapping-error risk.
- **Decision:** Use TypeORM only for **connection and transactions**, with **explicit SQL** (`queryRunner`/`DataSource.query`) and the schema in `schema.sql`. Idempotency via `INSERT ... UNIQUE(idempotency_key)`; `23505` conflict → replay without re-executing.
- **Justifications:** (1) Precise control of the transaction grouping order+idempotency+outbox. (2) Fewer coupling/surprises than decorator mapping for a PoC.
- **Alternatives:** `@Entity` entities + TypeORM repositories (more sugar, more configuration risk); Prisma (another toolchain).
- **Consequences:** Hand-written SQL; migrations managed by an idempotent `schema.sql` (not the TypeORM migration runner).

## ADR-0028 — English-only project language
- **Status:** Accepted
- **Context:** The project switched to English as a permanent requirement (2026-11-17).
- **Decision:** All artifacts (code, comments, docs, ADRs, diagram labels, DSL/PlantUML descriptions, API docs, error/validation messages, test names, commit messages, WORKLOG, deployment/cost docs, the final PDF) are written in professional technical English. Existing identifiers, API routes, DB schemas, and event names are preserved.
- **Justifications:** (1) A single language removes ambiguity and eases onboarding/review. (2) Consistent terminology across all C4 levels and code.
- **Alternatives:** Keep Spanish (rejected by the requirement); bilingual docs (duplication/drift).
- **Consequences:** Existing Spanish content was translated in place; the policy is captured in `CLAUDE.md` (section 0) and in memory.

## ADR-0029 — Reconciliation exposed as a protected endpoint with a global advisory lock
- **Status:** Accepted
- **Context:** Reconciliation logic existed but had no operational execution mechanism, and concurrent runs could reconcile the same operation twice.
- **Decision:** Expose `POST /internal/reconcile`, protected by a shared `X-Internal-Token` (isolated from end-user auth). The run acquires a Postgres `pg_try_advisory_lock`, so only one reconciliation executes at a time; it queries the Core status by reference, never re-executes the transfer, keeps state-transition integrity, records every attempt in `reconciliation_attempts`, emits events, writes audit records, and handles Core unavailability safely (the order stays UNKNOWN).
- **Justifications:** (1) The advisory lock prevents concurrent reconciliation of the same operation without per-row locking complexity. (2) A protected internal endpoint can be driven by a scheduler/cron or an operator, with access control separate from user auth.
- **Alternatives:** Per-row `SELECT ... FOR UPDATE SKIP LOCKED` (finer granularity, more complexity); an always-on background job (harder to control/observe in the PoC).
- **Consequences:** The token must be strong and rotated in real environments; a single global lock serializes reconciliation runs (acceptable for the PoC scale).

## ADR-0030 — Final PDF generated from HTML via weasyprint
- **Status:** Accepted
- **Context:** The submission requires a professional, reproducible architecture PDF with a cover, table of contents, page numbers, embedded diagrams, and consistent typography.
- **Decision:** Author the document as a single print-CSS HTML file (`docs/deliverables/report.html`) and render it to PDF with the `ghcr.io/weasyprint/weasyprint` Docker image. Wide C4/deployment diagrams use landscape pages; the TOC uses CSS `target-counter` for page numbers; diagrams are embedded as the already-rendered PNGs.
- **Justifications:** (1) Reproducible and versionable (HTML+CSS is diff-friendly; one Docker command regenerates the PDF) with no local toolchain install. (2) weasyprint supports paged media (running headers/footers, page counters, named landscape pages, bookmarks) for a polished technical-report layout; it avoids the Python 3.14 wheel risk of reportlab/Pillow in this environment.
- **Alternatives:** reportlab/Platypus (manual layout; Pillow wheels unavailable for Python 3.14 here); pandoc+LaTeX (heavy install); headless-Chromium/Puppeteer (heavy chromium download).
- **Consequences:** CSS custom properties were inlined to hex (older weasyprint ignored `var()` in some shorthands); the HTML is the editable source committed alongside the PDF.
