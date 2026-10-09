-- Table: field_options
-- Generic, user-extendable dropdown options: one row per (table, column, key).
CREATE TABLE IF NOT EXISTS field_options (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   TEXT        NOT NULL,
  column_name  TEXT        NOT NULL,
  option_key   TEXT        NOT NULL,   -- the value stored in the business table; never changes
  option_value TEXT        NOT NULL,   -- the label people see; can be renamed
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  is_system    BOOLEAN     NOT NULL DEFAULT false,  -- seeded options: can be renamed/hidden, never deleted
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT field_options_key_len CHECK (char_length(option_key) BETWEEN 1 AND 80),
  CONSTRAINT field_options_value_len CHECK (char_length(btrim(option_value)) BETWEEN 1 AND 60)
);
CREATE UNIQUE INDEX IF NOT EXISTS field_options_key_uq ON field_options (table_name, column_name, lower(option_key));
-- Two different labels may not collapse to the same visible text within one dropdown.
CREATE UNIQUE INDEX IF NOT EXISTS field_options_value_uq ON field_options (table_name, column_name, lower(btrim(option_value)));
