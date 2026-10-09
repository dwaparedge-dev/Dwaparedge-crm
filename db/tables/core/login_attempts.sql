-- Table: login_attempts
-- Failed-login tracking for rate limiting / lockout (keyed by hashed email or IP).
CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGSERIAL   PRIMARY KEY,
  key_hash   TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_key_created_idx ON login_attempts (key_hash, created_at DESC);
