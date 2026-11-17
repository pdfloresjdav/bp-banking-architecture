# WORKLOG — BP Digital Banking

**Append-only** chronological history. Previous entries are never rewritten; only new ones are added.
Validation results: **PASS / FAIL / NOT RUN** (real, never invented).

> Note: on 2026-11-17 the project switched to English; the existing entries below were translated in place,
> preserving their chronology and facts (see TASK-EN1). No history was erased.

---

## 2026-11-17 — TASK-E0 — Analysis and design (retroactive)
- **Objective:** Analyze requirements (Stage 1) and define the logical design + stack (Stage 2).
- **Files created:** none (done in the conversation; later formalized in ADRs).
- **Files modified:** none.
- **Decisions made:** Approved stack and patterns → formalized in `docs/architecture/DECISIONS.md` (ADR-0001..0021).
- **Validations:** N/A — **NOT RUN**.
- **Issues found:** The literal 15 evaluation criteria were not provided; a derivation was used, flagged as pending cross-check.
- **Open issues:** P-Core-01 (Core status lookup), P-01 (jurisdiction/compliance).
- **Next step:** Generate C4 diagrams.

## 2026-11-17 — TASK-E1 — C4 diagrams (retroactive)
- **Objective:** Create editable, versionable C4 Level 1/2/3; L3 covers transfers and the Core.
- **Files created:**
  - `docs/architecture/workspace.dsl` (single Structurizr source)
  - `docs/architecture/exports/C1-Contexto.puml`
  - `docs/architecture/exports/C2-Contenedores.puml`
  - `docs/architecture/exports/C3-Transfer.puml`
  - `docs/architecture/exports/C3-CoreIntegration.puml`
  - `docs/architecture/README.md`
- **Files modified:** none.
- **Decisions made:** Structurizr DSL as the single source; PlantUML C4 exports to render without Structurizr tooling; `!impliedRelationships true`.
- **Validations:** image render **NOT RUN** (no PlantUML/Graphviz or Docker daemon on the machine at that time).
- **Issues found:** Could not generate PNG/SVG.
- **Open issues:** Validate syntax and render the C4.
- **Next step:** Project memory + consistency corrections + validation.

## 2026-11-17 — TASK-MEM1 — Project memory + consistency corrections + validation + sequences
- **Objective:** Establish persistent memory (CLAUDE/WORKLOG/ADR), fix C4 inconsistencies, validate with available tools, and generate the sequence diagrams.
- **Files created:**
  - `CLAUDE.md`
  - `docs/WORKLOG.md`
  - `docs/architecture/DECISIONS.md` (ADR-0001..0022)
  - `docs/architecture/validate.mjs` (dependency-free Node validator)
  - `docs/architecture/sequences/seq-01..07-*.puml` (7 diagrams)
- **Files modified:**
  - `docs/architecture/workspace.dsl` (single source): idempotency/Outbox/operational audit → PostgreSQL ACID; removed `bp-store-dynamo` as a container; added `bp-audit-archive` (WORM); source-account authorization.
  - `docs/architecture/exports/C2-Contenedores.puml`, `C3-Transfer.puml`, `C3-CoreIntegration.puml` (synced with the DSL).
  - `docs/architecture/README.md` (sequences, corrections, validation).
- **Decisions made:** ADR-0019 (PostgreSQL ACID for idempotency/Outbox/audit; DynamoDB as a documented AWS alternative), ADR-0021 (source-account authorization), ADR-0018 (operational vs. WORM retention audit), ADR-0022 (Core getOperationStatus: **Proposed**).
- **Validations executed:**
  - `node docs/architecture/validate.mjs` → **PASS** (0 errors, 1 warning: `transfer` orphan = parser false positive; connects via components).
  - `bp-*` name consistency across DSL, exports, and sequences → **PASS**.
  - No obsolete `bp-store-dynamo` references → **PASS**.
  - C1/C2/C3 image render to PNG/SVG → **NOT RUN** (no Java/PlantUML/Graphviz; `/usr/bin/java` is a stub without a JDK; Docker off; no external PlantUML server used, to avoid transmitting the architecture to third parties without approval).
- **Issues found:**
  - DynamoDB appeared as a mandatory dependency (idempotency/audit) → corrected to PostgreSQL ACID.
  - Interbank authorization semantics (destination ownership was validated) → corrected to source-account authorization.
  - No local render tool without installing heavy/global dependencies.
- **Open issues:**
  - **P-Core-01 / ADR-0022:** confirm whether the Core exposes status lookup by reference (needed to reconcile UNKNOWN).
  - Visual render of the diagrams pending a tool (Docker/Structurizr or PlantUML) on the user's side.
- **Next step:** Execution deliverable 2 — AWS infrastructure architecture (deployment diagram + Multi-AZ, auto scaling, observability, DR, CI/CD, IaC, FinOps).

## 2026-11-17 — TASK-INFRA1 — Real diagram render + AWS infrastructure (documentation)
- **Objective:** Start Docker, validate/render the real diagrams, design the AWS infrastructure (deployment, HA/DR, costs), and update memory.
- **Commands executed (real):**
  - `open -a Docker` → daemon operational.
  - `docker run --rm -v "$PWD":/work -w /work structurizr/structurizr validate -w workspace.dsl` → **detected** `reconciliationWorker=` missing a space; after fixing → **EXIT=0**.
  - `docker run --rm -v "$PWD":/work -w /work plantuml/plantuml -tsvg|-tpng -o /work/rendered <puml>` → render of C4, 7 sequences, and deployment.
  - `node docs/architecture/validate.mjs` → **PASS**.
  - Finding: `structurizr/cli:latest` is **deprecated/empty** (its entrypoint only prints a banner, no CLI). Use `structurizr/structurizr`.
- **Files created:**
  - `docs/architecture/deployment/bp-aws-deployment.puml` + `docs/architecture/deployment/README.md`
  - `docs/architecture/HA-DR-OBSERVABILITY.md`
  - `docs/architecture/COSTS.md`
  - `docs/architecture/rendered/*.svg` (15) and `*.png` (C1,C2,C3-Transfer,C3-CoreIntegration,deployment)
- **Files modified:**
  - `docs/architecture/workspace.dsl` (syntax fix: space before `=` in `reconciliationWorker`)
  - `docs/architecture/validate.mjs` (new rule: missing space before `=`)
  - `docs/architecture/sequences/seq-04,05` (`storage`→`participant`), `seq-06` (`par/and`→`group`)
  - `docs/architecture/DECISIONS.md` (ADR-0023 Core connectivity, ADR-0024 DR, ADR-0025 PlantUML deployment)
  - `docs/architecture/README.md`, `CLAUDE.md` (state, locations, validations)
- **Validations executed and result:**
  - DSL `structurizr/structurizr validate` → **PASS** (after fixing 1 real error).
  - `node validate.mjs` → **PASS** (0 errors, 1 known warning).
  - C4 render (4) → **PASS**; sequences (7) → **PASS** (after fixing 3 real errors); deployment → **PASS**.
  - Visual PNG inspection (C2, C3-Transfer, deployment) → **PASS** (no orphans/duplicates/illegible labels).
- **Issues found and fixed:** 1 DSL syntax error; 3 sequence errors (`storage`, `par`); deprecated `structurizr/cli` image (replaced with `structurizr/structurizr`).
- **Open issues:**
  - **P-Core-01 / ADR-0022:** Core status lookup (UNKNOWN reconciliation).
  - **ADR-0024 (DR):** Proposed strategy; requires business RTO/RPO and a game day.
  - **CI/CD and IaC:** designed at the documentation level; **not implemented** (IaC code pending).
  - Region `us-east-1` is an assumption (P-12 residency/latency).
- **Next step:** Deliverable — **local Docker Compose + NestJS backend** (PoC of the 9 priority flows).

## 2026-11-17 — TASK-POC1 — Functional local PoC (NestJS + Docker monorepo)
- **Objective:** Implement the first functional PoC version (PHASES 1–11) with real, executable, tested code.
- **Commands executed (real):**
  - `corepack prepare pnpm@9.12.0 --activate`; `corepack pnpm install`.
  - `corepack pnpm --filter @bp/domain test` → **17 PASS**; `--filter @bp/api exec jest` → **11 PASS**.
  - `corepack pnpm --filter @bp/api typecheck` → **OK** (0 errors).
  - `docker compose config` → OK (6 images); `pnpm env:up` → infra **healthy**.
  - `pnpm migrate` (6 tables) + `pnpm seed` → OK.
  - API on host (ts-node, DEV_AUTH_BYPASS) + HTTP tests with curl → **12/12 checks PASS**.
  - DB verification: transfers by state (CONFIRMED/REJECTED/UNKNOWN), `outbox_events`=SENT, `notifications` email/push SENT, `audit_log` with chained hash.
- **Files created (main):** `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `docker-compose.yml`; `packages/{contracts,domain,shared}`; `apps/api/**` (NestJS: identity/BFF, customer, accounts, movements, transfers, core-integration, notifications, audit, outbox/events, health); `infrastructure/{docker,mocks,keycloak,scripts}`; `README.md`, `docs/API.md`, `docs/TESTING.md`.
- **Decisions made:** ADR-0026 (ts-node + DEV_AUTH_BYPASS for the PoC), ADR-0027 (TypeORM DataSource + explicit SQL).
- **Validations and result:** Unit **28 PASS**; functional HTTP **12 PASS**; typecheck **PASS**; compose **PASS**; infra **healthy**.
- **Issues found and fixed:**
  - TS syntax error from `rootDir` + `paths` to other packages' src → split `tsconfig.json`/`tsconfig.build.json`.
  - RabbitMQ routing bug `bp.transfer.*` did not match `bp.transfer.confirmed.v1` → fixed to `bp.transfer.#` (verified: email+push notifications recorded).
- **Open issues (NOT RUN, documented in docs/TESTING.md):**
  - Interactive OIDC/Keycloak end-to-end flow (DEV_AUTH_BYPASS used for HTTP).
  - Automated e2e suite (supertest) not yet formalized under `apps/api/test/`.
  - Live notification DLQ (covered by unit test).
  - Web SPA (`apps/web`) and mobile app (`apps/mobile`) reserved.
- **Next step:** Minimal React SPA + interactive OIDC flow with Keycloak; supertest e2e; reconciliation as a job/endpoint.

## 2026-11-17 — TASK-EN1 — English migration + SPA + real auth + E2E + reconciliation
- **Objective:** Make English the permanent project language, translate existing artifacts, and implement the next deliverables (React SPA, real Keycloak auth, formal E2E, reconciliation execution).
- **Commands executed (real):**
  - `corepack pnpm --filter @bp/api typecheck` → **PASS** (after adding auth guard + reconciliation).
  - `corepack pnpm --filter @bp/domain test` → **17 PASS**; `--filter @bp/api exec jest` (unit) → **11 PASS**.
  - E2E: `jest --config test/jest-e2e.config.js --runInBand --forceExit` → **17/17 PASS** (functional, DEV_AUTH_BYPASS).
  - Real auth E2E (bypass OFF): `test/auth.e2e-spec.ts` → **4/4 PASS** (real Keycloak token + backend JWKS verification).
  - `corepack pnpm --filter @bp/web build` (tsc --noEmit + vite build) → **PASS** (44 modules).
  - `structurizr/structurizr validate` → **PASS**; `node validate.mjs` → **PASS**; re-render all diagrams (17 images) → **PASS** (no errors).
  - Added a TEST-ONLY `bp-test` Keycloak client (direct grant) + `docker compose up -d --force-recreate keycloak` → realm ready.
- **Files created:**
  - `apps/web/**` (React+TS+Vite SPA: SignIn, Dashboard, Accounts, AccountDetail, Transfers, Audit, auth context, API client, styles).
  - `apps/api/src/modules/transfers/application/reconciliation.service.ts`, `apps/api/src/modules/internal/{internal-token.guard.ts,reconciliation.controller.ts}`.
  - `apps/api/test/{jest-e2e.config.js,app.e2e-spec.ts,auth.e2e-spec.ts}`.
  - `memory/english-only-policy.md` (+ MEMORY.md index).
- **Files modified:**
  - Translated to English: `CLAUDE.md` (+ language policy section 0), `README.md`, `docs/{API.md,TESTING.md,WORKLOG.md}`, `docs/architecture/{README.md,DECISIONS.md,HA-DR-OBSERVABILITY.md,COSTS.md,workspace.dsl}`, `docs/architecture/deployment/README.md`, all `exports/*.puml`, all `sequences/*.puml`, `deployment/bp-aws-deployment.puml`, and all `apps/**` + `packages/**` source comments/messages/test names.
  - `apps/api/src/modules/identity/auth.guard.ts` (real session-cookie resolution from Redis + JWKS + CSRF; bypass isolated).
  - `apps/api/src/modules/identity/bff.controller.ts` (post-login redirect config), `src/config/configuration.ts` (internal token, post-login redirect), `src/main.ts` (CORS with credentials), `src/infra/database/schema.sql` (reconciliation_attempts), `src/app.module.ts` (reconciliation wiring), `infrastructure/keycloak/bp-realm.json` (bp-test client).
- **Decisions made:** ADR-0028 (English-only), ADR-0029 (reconciliation endpoint + advisory lock).
- **Validations and result:** unit **28 PASS**; functional E2E **17/17 PASS**; real-auth E2E **4/4 PASS**; web build **PASS**; DSL validate **PASS**; render **PASS**; source Spanish check → **clean**.
- **Issues found and fixed:**
  - E2E non-isolation: persistent DB + Redis across runs flipped UNKNOWN→CONFIRMED (via reconciliation) and caused a false cache HIT → added TRUNCATE + `flushdb` in `beforeAll`.
  - Jest did not exit (open handles: Rabbit/interval) → `--runInBand --forceExit`.
- **Open issues (NOT RUN, documented):**
  - Interactive OIDC browser flow (Authorization Code + PKCE via the BFF) — backend token verification is validated; the browser click-through is **NOT RUN** (no browser automation here).
  - SPA live UI click-through — builds cleanly but the running UI is **NOT RUN**.
  - CI/CD and IaC still not implemented.
- **Next step:** Final professional PDF (English); GitHub repository preparation; optional CI workflow.

## 2026-11-17 — TASK-DELIVERY — Final submission (PDF, repository, CI)
- **Objective:** Produce the final architecture PDF, prepare the repository for public GitHub publication, add a CI workflow, and verify everything.
- **Commands executed (real):**
  - PDF: authored `docs/deliverables/report.html`; `docker run ghcr.io/weasyprint/weasyprint` → `BP-Banking-Solution-Architecture.pdf` (35 pages). Rasterized with Ghostscript (`minidocks/ghostscript`) and **visually inspected** cover, TOC, requirements tables, C2 landscape diagram, ADR table, and the 15-criteria page.
  - Re-ran checks: unit **28 PASS**, `pnpm -r typecheck` **PASS**, web build **PASS**, `node validate.mjs` **PASS**, `structurizr/structurizr validate` **PASS**.
  - `git init` (main) + clean commit (157 files, no node_modules, PDF + 24 rendered diagrams included). Secret scan: no `.env`, keys, certs, dumps, or real secrets (only clearly-fictional dev placeholders).
- **Files created:** `docs/deliverables/{report.html,BP-Banking-Solution-Architecture.pdf}`, `.github/workflows/ci.yml`.
- **Files modified:** `README.md` (PDF/diagram links, architecture overview, stack, known limitations), `CLAUDE.md`, `docs/TESTING.md`, `docs/architecture/DECISIONS.md` (ADR-0030); translated to English the items missed earlier: `docs/architecture/validate.mjs`, `infrastructure/docker/api.Dockerfile`, `.gitignore` note.
- **Validations and result:** unit **28 PASS**; typecheck/builds/validators **PASS**; PDF visual checks **PASS** (cover complete, TOC page numbers correct, diagrams legible, tables no overflow, English-only, 15 criteria present, C4 + supporting diagrams included).
- **PDF visual fixes applied:** cover meta overflow (flex→absolute positioning); landscape heading/figure split (capped figure height) — reduced 45→35 pages with each diagram beside its heading.
- **NOT RUN / pending:** GitHub publication (no remote and no `gh` in this environment) — prepared locally; steps documented. Interactive OIDC browser login and SPA live UI remain NOT RUN.
- **Next step:** Create the GitHub repository, add the remote, and push `main` (steps in the final report). Optional: IaC and mobile app.
