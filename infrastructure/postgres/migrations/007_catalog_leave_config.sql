CREATE TABLE IF NOT EXISTS holidays (
  holiday_date DATE PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leave_policies (
  leave_type TEXT PRIMARY KEY,
  annual_allowance INT NOT NULL,
  counts_weekends BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO leave_policies (leave_type, annual_allowance, counts_weekends) VALUES
  ('CASUAL', 12, FALSE),
  ('SICK', 12, FALSE),
  ('EARNED', 24, FALSE)
ON CONFLICT (leave_type) DO NOTHING;

INSERT INTO holidays (holiday_date, name) VALUES
  ('2026-01-26', 'Republic Day'),
  ('2026-08-15', 'Independence Day'),
  ('2026-10-02', 'Gandhi Jayanti'),
  ('2026-12-25', 'Christmas Day')
ON CONFLICT (holiday_date) DO NOTHING;
