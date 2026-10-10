ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_id UUID;

CREATE TABLE IF NOT EXISTS attendance (
  attendance_id TEXT PRIMARY KEY,
  employee_id UUID NOT NULL,
  bucket_id INT NOT NULL,
  workday DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PRESENT' CHECK (status IN ('PRESENT', 'LATE', 'HALF_DAY', 'ABSENT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, workday)
);
CREATE INDEX IF NOT EXISTS idx_attendance_bucket_day ON attendance (bucket_id, workday);

CREATE TABLE IF NOT EXISTS leave_balances (
  employee_id UUID NOT NULL,
  bucket_id INT NOT NULL,
  leave_type TEXT NOT NULL,
  year INT NOT NULL,
  total_days INT NOT NULL,
  used_days INT NOT NULL DEFAULT 0,
  PRIMARY KEY (employee_id, leave_type, year)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  request_id TEXT PRIMARY KEY,
  employee_id UUID NOT NULL,
  bucket_id INT NOT NULL,
  leave_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  workdays INT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING_MANAGER' CHECK (status IN ('PENDING_MANAGER', 'PENDING_HR', 'APPROVED', 'REJECTED', 'CANCELLED')),
  version INT NOT NULL DEFAULT 1,
  decided_by TEXT NOT NULL DEFAULT '',
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leave_emp_status ON leave_requests (employee_id, status);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id TEXT PRIMARY KEY,
  employee_id UUID NOT NULL,
  bucket_id INT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_emp ON notifications (employee_id, created_at DESC);
