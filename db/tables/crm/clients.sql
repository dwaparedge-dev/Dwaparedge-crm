-- Table: clients
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
  state_code       TEXT,       -- 2-digit GST state code, drives CGST/SGST vs IGST
  postal_code      TEXT,
  country          TEXT        NOT NULL DEFAULT 'India',
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
