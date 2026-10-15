# Data model

PostgreSQL, declared in `db/tables/**/*.sql` (registered in `db/schema.ts`, built by `npm run db:sync`; triggers and views in `db/logic/`). UUID primary keys, `timestamptz` timestamps, money as `NUMERIC(14,2)`, quantities `NUMERIC(12,3)`, rates `NUMERIC(5,2)`. Business data is relational; the only JSON columns are the frozen snapshots on issued invoices (parties and document) and free-form `metadata` on the activity log.

```
users ──< clients ──< contacts
            │  ├──< sales ──< sale_items >── products
            │  │      └──< sale_milestones
            │  ├──< licenses >── products
            │  ├──< invoices ──< invoice_items            invoices >── sales (required)
            │  └──< payments ──< payment_allocations >── invoices
            └──< activity_log (all modules write here)
company_settings (single row)      document_sequences (numbering counters)
field_options (dropdown lists: table, column, key → label)
```

| Table | Purpose and key rules |
|---|---|
| `users` | Staff login. `password_hash` (bcrypt), `token_version` (bump = revoke sessions), `is_active`. Unique on `lower(email)` |
| `login_attempts` | Failed-login counters (hashed email/IP) for lock-out |
| `clients` | Permanent `code` (AA01 ... AA99, AB01 ... ZZ99, unique), legal/display name, GSTIN (unique, format-checked), PAN, address, state code (the name follows from it), brand names, optional bank details (bank, account no, IFSC, branch), owner, `archived_at` (= inactive). Never deleted |
| `contacts` | Per client; partial unique index = at most one primary |
| `client_documents` | Files uploaded against a client (max 4 MB each), stored in the `content` bytea column with a name and a type (`field_options` key `client_documents.doc_type`). List queries never read `content`; it is served only by the download route |
| `products` | Catalog: type, SKU (unique, case-insensitive), HSN/SAC, price, GST rate (0 = exempt), active |
| `sales`, `sale_items` | What was sold. Items copy description/price/tax from the product at the time. `quotation_number` and `agreement_ref` are printed in the invoice's Project & Agreement block |
| `licenses` | Register (`status`: pending/active/suspended/revoked; *expired* is derived from `expiry_date`). Its history is the `activity_log` filtered to the license (status change and note in `metadata`) |
| `field_options` | User-extendable dropdowns: `(table_name, column_name, option_key, option_value)`. The business table stores the **key**; the label is looked up, so renaming never touches records. Built-in rows (`is_system`) can be hidden, not deleted. A trigger rejects unknown keys on `sales.type`, `products.type`, `payments.method`, `licenses.plan`, `client_documents.doc_type`. Which columns may have options is a whitelist in `src/features/options/registry.ts` |
| `sale_milestones` | Optional billing plan of a sale: instalments by percentage or fixed amount (before GST), with a due date and a `description` (deliverables, printed on that instalment's invoice). `invoice_id` links the instalment to its invoice; it counts as billed only while that invoice is a draft or issued |
| `invoices`, `invoice_items` | **Every invoice has a `sale_id` and every line a `sale_item_id`** (NOT NULL). A trigger blocks billing more of a sale item than it is worth; another stops a billed sale item from being removed or reduced. Draft → issued → cancelled. Number allocated at issue. Snapshots (`client_snapshot`, `company_snapshot`, and `document_snapshot`: project references, the milestone billed, the full billing schedule and the billed-to-date / balance figures), per-line CGST/SGST/IGST, round-off. **Triggers** make issued rows immutable and undeletable, except `issue_date` and the optional `due_date` (NULL = not specified), which can change only while the invoice is regenerated |
| `invoice_versions` | Regenerating an issued invoice (`POST /api/invoices/{id}/regenerate`) adds a version with the client, company and project details as they are then, plus the PDF exactly as generated. The invoice row (number, date, amounts, original snapshots) never changes; version 1 is the original and the highest version is current. A version also records the SAC/HSN code of each line as the sale had it when the version was made (`item_codes`), because the issued lines themselves cannot change. A trigger makes the rows permanent |
| `payments` | Receipt number, amount, method, reference, optional `sale_id` (what it was paid for). Immutable; corrected by voiding |
| `payment_allocations` | Payment ↔ invoice amounts. Reversed rows are kept (`reversed_at`). **Trigger** locks both rows and blocks over-allocation and cross-client allocation |
| `activity_log` | Who/what/when for every change, with `client_id` for the client history tab |
| `company_settings` | One row (`id = 1`): company, state, GSTIN, bank, receipt prefix, defaults, invoice tagline and declaration text |
| `document_sequences` | `(doc_type, scope)` counters: client codes (global), sale orders (per client), quotations and invoices (per client per month, scope `AA01-1026`), receipts (per financial year). Allocated with a row-locking upsert inside the business transaction |
| `sale_item_billing`, `sale_billing` (views) | Derived per-item and per-sale figures: taxable billed (issued vs draft), billed total, paid on invoices, advance, still to bill. Never stored, so they cannot drift |
| `_migrations` | Applied migration files |

## Delete behaviour

`ON DELETE RESTRICT` on everything that carries financial or license history (clients, products, invoices, payments), so history cannot disappear by accident. `CASCADE` only for items owned by a draft/sale (`sale_items`, `invoice_items` of drafts). `SET NULL` for optional user/sale back-references.

## Why not Prisma's suggested model list

The brief listed Lead, FollowUp, Quotation, CreditNote, Deal and similar tables. v1 scope was reduced to clients, sales, licenses, invoices and payments, so: *Deal/DealItem* became `sales`/`sale_items`; *Lead, FollowUp, Quotation, CreditNote* are deferred (nothing in the schema blocks adding them); *DocumentSequence*, *LicenseEvent*, *PaymentAllocation*, *ActivityLog* and *CompanySettings* are implemented as specified; *UserProfile* is the `users` table itself because auth is local rather than Supabase Auth.

## Document numbers

| Document | Format | Counter |
|---|---|---|
| Client code | `AA01`, `AA02` ... `AA99`, `AB01` ... `ZZ99` | One global counter; permanent for the client, assigned when the client is created |
| Sale order | `SL-AA01-01` | Per client, never restarts |
| Quotation | `QT-1026-AA01-01` (QT-MMYY-client-nth) | Per client per month of the sale date; created with the sale |
| Invoice | `INV-1026-AA01-01` (INV-MMYY-client-nth) | Per client per month of the issue date; allocated at issue |

Invoice numbers must stay within GST's 16 characters (CGST Rule 46), so the prefix is fixed (`INV`) and a client can have at most 99 invoices a month; issuing the 100th is refused with a clear message. Sales, quotations and invoices created before codes existed keep their old numbers (`SL-0007`, `DE/2026-27/0001`); only new documents use the new format.
