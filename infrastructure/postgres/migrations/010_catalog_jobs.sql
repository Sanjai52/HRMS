ALTER TABLE routing_map_versions ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT 'employee';

CREATE TABLE IF NOT EXISTS jobs (
  job_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  experience TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  employment_type TEXT NOT NULL DEFAULT 'FULL_TIME',
  salary_range TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closing_date DATE
);

CREATE TABLE IF NOT EXISTS short_urls (
  code TEXT PRIMARY KEY,
  destination TEXT NOT NULL,
  clicks INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS candidate_email_claims (
  email_norm TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS application_index (
  application_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  job_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_status_tokens (
  token_hash TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE
);
