-- Company settings, invoices, payments and payment allocations.
-- Money is NUMERIC. Payment status is never stored: it is derived from payment_allocations.
-- Issued documents are made immutable by triggers (defence in depth on top of the service layer).

CREATE TABLE IF NOT EXISTS company_settings (
  id                   SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- single row
  legal_name           TEXT         NOT NULL DEFAULT '',
  trade_name           TEXT,
  address              TEXT         NOT NULL DEFAULT '',
  city                 TEXT,
  state_code           TEXT,        -- drives intra-state (CGST+SGST) vs inter-state (IGST)
  postal_code          TEXT,
  gstin                TEXT,
  pan                  TEXT,
  email                TEXT,
  phone                TEXT,
  website              TEXT,
  bank_account_name    TEXT,
  bank_name            TEXT,
  bank_account_number  TEXT,
  bank_ifsc            TEXT,
  bank_branch          TEXT,
  upi_id               TEXT,
  invoice_prefix       TEXT         NOT NULL DEFAULT 'DE',
  receipt_prefix       TEXT         NOT NULL DEFAULT 'RCT',
  default_due_days     INTEGER      NOT NULL DEFAULT 15 CHECK (default_due_days >= 0),
  default_payment_terms TEXT,
  default_invoice_notes TEXT,
  signatory_name       TEXT,
  round_off_total      BOOLEAN      NOT NULL DEFAULT true,  -- round grand total to the nearest rupee
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);
INSERT INTO company_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS invoices (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number           TEXT          UNIQUE,  -- allocated at issue, never for drafts
  status                   TEXT          NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','cancelled')),
  invoice_type             TEXT          NOT NULL CHECK (invoice_type IN
                             ('project','software_sale','subscription_renewal','implementation','service','milestone','other')),
  client_id                UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  sale_id                  UUID          REFERENCES sales(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS invoice_items (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID          NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS payments (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT         NOT NULL UNIQUE,
  client_id     UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  payment_date  DATE          NOT NULL,
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency      TEXT          NOT NULL DEFAULT 'INR',
  method        TEXT          NOT NULL CHECK (method IN ('bank_transfer','upi','cash','cheque','other')),
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

CREATE TABLE IF NOT EXISTS payment_allocations (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id     UUID          NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  invoice_id     UUID          NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_by     UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  reversed_at    TIMESTAMPTZ,  -- reallocation = reverse this row and add a new one; nothing is deleted
  reversed_by    UUID          REFERENCES users(id) ON DELETE SET NULL,
  reverse_reason TEXT
);
CREATE INDEX IF NOT EXISTS allocations_payment_idx ON payment_allocations (payment_id) WHERE reversed_at IS NULL;
CREATE INDEX IF NOT EXISTS allocations_invoice_idx ON payment_allocations (invoice_id) WHERE reversed_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION guard_invoice_update() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'Invoice % is cancelled and cannot be changed', OLD.invoice_number USING ERRCODE = 'check_violation';
  END IF;
  -- Issued: only the transition to cancelled (with its audit fields) is allowed.
  IF NEW.status NOT IN ('issued','cancelled') THEN
    RAISE EXCEPTION 'An issued invoice cannot go back to %', NEW.status USING ERRCODE = 'check_violation';
  END IF;
  IF ROW(NEW.invoice_number, NEW.invoice_type, NEW.client_id, NEW.sale_id, NEW.issue_date, NEW.due_date, NEW.currency,
         NEW.place_of_supply_state_code, NEW.supply_type, NEW.subtotal, NEW.cgst_total, NEW.sgst_total, NEW.igst_total,
         NEW.tax_total, NEW.round_off, NEW.total, NEW.payment_terms, NEW.notes, NEW.client_snapshot, NEW.company_snapshot,
         NEW.issued_at, NEW.issued_by)
     IS DISTINCT FROM
     ROW(OLD.invoice_number, OLD.invoice_type, OLD.client_id, OLD.sale_id, OLD.issue_date, OLD.due_date, OLD.currency,
         OLD.place_of_supply_state_code, OLD.supply_type, OLD.subtotal, OLD.cgst_total, OLD.sgst_total, OLD.igst_total,
         OLD.tax_total, OLD.round_off, OLD.total, OLD.payment_terms, OLD.notes, OLD.client_snapshot, OLD.company_snapshot,
         OLD.issued_at, OLD.issued_by) THEN
    RAISE EXCEPTION 'Issued invoice % is immutable', OLD.invoice_number USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_guard_update ON invoices;
CREATE TRIGGER invoices_guard_update BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION guard_invoice_update();

CREATE OR REPLACE FUNCTION guard_invoice_delete() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Issued invoices cannot be deleted; cancel them instead' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS invoices_guard_delete ON invoices;
CREATE TRIGGER invoices_guard_delete BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION guard_invoice_delete();

CREATE OR REPLACE FUNCTION guard_invoice_items() RETURNS trigger AS $$
DECLARE parent_status TEXT;
BEGIN
  SELECT status INTO parent_status FROM invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  -- parent_status is NULL while the parent is being cascade-deleted (only possible for drafts).
  IF parent_status IS NOT NULL AND parent_status <> 'draft' THEN
    RAISE EXCEPTION 'Items of an issued invoice cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS invoice_items_guard ON invoice_items;
CREATE TRIGGER invoice_items_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_items FOR EACH ROW EXECUTE FUNCTION guard_invoice_items();

CREATE OR REPLACE FUNCTION guard_payment_update() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW.receipt_number, NEW.client_id, NEW.payment_date, NEW.amount, NEW.currency, NEW.method, NEW.reference, NEW.recorded_by)
     IS DISTINCT FROM
     ROW(OLD.receipt_number, OLD.client_id, OLD.payment_date, OLD.amount, OLD.currency, OLD.method, OLD.reference, OLD.recorded_by) THEN
    RAISE EXCEPTION 'A recorded payment cannot be edited; void it and record a new one' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.voided_at IS NOT NULL AND NEW.voided_at IS DISTINCT FROM OLD.voided_at THEN
    RAISE EXCEPTION 'A voided payment cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS payments_guard_update ON payments;
CREATE TRIGGER payments_guard_update BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION guard_payment_update();

CREATE OR REPLACE FUNCTION guard_payment_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Payments are never deleted; void them instead' USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS payments_guard_delete ON payments;
CREATE TRIGGER payments_guard_delete BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION guard_payment_delete();

-- Backstop for over-allocation: locks both rows, so concurrent allocations are serialised even if
-- some code path forgets to lock. The service layer performs the same checks to give friendly errors.
CREATE OR REPLACE FUNCTION check_allocation() RETURNS trigger AS $$
DECLARE p payments%ROWTYPE; i invoices%ROWTYPE; paid_from_payment NUMERIC; paid_to_invoice NUMERIC;
BEGIN
  SELECT * INTO p FROM payments WHERE id = NEW.payment_id FOR UPDATE;
  SELECT * INTO i FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF p.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Cannot allocate a voided payment' USING ERRCODE = 'check_violation'; END IF;
  IF i.status <> 'issued' THEN RAISE EXCEPTION 'Payments can only be allocated to issued invoices' USING ERRCODE = 'check_violation'; END IF;
  IF p.client_id <> i.client_id THEN RAISE EXCEPTION 'Payment and invoice belong to different clients' USING ERRCODE = 'check_violation'; END IF;
  SELECT COALESCE(sum(amount), 0) INTO paid_from_payment FROM payment_allocations WHERE payment_id = NEW.payment_id AND reversed_at IS NULL;
  SELECT COALESCE(sum(amount), 0) INTO paid_to_invoice FROM payment_allocations WHERE invoice_id = NEW.invoice_id AND reversed_at IS NULL;
  IF paid_from_payment + NEW.amount > p.amount THEN RAISE EXCEPTION 'Allocation exceeds the unallocated amount of the payment' USING ERRCODE = 'check_violation'; END IF;
  IF paid_to_invoice + NEW.amount > i.total THEN RAISE EXCEPTION 'Allocation exceeds the balance of the invoice' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS allocations_check ON payment_allocations;
CREATE TRIGGER allocations_check BEFORE INSERT ON payment_allocations FOR EACH ROW EXECUTE FUNCTION check_allocation();

CREATE OR REPLACE FUNCTION guard_allocation_update() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW.payment_id, NEW.invoice_id, NEW.amount, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM ROW(OLD.payment_id, OLD.invoice_id, OLD.amount, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'Allocations cannot be edited; reverse and re-allocate' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'A reversed allocation cannot be changed' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS allocations_guard_update ON payment_allocations;
CREATE TRIGGER allocations_guard_update BEFORE UPDATE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION guard_allocation_update();

CREATE OR REPLACE FUNCTION guard_allocation_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Allocations are never deleted; reverse them instead' USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS allocations_guard_delete ON payment_allocations;
CREATE TRIGGER allocations_guard_delete BEFORE DELETE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION guard_allocation_delete();
