CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shard_write_gate (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  state TEXT NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'GATED')),
  epoch BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO shard_write_gate (id, state, epoch) VALUES (1, 'OPEN', 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS employees (
  employee_id UUID PRIMARY KEY,
  bucket_id INT NOT NULL CHECK (bucket_id >= 0 AND bucket_id < 256),
  display_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  designation TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employees_bucket ON employees (bucket_id);
