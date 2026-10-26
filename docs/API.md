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
| 413 | Intake body too large |
| 429 | Too many failed logins, or too many requests from one address |
| 503 | Intake is switched off (`DEMO_INTAKE_KEY` not set) |

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
| `/api/invoices/{id}/regenerate` | POST | `{reason?, dueDate?, updateInvoiceDate?}`; issued invoices only. `updateInvoiceDate: true` moves the invoice date to today (the number keeps its original month). `dueDate` omitted keeps the due date, `null` makes it "not specified", a `YYYY-MM-DD` date sets it (not before the invoice date). Keeps the number and amounts, refreshes the client / company / project details and layout, and stores the result as a new version (the previous ones stay). Returns `{version}` |
| `/api/invoices/{id}/pdf` | GET | `application/pdf`; `?version=N` for an earlier version (default: the current one); `?download=1` for attachment. One page for a normal invoice; a long one continues onto further pages |
| `/api/payments` | GET, POST | POST may include `saleId` (tag the payment to a sale; unallocated money becomes its advance) and `allocations: [{invoiceId, amount}]`. GET filter `saleId` lists payments tagged to the sale or allocated to its invoices (with `applied_to_sale`) |
| `/api/payments/{id}` | GET | Includes allocations |
| `/api/payments/{id}/allocations` | POST | `{allocations: [...]}` |
| `/api/payments/{id}/void` | POST | `{reason}`; refused while allocated |
| `/api/payments/{id}/receipt` | GET | PDF |
| `/api/allocations/{id}/reverse` | POST | `{reason}` |
| `/api/settings` | GET, PUT | Company details, bank, numbering, defaults |
| `/api/dashboard` | GET | `?from=&to=` (YYYY-MM-DD) |
| `/api/users/options` | GET | Active staff for dropdowns |
| `/api/demo-requests` | GET | "Book a demo" requests from the website. Filters: `status` (`new`, `contacted`, `scheduled`, `done`, `spam`; without it everything **except spam** is listed), `ownerId`, `search` (name, company, mobile, email), `sort` (`created` default, `name`, `company`), `dir` (`desc` default). Returns `{items, total, page, pageSize, summary}`; `summary` counts each status, and `all` is everything except spam. The visitor's hashed address and browser are never returned |
| `/api/demo-requests/summary` | GET | The same per-status counts alone. The sidebar badge and the bell read `new` from here once a minute |
| `/api/demo-requests/{id}` | GET, PATCH | GET returns the request with its `events` (history, newest first). PATCH `{ownerId?, notes?}`: only the fields sent change, `""` or `null` clears one, the owner must be an active user (422 otherwise), notes keep their line breaks (≤ 5,000 characters). Nothing is logged when nothing changed |
| `/api/demo-requests/{id}/status` | POST | `{status}`. Any status may follow any other (a request wrongly marked spam can be reopened); the same status again is a 409. `contacted_at` records the first time it left New for contacted, scheduled or done and is never cleared |
| `/api/options` | GET, POST | GET `?table=&column=` lists a dropdown (no params: all, with usage, for Settings). POST `{table, column, label}` adds an option, or returns the existing one with the same name. Only whitelisted `table.column` pairs are accepted |
| `/api/options/{id}` | PATCH, DELETE | PATCH `{label?, sortOrder?, isActive?}`; DELETE refused for built-in or in-use options |

## Demo-request intake (server to server)

`POST /api/intake/demo-requests` receives a "Book a demo" submission from the FactoOne site. It is the one route that does **not** use the session cookie or the same-origin check, because its caller is a server, not a browser. It is authenticated by a shared secret instead:

```
POST /api/intake/demo-requests
Content-Type: application/json
X-Intake-Key: <DEMO_INTAKE_KEY>
```

| Field | Rules |
|---|---|
| `name` | required, ≤ 120 characters |
| `company` | required, ≤ 200 characters |
| `mobile` | required; 10 digits starting 6-9. `+91`, `91`, a leading `0`, spaces and dashes are accepted and dropped |
| `email` | required, valid, stored lower-cased |
| `source` | optional label (`a-z 0-9 - _`, ≤ 50), default `landing` |
| `entryPoint` | optional label for the button that led to the form (`navbar`, `hero`, ...) |
| `externalRef` | optional, 8-100 characters (`A-Z a-z 0-9 - _`). The form generates one per page load; sending the same value again returns the first request instead of creating another |
| `submitterIp`, `userAgent` | optional. The visitor's address and browser as the FactoOne server saw them. The address is stored only as a salted hash |

Control characters are replaced by spaces and extra spaces collapsed. Unknown fields are ignored (a caller cannot set `status`, owner or notes).

| Answer | Meaning |
|---|---|
| 201 `{id, duplicate: false}` | Stored as a new request with status `new` |
| 200 `{id, duplicate: true}` | Nothing new stored: the same `externalRef` again, or the same email or mobile asking again within 24 hours (the first request's `repeat_count` goes up) |
| 401 | Missing or wrong `X-Intake-Key` (checked before the body is read) |
| 413 / 415 / 400 | Body over 8,000 characters / not `application/json` / not valid JSON |
| 422 | Validation failed; `error.issues` names each field |
| 429 | More than 60 intake calls a minute from one address (that address is the FactoOne server, so this caps all visitors together) |
| 503 | `DEMO_INTAKE_KEY` is not set: the endpoint is off |
