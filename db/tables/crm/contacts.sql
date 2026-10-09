-- Table: contacts
CREATE TABLE IF NOT EXISTS contacts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID        NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  name        TEXT        NOT NULL,
  designation TEXT,
  email       TEXT,
  phone       TEXT,
  notes       TEXT,
  is_primary  BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contacts_client_idx ON contacts (client_id);
-- At most one primary contact per client.
CREATE UNIQUE INDEX IF NOT EXISTS contacts_one_primary_key ON contacts (client_id) WHERE is_primary;
