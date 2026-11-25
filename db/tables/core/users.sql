-- Table: users
-- Staff login accounts. No roles: every signed-in user sees the same pages, and the task desk's extra abilities
-- are individual permission keys in `permissions` (see src/lib/auth/permissions.ts).
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,  -- bcrypt hash, never plaintext
  token_version INTEGER     NOT NULL DEFAULT 0,  -- bump to revoke all sessions
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  permissions   TEXT[]      NOT NULL DEFAULT '{}',  -- permission keys held by this account; none by default
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));
