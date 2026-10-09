-- Integrity triggers for billing: issued documents are immutable, payments and allocations are never deleted,
-- nothing is over-allocated. Defence in depth on top of the service layer. Safe to re-run.

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
  IF ROW(NEW.invoice_number, NEW.client_id, NEW.sale_id, NEW.issue_date, NEW.due_date, NEW.currency,
         NEW.place_of_supply_state_code, NEW.supply_type, NEW.subtotal, NEW.cgst_total, NEW.sgst_total, NEW.igst_total,
         NEW.tax_total, NEW.round_off, NEW.total, NEW.payment_terms, NEW.notes, NEW.client_snapshot, NEW.company_snapshot,
         NEW.issued_at, NEW.issued_by)
     IS DISTINCT FROM
     ROW(OLD.invoice_number, OLD.client_id, OLD.sale_id, OLD.issue_date, OLD.due_date, OLD.currency,
         OLD.place_of_supply_state_code, OLD.supply_type, OLD.subtotal, OLD.cgst_total, OLD.sgst_total, OLD.igst_total,
         OLD.tax_total, OLD.round_off, OLD.total, OLD.payment_terms, OLD.notes, OLD.client_snapshot, OLD.company_snapshot,
         OLD.issued_at, OLD.issued_by) THEN
    RAISE EXCEPTION 'Issued invoice % is immutable', OLD.invoice_number USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_guard_update ON invoices;
CREATE TRIGGER invoices_guard_update BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION guard_invoice_update();

CREATE OR REPLACE FUNCTION guard_payment_update() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW.receipt_number, NEW.client_id, NEW.sale_id, NEW.payment_date, NEW.amount, NEW.currency, NEW.method, NEW.reference, NEW.recorded_by)
     IS DISTINCT FROM
     ROW(OLD.receipt_number, OLD.client_id, OLD.sale_id, OLD.payment_date, OLD.amount, OLD.currency, OLD.method, OLD.reference, OLD.recorded_by) THEN
    RAISE EXCEPTION 'A recorded payment cannot be edited; void it and record a new one' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.voided_at IS NOT NULL AND NEW.voided_at IS DISTINCT FROM OLD.voided_at THEN
    RAISE EXCEPTION 'A voided payment cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_guard_update ON payments;
CREATE TRIGGER payments_guard_update BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION guard_payment_update();


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

-- Never bill more of a sale item than it is worth. Locks the item, so concurrent invoices serialise.
CREATE OR REPLACE FUNCTION check_sale_item_billing() RETURNS trigger AS $$
DECLARE cap NUMERIC; item_sale UUID; inv_sale UUID; used NUMERIC;
BEGIN
  SELECT taxable_amount, sale_id INTO cap, item_sale FROM sale_items WHERE id = NEW.sale_item_id FOR UPDATE;
  SELECT sale_id INTO inv_sale FROM invoices WHERE id = NEW.invoice_id;
  IF item_sale IS DISTINCT FROM inv_sale THEN
    RAISE EXCEPTION 'An invoice line must bill an item of the invoice''s own sale' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(sum(ii.taxable_amount), 0) INTO used
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
   WHERE ii.sale_item_id = NEW.sale_item_id AND i.status IN ('draft','issued') AND ii.id <> NEW.id;
  IF used + NEW.taxable_amount > cap THEN
    RAISE EXCEPTION 'Billing more than the sale item allows (already billed %, this line %, item total %)', used, NEW.taxable_amount, cap USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS invoice_items_billing_check ON invoice_items;
CREATE TRIGGER invoice_items_billing_check BEFORE INSERT OR UPDATE ON invoice_items FOR EACH ROW EXECUTE FUNCTION check_sale_item_billing();

-- A sale item that has been invoiced cannot disappear or shrink below what was billed.
CREATE OR REPLACE FUNCTION guard_sale_item_change() RETURNS trigger AS $$
DECLARE used NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM invoice_items WHERE sale_item_id = OLD.id) THEN
      RAISE EXCEPTION 'This sale item has invoice history and cannot be removed' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  SELECT COALESCE(sum(ii.taxable_amount), 0) INTO used
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
   WHERE ii.sale_item_id = NEW.id AND i.status IN ('draft','issued');
  IF NEW.taxable_amount < used THEN
    RAISE EXCEPTION 'A sale item cannot be reduced below the amount already invoiced (%)', used USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sale_items_guard ON sale_items;
CREATE TRIGGER sale_items_guard BEFORE UPDATE OR DELETE ON sale_items FOR EACH ROW EXECUTE FUNCTION guard_sale_item_change();

