-- Table: sales
-- What was sold to a client. `type` holds any key from field_options (sales.type).
CREATE TABLE IF NOT EXISTS sales (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number      TEXT          NOT NULL UNIQUE,
  client_id        UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  type             TEXT          NOT NULL,
  title            TEXT          NOT NULL,
  status           TEXT          NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','completed','cancelled')),
  owner_id         UUID          REFERENCES users(id) ON DELETE SET NULL,
  sale_date        DATE          NOT NULL DEFAULT CURRENT_DATE,
  expected_close   DATE,
  currency         TEXT          NOT NULL DEFAULT 'INR',
  subtotal         NUMERIC(14,2) NOT NULL DEFAULT 0,  -- taxable value after discounts
  tax_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
  total            NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  created_by       UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_client_idx ON sales (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_status_idx ON sales (status);
