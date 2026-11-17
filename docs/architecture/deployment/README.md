# BP Digital Banking — AWS deployment infrastructure

Editable source: [`bp-aws-deployment.puml`](./bp-aws-deployment.puml) (PlantUML C4 Deployment, renderable offline).
Images: [`../rendered/bp-aws-deployment.svg`](../rendered/bp-aws-deployment.svg) and `.png` (rendered and visually verified on 2026-11-17).

> The logical C4 model (single source) lives in [`../workspace.dsl`](../workspace.dsl). This deployment diagram is a
> complementary **infrastructure view** (a separate concern), maintained in PlantUML and versioned.

## 1. Infrastructure description
- **Edge:** Route 53 (DNS + health checks) → CloudFront + AWS WAF (CDN, TLS, OWASP, rate limit, bot/geo). The SPA (`bp-web-spa`) is served statically from S3 via CloudFront.
- **API entry:** Amazon API Gateway (HTTP API) with a JWT authorizer → ALB → ECS tasks.
- **Compute:** ECS Fargate (no node management) running the `bp-*` services as tasks, replicated across 2 AZs.
- **Data:** Aurora PostgreSQL (writer + reader/standby, Multi-AZ), ElastiCache Redis (primary + replica).
- **Messaging:** EventBridge (routing) + SQS (work) + **DLQ**.
- **Security/platform:** Secrets Manager + KMS, CloudWatch + X-Ray (OTel), S3 (encrypted onboarding evidence + `bp-audit-archive` with **S3 Object Lock / WORM**).
- **Core Banking:** **outside AWS** (on-prem or another DC), reached over **VPN IPsec or Direct Connect**.

## 2. Network segmentation
| Zone | Content | Access |
|------|---------|--------|
| Internet (public) | Route 53, CloudFront + WAF | Client entry (HTTPS) |
| VPC `10.0.0.0/16` | All BP compute and data | Private |
| Public subnets (`10.0.0.0/24`, `10.0.1.0/24`) | ALB + NAT Gateway (per AZ) | Ingress from API Gateway; egress via NAT |
| Private subnets (`10.0.10.0/24`, `10.0.11.0/24`) | ECS Fargate, Aurora, ElastiCache | No public IP; only east-west and NAT egress |
| To the Core | VPN Gateway / Direct Connect | Encrypted hybrid link (mTLS over the tunnel) |

Least-privilege Security Groups; east-west traffic is **mTLS**. Managed services accessed via private endpoints where applicable.

## 3. Traffic flow
1. Client → Route 53 → CloudFront (+WAF) → (static SPA from S3) and/or API Gateway.
2. API Gateway validates the JWT (IdP JWKS) → ALB → the destination service's ECS task.
3. The service validates the token/scopes/source-account authorization → runs the use case.
4. Read: cache-aside in Redis; miss → `bp-core-integration` (ACL) → **VPN/Direct Connect** → Core.
5. Financial command: ACID persistence in Aurora (order+idempotency+Outbox) → ACL → Core.
6. Events: OutboxPublisher → EventBridge/SQS → consumers (notification, audit); failures → DLQ.
7. Notifications exit via NAT → external email/push providers.

## 4. Multi-AZ distribution
- ECS Fargate: tasks spread across **AZ-A and AZ-B** (minimum 2 AZs) with Auto Scaling.
- ALB: nodes in both AZs (cross-zone load balancing).
- Aurora: writer in one AZ + reader/standby in another, **automatic failover**.
- ElastiCache: primary + replica in a different AZ with failover.
- NAT Gateway per AZ (no single egress point).

## 5. Persistence
| Data | Service | Note |
|------|---------|------|
| Orders, idempotency (UNIQUE), Outbox, ACL correlation, operational audit | Aurora PostgreSQL | ACID operational store (not the financial truth) |
| Cache (profile/products/movements) + BFF session | ElastiCache Redis | TTL + event-based invalidation |
| Onboarding evidence | S3 + KMS | Encrypted references/score only |
| Audit archive | S3 Object Lock (WORM) | Immutable protected retention |
| Official balances/movements/transactions | **Core Banking (external)** | Source of truth |

## 6. Failure recovery (summary; detail in `../HA-DR-OBSERVABILITY.md`)
ECS task failure, AZ failure, Aurora failover, Redis outage, Core unavailable, UNKNOWN transfer, notification-provider
failure, and regional outage → see the dedicated document.

## 7. Monitoring
CloudWatch (metrics/structured logs), X-Ray/OTel (distributed traces with `correlationId`), alarms on p95 latency,
error rate, SQS/DLQ depth, ECS CPU/memory, Aurora connections, ACL circuit. Per-domain and operational dashboards.
Detail in `../HA-DR-OBSERVABILITY.md`.

## 8. Security
TLS in transit, KMS at rest, Secrets Manager (rotation), WAF at the edge, east-west mTLS, least-privilege SGs,
API Gateway with a JWT authorizer, BFF with HttpOnly/Secure/SameSite cookies + CSRF, WORM audit. The Core is reached
only over an encrypted hybrid link; its credentials live in Secrets Manager.

## 9. Assumptions (explicit)
- **Region:** `us-east-1` (assumption; to confirm by latency/data residency — see P-12).
- **Core outside AWS**: connectivity over VPN IPsec (baseline) or **Direct Connect** if stable, predictable bandwidth/latency is required. The choice depends on volume and the link SLA (to confirm with Core infrastructure — P-Core).
- Multi-AZ in a single region; **multi-region DR** is described as a strategy, not deployed in the PoC.
- No regulatory compliance is claimed (jurisdiction pending, P-01).
