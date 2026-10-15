-- Client bank details. `npm run db:sync` adds the clients.bank_* columns and the client_documents table;
-- this adds the IFSC format check to the clients table that already exists (sync cannot add constraints).
-- Run `npm run db:sync` first, then `npm run db:migrate`.
UPDATE clients SET bank_ifsc = upper(btrim(bank_ifsc)) WHERE bank_ifsc IS NOT NULL;
UPDATE clients SET bank_ifsc = NULL WHERE bank_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$';
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_ifsc_format;
ALTER TABLE clients ADD CONSTRAINT clients_ifsc_format CHECK (bank_ifsc IS NULL OR bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$');
