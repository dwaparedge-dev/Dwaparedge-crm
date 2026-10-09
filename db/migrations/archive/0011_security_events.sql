-- A log of sign-in and account-security events (who, what, from where), kept for review.
CREATE TABLE IF NOT EXISTS security_events (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  email_hint TEXT,                       -- what was typed on a failed sign-in (never a password)
  event      TEXT        NOT NULL,       -- login_ok, login_failed, login_locked, password_changed, password_change_failed, logout
  ip         TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_user_idx ON security_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_created_idx ON security_events (created_at DESC);
