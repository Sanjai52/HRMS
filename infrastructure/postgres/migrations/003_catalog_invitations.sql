CREATE TABLE IF NOT EXISTS invitations (
  invitation_id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  email_norm TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'EMPLOYEE' CHECK (role IN ('EMPLOYEE', 'MANAGER', 'HR', 'ADMIN')),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED', 'RESERVED', 'CREATED', 'ACTIVE', 'EXPIRED')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invitations_email_active
  ON invitations (email_norm) WHERE status IN ('INVITED', 'RESERVED', 'CREATED', 'ACTIVE');
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations (status);
