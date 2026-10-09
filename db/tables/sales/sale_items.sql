-- Table: sale_items
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
