-- Table: invoice_versions
-- Every time an issued invoice is regenerated (fresh client / company / project details, newest layout) the result is
-- kept here as a new version; nothing is overwritten. The invoice row itself never changes (amounts, number, date),
-- it keeps the details as first issued. Version 1 is that original; the current version is the highest one.
-- Rows are permanent (see logic/billing_guards.sql).
CREATE TABLE IF NOT EXISTS invoice_versions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID        NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  version_no        INTEGER     NOT NULL CHECK (version_no >= 1),
  client_snapshot   JSONB       NOT NULL,   -- client details printed on this version
  company_snapshot  JSONB       NOT NULL,   -- our details and bank details printed on this version
  document_snapshot JSONB,                  -- project references, milestone and billing schedule printed on this version
  item_codes        JSONB,                  -- {invoice_item_id: SAC/HSN} as read from the sale for this version; NULL = the codes on the lines
  item_descriptions JSONB,                  -- {invoice_item_id: line wording} as read from the sale for this version; NULL = the wording on the lines
  pdf               BYTEA       NOT NULL,   -- the document exactly as generated then (later layout changes do not touch it)
  reason            TEXT,                   -- why it was regenerated
  created_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoice_versions_unique UNIQUE (invoice_id, version_no)
);
