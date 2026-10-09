/**
 * DWARAEDGE CRM DATABASE SCHEMA REGISTRY
 *
 * The single list of everything `npm run db:sync` builds. Each table is declared in its own file under
 * `db/tables/<module>/`; functions, triggers and views live in `db/logic/`; default rows in `db/seeds/`.
 *
 * HOW TO USE
 *  - Add a table:   create `db/tables/<module>/my_table.sql` (CREATE TABLE IF NOT EXISTS + its indexes,
 *                   one column per line) and register it in TABLE_REGISTRY below, AFTER the tables it references.
 *  - Add a column:  add the line to the table's file. The next sync adds it to a database that already has the table.
 *  - Triggers/views: edit the file in `db/logic/` (CREATE OR REPLACE / DROP+CREATE, so it is safe to re-run).
 *  - Run:           npm run db:sync                       (everything)
 *                   npm run db:sync -- --module=billing   (one module)
 *                   npm run db:sync -- --table=payments   (one table)
 *
 * What a sync cannot do (it never drops or rewrites data): remove or rename a column, change a column's type,
 * or add a constraint to a table that already exists. Put those in a numbered file in `db/migrations/`
 * and run `npm run db:migrate`.
 */

export type SchemaModule = "core" | "crm" | "catalog" | "sales" | "billing" | "licensing";

export interface TableDefinition {
  /** Table name in PostgreSQL. */
  name: string;
  module: SchemaModule;
  /** File inside db/tables/. */
  file: string;
  description: string;
  /** Set to false to skip the table during a sync. */
  enabled: boolean;
}

const t = (module: SchemaModule, name: string, description: string, enabled = true): TableDefinition => ({
  name, module, file: `${module}/${name}.sql`, description, enabled,
});

/** Order matters: a table must come after every table it references. */
export const TABLE_REGISTRY: TableDefinition[] = [
  t("core", "users", "Staff login accounts"),
  t("core", "login_attempts", "Failed-login tracking for rate limiting"),
  t("core", "security_events", "Sign-in and account-security audit log"),
  t("core", "document_sequences", "Gap-free document numbering counters"),
  t("core", "company_settings", "Our company details, prefixes and invoice defaults (single row)"),
  t("core", "field_options", "User-extendable dropdown options"),
  t("crm", "clients", "Customers"),
  t("crm", "contacts", "People at a client"),
  t("crm", "activity_log", "Shared activity / audit log"),
  t("catalog", "products", "Product and service catalog"),
  t("sales", "sales", "Sale orders"),
  t("sales", "sale_items", "Lines of a sale order"),
  t("licensing", "licenses", "Software license register"),
  t("billing", "invoices", "Sales invoices"),
  t("billing", "invoice_items", "Invoice lines, each billing part of a sale item"),
  t("sales", "sale_milestones", "Billing plan (instalments) of a sale"),
  t("billing", "payments", "Payments received"),
  t("billing", "payment_allocations", "Which payment paid which invoice"),
];

/** Run after all tables, in this order (db/logic/). Each file must be safe to run repeatedly. */
export const LOGIC_FILES = ["billing_guards.sql", "field_option_guards.sql", "license_guards.sql", "sale_billing_views.sql"];

/** Default rows (db/seeds/). Must never overwrite rows people have edited. */
export const SEED_FILES = ["defaults.sql"];

export function getActiveTables(filter: { table?: string; module?: string } = {}): TableDefinition[] {
  const tables = TABLE_REGISTRY.filter((x) => x.enabled && (!filter.table || x.name === filter.table) && (!filter.module || x.module === filter.module));
  if (filter.table && tables.length === 0) throw new Error(`Unknown or disabled table "${filter.table}"`);
  if (filter.module && tables.length === 0) throw new Error(`Unknown or empty module "${filter.module}"`);
  return tables;
}
