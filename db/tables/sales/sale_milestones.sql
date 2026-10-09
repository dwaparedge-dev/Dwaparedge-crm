-- Table: sale_milestones
-- Billing plan: instalments of a sale, by percentage of the order or a fixed amount (both before GST).
CREATE TABLE IF NOT EXISTS sale_milestones (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    UUID          NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  position   INTEGER       NOT NULL,
  title      TEXT          NOT NULL,
  basis      TEXT          NOT NULL CHECK (basis IN ('percent','amount')),
  percent    NUMERIC(5,2)  CHECK (percent > 0 AND percent <= 100),
  amount     NUMERIC(14,2) CHECK (amount > 0),
  due_date   DATE,
  invoice_id UUID          REFERENCES invoices(id) ON DELETE SET NULL,  -- deleting a draft returns the milestone to "planned"
  created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT milestone_basis_fields CHECK ((basis = 'percent' AND percent IS NOT NULL AND amount IS NULL) OR (basis = 'amount' AND amount IS NOT NULL AND percent IS NULL)),
  UNIQUE (sale_id, position)
);
CREATE UNIQUE INDEX IF NOT EXISTS sale_milestones_invoice_key ON sale_milestones (invoice_id) WHERE invoice_id IS NOT NULL;
