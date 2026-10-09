-- Built-in dropdown options and the single company_settings row. Safe to re-run: existing rows are left as they are,
-- so a renamed or hidden option is never reset by a sync.
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
INSERT INTO company_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
