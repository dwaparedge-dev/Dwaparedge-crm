-- Two-step verification was tried and removed. Databases that already applied the earlier 0011 still carry these columns.
ALTER TABLE users
  DROP COLUMN IF EXISTS totp_secret_enc,
  DROP COLUMN IF EXISTS totp_enabled_at,
  DROP COLUMN IF EXISTS totp_last_step,
  DROP COLUMN IF EXISTS recovery_code_hashes;
