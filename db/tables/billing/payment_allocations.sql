-- Table: payment_allocations
-- Reallocation = reverse a row and add a new one; nothing is ever deleted.
CREATE TABLE IF NOT EXISTS payment_allocations (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id     UUID          NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  invoice_id     UUID          NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_by     UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  reversed_at    TIMESTAMPTZ,
  reversed_by    UUID          REFERENCES users(id) ON DELETE SET NULL,
  reverse_reason TEXT
);
CREATE INDEX IF NOT EXISTS allocations_payment_idx ON payment_allocations (payment_id) WHERE reversed_at IS NULL;
CREATE INDEX IF NOT EXISTS allocations_invoice_idx ON payment_allocations (invoice_id) WHERE reversed_at IS NULL;
