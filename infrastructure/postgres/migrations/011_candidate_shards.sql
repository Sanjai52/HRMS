CREATE TABLE IF NOT EXISTS candidates (
  candidate_id TEXT PRIMARY KEY,
  candidate_bucket_id INT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  skills TEXT[] NOT NULL DEFAULT '{}',
  experience_years INT NOT NULL DEFAULT 0,
  resume_key TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'direct',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_candidates_bucket ON candidates (candidate_bucket_id);

CREATE TABLE IF NOT EXISTS applications (
  application_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  candidate_bucket_id INT NOT NULL,
  job_id TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'APPLIED' CHECK (stage IN ('APPLIED', 'SCREENING', 'SHORTLISTED', 'ASSESSMENT', 'INTERVIEW', 'SELECTED', 'REJECTED', 'WITHDRAWN')),
  version INT NOT NULL DEFAULT 1,
  converted_invitation_id TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_applications_job ON applications (job_id, stage);

CREATE TABLE IF NOT EXISTS application_stage_history (
  history_id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  candidate_bucket_id INT NOT NULL,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  changed_by TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interviews (
  interview_id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  candidate_bucket_id INT NOT NULL,
  round TEXT NOT NULL,
  interviewer TEXT NOT NULL DEFAULT '',
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  feedback TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS assessments (
  assessment_id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  candidate_bucket_id INT NOT NULL,
  type TEXT NOT NULL,
  score TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED')),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS candidate_outbox (
  event_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  candidate_bucket_id INT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('AUDIT')),
  payload JSONB NOT NULL DEFAULT '{}',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_candidate_outbox_undelivered ON candidate_outbox (created_at) WHERE delivered_at IS NULL;
