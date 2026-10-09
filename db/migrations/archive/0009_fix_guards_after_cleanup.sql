-- 0008 dropped invoices.invoice_type, but the issued-invoice guard still compared it. Redefine the guard
-- without it. Also keep licenses undeletable now that license_events (which used to reference them) is gone.

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

CREATE OR REPLACE FUNCTION guard_license_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Licenses cannot be deleted; revoke them instead' USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS licenses_guard_delete ON licenses;
CREATE TRIGGER licenses_guard_delete BEFORE DELETE ON licenses FOR EACH ROW EXECUTE FUNCTION guard_license_delete();
