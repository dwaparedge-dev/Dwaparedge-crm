# DwaparEdge Business Hub

Internal web app for Dwapar Edge Private Limited to manage **clients, sales, software licenses, GST invoices and payments**. Staff only; there is no customer portal.

| | |
|---|---|
| Framework | Next.js 16 (App Router, Cache Components) · React 19 · TypeScript (strict) |
| UI | Material UI |
| Database | PostgreSQL (hosted on Supabase) via `pg` and plain SQL migrations |
| Auth | Own `users` table · bcrypt · signed JWT in an httpOnly cookie |
| Validation / forms | Zod · React Hook Form |
| PDFs | PDFKit (invoices, receipts) |
| Tests | Vitest (unit + database-backed integration) |

> Next.js 16 differs from older versions (`proxy.ts` replaces `middleware.ts`, error boundaries receive `retry`, etc.). Read `node_modules/next/dist/docs/` before changing framework-level code. See `AGENTS.md`.

## What it does

- **Clients** with multiple contacts, GSTIN/PAN validation, duplicate detection, archive (never delete), per-client history.
- **Products & services** catalog with HSN/SAC and GST rate (or exempt).
- **Sales** (project / license / service) with line items, discounts and GST estimate; prices are copied into the sale.
- **Software licenses** register: issue, activate, renew, suspend, reinstate, revoke; full history; days remaining; renewal opportunities.
- **Invoices** in a professional PDF format: draft → issue → (cancel). CGST+SGST or IGST by state, per-line GST rates, round-off, amount in words, bank details. Issued invoices are immutable.
- **Payments** ledger with allocation to invoices (partial, multi-invoice, advances), reallocation, void, receipts (PDF).
- **Dashboard** and **10 reports** (CSV export), including the activity log.

Not in v1 (by decision): email sending, leads/follow-ups, quotations, credit notes, CSV client import, roles/permissions, e-invoicing (IRN). See [Known limitations](#known-limitations).

## Quick start

Requirements: Node 20.9+, a PostgreSQL database (a **separate** Supabase project or any empty Postgres; never FactoONE's database).

```bash
npm install
cp .env.example .env.local        # then edit it (see Environment variables)
npm run db:migrate                # create the tables
npm run db:seed-admin             # create the first login from SEED_ADMIN_*
npm run dev                       # http://localhost:3000
```

Then sign in, open **Settings**, and fill in your company name, address, **state**, GSTIN, bank details and numbering prefixes. Invoices cannot be issued until the company name, address and state are set.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string used by the app |
| `DIRECT_URL` | no | If set, migrations and admin scripts use it instead of `DATABASE_URL`. Leave unset if you have no separate direct connection |
| `JWT_SECRET` | yes | Signs session cookies. ≥ 32 chars. Changing it signs everyone out |
| `JWT_EXPIRES_IN_DAYS` | no (7) | Session lifetime |
| `BCRYPT_SALT_ROUNDS` | no (12) | Password hashing cost (10-15) |
| `RATE_LIMIT_SALT` | no | Salt for hashing emails/IPs in the login rate limiter |
| `SEED_ADMIN_NAME/EMAIL/PASSWORD` | first run | Used only by `db:seed-admin` (password ≥ 12 chars) |

`.env`, `.env.local` are git-ignored. Only `.env.example` (names and placeholders) is committed. Nothing secret is exposed to the browser: there are no `NEXT_PUBLIC_*` variables.

### Supabase setup

1. Create a **new** Supabase project for this app (same account as FactoONE is fine; different project).
2. *Project Settings → Database → Connect*: copy the **Session pooler** string (port 5432). The direct host (`db.<ref>.supabase.co`) is IPv6-only and fails on many networks and on Vercel; the session pooler works everywhere. Put it in `DATABASE_URL`.
3. The app does **not** use Supabase Auth, Storage or the REST API. Supabase is just a hosted Postgres. Because the browser never talks to the database, Row Level Security is not part of the design: **all authorization is in the server code**, and the database credential must stay server-side.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve the build |
| `npm run check` | Type-check, lint and unit tests (run before committing) |
| `npm run typecheck` · `lint` · `test` | The three checks separately |
| `npm run test:db` | Database-backed integration tests (see [Testing](#testing)) |
| `npm run db:migrate` | Apply new `db/migrations/*.sql` files, each in a transaction |
| `npm run db:seed-admin` | Create the first user from `SEED_ADMIN_*` (no-op if the email exists) |
| `npm run users -- <command>` | `list`, `create`, `passwd`, `deactivate`, `activate` (passwords typed at a hidden prompt) |

### Staff accounts

There is no user-management screen in v1, and no roles: **every signed-in user can do everything**, so only create accounts for people who should have full access.

```bash
npm run users -- create --email asha@example.com --name "Asha"
npm run users -- passwd --email asha@example.com        # reset, signs the user out everywhere
npm run users -- deactivate --email asha@example.com    # block login, end all sessions
```

Users can change their own password from the account menu (top right).

## Deployment (Vercel)

1. Push the repo and import it in Vercel (framework: Next.js; Node 20+).
2. Set environment variables for **Production** (and Preview if used): `DATABASE_URL` (session pooler), `JWT_SECRET`, `JWT_EXPIRES_IN_DAYS`, `BCRYPT_SALT_ROUNDS`, `RATE_LIMIT_SALT`. Use a **different** `JWT_SECRET` from local.
3. Run migrations and create the admin **from your machine** against the production database (`DATABASE_URL=… npm run db:migrate && npm run db:seed-admin`) or in CI before the first deploy. The build does not migrate automatically, on purpose.
4. Pick the Vercel function region closest to your Supabase region (e.g. Supabase `ap-southeast-2` → Vercel `syd1`) to keep database round trips short.
5. Each serverless instance keeps a small pool (3 connections on Vercel). If you scale up, watch the Supabase pooler's connection limit.

There are **no scheduled jobs or background workers**, so no cron setup is needed. (Reminders are shown on the dashboard instead of emailed.) The app writes nothing to the local filesystem; PDFs are generated on demand from stored data.

### Database backups and recovery

- Check your Supabase plan for its automatic backup and point-in-time-recovery options and enable what it offers. Do not rely on that alone: also take your own dumps:
  ```bash
  pg_dump "$DATABASE_URL" --format=custom --no-owner --file=backup-$(date +%F).dump
  ```
  Keep dumps encrypted and off the database host. Schedule it weekly at minimum, and before every migration.
- Restore into an **empty** database: `pg_restore --no-owner --dbname "$NEW_DATABASE_URL" backup.dump`, then point `DATABASE_URL` at it. Test a restore at least once.
- Financial history is never deleted by the app (invoices, payments and allocations are append-only and protected by database triggers), so a backup is a full audit record.

## Security

- **Sessions:** httpOnly, `SameSite=Lax`, `Secure` in production, signed HS256 JWT. On every request the user row is re-checked (still active, `token_version` unchanged), so deactivating a user, changing a password or signing out ends sessions immediately.
- **Login:** bcrypt; identical response and timing for unknown email vs wrong password; lock-out after 5 failures per email / 20 per IP in 15 minutes (stored in Postgres, so it works across serverless instances). Trade-off: someone can deliberately lock a known email for 15 minutes.
- **Authorization:** every route handler calls `requireUser()`; `proxy.ts` is only an optimistic redirect. An automated test calls **every** API route anonymously and fails if any answers anything but 401, so a new route without a login check is caught.
- **CSRF:** mutating requests must be same-origin (`Origin` equals `Host`) and `application/json`.
- **Input:** Zod on every request body and query; all SQL is parameterized (sort columns come from allow-lists).
- **Headers:** `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, HSTS, referrer and permissions policies. A full script-src CSP needs per-request nonces with MUI/Emotion and is left out.
- **Integrity in the database:** triggers make issued invoices, their items, payments and allocations immutable and block over-allocation even if application code is bypassed.
- **Exports:** CSV cells that look like spreadsheet formulas are neutralised.
- **Secrets:** none in the repo or the browser bundle. The database connection uses TLS but does not verify the server certificate (`rejectUnauthorized: false`, the common Supabase setup); supply the CA if you need verification.
- **Dependencies:** `npm audit --omit=dev` reports no known vulnerabilities at the time of writing.

## Testing

```bash
npm test         # fast unit tests (money, GST, allocation rules, validation, dates, CSV)
npm run test:db  # integration tests against the real database engine
```

`test:db` creates a throwaway schema `vt_<random>` in the database from `DATABASE_URL`, applies the migrations inside it, runs the tests, and drops it. It **never touches real data** (the app refuses any `DB_SEARCH_PATH` that isn't `vt_*`). Over a remote database it takes several minutes (latency); against a local Postgres it takes seconds.

It covers: GST split and rounding, invoice numbering under concurrency (gap-free, per financial year), issued-invoice immutability (service and raw SQL), partial/multi-invoice allocations, invalid and **simultaneous** allocations, reversal/void rules, license lifecycle and derived expiry, duplicate detection, primary-contact rules, login lock-out, session revocation, forged tokens, CSRF, and "every endpoint requires a login".

## Architecture

```
src/
  app/                 Next.js routes: (dashboard)/ pages, api/ route handlers, login/
  components/          layout shell, common UI (dialogs, tables states), forms
  features/<module>/   schema.ts (Zod) · service.ts (business logic + SQL) · components/
  lib/                 db (pg pool, transactions), auth, money (BigInt), gst, pdf, csv, dates
  proxy.ts             optimistic auth redirect (not a security boundary)
db/migrations/         numbered SQL files applied by scripts/migrate.ts
scripts/               migrate, seed-admin, users
tests/                 unit tests; tests/integration/ database-backed tests
docs/                  API.md, DATA-MODEL.md
```

Route handlers are thin: parse with Zod → `requireUser()` → call a service → return JSON. Services own the SQL and transactions. Money is stored as `NUMERIC` and calculated as integers in paise (BigInt); no floating point touches an authoritative total. See [docs/DATA-MODEL.md](docs/DATA-MODEL.md) and [docs/API.md](docs/API.md).

### Business rules worth knowing

- **Invoice numbers** `PREFIX/FY/0001` (FY = April-March of the invoice date), allocated inside the issuing transaction from a locked counter: no duplicates under concurrency, and a failed issue does not burn a number. Drafts have no number.
- **GST:** place of supply (default: the client's state) vs your company state → CGST+SGST (same state) or IGST. Rate is per line. CGST and SGST are each rounded separately; the grand total can be rounded to the rupee with an explicit round-off line.
- **Snapshots:** an issued invoice stores the client's and your company's details as they were; items store their own description, price and tax. Later edits to clients, products or settings never change it.
- **Payment status is derived** from allocations (never typed in). *Collected* = payments received (not voided); *Invoiced* = issued invoices; *Outstanding* = invoiced − allocated payments; *Advance* = received but unallocated. The dashboard keeps these separate.
- **Licenses:** "expired" is derived (an active license past its expiry date), so it can never be stale.
- **Corrections:** invoices are cancelled with a reason; payments are voided with a reason; allocations are reversed. Nothing is deleted.

## Known limitations

- **Accountant sign-off needed** for: treatment of advance payments (they are recorded as receipts + unallocated payments, not tax invoices), credit-note handling (not built; cancel + re-issue instead), place-of-supply edge cases, round-off policy, and whether your invoice wording meets GST rules. TDS and e-invoicing/IRN are not handled.
- **No roles or permissions**: all users have full access. Add before giving access to anyone who should not see financials.
- **Receipts** use the current company settings (they do not keep a snapshot like invoices do).
- **PDF currency** prints "INR" (built-in fonts have no ₹ glyph); embed a font to change it.
- **No email**: PDFs are viewed or downloaded and sent by hand.
- **No scheduled jobs**: renewal and overdue reminders are dashboard alerts, not notifications.
- **Single currency (INR)**, single company.
- The login lock-out can be abused to lock a known email for 15 minutes; the per-IP limit trusts `x-forwarded-for`, which is reliable on Vercel but spoofable elsewhere.
- Integration tests are slow over a remote database.
