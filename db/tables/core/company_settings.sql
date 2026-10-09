-- Table: company_settings
-- Our own company details, numbering prefixes and invoice defaults. Single row (id = 1).
CREATE TABLE IF NOT EXISTS company_settings (
  id                   SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
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
