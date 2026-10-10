# Security notes

## How access is controlled
- **Every page and API route needs a signed-in staff user.** `src/proxy.ts` redirects pages and answers `401` for the API as a first gate; each route handler then calls `requireUser()`, which re-reads the user row (active, token version). The only open endpoints are `POST /api/auth/login` and the manifest and icons.
- **Session:** a JWT (HS256, algorithm pinned) in an `httpOnly`, `SameSite=Lax`, `Secure` cookie. In production the cookie is named `__Host-de_session`, so a browser only accepts it from this exact host over HTTPS. Signing out, changing the password, or deactivating a user bumps `token_version`, which ends every session of that user at once.
- **Idle sign-out:** a browser signs itself out after 30 minutes without activity (other devices are not affected). Set `JWT_EXPIRES_IN_DAYS=1` in production.
- **Passwords:** bcrypt (12 rounds), 12 to 72 bytes, no common passwords, nothing built from your email name. Unknown emails cost the same time as known ones and the error never says which part was wrong.
- **Brute force:** at most 5 failed sign-ins per email-and-address pair, 25 per email and 20 per address in 15 minutes, then `429` (a stranger cannot lock the real user out from another address). Password changes have the same kind of limit. The keys are salted hashes (`RATE_LIMIT_SALT`).
- **Flooding:** the proxy limits each address per instance (300 reads, 90 writes, 30 auth calls a minute). Instances do not share memory, so also add the Vercel Firewall rule below.
- **CSRF:** every state-changing request must be same-origin (Origin must match Host) and `application/json`.
- **Injection:** every value goes to Postgres as a bound parameter. Sort columns come from fixed lists, and the only interpolated identifiers (dropdown options) come from a whitelist.
- **Validation:** every input is checked with Zod (ids are UUIDs, pages are capped at 100 rows, text has length limits).
- **Errors:** unexpected failures return a generic `500`; details only go to the server log.
- **Audit trail:** `security_events` records sign-ins (ok, failed, locked), password changes and sign-outs with address and browser, kept 180 days. Read it with `npm run users -- events [--email ...]`.
- **Browser hardening:** CSP (no third-party origins, no framing), HSTS, `nosniff`, `X-Frame-Options: DENY`, referrer and permissions policies, COOP/CORP, and `Cache-Control: private, no-store` on all `/api` responses.
- **Supply chain:** CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and `npm audit` on every push.

## The database
- **Supabase's public REST API is closed.** Supabase exposes every `public` table to the anon key unless Row Level Security is on. `db/hardening.sql` (run at the end of every `npm run db:sync` / `db:migrate`) turns RLS on for every table with no policies and revokes the `anon` and `authenticated` roles. The app connects as the owner role, which is unaffected.
- Use a **separate Supabase project and different secrets for production**. Never reuse the development database.
- In Supabase, optionally also turn the Data API off: Project Settings → API (or Data API) → disable.

## Before going live
1. Set strong, unique `JWT_SECRET` (`openssl rand -hex 48`) and `RATE_LIMIT_SALT` (`openssl rand -hex 16`) in Vercel, and `JWT_EXPIRES_IN_DAYS=1`. The app refuses to start in production without `RATE_LIMIT_SALT`.
2. Run `npm run db:sync` against production (this also applies `db/hardening.sql`).
3. Create the admin with `npm run db:seed-admin` using a long, unique password, then delete the `SEED_ADMIN_*` values from every `.env` file.
4. In Vercel add a **rate-limit rule** (Firewall) for `/api/*` (for example 100 requests per minute per IP) and a stricter one for `/api/auth/*`.
5. Turn on Supabase backups and enable two-step sign-in on the Supabase, Vercel and GitHub accounts.
6. Look at `npm run users -- events` now and then for repeated failures or sign-ins from places you don't recognise.

## Known limits
- All staff have the same access (there are no roles). Only create accounts for people who may see and change everything.
- The CSP allows inline scripts and styles (Next.js and the UI library need them); it still blocks every other origin.
- There is no second sign-in step, so a leaked password is enough to sign in. Use long unique passwords and turn on two-step sign-in on the Supabase, Vercel and GitHub accounts themselves.
