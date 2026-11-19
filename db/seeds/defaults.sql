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
  ('payments','method','other','Other',50,true),
  ('client_documents','doc_type','gst_certificate','GST certificate',10,true),
  ('client_documents','doc_type','pan_card','PAN card',20,true),
  ('client_documents','doc_type','agreement','Agreement',30,true),
  ('client_documents','doc_type','cancelled_cheque','Cancelled cheque',40,true),
  ('client_documents','doc_type','other','Other',50,true)
ON CONFLICT DO NOTHING;
INSERT INTO company_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Starter task categories and priorities (the Task Desk). Same rule: existing rows are left as they are, so a renamed,
-- recoloured or hidden row is never reset. is_system marks the rows the auto-task rules rely on.
INSERT INTO task_categories (key, name, colour, default_follow_up_days, sort_order, is_system) VALUES
  ('sales_leads','Sales & leads','#6366f1',2,10,true),
  ('collections','Collections','#0d9488',3,20,true),
  ('billing','Billing & invoicing','#0284c7',NULL,30,true),
  ('licences','Licences & renewals','#d97706',7,40,true),
  ('clients_support','Clients & support','#db2777',NULL,50,false),
  ('delivery','Delivery','#16a34a',NULL,60,false),
  ('finance_compliance','Finance & compliance','#64748b',NULL,70,false),
  ('admin_hiring','Admin & hiring','#8b5cf6',NULL,80,false)
ON CONFLICT (key) DO NOTHING;
INSERT INTO task_priorities (key, name, colour, rank, sort_order, is_system) VALUES
  ('critical','Critical','#dc2626',1,10,false),
  ('high','High','#ea580c',2,20,true),
  ('normal','Normal','#2563eb',3,30,true),
  ('low','Low','#6b7280',4,40,false)
ON CONFLICT (key) DO NOTHING;
