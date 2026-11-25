# API reference

All routes are Next.js Route Handlers under `/api`, JSON in and out, authenticated by the session cookie (`de_session`) unless noted. Errors share one shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "issues": [{ "path": ["gstin"], "message": "…" }] } }
```

| Status | Meaning |
|---|---|
| 400 | Malformed JSON |
| 401 | Not signed in / session ended |
| 403 | Cross-origin request (`CSRF`), wrong current password, or a permission the account does not hold (`FORBIDDEN`) |
| 404 | Not found |
| 409 | Conflict: duplicate GSTIN/SKU or task category/priority name (`DUPLICATE`), invalid state transition (`INVALID_TRANSITION`), a task category or priority that tasks use cannot be deleted (`IN_USE`), locked record, constraint violation |
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
| `/api/invoices/{id}/regenerate` | GET, POST | **Refused with `409 HAS_PAYMENTS` while any payment allocation is applied to the invoice** (reverse the allocation first). POST `{reason?, dueDate?, updateInvoiceDate?, renumberInvoice?}`; issued invoices only. `dueDate` omitted keeps the due date, `null` makes it "not specified", a `YYYY-MM-DD` date sets it (not before the invoice date). `updateInvoiceDate: true` moves the invoice date to today. `renumberInvoice: true` gives the invoice the next number of the month of its (new) invoice date when its number is for another month (`INV-1026-AA01-01` becomes `INV-1126-AA01-01`); the old number is never issued again and stays on the version that printed it. Keeps the amounts, refreshes the client / company / project details and layout, and stores the result as a new version (the previous ones stay). Returns `{version}`. GET `?updateInvoiceDate=true\|false` previews the number it would get (`{number, newNumber, invoiceDate, blocked}`) without changing or using up anything |
| `/api/invoices/{id}/pdf` | GET | `application/pdf`; `?version=N` for an earlier version (default: the current one; the filename carries the number that version printed); `?download=1` for attachment. One page for a normal invoice; a long one continues onto further pages |
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
| `/api/tasks` | GET, POST | GET lists tasks as `{items, total, page, pageSize}`. By default (`scope=mine`) these are the tasks the caller **owns or created**; `scope=all` lists every task and needs `tasks.view_all` (else `403 FORBIDDEN`). Filters: `status` (`active` default = open, in progress and waiting; `closed` = done and cancelled; or one of `open`, `in_progress`, `waiting`, `done`, `cancelled`), `categoryId`, `priorityId`, `ownerId` (a user id, or `unassigned`; a deactivated owner counts as unassigned), `clientId`, `origin` (`manual`, `auto`), `dueFrom` and `dueTo` (`YYYY-MM-DD`), `search` (title and description, ≤ 100 characters; `%` and `_` match themselves), `sort` (`due` default, `priority`, `created`, `updated`), `dir` (`asc` default, `desc`). Ties are broken by priority, then due date, then age. POST `{title, description?, categoryId, priorityId, ownerId?, clientId?, dueDate?, followUpAt?, followUpEveryDays?}` creates a task and answers `201 {id}`: title 1 to 200 characters, description ≤ 5,000, `followUpEveryDays` 1 to 365, category and priority must be active (422). `ownerId` left out means the caller; another person, or `null` for Unassigned, needs `tasks.assign` (403). `followUpAt` is an ISO 8601 time **with a time zone** (`2026-11-20T10:00:00+05:30`), in the future and at most 365 days out (422). When `followUpEveryDays` is left out the category's default is copied. Status, origin, source and creator cannot be sent: they are ignored |
| `/api/tasks/{id}` | GET, PATCH | GET returns the task with its `events` (history, newest first). A task the caller may not see answers `404`, as if it did not exist. PATCH takes any of the create fields; only the fields sent change, and `""` or `null` clears an owner, client, date, time or description. Changing anything but the owner needs the edit right (the caller owns or created the task, or holds `tasks.edit_all`; else 403); changing the owner needs `tasks.assign` ("Take it" is setting the owner to yourself on an unassigned task). An edit that does both needs both and is refused whole if either is missing. Nothing is logged when nothing changed |
| `/api/tasks/{id}/status` | POST | `{status, waitingOn?, followUpAt?}`, `status` one of `open`, `in_progress`, `waiting`, `done`, `cancelled`. Needs the edit right. Done records who closed it and when; every other status clears both, so moving a done or cancelled task to `open` **reopens** it. `waiting` needs a follow-up time: `followUpAt` (future, ≤ 365 days), or one already on the task that is still ahead (422 otherwise); `waitingOn` (≤ 200 characters) says who or what is awaited. The same status again is `409 INVALID_TRANSITION`. The row is locked, so two people pressing Done at once give one change |
| `/api/tasks/{id}/notes` | POST | `{note}` (1 to 2,000 characters, line breaks kept). Adds a note to the task's timeline; allowed on a task in any status. Needs the edit right |
| `/api/tasks/{id}/follow-up` | POST | `{note, next}`; `note` 1 to 2,000 characters; `next` is `{kind:"in_days", days:1..365}`, `{kind:"at", at}` (ISO time with offset), `{kind:"cadence"}` (now plus the task's own cadence; 422 when it has none) or `{kind:"stop"}` (clears the timer and cadence; 422 on a `waiting` task). Counts one follow-up, parks the task until the time, logs `followed_up`. A done or cancelled task is `409 INVALID_TRANSITION`; a time in the past or more than 365 days ahead is 422. Needs the edit right; the row is locked, so parallel follow-ups each count |
| `/api/tasks/{id}/snooze` | POST | `{until}` (ISO time with offset, future, ≤ 365 days). Parks the task until then without counting a follow-up; logs `snoozed`. Works on any active task, overdue or not. Same 409/422 rules and edit right as follow-up |
| `/api/tasks/desk` | GET | The Desk in one round trip: `{today, counts, sections, categories, unassigned}`. `sections` has `overdue`, `followups_due`, `today`, `next7`, `later` and `parked` (each ordered by priority, then due date, then age); `counts` holds the numbers for the stat strip and the badge. `?owner=` is `me` (default: the caller's tasks plus unassigned ones for someone who holds `tasks.view_all`, only their own otherwise), `all`, `unassigned`, or a user id; anything but `me` needs `tasks.view_all` (403). Active tasks only, at most 2,000. Read-only |
| `/api/tasks/sync` | POST | The sidebar badge's poll and the Desk's refresh. The body is ignored; answers `{counts}` with `overdue`, `followUpsDue`, `dueToday`, `next7`, `parked`, `parkedLate` and `badge` (overdue plus follow-ups due) for the caller's default Desk scope. It also runs the auto-task sync (a POST because it writes; answers `sync: {status, created, closed, reopened}`, `disabled` until `TASKS_AUTO_FROM` is set, `skipped` when another call holds the lock). Needs a session and the same-origin check, like any POST |
| `/api/tasks/{id}/mark-contacted` | POST | Demo-request auto-tasks only (409 otherwise): moves the demo request to Contacted (with its own history row) and closes the task in one transaction. Plain Done on such a task is `409` |
| `/api/task-categories` | GET, POST | GET: any signed-in user can read the list (for the pickers); `?all=true` includes hidden rows (for Settings and for tasks that still point at one). Each item is `{id, key, name, colour, default_follow_up_days, sort_order, is_active, is_system, in_use}`, ordered by `sort_order`. POST `{name, colour, defaultFollowUpDays?, sortOrder?}` needs `tasks.manage_settings` (403) and answers `201 {id}`: name 1 to 60 characters, unique whatever the case, hidden rows included (409 `DUPLICATE`); `colour` is `#rrggbb`; `defaultFollowUpDays` 1 to 365 or blank for no repeat; the new row goes last unless `sortOrder` says otherwise. The `key` is made from the name and cannot be sent |
| `/api/task-categories/{id}` | PATCH, DELETE | Need `tasks.manage_settings`. PATCH `{name?, colour?, defaultFollowUpDays?, sortOrder?, isActive?}`: only the fields sent change, `isActive: false` hides the row from the pickers, nothing is logged when nothing changed. DELETE is refused with `409 IN_USE` for a row any task uses (hide it instead); any other row, starter ones included, can be deleted. Every change is written to `activity_log` (`entity_type = 'task_category'`) |
| `/api/task-priorities` | GET, POST | As for categories, with `rank` instead of `defaultFollowUpDays`: items are `{id, key, name, colour, rank, sort_order, is_active, is_system, in_use}`; POST `{name, colour, rank, sortOrder?}`, `rank` 1 to 99 (1 = most urgent; it orders tasks inside a Desk section, while `sortOrder` is only the order of the dropdown) |
| `/api/task-priorities/{id}` | PATCH, DELETE | As for categories: PATCH `{name?, colour?, rank?, sortOrder?, isActive?}`; DELETE refused (`IN_USE`) for an in-use row. Logged as `entity_type = 'task_priority'` |
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
