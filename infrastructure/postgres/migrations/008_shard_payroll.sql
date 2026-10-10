CREATE TABLE IF NOT EXISTS salary_structures (
  employee_id UUID PRIMARY KEY,
  bucket_id INT NOT NULL,
  basic_paise INT NOT NULL CHECK (basic_paise >= 0),
  allowances_paise INT NOT NULL DEFAULT 0 CHECK (allowances_paise >= 0),
  other_deductions_paise INT NOT NULL DEFAULT 0 CHECK (other_deductions_paise >= 0),
  pf_pct NUMERIC NOT NULL DEFAULT 0 CHECK (pf_pct >= 0 AND pf_pct <= 100),
  tax_pct NUMERIC NOT NULL DEFAULT 0 CHECK (tax_pct >= 0 AND tax_pct <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_records (
  record_id TEXT PRIMARY KEY,
  employee_id UUID NOT NULL,
  bucket_id INT NOT NULL,
  period CHAR(7) NOT NULL CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),
  gross_paise INT NOT NULL,
  lop_paise INT NOT NULL,
  pf_paise INT NOT NULL,
  tax_paise INT NOT NULL,
  other_paise INT NOT NULL,
  net_paise INT NOT NULL,
  scheduled_days INT NOT NULL,
  paid_days INT NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period)
);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll_records (period);
