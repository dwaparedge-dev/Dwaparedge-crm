-- Restores the built-in dropdown options. Safe to re-run: an option someone already added under the same key
-- (e.g. "cheque") is kept and just becomes the built-in one with its proper label.
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
ON CONFLICT (table_name, column_name, (lower(option_key))) DO UPDATE
  SET option_value = EXCLUDED.option_value, sort_order = EXCLUDED.sort_order, is_system = true, updated_at = now();
