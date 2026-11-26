-- Demo requests can now be deleted for good, which needs the per-user key demo_requests.delete (src/lib/auth/permissions.ts).
-- Every existing login was already trusted with the whole CRM, so each one receives it; accounts created from now on start without it.
-- Run `npm run db:migrate`.
UPDATE users SET permissions = array_append(permissions, 'demo_requests.delete') WHERE NOT ('demo_requests.delete' = ANY(permissions));
