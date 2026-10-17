ALTER TABLE notifications ADD COLUMN IF NOT EXISTS source_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_source
  ON notifications (employee_id, source_ref)
  WHERE source_ref IS NOT NULL;
