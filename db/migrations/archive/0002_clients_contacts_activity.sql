-- Clients, their contacts, and a shared activity (audit) log.

CREATE TABLE IF NOT EXISTS clients (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name       TEXT        NOT NULL,
  display_name     TEXT        NOT NULL,
  gstin            TEXT,
  pan              TEXT,
  email            TEXT,
  phone            TEXT,
  billing_address  TEXT,
  shipping_address TEXT,
  city             TEXT,
  state_code       TEXT,       -- 2-digit GST state code, drives CGST/SGST vs IGST later
  state            TEXT,
  postal_code      TEXT,
  country          TEXT        NOT NULL DEFAULT 'India',
  status           TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  owner_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  notes            TEXT,
  archived_at      TIMESTAMPTZ,  -- archive instead of delete: history stays intact
  created_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clients_gstin_format CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  CONSTRAINT clients_pan_format CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$')
);

-- A GSTIN identifies exactly one client, even archived ones (prevents re-creating a duplicate).
CREATE UNIQUE INDEX IF NOT EXISTS clients_gstin_key ON clients (gstin) WHERE gstin IS NOT NULL;
CREATE INDEX IF NOT EXISTS clients_legal_name_lower_idx ON clients (lower(legal_name));
CREATE INDEX IF NOT EXISTS clients_email_lower_idx ON clients (lower(email));
CREATE INDEX IF NOT EXISTS clients_owner_idx ON clients (owner_id);
CREATE INDEX IF NOT EXISTS clients_status_archived_idx ON clients (status, archived_at);

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

CREATE TABLE IF NOT EXISTS activity_log (
  id          BIGSERIAL   PRIMARY KEY,
  entity_type TEXT        NOT NULL,
  entity_id   UUID        NOT NULL,
  client_id   UUID        REFERENCES clients(id) ON DELETE RESTRICT,  -- for the client activity tab
  action      TEXT        NOT NULL,
  summary     TEXT        NOT NULL,
  actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_client_idx ON activity_log (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_entity_idx ON activity_log (entity_type, entity_id);
