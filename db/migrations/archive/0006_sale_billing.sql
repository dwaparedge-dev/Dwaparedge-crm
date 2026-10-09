-- The sale becomes the hub: every invoice line bills a sale item, payments can be tagged to a sale,
-- and a billing plan (milestones) can be attached. All sale-level money figures are derived by views.

-- Invoices belong to a sale. The database held only demo data when this was introduced.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_sale_id_fkey;
ALTER TABLE invoices ALTER COLUMN sale_id SET NOT NULL;
ALTER TABLE invoices ADD CONSTRAINT invoices_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE RESTRICT;

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS sale_item_id UUID;
ALTER TABLE invoice_items ALTER COLUMN sale_item_id SET NOT NULL;
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_sale_item_id_fkey;
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_sale_item_id_fkey FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS invoice_items_sale_item_idx ON invoice_items (sale_item_id);

-- Optional "this payment is for that sale". Whatever is not yet allocated counts as the sale's advance.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS payments_sale_idx ON payments (sale_id) WHERE sale_id IS NOT NULL;

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

-- Derived figures (never stored, so they cannot drift from the invoices and allocations).
CREATE OR REPLACE VIEW sale_item_billing AS
SELECT si.id AS sale_item_id, si.sale_id, si.taxable_amount, si.tax_rate,
       COALESCE(sum(ii.taxable_amount) FILTER (WHERE i.status = 'issued'), 0) AS issued_taxable,
       COALESCE(sum(ii.taxable_amount) FILTER (WHERE i.status = 'draft'), 0)  AS draft_taxable
  FROM sale_items si
  LEFT JOIN invoice_items ii ON ii.sale_item_id = si.id
  LEFT JOIN invoices i ON i.id = ii.invoice_id
 GROUP BY si.id;

CREATE OR REPLACE VIEW sale_billing AS
SELECT s.id AS sale_id,
       s.subtotal AS taxable_total,
       COALESCE(b.issued_taxable, 0) AS issued_taxable,
       COALESCE(b.draft_taxable, 0)  AS draft_taxable,
       s.subtotal - COALESCE(b.issued_taxable, 0) - COALESCE(b.draft_taxable, 0) AS to_bill_taxable,  -- still free to put on a new invoice
       COALESCE(b.unbilled_estimate, 0) AS unbilled_estimate,  -- incl. GST at the sale's rates, drafts count as unbilled
       COALESCE(inv.billed_total, 0) AS billed_total,           -- issued invoices, incl. GST
       COALESCE(inv.paid, 0) AS paid_on_invoices,
       COALESCE(adv.advance, 0) AS advance                      -- received for this sale, not yet allocated
  FROM sales s
  LEFT JOIN (SELECT sale_id, sum(issued_taxable) AS issued_taxable, sum(draft_taxable) AS draft_taxable,
                    sum(round((taxable_amount - issued_taxable) * (1 + tax_rate / 100), 2)) AS unbilled_estimate
               FROM sale_item_billing GROUP BY sale_id) b ON b.sale_id = s.id
  LEFT JOIN (SELECT i.sale_id, sum(i.total) AS billed_total,
                    sum(COALESCE((SELECT sum(a.amount) FROM payment_allocations a WHERE a.invoice_id = i.id AND a.reversed_at IS NULL), 0)) AS paid
               FROM invoices i WHERE i.status = 'issued' GROUP BY i.sale_id) inv ON inv.sale_id = s.id
  LEFT JOIN (SELECT p.sale_id,
                    sum(p.amount - COALESCE((SELECT sum(a.amount) FROM payment_allocations a WHERE a.payment_id = p.id AND a.reversed_at IS NULL), 0)) AS advance
               FROM payments p WHERE p.voided_at IS NULL AND p.sale_id IS NOT NULL GROUP BY p.sale_id) adv ON adv.sale_id = s.id;
