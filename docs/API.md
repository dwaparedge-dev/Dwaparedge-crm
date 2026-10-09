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
| `/api/sales/{id}` | GET, PATCH | Locked once completed/cancelled |
| `/api/sales/{id}/status` | POST | `{status: confirmed\|completed\|cancelled}` |
| `/api/sales/{id}/invoice` | POST | Creates a draft invoice from the sale |
| `/api/licenses` | GET, POST | GET filters: `clientId`, `productId`, `status` (incl. `expired`), `expiringWithin` (days), `sort` |
| `/api/licenses/{id}` | GET, PATCH | GET includes full history |
| `/api/licenses/{id}/action` | POST | `{action: activate\|renew\|suspend\|reinstate\|revoke, note?, newExpiry?, renewalPrice?}` |
| `/api/invoices` | GET, POST | GET filters: `clientId`, `status`, `paymentStatus`, `openOnly`, `from`, `to`. POST creates a draft |
| `/api/invoices/{id}` | GET, PATCH, DELETE | PATCH/DELETE only for drafts |
| `/api/invoices/{id}/issue` | POST | Assigns the number; makes the invoice permanent |
| `/api/invoices/{id}/cancel` | POST | `{reason}`; refused while payments are allocated |
| `/api/invoices/{id}/pdf` | GET | `application/pdf`; `?download=1` for attachment |
| `/api/payments` | GET, POST | POST may include `allocations: [{invoiceId, amount}]` |
| `/api/payments/{id}` | GET | Includes allocations |
| `/api/payments/{id}/allocations` | POST | `{allocations: [...]}` |
| `/api/payments/{id}/void` | POST | `{reason}`; refused while allocated |
| `/api/payments/{id}/receipt` | GET | PDF |
| `/api/allocations/{id}/reverse` | POST | `{reason}` |
| `/api/settings` | GET, PUT | Company details, bank, numbering, defaults |
| `/api/dashboard` | GET | `?from=&to=` (YYYY-MM-DD) |
| `/api/reports` | GET | Catalogue of reports |
| `/api/reports/{key}` | GET | Keys: `clients sales invoices payments outstanding overdue licenses renewals ledger activity`. `?format=csv` exports (≤ 50,000 rows) |
| `/api/users/options` | GET | Active staff for dropdowns |
