# BP Digital Banking — API (PoC)

Local base URL: `http://localhost:3001`. All error responses use the envelope
`{ code, message, correlationId }`. An `x-correlation-id` header is propagated on every response.

Authentication: `Authorization: Bearer <jwt>` (mobile) or the BFF session cookie (web).
With `DEV_AUTH_BYPASS=true`: `x-debug-user` header (and `x-debug-stepup: true` for sensitive operations).

## Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health/live` | Liveness |
| GET | `/health` | Readiness: checks postgres, redis, rabbit |

## Customer
| GET | `/v1/customers/me` | Profile: accounts (Core) + detail (complementary system) |

## Accounts
| GET | `/v1/accounts` | Customer accounts/products (Core) |

## Movements
| GET | `/v1/accounts/:id/movements?cursor&limit` | Movements (cache-aside). Includes `_cache: HIT\|MISS`. 403 if the account is not the user's. |

## Transfers
| POST | `/v1/transfers` | Creates an order. **Requires** the `Idempotency-Key` header and step-up. |
| GET | `/v1/transfers/:id` | Order status |

`POST /v1/transfers` body:
```json
{
  "sourceAccountId": "acc-001",
  "destinationAccountId": "acc-999",
  "amount": { "amountMinor": 1500, "currency": "USD" },
  "kind": "INTERBANK",
  "description": "optional"
}
```
Response (`TransferResponse`): `transferId, state, sourceAccountId, destinationAccountId, amount, kind, coreReference, createdAt, updatedAt`.

States: `PENDING → SUBMITTED → (CONFIRMED | REJECTED | UNKNOWN)`; `UNKNOWN` is resolved by reconciliation.

Relevant codes:
- `400` Idempotency-Key missing, `401 step_up_required`, `403 ACCOUNT_FORBIDDEN` (source account),
  `409 IDEMPOTENCY_KEY_CONFLICT` (same key, different payload), `422 INVALID_TRANSFER`.

### Core scenarios (WireMock)
- `destinationAccountId = acc-reject` → the Core returns 422 → state **REJECTED**.
- `destinationAccountId = acc-timeout` → the Core delays 6s (> timeout) → state **UNKNOWN**.
- any other destination → **CONFIRMED** with a `coreReference`.

## Audit
| GET | `/v1/audit?limit` | Append-only audit log (hash-chained) |

## Internal operations
| POST | `/internal/reconcile?limit` | Reconciles UNKNOWN transfers. Protected by the `X-Internal-Token` header (shared token, isolated from user auth). Acquires a Postgres advisory lock so concurrent runs cannot reconcile the same operations; queries the Core status by reference, never re-executes the transfer, records attempts, emits events, and writes audit records. |

## BFF OIDC (web)
| GET | `/auth/login` | Starts OIDC Authorization Code + PKCE |
| GET | `/auth/callback` | Exchanges code→tokens, creates the server-side session + HttpOnly cookie + CSRF |
| GET | `/auth/session` | `{ authenticated, csrf? }` |
| POST | `/auth/logout` | Ends the session |

## Emitted events (`bp.<domain>.<fact>.vN`)
`bp.transfer.requested/confirmed/failed/unknown.v1` → via Transactional Outbox → RabbitMQ
(`bp.events`, topic exchange). Consumers: `bp.notifications` (email+push, DLQ `bp.notifications.dlq`) and
`bp.audit` (audit of all events).
