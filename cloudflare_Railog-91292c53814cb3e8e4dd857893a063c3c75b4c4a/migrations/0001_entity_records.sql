CREATE TABLE IF NOT EXISTS entity_records (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entity_records_entity ON entity_records(entity);
CREATE INDEX IF NOT EXISTS idx_entity_records_entity_updated ON entity_records(entity, updated_at);
