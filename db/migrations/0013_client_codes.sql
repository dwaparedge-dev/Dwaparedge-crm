-- Client codes (AA01, AA02 ... AA99, AB01 ...) for the document numbers SL-AA01-01, QT-1026-AA01-01, INV-1026-AA01-01.
-- Existing clients get their code in the order they were created; the counter in document_sequences carries on from there.
-- Run `npm run db:sync` first (it adds clients.code), then `npm run db:migrate`.
WITH base AS (
  SELECT COALESCE((SELECT last_value FROM document_sequences WHERE doc_type = 'client_code' AND scope = ''), 0) AS b
), numbered AS (
  SELECT c.id, (SELECT b FROM base) + row_number() OVER (ORDER BY c.created_at, c.id) AS n
  FROM clients c WHERE c.code IS NULL
)
UPDATE clients c
SET code = chr(65 + (((x.n - 1) / 99) / 26)::int) || chr(65 + (((x.n - 1) / 99) % 26)::int) || lpad((((x.n - 1) % 99) + 1)::text, 2, '0')
FROM numbered x WHERE c.id = x.id;

INSERT INTO document_sequences (doc_type, scope, last_value)
SELECT 'client_code', '', count(*) FROM clients WHERE code IS NOT NULL
ON CONFLICT (doc_type, scope) DO UPDATE SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value), updated_at = now();

CREATE UNIQUE INDEX IF NOT EXISTS clients_code_key ON clients (code) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_quotation_number_key ON sales (quotation_number) WHERE quotation_number IS NOT NULL;
