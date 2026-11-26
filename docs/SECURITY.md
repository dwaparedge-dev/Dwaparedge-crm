# Security notes

## How access is controlled
- **Every page and API route needs a signed-in staff user.** `src/proxy.ts` redirects pages and answers `401` for the API as a first gate; each route handler then calls `requireUser()`, which re-reads the user row (active, token version). The only endpoints reachable without a session are `POST /api/auth/login`, the manifest and icons, and `POST /api/intake/demo-requests`, which is closed to anyone without the shared `DEMO_INTAKE_KEY` (see below).
- **Session:** a JWT (HS256, algorithm pinned) in an `httpOnly`, `SameSite=Lax`, `Secure` cookie. In production the cookie is named `__Host-de_session`, so a browser only accepts it from this exact host over HTTPS. Signing out, changing the password, or deactivating a user bumps `token_version`, which ends every session of that user at once.
- **Idle sign-out:** a browser signs itself out after 30 minutes without activity (other devices are not affected). Set `JWT_EXPIRES_IN_DAYS=1` in production.
- **Passwords:** bcrypt (12 rounds), 12 to 72 bytes, no common passwords, nothing built from your email name. Unknown emails cost the same time as known ones and the error never says which part was wrong.
- **Brute force:** at most 5 failed sign-ins per email-and-address pair, 25 per email and 20 per address in 15 minutes, then `429` (a stranger cannot lock the real user out from another address). Password changes have the same kind of limit. The keys are salted hashes (`RATE_LIMIT_SALT`).
- **Flooding:** the proxy limits each address per instance (300 reads, 90 writes, 30 auth calls a minute). Instances do not share memory, so also add the Vercel Firewall rule below.
- **Demo-request intake:** the FactoOne server posts "Book a demo" submissions to `POST /api/intake/demo-requests`. The browser never talks to the CRM: the visitor's browser calls the FactoOne server, which adds `X-Intake-Key`, so the key is never in a web page and the CRM needs no CORS. The key (`DEMO_INTAKE_KEY`, 32+ characters, different in production) is compared in constant time before the body is read; unset means the route answers `503`. The route accepts only a small JSON body, validates every field, cannot set status or owner, and stores the visitor's address only as a salted hash. `src/proxy.ts` skips the cookie check for `/api/intake/*` only and still applies a flood limit; any new route under that path must call `requireIntakeKey()` itself.
- **Permissions (Task Desk only):** each account carries its own list of permission keys; see [Per-user permissions](#per-user-permissions) below. Everything else in the CRM has no per-user access control yet.
- **CSRF:** every state-changing request must be same-origin (Origin must match Host) and `application/json`.
- **Injection:** every value goes to Postgres as a bound parameter. Sort columns come from fixed lists, and the only interpolated identifiers (dropdown options) come from a whitelist.
- **Validation:** every input is checked with Zod (ids are UUIDs, pages are capped at 100 rows, text has length limits).
- **Errors:** unexpected failures return a generic `500`; details only go to the server log.
- **Audit trail:** `security_events` records sign-ins (ok, failed, locked), password changes and sign-outs with address and browser, kept 180 days. Read it with `npm run users -- events [--email ...]`.
- **Browser hardening:** CSP (no third-party origins, no framing), HSTS, `nosniff`, `X-Frame-Options: DENY`, referrer and permissions policies, COOP/CORP, and `Cache-Control: private, no-store` on all `/api` responses.
- **Supply chain:** there is no automated pipeline; run `npm run check` and `npm audit --omit=dev --audit-level=high` yourself before a release.

## Per-user permissions

The Task Desk is the first module with per-user access, and it is built so that staff can be added later without reworking it. There are **no roles**: every account has its own list of permission keys in `users.permissions`, and what a person may see and do follows from that list plus the tasks they own or created. The valid keys, and the one `can` check every module uses, are in `src/lib/auth/permissions.ts`; the task rules are in one policy file, `src/features/tasks/policy.ts`, which every task service function asks. Nothing else decides who may see a task.

| Permission | What it allows |
|---|---|
| *(none)* | Create tasks for themselves. See, edit, complete and add notes to the tasks they **own or created**. Read the category and priority lists (for the pickers). Nothing else |
| `tasks.view_all` | See everyone's tasks and the unassigned ones; use the owner filters on the Desk and All tasks |
| `tasks.edit_all` | Change, complete and add notes to **other people's** tasks. Includes `tasks.view_all` |
| `tasks.assign` | Give a task to someone else, or take an unassigned one ("Take it") |
| `tasks.manage_settings` | Add, rename, recolour, reorder, hide and delete task categories and priorities |
| `demo_requests.delete` | Delete a demo request permanently (the Delete button on the Demo requests list and detail page; `DELETE /api/demo-requests/{id}`). Also erases the website analytics of the browser linked to it |
| `analytics.view` | Open Website Analytics (`/analytics`, `/api/analytics/*`) and the Website activity tab of a demo request (`GET /api/demo-requests/{id}/journey`). Visitor data is personal data, so it has its own key; migration `0019` gave it to existing accounts, new accounts start without it |

- **A new account holds none.** Accounts that existed when permissions were introduced were given all four (migration `0017_user_permissions`), because they already had full access; `db:seed-admin` gives the first admin all four.
- **The command line is the only way to change them in v1** (there is no user screen yet): `npm run users -- permissions --email x`, `grant --email x --permission tasks.view_all`, `revoke ...`, and `create ... --grant a,b`. Run them from a machine that holds the database credential, like every other account command.
- **Every grant and revoke is logged** to `activity_log` (`entity_type = 'user'`, the permission key in `metadata`). The command line has no signed-in person, so the entry has no actor and reads as a command-line change. A change takes effect on that user's very next request, because the session check re-reads the user row every time. An unknown key held by mistake grants nothing.
- **Enforced on the server.** The pages only hide controls a person cannot use; each route checks again. A task the caller may not see answers `404`, as if it did not exist, and a refused action answers `403` with code `FORBIDDEN`.
- A task whose owner has been deactivated reads as Unassigned, so it stays visible to whoever holds `tasks.view_all`.

**The limit that matters:** the rest of the CRM (clients, invoices, payments, licences, products, demo requests, settings) has **no per-user access control**: any signed-in user can open all of it. The task module is safe for restricted users from day one; the other pages are not. So **do not create accounts for people who should not see client and billing data** until the later team-rollout phase adds permissions such as `clients.view` and `invoices.view` to this same mechanism and the pages enforce them. For the same reason, the dashboard's recent-activity feed and a client's History tab show task activity (titles, notes and who did what) to **every signed-in user**, whatever their task permissions. The feed leaves out permission changes (`entity_type = 'user'`), because their text names email addresses.

## The database
- **Supabase's public REST API is closed.** Supabase exposes every `public` table to the anon key unless Row Level Security is on. `db/hardening.sql` (run at the end of every `npm run db:sync` / `db:migrate`) turns RLS on for every table with no policies and revokes the `anon` and `authenticated` roles. The app connects as the owner role, which is unaffected.
- Use a **separate Supabase project and different secrets for production**. Never reuse the development database.
- In Supabase, optionally also turn the Data API off: Project Settings → API (or Data API) → disable.

## Before going live
1. Set strong, unique `JWT_SECRET` (`openssl rand -hex 48`) and `RATE_LIMIT_SALT` (`openssl rand -hex 16`) in Vercel, and `JWT_EXPIRES_IN_DAYS=1`. To receive demo requests also set `DEMO_INTAKE_KEY` (`openssl rand -hex 32`, not the development value) and put the same value in the FactoOne server's environment. The app refuses to start in production without `RATE_LIMIT_SALT`.
2. Run `npm run db:sync` against production (this also applies `db/hardening.sql`).
3. Create the admin with `npm run db:seed-admin` using a long, unique password, then delete the `SEED_ADMIN_*` values from every `.env` file.
4. In Vercel add a **rate-limit rule** (Firewall) for `/api/*` (for example 100 requests per minute per IP) a stricter one for `/api/auth/*`, and one for `/api/intake/*` (for example 30 a minute per IP).
5. Turn on Supabase backups and enable two-step sign-in on the Supabase, Vercel and GitHub accounts.
6. Look at `npm run users -- events` now and then for repeated failures or sign-ins from places you don't recognise.

## Known limits
- Apart from the Task Desk's four permissions (see [Per-user permissions](#per-user-permissions)), all staff have the same access and there are no roles. Only create accounts for people who may see and change everything, until the team-rollout phase brings permissions to the other pages.
- The CSP allows inline scripts and styles (Next.js and the UI library need them); it still blocks every other origin.
- There is no second sign-in step, so a leaked password is enough to sign in. Use long unique passwords and turn on two-step sign-in on the Supabase, Vercel and GitHub accounts themselves.

## Website analytics and privacy law (India DPDP Act 2023, GDPR-style rules)

How the design meets the main duties. This is engineering documentation, not legal advice: have a lawyer review the privacy notice (`Dwapar_Edge/src/app/privacy/page.tsx`) before relying on it.

| Duty | What the system does |
|---|---|
| Free, specific, informed consent before processing | Opt-in. Until the visitor presses **Accept**, the tracker does not run and writes nothing to the browser. Accept and Decline are equally prominent. A browser Do Not Track or Global Privacy Control signal counts as Decline |
| Notice | Plain-language banner and `/privacy` notice: what is collected, why, how long, who sees it, rights, contact. Linked from the banner, footer and the demo form |
| Withdraw as easily as given | Footer **Privacy settings** link reopens the choice. Turning it off stops tracking at once, deletes the browser id and asks the server to erase past data; if the request fails it is retried on the next visit |
| Proof of consent | `analytics_visitors.consent_version` / `consent_at`. Changing `CONSENT_VERSION` in the website re-asks everyone who accepted an older notice |
| Data minimisation | No IP address (used in memory for rate-limiting and the location lookup only), no User-Agent string (reduced to browser / OS / device), paths without query strings, no form contents, no free-form event payload, no third-party scripts or cookies |
| Purpose limitation | Used only for website statistics and, when a visitor books a demo, the lead's activity view. Not sold, shared or used for advertising |
| Storage limitation | Erased after `ANALYTICS_RETENTION_DAYS` (default 395). **Schedule `npm run analytics:purge` daily** (cron on a machine holding the database credential, or a scheduled job) |
| Erasure and correction | Self-service erasure on the website; deleting a demo request erases its browser's analytics too; `forgetVisitor()` in `src/features/analytics/service.ts` for a manual request by browser id |
| Security safeguards | Server-to-server key (constant-time check), strict schema validation, size limits, own rate-limit bucket, staff access behind `analytics.view`, all queries parameterised, database closed to the public API |
| Breach duty (DPDP) | Not automated. Keep the process: if analytics or lead data is exposed, notify the Data Protection Board and affected people as the Act requires |

**Left for the business to decide:** name a grievance contact if the law requires one for your size; offer the notice in Gujarati and Hindi (DPDP lets people ask for any scheduled language); check where Supabase and the website host run their servers; record these processors in your data inventory; review whether a demo-request's retention period should be fixed.
