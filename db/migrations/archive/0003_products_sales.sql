-- Product/service catalog, sales (what was sold to a client) and gap-free document numbering.

-- Atomic counters. Allocation is `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, which
-- row-locks, so concurrent transactions get distinct numbers and a rollback releases the number.
CREATE TABLE IF NOT EXISTS document_sequences (
  doc_type   TEXT        NOT NULL,
  scope      TEXT        NOT NULL DEFAULT '',  -- e.g. financial year '2026-27' for invoices
  last_value INTEGER     NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_type, scope)
);

CREATE TABLE IF NOT EXISTS products (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT          NOT NULL,
  sku           TEXT,
  type          TEXT          NOT NULL CHECK (type IN
                  ('software_license','software_subscription','implementation','custom_development','consulting','support_maintenance','other')),
  description   TEXT,
  hsn_sac       TEXT,
  default_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (default_price >= 0),
  currency      TEXT          NOT NULL DEFAULT 'INR',
  gst_rate      NUMERIC(5,2)  NOT NULL DEFAULT 18 CHECK (gst_rate >= 0 AND gst_rate <= 100),
  is_tax_exempt BOOLEAN       NOT NULL DEFAULT false,
  is_active     BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_lower_key ON products (lower(sku)) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_type_idx ON products (type);

CREATE TABLE IF NOT EXISTS sales (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number      TEXT          NOT NULL UNIQUE,
  client_id        UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  type             TEXT          NOT NULL CHECK (type IN ('project','license','service')),
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

-- Items copy name/price/tax from the product at the time of sale, so later catalog edits
-- never change a recorded sale. product_id is only a back-reference.
CREATE TABLE IF NOT EXISTS sale_items (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          UUID          NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  position         INTEGER       NOT NULL,
  product_id       UUID          REFERENCES products(id) ON DELETE RESTRICT,
  description      TEXT          NOT NULL,
  hsn_sac          TEXT,
  quantity         NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_price       NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  discount_percent NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  tax_rate         NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  taxable_amount   NUMERIC(14,2) NOT NULL,
  tax_amount       NUMERIC(14,2) NOT NULL,
  line_total       NUMERIC(14,2) NOT NULL,
  UNIQUE (sale_id, position)
);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items (sale_id);
