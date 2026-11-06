-- Each invoice version now records the invoice number it printed (an invoice can be renumbered when it is regenerated
-- into a new month). Nothing has been renumbered yet, so every existing version printed the invoice's current number.
-- Run `npm run db:sync` first (it adds invoice_versions.invoice_number and the updated guard triggers), then `npm run db:migrate`.
ALTER TABLE invoice_versions DISABLE TRIGGER invoice_versions_guard;
UPDATE invoice_versions v SET invoice_number = i.invoice_number FROM invoices i WHERE i.id = v.invoice_id AND v.invoice_number IS NULL;
ALTER TABLE invoice_versions ENABLE TRIGGER invoice_versions_guard;
