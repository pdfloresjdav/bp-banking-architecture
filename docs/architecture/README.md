# BP Digital Banking — C4 Diagrams

C4 architecture model of the **BP Digital Banking** platform. The **single editable source** is
[`workspace.dsl`](./workspace.dsl) (Structurizr DSL). The `.puml` files under [`exports/`](./exports/) are a
**renderable copy without Structurizr tooling** (PlantUML C4), kept consistent with the DSL.

> **Model source of truth:** `workspace.dsl`. If you edit a diagram, edit it there and regenerate the exports.
> Do not hand-edit the `.puml` files unless you are not using Structurizr.

## 1. Included diagrams

| Level | View (DSL) | PlantUML export | Description |
|-------|------------|-----------------|-------------|
| C1 | `C1-Contexto` | `exports/C1-Contexto.puml` | Context: actors (Customer, Operator) and external systems (IdP, Core, Complementary, Facial, Email, Push) around the BP Platform. |
| C2 | `C2-Contenedores` | `exports/C2-Contenedores.puml` | Containers: SPA, mobile, edge, gateway, BFF, identity, domain services, ACLs, notifications, audit, and stores (Postgres, Redis, bus, audit-archive). |
| C3 | `C3-Transfer` | `exports/C3-Transfer.puml` | Components of **bp-transfer-service** (idempotency, Outbox, states, reconciliation). |
| C3 | `C3-CoreIntegration` | `exports/C3-CoreIntegration.puml` | Components of **bp-core-integration** (ACL: translation, resilience, status lookup, correlation). |

### Sequence diagrams (`sequences/`)
| File | Flow | Alternative flows covered |
|------|------|---------------------------|
| `seq-01-auth-web-oidc-pkce-bff.puml` | Web login OIDC+PKCE with BFF | invalid state/code, failed MFA, refresh rotation |
| `seq-02-auth-mobile-oidc-pkce.puml` | Mobile login OIDC+PKCE | auth error, expired token, OS/passkey biometrics |
| `seq-03-transfer-idempotencia-outbox-conciliacion.puml` | Transfer | step-up, idempotency (UNIQUE), CONFIRMED/REJECTED/**UNKNOWN**, reconciliation |
| `seq-04-onboarding-facial.puml` | Facial onboarding 1:1 + liveness | rejection, provider unavailable (manual review) |
| `seq-05-auditoria.puml` | Append-only audit + WORM | bus duplicates, integrity check (broken chain) |
| `seq-06-notificaciones-email-push.puml` | Email + push notifications | per-channel failure, idempotency, DLQ |
| `seq-07-consulta-movimientos-cache-aside.puml` | Movement query | HIT/MISS, Core unavailable (degraded) |

> The sequence file names are kept as stable identifiers; their diagram titles and labels are in English.

## 2. How to render

### Option A — Structurizr (recommended, uses the DSL as source)
```bash
# Structurizr Lite (interactive, in the browser at http://localhost:8080)
docker run --rm -p 8080:8080 -v "$PWD":/usr/local/structurizr structurizr/lite

# Validate the DSL syntax (the classic structurizr/cli is deprecated/empty — use structurizr/structurizr)
docker run --rm -v "$PWD":/work -w /work structurizr/structurizr validate -w workspace.dsl
```

### Option B — PlantUML (uses the `.puml` files under `exports/`)
```bash
docker run --rm -v "$PWD":/work -w /work plantuml/plantuml -tsvg -o /work/rendered "exports/*.puml" "sequences/*.puml" "deployment/*.puml"
# or, with a local install: brew install plantuml graphviz && plantuml -tsvg exports/*.puml
```
The `.puml` files use PlantUML's bundled C4 library (`!include <C4/...>`) and render offline.

> **Status (2026-11-17):** images are **already rendered** under [`rendered/`](./rendered/) (SVG for all diagrams;
> PNG for the C4 diagrams and the deployment). Generated with `plantuml/plantuml` via Docker; the DSL is validated
> with `structurizr/structurizr validate`.

## 3. Important relationships and protocols

- **Clients → edge:** `bp-web-spa` and `bp-mobile-app` exit through `bp-edge (CloudFront+WAF)` over **HTTPS/TLS**.
- **Authentication:** `bp-mobile-app` and `bp-bff-web` run **OIDC Authorization Code + PKCE** against the IdP.
  The SPA handles **no** tokens: the BFF keeps them (session in Redis) and exposes an **HttpOnly/Secure/SameSite cookie + CSRF**.
- **North-south:** everything enters through `bp-api-gateway` (**JWT/JWKS** validation, rate limit, routing).
- **East-west:** domain services communicate over **REST on mTLS** in a private network.
- **Financial commands:** `bp-transfer-service`/`bp-payment-service` → `bp-core-integration` with a propagated **Idempotency-Key**.
- **Core:** the only point of contact is `bp-core-integration` (**HTTPS/mTLS**), never directly from the domains.
- **Events:** producers publish via the **Outbox** → `bp-event-bus` (**AMQP** locally / **EventBridge+SQS** on AWS);
  `bp-notification-service` and `bp-audit-service` are consumers.

## 4. Security between components

| Boundary | Control |
|----------|---------|
| Internet → edge | TLS, WAF (OWASP, rate limit, bot/geo) at CloudFront |
| Browser ↔ BFF | **HttpOnly, Secure, SameSite=strict** cookie + **CSRF** token (double-submit); no tokens in JS |
| Mobile ↔ Gateway | **Bearer JWT**, PKCE, device secure storage |
| Gateway → services | JWT (JWKS) validation at the edge + **each service revalidates the token, scopes, and source-account authorization** (interbank: destination ownership is not validated) |
| Service ↔ service | **mTLS** in a private VPC |
| Service → Core | mTLS + credentials in **Secrets Manager**, **circuit breaker** in the ACL |
| Data | Encryption at rest (**KMS**) and in transit (TLS); **append-only** audit with **hash chaining** |
| Sensitive operations | **MFA + step-up** enforced by transfer/payment (valid ACR claim) |
| Biometrics | Onboarding (1:1+liveness) stores **no templates**; subsequent biometrics = OS/passkeys (WebAuthn) |

## 5. Name consistency across levels

The `bp-*` identifiers, the `bp.<domain>.<fact>.vN` events, and the component names are identical in C1→C2→C3
and are reused in documentation, infrastructure, and code. Because they are derived from a single `workspace.dsl`,
consistency is guaranteed by construction.

## 6. Relevant architectural decisions (2 justifications each)

| Decision | Justification 1 | Justification 2 |
|----------|-----------------|-----------------|
| **Structurizr DSL** as source | One model generates C1/C2/C3 → name consistency by construction | Versionable (text) and exportable to PlantUML/Mermaid/images |
| **BFF for the SPA** | Tokens out of the browser → reduces XSS/refresh-theft surface | Allows secure cookies + web experience aggregation |
| **Single ACL to the Core** (`bp-core-integration`) | Isolates the Core model/legacy from the domains | Single point of resilience, idempotency, and status lookup |
| **Separate Transfer and Payment** | Distinct states and rules (anti-fraud/reconciliation) | Independent lifecycles and scaling |
| **Outbox + idempotency** | Event publication atomic with the state change (no dual-write) | Safe retries without financial double processing |
| **PostgreSQL ACID for idempotency/Outbox/operational audit** | One ACID transaction with a `UNIQUE(idempotency_key)` constraint → no dual-write or race | Simplifies the PoC (one engine); DynamoDB remains a **documented AWS alternative** (ADR-0019) |
| **Audit: operational vs. retention** | Append-only operational log with chained hash in Postgres (queryable) | Separate protected **WORM** retention archive (S3 Object Lock); not simulated locally |

## 7. Key assumptions (inherited)

- **S-A1:** Core Banking = source of truth for balances/movements/transactions.
- **S-A2:** Payment scope = bill payments (initial).
- **S-A3:** The Core supports idempotency propagation and/or **status lookup by reference**
  (`getOperationStatus`). *Pending confirmation (P-Core-01); the capability is not invented.*
- Edge/HA/DR are **not simulated** locally (documented in the AWS infrastructure diagram).

## Validation executed (2026-11-17, real)
| Validation | Tool | Result |
|------------|------|--------|
| Real DSL syntax | `structurizr/structurizr validate` (Docker) | **PASS** (caught and fixed `reconciliationWorker=` missing space earlier) |
| Model referential integrity | `node docs/architecture/validate.mjs` | **PASS** (0 errors, 1 known warning: `transfer` connects via its components) |
| C4 render (C1/C2/C3) | `plantuml/plantuml` → SVG+PNG | **PASS** (4 diagrams) |
| Sequence render (7) | `plantuml/plantuml` → SVG | **PASS** |
| AWS deployment render | `plantuml/plantuml` → SVG+PNG | **PASS** |
| Visual inspection | PNG reading (C2, C3-Transfer, deployment) | **PASS** (no orphans/duplicates/illegible labels) |

Images under [`rendered/`](./rendered/).

## Infrastructure documentation (AWS)
- [`deployment/bp-aws-deployment.puml`](./deployment/bp-aws-deployment.puml) + [`deployment/README.md`](./deployment/README.md) — Multi-AZ deployment diagram and description.
- [`HA-DR-OBSERVABILITY.md`](./HA-DR-OBSERVABILITY.md) — 8 failure scenarios, SLO/RTO/RPO/latency (proposed), metrics, alarms, dashboards, runbooks.
- [`COSTS.md`](./COSTS.md) — cost categories, formulas, and variables for AWS Pricing Calculator (no invented prices) + FinOps.
