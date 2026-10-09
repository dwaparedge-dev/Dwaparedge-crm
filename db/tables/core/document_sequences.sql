-- Table: document_sequences
-- Atomic counters. Allocation is `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, which
-- row-locks, so concurrent transactions get distinct numbers and a rollback releases the number.
CREATE TABLE IF NOT EXISTS document_sequences (
  doc_type   TEXT        NOT NULL,
  scope      TEXT        NOT NULL DEFAULT '',  -- e.g. financial year '2026-27' for invoices
  last_value INTEGER     NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_type, scope)
);
