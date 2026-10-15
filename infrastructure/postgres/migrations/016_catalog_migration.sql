CREATE TABLE IF NOT EXISTS catalog_write_gate (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  state TEXT NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'GATED')),
  epoch BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO catalog_write_gate (id, state, epoch) VALUES (1, 'OPEN', 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE process_registry ADD COLUMN IF NOT EXISTS gate_epoch BIGINT NOT NULL DEFAULT 0;
ALTER TABLE process_registry ADD COLUMN IF NOT EXISTS gate_state TEXT NOT NULL DEFAULT 'OPEN';

CREATE TABLE IF NOT EXISTS migration_runs (
  run_id TEXT PRIMARY KEY,
  from_version INT NOT NULL,
  to_version INT NOT NULL,
  new_shard TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PREVIEWED',
  moved_buckets JSONB NOT NULL DEFAULT '[]',
  epoch BIGINT NOT NULL DEFAULT 0,
  current_step TEXT NOT NULL DEFAULT 'preview',
  error TEXT NOT NULL DEFAULT '',
  metrics JSONB NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
