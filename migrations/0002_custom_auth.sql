CREATE TABLE IF NOT EXISTS auth_challenges (
  challenge_id TEXT PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  used_at INTEGER,
  CHECK (attempt_count >= 0),
  CHECK (max_attempts > 0)
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_created
  ON auth_challenges(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires
  ON auth_challenges(expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
  ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  action TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (action, key_hash, window_start),
  CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_expires
  ON auth_rate_limits(expires_at);
