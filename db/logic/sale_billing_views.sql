-- Derived sale billing figures (never stored, so they cannot drift). NUMERIC(14,2) so amounts always read "0.00".
DROP VIEW IF EXISTS sale_billing;
DROP VIEW IF EXISTS sale_item_billing;

CREATE VIEW sale_item_billing AS
SELECT si.id AS sale_item_id, si.sale_id, si.taxable_amount, si.tax_rate,
       COALESCE(sum(ii.taxable_amount) FILTER (WHERE i.status = 'issued'), 0)::numeric(14,2) AS issued_taxable,
       COALESCE(sum(ii.taxable_amount) FILTER (WHERE i.status = 'draft'), 0)::numeric(14,2)  AS draft_taxable
  FROM sale_items si
  LEFT JOIN invoice_items ii ON ii.sale_item_id = si.id
  LEFT JOIN invoices i ON i.id = ii.invoice_id
 GROUP BY si.id;

CREATE VIEW sale_billing AS
SELECT s.id AS sale_id,
       s.subtotal AS taxable_total,
       COALESCE(b.issued_taxable, 0)::numeric(14,2) AS issued_taxable,
       COALESCE(b.draft_taxable, 0)::numeric(14,2)  AS draft_taxable,
       (s.subtotal - COALESCE(b.issued_taxable, 0) - COALESCE(b.draft_taxable, 0))::numeric(14,2) AS to_bill_taxable,
       COALESCE(b.unbilled_estimate, 0)::numeric(14,2) AS unbilled_estimate,
       COALESCE(inv.billed_total, 0)::numeric(14,2) AS billed_total,
       COALESCE(inv.paid, 0)::numeric(14,2) AS paid_on_invoices,
       COALESCE(adv.advance, 0)::numeric(14,2) AS advance
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
