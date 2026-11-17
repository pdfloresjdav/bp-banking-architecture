-- BP Digital Banking PoC - operational schema (PostgreSQL). Idempotency, Outbox, append-only audit.
-- Official financial data does NOT live here (it lives in the Core / WireMock).

CREATE TABLE IF NOT EXISTS transfers (
  transfer_id            TEXT PRIMARY KEY,
  source_account_id      TEXT NOT NULL,
  destination_account_id TEXT NOT NULL,
  amount_minor           BIGINT NOT NULL CHECK (amount_minor > 0),
  currency               TEXT NOT NULL,
  kind                   TEXT NOT NULL,
  state                  TEXT NOT NULL,
  core_reference         TEXT,
  created_at             TIMESTAMPTZ NOT NULL,
  updated_at             TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transfers_state ON transfers (state);

-- Idempotency: UNIQUE on the key (constraint that prevents double processing).
CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  fingerprint     TEXT NOT NULL,
  transfer_id     TEXT NOT NULL REFERENCES transfers(transfer_id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transactional Outbox.
CREATE TABLE IF NOT EXISTS outbox_events (
  id              BIGSERIAL PRIMARY KEY,
  event_id        TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  payload         JSONB NOT NULL,
  correlation_id  TEXT NOT NULL,
  idempotency_key TEXT,
  status          TEXT NOT NULL DEFAULT 'PENDING',
  attempts        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox_events (status, id);

-- Append-only audit with hash chaining (integrity).
CREATE TABLE IF NOT EXISTS audit_log (
  seq            BIGSERIAL PRIMARY KEY,
  action         TEXT NOT NULL,
  result         TEXT NOT NULL,
  user_id        TEXT,
  correlation_id TEXT NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash      TEXT,
  hash           TEXT NOT NULL
);

-- Consumer-side idempotency for events.
CREATE TABLE IF NOT EXISTS processed_events (
  event_id     TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notification delivery log (no unnecessary PII).
CREATE TABLE IF NOT EXISTS notifications (
  id         BIGSERIAL PRIMARY KEY,
  event_id   TEXT NOT NULL,
  channel    TEXT NOT NULL,
  status     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reconciliation attempts (operational trace of UNKNOWN resolution).
CREATE TABLE IF NOT EXISTS reconciliation_attempts (
  id              BIGSERIAL PRIMARY KEY,
  transfer_id     TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  outcome         TEXT NOT NULL,
  correlation_id  TEXT NOT NULL,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_transfer ON reconciliation_attempts (transfer_id);
