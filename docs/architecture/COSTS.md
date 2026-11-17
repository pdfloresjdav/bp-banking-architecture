# BP Digital Banking — AWS cost estimate (indicative)

> **No current prices are included.** AWS rates vary by region and over time. This document provides
> **formulas, variables, and assumptions** to load into **AWS Pricing Calculator** (https://calculator.aws).
> Replace each `price_*` with the current rate for your region when estimating.

## Sizing assumptions (explicit, adjustable)
| Variable | Symbol | Initial assumed value |
|----------|--------|-----------------------|
| Region | — | us-east-1 (assumption) |
| Monthly active users | `MAU` | 50,000 |
| API requests / month | `REQ` | 15,000,000 |
| Transfers+payments / month | `TXN` | 500,000 |
| Average ECS tasks (vCPU/mem) | `N_task`, `vCPU`, `GB` | 12 tasks · 0.5 vCPU · 1 GB (avg.) |
| Hours/month | `H` | 730 |
| Internet egress data | `EGRESS_GB` | 500 GB |
| Log retention | `LOG_GB` | 100 GB/month |
| Business events / month | `EVT` | 3,000,000 |

> These values are **placeholders** for calculation; they must be confirmed with the business (P-06 from Stage 1).

## Cost categories and formulas

### 1. Compute (ECS Fargate)
```
cost_fargate = N_task * H * (vCPU * price_vCPU_hour + GB * price_GB_hour)
```
Variables: `price_vCPU_hour`, `price_GB_hour`. FinOps: **Fargate Spot** for tolerant workloads, **Compute Savings Plans** for the baseline.

### 2. Database (Aurora PostgreSQL)
```
cost_aurora = (writer+reader instances) * H * price_instance_hour
            + storage_GB * price_storage_GB_month
            + IO_millions * price_IO           (standard model)
            + backup_GB_extra * price_backup_GB_month
```
**Aurora Serverless v2** alternative: `ACU_hours * price_ACU_hour`. FinOps: Serverless v2 for variable load; Reserved/Savings for a stable baseline.

### 3. Cache (ElastiCache Redis)
```
cost_redis = (primary+replica nodes) * H * price_node_hour
```
FinOps: **Reserved Nodes** if the size is stable; size by the target hit ratio.

### 4. Networking and transfer
```
cost_networking = EGRESS_GB * price_egress_GB
                + NAT_GW_hours * price_nat_hour + NAT_GB_processed * price_nat_GB
                + (Direct_Connect_port_hour * H + DX_GB * price_dx_GB)   (if applicable)
```
FinOps: VPC endpoints (S3/Dynamo/etc.) to reduce NAT traffic; CloudFront reduces origin egress.

### 5. API Gateway
```
cost_apigw = (REQ/1,000,000) * price_million_requests   (HTTP API)
```
FinOps: HTTP API is cheaper than REST API; cache the cacheable at CloudFront.

### 6. Messaging (EventBridge + SQS)
```
cost_eventbridge = (EVT/1,000,000) * price_million_events
cost_sqs         = (REQ_sqs/1,000,000) * price_million_requests_sqs   (includes DLQ)
```
FinOps: message batching; rule filters to avoid unnecessary fan-out.

### 7. Logs and observability (CloudWatch + X-Ray)
```
cost_obs = LOG_GB * price_log_ingest_GB + LOG_GB_retained * price_log_storage_GB
         + custom_metrics * price_metric + traces_millions * price_million_traces
```
FinOps: trace sampling, tiered retention (→ S3/Glacier), avoid redundant custom metrics.

### 8. Security (WAF, Secrets Manager, KMS)
```
cost_security = WAF_ACL * price_acl_month + WAF_rules * price_rule_month + (REQ/1,000,000)*price_waf_million
              + secrets * price_secret_month + KMS_keys * price_key_month + KMS_requests/10,000 * price_10k
```
FinOps: consolidate secrets; reuse KMS keys with good segmentation.

### 9. Backups
```
cost_backups = snapshot_GB * price_snapshot_GB_month + PITR_GB * price_pitr_GB_month
```

### 10. DR (secondary region)
```
cost_dr = (per strategy)
  Backup & Restore: cross-region snapshot replication + storage
  Pilot Light:      + minimal infra kept warm (Aurora replica, config) in the secondary region
```
FinOps: Pilot Light costs more than Backup & Restore but improves RTO; choose per validated objectives.

## Total (model)
```
TOTAL_monthly = cost_fargate + cost_aurora + cost_redis + cost_networking
              + cost_apigw + cost_eventbridge + cost_sqs + cost_obs
              + cost_security + cost_backups + cost_dr
```

## FinOps recommendations (without sacrificing security/availability)
1. **Savings Plans / Reserved** for the stable baseline (Fargate, Aurora, Redis); Spot only for tolerant workloads.
2. **Aurora Serverless v2** if traffic is highly variable.
3. **VPC endpoints** and **CloudFront** to cut egress/NAT.
4. **Tiered log/trace retention** and sampling; do not give up the WORM audit (an integrity requirement).
5. **Tagging** by domain/environment + **AWS Budgets** and cost-anomaly alerts.
6. **Continuous right-sizing** with Compute Optimizer; review the Redis hit ratio and task sizing.
7. Always keep **Multi-AZ** (HA is not sacrificed for cost); multi-region DR per approved objectives.

> For a concrete figure: load these formulas and variables into AWS Pricing Calculator with the current rates
> for the chosen region and the volume confirmed by the business.
