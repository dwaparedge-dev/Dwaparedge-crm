-- Table: invoice_items
-- Every line bills part of a sale item (sale_item_id); see logic/billing_guards.sql for the cap.
CREATE TABLE IF NOT EXISTS invoice_items (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID          NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sale_item_id     UUID          NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
  position         INTEGER       NOT NULL,
  product_id       UUID          REFERENCES products(id) ON DELETE RESTRICT,
  description      TEXT          NOT NULL,
  hsn_sac          TEXT,
  quantity         NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_price       NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  discount_percent NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  tax_rate         NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  taxable_amount   NUMERIC(14,2) NOT NULL,
  cgst_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount       NUMERIC(14,2) NOT NULL,
  line_total       NUMERIC(14,2) NOT NULL,
  UNIQUE (invoice_id, position)
);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_items_sale_item_idx ON invoice_items (sale_item_id);
