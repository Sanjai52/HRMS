CREATE TABLE IF NOT EXISTS outbox_events (
  event_id TEXT PRIMARY KEY,
  employee_id UUID NOT NULL,
  bucket_id INT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('EMPLOYEE_CREATED', 'EMPLOYEE_UPDATED', 'EMPLOYEE_DEACTIVATED', 'LEAVE_DECIDED', 'AUDIT')),
  payload JSONB NOT NULL DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_undelivered ON outbox_events (created_at) WHERE delivered_at IS NULL;
