-- Table: licenses
-- Software license register. Administrative registry only (no enforcement inside the products).
-- `status` holds the administrative state; "expired" is derived from expiry_date at read time
-- (an active license past its expiry), so it can never go stale. History lives in activity_log.
CREATE TABLE IF NOT EXISTS licenses (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  license_identifier TEXT          NOT NULL UNIQUE,  -- public registry id, e.g. DE-7K3M-X9QP-4TWB. Not a secret.
  client_id          UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  product_id         UUID          NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sale_id            UUID          REFERENCES sales(id) ON DELETE SET NULL,
  plan               TEXT          NOT NULL,
  start_date         DATE          NOT NULL,
  expiry_date        DATE          NOT NULL,
  seat_limit         INTEGER       CHECK (seat_limit IS NULL OR seat_limit > 0),
  renewal_price      NUMERIC(14,2) CHECK (renewal_price IS NULL OR renewal_price >= 0),
  renewal_terms      TEXT,
  status             TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','revoked')),
  notes              TEXT,
  activated_at       TIMESTAMPTZ,
  created_by         UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT licenses_dates_check CHECK (expiry_date > start_date)
);
CREATE INDEX IF NOT EXISTS licenses_client_idx ON licenses (client_id);
CREATE INDEX IF NOT EXISTS licenses_product_idx ON licenses (product_id);
CREATE INDEX IF NOT EXISTS licenses_expiry_idx ON licenses (expiry_date) WHERE status = 'active';
