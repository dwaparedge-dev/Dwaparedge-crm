-- Staff login accounts. All authenticated users have full access (no roles in v1).
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,  -- bcrypt hash, never plaintext
  token_version INTEGER     NOT NULL DEFAULT 0,  -- bump to revoke all sessions
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));

-- Failed-login tracking for rate limiting / lockout (keyed by hashed email or IP).
CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGSERIAL   PRIMARY KEY,
  key_hash   TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_key_created_idx ON login_attempts (key_hash, created_at DESC);
