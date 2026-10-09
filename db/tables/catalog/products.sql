-- Table: products
-- Product/service catalog. `type` holds any key from field_options (products.type).
CREATE TABLE IF NOT EXISTS products (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT          NOT NULL,
  sku           TEXT,
  type          TEXT          NOT NULL,
  description   TEXT,
  hsn_sac       TEXT,
  default_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (default_price >= 0),
  gst_rate      NUMERIC(5,2)  NOT NULL DEFAULT 18 CHECK (gst_rate >= 0 AND gst_rate <= 100),  -- 0 = tax exempt
  is_active     BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_lower_key ON products (lower(sku)) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_type_idx ON products (type);
