-- Table: demo_requests
-- "Book a demo" submissions from the FactoOne landing page, received through POST /api/intake/demo-requests
-- (authenticated by DEMO_INTAKE_KEY, not by a staff session). Staff work them from the Demo requests page.
CREATE TABLE IF NOT EXISTS demo_requests (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  company           TEXT        NOT NULL,
  mobile            TEXT        NOT NULL,   -- 10 digits, normalised on the way in
  email             TEXT        NOT NULL,   -- lower-cased
  source            TEXT        NOT NULL DEFAULT 'landing',  -- which site / form sent it
  entry_point       TEXT,       -- which button led to the form (navbar, hero, ...)
  external_ref      TEXT,       -- id the form generated for this attempt; a retry with the same value is not a new request
  status            TEXT        NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','scheduled','done','spam')),
  owner_id          UUID        REFERENCES users(id) ON DELETE SET NULL,
  notes             TEXT,
  client_id         UUID        REFERENCES clients(id) ON DELETE SET NULL,  -- set when the request is converted to a client
  repeat_count      INTEGER     NOT NULL DEFAULT 0 CHECK (repeat_count >= 0),  -- same person submitting again within 24 hours
  last_submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contacted_at      TIMESTAMPTZ,
  ip_hash           TEXT,       -- salted hash of the visitor's address; never the address itself
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS demo_requests_external_ref_key ON demo_requests (external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS demo_requests_status_idx ON demo_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS demo_requests_email_lower_idx ON demo_requests (lower(email));
CREATE INDEX IF NOT EXISTS demo_requests_mobile_idx ON demo_requests (mobile);
CREATE INDEX IF NOT EXISTS demo_requests_owner_idx ON demo_requests (owner_id);
