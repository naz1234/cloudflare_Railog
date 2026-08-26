ALTER TABLE auth_challenges ADD COLUMN email_hash TEXT;

ALTER TABLE auth_sessions ADD COLUMN email_hash TEXT;
ALTER TABLE auth_sessions ADD COLUMN last_seen_at INTEGER;

-- Sessions and challenges created by the former shared-mailbox design do not
-- identify an individual member. Invalidate them during the cutover so they
-- cannot be mistaken for a named staff session.
UPDATE auth_challenges
SET used_at = COALESCE(used_at, unixepoch())
WHERE email_hash IS NULL;

UPDATE auth_sessions
SET revoked_at = COALESCE(revoked_at, unixepoch())
WHERE email_hash IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_presence
  ON auth_sessions(last_seen_at DESC, expires_at, revoked_at);
