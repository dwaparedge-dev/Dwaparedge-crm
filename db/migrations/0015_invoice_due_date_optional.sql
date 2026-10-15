-- An invoice may have no due date ("not specified"), and its due date can be changed when it is regenerated.
-- `npm run db:sync` updates the guard trigger (db/logic/billing_guards.sql); this drops the NOT NULL on the existing table.
ALTER TABLE invoices ALTER COLUMN due_date DROP NOT NULL;
