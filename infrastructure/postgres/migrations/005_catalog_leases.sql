ALTER TABLE worker_id_leases ADD COLUMN IF NOT EXISTS owner_kind TEXT NOT NULL DEFAULT 'snowflake';
