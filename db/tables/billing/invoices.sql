-- Table: invoices
-- Money is NUMERIC. Payment status is never stored: it is derived from payment_allocations.
-- Issued invoices are made immutable by triggers (see logic/billing_guards.sql).
CREATE TABLE IF NOT EXISTS invoices (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number           TEXT          UNIQUE,  -- allocated at issue, never for drafts
  status                   TEXT          NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','cancelled')),
  client_id                UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  sale_id                  UUID          NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  issue_date               DATE          NOT NULL,
  due_date                 DATE          NOT NULL,
  currency                 TEXT          NOT NULL DEFAULT 'INR',
  place_of_supply_state_code TEXT,
  supply_type              TEXT          CHECK (supply_type IN ('intra','inter')),
  subtotal                 NUMERIC(14,2) NOT NULL DEFAULT 0,  -- taxable value after discounts
  cgst_total               NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_total               NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst_total               NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total                NUMERIC(14,2) NOT NULL DEFAULT 0,
  round_off                NUMERIC(14,2) NOT NULL DEFAULT 0,
  total                    NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_terms            TEXT,
  notes                    TEXT,
  client_snapshot          JSONB,        -- client name/address/GSTIN as they were at issue
  company_snapshot         JSONB,        -- our own details and bank details as they were at issue
  issued_at                TIMESTAMPTZ,
  issued_by                UUID          REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at             TIMESTAMPTZ,
  cancelled_by             UUID          REFERENCES users(id) ON DELETE SET NULL,
  cancel_reason            TEXT,
  created_by               UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT invoices_number_when_issued CHECK (status = 'draft' OR invoice_number IS NOT NULL),
  CONSTRAINT invoices_due_after_issue CHECK (due_date >= issue_date),
  CONSTRAINT invoices_total_nonneg CHECK (total >= 0)
);
CREATE INDEX IF NOT EXISTS invoices_client_idx ON invoices (client_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS invoices_status_due_idx ON invoices (status, due_date);
CREATE INDEX IF NOT EXISTS invoices_sale_idx ON invoices (sale_id);
