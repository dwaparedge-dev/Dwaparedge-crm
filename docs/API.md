# API reference

All routes are Next.js Route Handlers under `/api`, JSON in and out, authenticated by the session cookie (`de_session`) unless noted. Errors share one shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "issues": [{ "path": ["gstin"], "message": "…" }] } }
```

| Status | Meaning |
|---|---|
| 400 | Malformed JSON |
| 401 | Not signed in / session ended |
| 403 | Cross-origin request (`CSRF`) or wrong current password |
| 404 | Not found |
| 409 | Conflict: duplicate GSTIN/SKU, invalid state transition, locked record, constraint violation |
| 415 | Body is not `application/json` |
| 422 | Validation failed or business rule refused (allocation too large, missing tax context, …) |
| 429 | Too many failed logins |

Mutating requests (`POST/PUT/PATCH/DELETE`) must send `Content-Type: application/json` and a same-origin `Origin` header. Lists accept `page`, `pageSize` (≤ 100), `search`, and return `{ items, total, page, pageSize }`. Money values are decimal **strings**.

| Route | Methods | Notes |
|---|---|---|
| `/api/auth/login` | POST | Public. `{email, password}` → sets cookie |
| `/api/auth/logout` | POST | Ends **all** of the user's sessions |
| `/api/auth/change-password` | POST | `{currentPassword, newPassword}` (≥ 12 chars); other sessions end |
| `/api/clients` | GET, POST | GET filters: `status`, `archived`, `ownerId`, `sort`, `dir`. POST accepts `confirmDuplicate` |
| `/api/clients/{id}` | GET, PATCH | |
| `/api/clients/{id}/archive` | POST | `{archived: boolean}` |
| `/api/clients/{id}/contacts` | GET, POST | |
| `/api/clients/{id}/contacts/{contactId}` | PATCH, DELETE | |
| `/api/clients/{id}/activity` | GET | Audit trail for the client |
| `/api/products` | GET, POST | GET filters: `type`, `active` |
| `/api/products/{id}` | GET, PATCH | Changes never affect existing sales/invoices |
| `/api/sales` | GET, POST | GET filters: `clientId`, `status`, `type` |
| `/api/sales/{id}` | GET, PATCH | GET returns the sale with its items (billed / left to bill each), billing plan and the derived figures (`billed_total`, `paid_total`, `advance`, `due_on_invoices`, `unbilled_estimate`, `balance_remaining`, `billing_status`, `payment_status`). PATCH keeps item identity via `itemId`; billed items cannot be removed or reduced below what is billed. Locked once completed/cancelled |
| `/api/sales/{id}/status` | POST | `{status: confirmed\|completed\|cancelled}`. Completing needs the sale fully billed; cancelling needs no live invoices and no unallocated advance |
| `/api/sales/{id}/invoice` | POST | Creates a draft invoice against a confirmed sale: `{mode: "rest"}` \| `{mode: "percent", percent}` \| `{mode: "amount", amount}` (before GST) \| `{mode: "milestone", milestoneId}` |
| `/api/sales/{id}/milestones` | PUT | Replaces the billing plan: `{milestones: [{id?, title, basis: percent\|amount, percent?, amount?, dueDate?}]}`. Instalments with a live invoice must be kept |
| `/api/sales/{id}/apply-advance` | POST | `{invoiceId?}` allocates the sale's unallocated advance to its issued invoices (oldest due first) |
| `/api/licenses` | GET, POST | GET filters: `clientId`, `productId`, `status` (incl. `expired`), `expiringWithin` (days), `sort` |
| `/api/licenses/{id}` | GET, PATCH | GET includes full history |
| `/api/licenses/{id}/action` | POST | `{action: activate\|renew\|suspend\|reinstate\|revoke, note?, newExpiry?, renewalPrice?}` |
| `/api/invoices` | GET, POST | GET filters: `clientId`, `saleId`, `status`, `paymentStatus`, `openOnly`, `from`, `to`. POST creates a draft: `{saleId, issueDate, dueDate, items: [{saleItemId, …}]}`; every line must bill a line of that sale and not exceed what is left of it |
| `/api/invoices/{id}` | GET, PATCH, DELETE | PATCH/DELETE only for drafts |
| `/api/invoices/{id}/issue` | POST | Assigns the number; makes the invoice permanent |
| `/api/invoices/{id}/cancel` | POST | `{reason}`; refused while payments are allocated |
| `/api/invoices/{id}/pdf` | GET | `application/pdf`; `?download=1` for attachment |
| `/api/payments` | GET, POST | POST may include `saleId` (tag the payment to a sale; unallocated money becomes its advance) and `allocations: [{invoiceId, amount}]`. GET filter `saleId` lists payments tagged to the sale or allocated to its invoices (with `applied_to_sale`) |
| `/api/payments/{id}` | GET | Includes allocations |
| `/api/payments/{id}/allocations` | POST | `{allocations: [...]}` |
| `/api/payments/{id}/void` | POST | `{reason}`; refused while allocated |
| `/api/payments/{id}/receipt` | GET | PDF |
| `/api/allocations/{id}/reverse` | POST | `{reason}` |
| `/api/settings` | GET, PUT | Company details, bank, numbering, defaults |
| `/api/dashboard` | GET | `?from=&to=` (YYYY-MM-DD) |
| `/api/users/options` | GET | Active staff for dropdowns |
| `/api/options` | GET, POST | GET `?table=&column=` lists a dropdown (no params: all, with usage, for Settings). POST `{table, column, label}` adds an option, or returns the existing one with the same name. Only whitelisted `table.column` pairs are accepted |
| `/api/options/{id}` | PATCH, DELETE | PATCH `{label?, sortOrder?, isActive?}`; DELETE refused for built-in or in-use options |
