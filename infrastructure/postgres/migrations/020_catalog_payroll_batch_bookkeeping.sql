-- Per-shard bookkeeping for async payroll batches (Task 20 fix).
-- The chunk handler writes one row per (batch, shard) and the batch totals are
-- recomputed from these rows, so a retried chunk (worker kill, BullMQ stall
-- redelivery) rewrites its own row instead of double-counting the batch.
CREATE TABLE IF NOT EXISTS payroll_batch_shards (
  batch_id TEXT NOT NULL,
  shard TEXT NOT NULL,
  total INT NOT NULL DEFAULT 0,
  done INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, shard)
);
