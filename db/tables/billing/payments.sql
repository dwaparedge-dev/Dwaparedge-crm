-- Table: payments
-- Optional sale_id = "this payment is for that sale"; whatever is not yet allocated counts as the sale's advance.
-- `method` holds any key from field_options (payments.method).
CREATE TABLE IF NOT EXISTS payments (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT         NOT NULL UNIQUE,
  client_id     UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  sale_id       UUID          REFERENCES sales(id) ON DELETE RESTRICT,
  payment_date  DATE          NOT NULL,
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency      TEXT          NOT NULL DEFAULT 'INR',
  method        TEXT          NOT NULL,
  reference     TEXT,
  notes         TEXT,
  voided_at     TIMESTAMPTZ,
  voided_by     UUID          REFERENCES users(id) ON DELETE SET NULL,
  void_reason   TEXT,
  recorded_by   UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT payments_void_reason CHECK (voided_at IS NULL OR void_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS payments_client_idx ON payments (client_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS payments_sale_idx ON payments (sale_id) WHERE sale_id IS NOT NULL;
