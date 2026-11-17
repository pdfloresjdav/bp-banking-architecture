# BP Digital Banking — High Availability, DR, and Observability

> **Proposed** objectives, to be validated with the business and with the **real Core capabilities** (these are not verified guarantees).

## 1. Service objectives (proposed, not guaranteed)
| Metric | Proposed objective | Note |
|--------|--------------------|------|
| Availability (platform plane) | ~99.9% monthly | The Core imposes its own limit; end-to-end cannot exceed the Core's |
| RTO (primary region) | ≤ 1–4 h | Depends on DR automation |
| RPO | ≤ 5–15 min | Aurora PITR/replication; official data lives in the Core |
| Read latency p95 (cached) | < 300–500 ms | Reads via Redis |
| Financial command latency p95 | Dominated by the Core | BP adds minimal overhead; the Core defines the bulk |

**Differentiation:** these are **design objectives**. Real guarantees require load tests, Core and IdP SLAs, and
failover validation. They are not claimed as met.

## 2. Failure scenarios and expected behavior

### 2.1 An ECS task fails
- ECS/ALB marks the task unhealthy (health check) and **stops routing traffic** to it; the **ECS service launches a replacement task** (auto-healing) in a healthy AZ.
- Idempotency + Outbox ensure an in-flight operation is neither duplicated nor loses its event.
- **Impact:** transparent client retries; no data loss.

### 2.2 An Availability Zone fails
- The ALB stops sending to the affected AZ; Auto Scaling concentrates tasks in the healthy AZ.
- Aurora: if the writer was in the failed AZ → **automatic failover** to the standby in the other AZ. Redis: replica promotion.
- **Impact:** brief degradation during failover; service continues at reduced capacity until it scales back out.

### 2.3 Aurora failover
- The reader/standby is promoted to writer; the write endpoint points to the new writer.
- Connections are recycled: services must **retry with backoff** interrupted transactions (idempotency prevents duplicates).
- **Half-committed transactions:** PostgreSQL is ACID → either committed or not; the order stays consistent. If the Core command was already sent, the state becomes **UNKNOWN** and reconciliation resolves it.

### 2.4 Redis becomes unavailable
- The cache is **cache-aside, not the source of truth** → services **fall back to the Core via the ACL** (more latency, not an error).
- BFF session in Redis: if it goes down, the replica is promoted; without a session, the user re-authenticates (OIDC).
- **Impact:** higher latency and load on the Core; **never incorrect data**. The circuit breaker avoids saturating the Core.

### 2.5 The Core Banking system does not respond
- `bp-core-integration` applies **timeout + circuit breaker + bulkhead**; the circuit opens after N failures.
- Reads: respond **503 degraded** (or cache flagged as possibly stale), without fabricating data.
- Commands: not sent blindly; if already sent with no response → **UNKNOWN** + reconciliation.
- **Impact:** degraded query functionality; financial integrity preserved.

### 2.6 Transfer with an UNKNOWN result
- The order persists in **UNKNOWN** state (not assumed settled; `HTTP 200 ≠ settled`).
- The client receives **202 "pending verification"**.
- The **ReconciliationService/worker** queries `getOperationStatus` (ADR-0022) and resolves to CONFIRMED/REJECTED; if unresolved, it keeps UNKNOWN and **raises an operational alert**.
- The command is **never** retried without prior idempotency/status lookup.

### 2.7 A notification provider fails
- Notification is a **decoupled informational channel** (event consumer), **outside the transactional path**.
- Email/push failure → retry with backoff; if exhausted → **DLQ** + audited `bp.notification.failed.v1` event.
- **Impact:** the financial operation is **not** affected; the notification is retried or parked in the DLQ for reprocessing.

### 2.8 Regional outage
- **Multi-region DR (proposed strategy, not deployed in the PoC):**
  - Baseline **Backup & Restore / Pilot Light**: Aurora backups (snapshots + PITR) and artifacts replicated to a secondary region; IaC recreates the environment.
  - Cross-region Aurora replica promotion (if Global Database is enabled) and DNS repoint via Route 53 (failover routing).
- **Impact:** RTO/RPO per the chosen strategy (Pilot Light < Backup & Restore). Requires a game day to validate.

## 3. Observability

### 3.1 Key metrics
- **ECS:** CPU/memory, task count, replacement rate, saturation.
- **API Gateway/ALB:** p50/p95/p99 latency, 4xx/5xx, throttling.
- **Aurora:** connections, query latency, replica lag, failovers.
- **Redis:** hit ratio, evictions, latency, memory.
- **Messaging:** SQS queue depth, oldest-message age, **DLQ messages**.
- **ACL/Core:** Core latency, error rate, **circuit-breaker state**, number of UNKNOWN orders.
- **Business:** transfers by state, rejection rate, time-to-reconcile.

### 3.2 Alarms (examples)
| Alarm | Proposed threshold | Action |
|-------|--------------------|--------|
| API p95 > objective for 5 min | > 500 ms | Investigate/scale |
| 5xx > 1% for 5 min | > 1% | Page on-call |
| DLQ > 0 | any message | Review reprocessing |
| Unresolved UNKNOWN orders | > N for 15 min | Review Core/reconciliation |
| Core circuit breaker open | OPEN state | Degraded mode + notice |
| Aurora replica lag | > X s | Review load/scale |
| Redis hit ratio | < threshold | Review TTL/keys |

### 3.3 Dashboards
- **Operational (SRE):** ECS/ALB/Aurora/Redis/SQS health, latencies, errors, DLQ.
- **Core integration:** Core latency/errors, circuit, UNKNOWN and reconciliation.
- **Business:** transfer/payment volumes and states, notifications, onboarding.
- **Security:** failed auth attempts, step-up, `bp.security.suspicious.v1` events.

### 3.4 Traces and logs
- **Distributed tracing** (X-Ray/OTel) with `correlationId` propagated end-to-end.
- **Structured JSON logs** with `correlationId`, `idempotencyKey`, no unnecessary PII.

### 3.5 Operational procedures (runbooks, schematic)
- **DLQ with messages:** inspect the cause → fix → idempotent reprocessing from the DLQ.
- **UNKNOWN orders:** force reconciliation → if the Core does not resolve, escalate to Core operations.
- **Open circuit breaker:** confirm Core state, activate communications, wait for half-open.
- **Aurora failover:** verify the new writer, recycle connections, review UNKNOWN transactions.
- **DR game day:** periodic restore/cross-region promotion drill with real RTO/RPO measurement.
