CREATE TABLE IF NOT EXISTS wsh2_uploads (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wsh2_washes (
  id TEXT PRIMARY KEY,
  train_number TEXT NOT NULL,
  next_wash TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  source_location TEXT NOT NULL DEFAULT '',
  last_wash TEXT NOT NULL DEFAULT '',
  source_upload_id TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
  hvac TEXT NOT NULL DEFAULT '' CHECK(hvac IN ('','ON','OFF')),
  wash_type TEXT NOT NULL DEFAULT '' CHECK(wash_type IN ('','Partial','Full')),
  depot TEXT NOT NULL DEFAULT '' CHECK(depot IN ('','west','east')),
  completed_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  UNIQUE(train_number, scheduled_date)
);
CREATE INDEX IF NOT EXISTS idx_wsh2_date ON wsh2_washes(scheduled_date, next_wash);
