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
