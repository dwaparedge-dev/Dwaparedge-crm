-- 1) Generic, user-extendable dropdown options: one row per (table, column, key).
-- 2) Remove tables/columns that duplicated other data.

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

INSERT INTO field_options (table_name, column_name, option_key, option_value, sort_order, is_system) VALUES
  ('sales','type','project','Project',10,true),
  ('sales','type','license','License',20,true),
  ('sales','type','service','Service',30,true),
  ('products','type','software_license','Software license',10,true),
  ('products','type','software_subscription','Software subscription',20,true),
  ('products','type','implementation','Implementation',30,true),
  ('products','type','custom_development','Custom development',40,true),
  ('products','type','consulting','Consulting',50,true),
  ('products','type','support_maintenance','Support & maintenance',60,true),
  ('products','type','other','Other service',70,true),
  ('payments','method','bank_transfer','Bank transfer',10,true),
  ('payments','method','upi','UPI',20,true),
  ('payments','method','cash','Cash',30,true),
  ('payments','method','cheque','Cheque',40,true),
  ('payments','method','other','Other',50,true)
ON CONFLICT DO NOTHING;

-- The type columns now hold any key from field_options, so the fixed CHECK lists go.
ALTER TABLE sales    DROP CONSTRAINT IF EXISTS sales_type_check;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_type_check;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;

-- Backstop: a dynamic column may only hold a key that exists in field_options (inactive keys are
-- still accepted so existing records can be re-saved). Statuses and other system values are not covered.
CREATE OR REPLACE FUNCTION check_field_option() RETURNS trigger AS $$
DECLARE
  col  TEXT := TG_ARGV[0];
  val  TEXT;
BEGIN
  EXECUTE format('SELECT ($1).%I::text', col) INTO val USING NEW;
  IF val IS NULL OR val = '' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM field_options WHERE table_name = TG_TABLE_NAME AND column_name = col AND lower(option_key) = lower(val)) THEN
    RAISE EXCEPTION 'Unknown option "%" for %.%', val, TG_TABLE_NAME, col USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sales_option_type ON sales;
CREATE TRIGGER sales_option_type BEFORE INSERT OR UPDATE OF type ON sales FOR EACH ROW EXECUTE FUNCTION check_field_option('type');
DROP TRIGGER IF EXISTS products_option_type ON products;
CREATE TRIGGER products_option_type BEFORE INSERT OR UPDATE OF type ON products FOR EACH ROW EXECUTE FUNCTION check_field_option('type');
DROP TRIGGER IF EXISTS payments_option_method ON payments;
CREATE TRIGGER payments_option_method BEFORE INSERT OR UPDATE OF method ON payments FOR EACH ROW EXECUTE FUNCTION check_field_option('method');

DROP TRIGGER IF EXISTS licenses_option_plan ON licenses;
CREATE TRIGGER licenses_option_plan BEFORE INSERT OR UPDATE OF plan ON licenses FOR EACH ROW EXECUTE FUNCTION check_field_option('plan');

-- Removals ---------------------------------------------------------------------------------------
-- License history lives in activity_log (metadata carries from/to/note/details).
DROP TABLE IF EXISTS license_events;

-- The invoice inherits its sale's type; a second, editable "invoice type" only invited mismatches.
ALTER TABLE invoices DROP COLUMN IF EXISTS invoice_type;

-- Derivable or duplicated fields.
ALTER TABLE clients  DROP COLUMN IF EXISTS state;        -- the name follows from state_code
ALTER TABLE clients  DROP COLUMN IF EXISTS status;       -- archived_at already means "inactive"
ALTER TABLE products DROP COLUMN IF EXISTS is_tax_exempt; -- same as a 0% GST rate
ALTER TABLE products DROP COLUMN IF EXISTS currency;     -- INR only
