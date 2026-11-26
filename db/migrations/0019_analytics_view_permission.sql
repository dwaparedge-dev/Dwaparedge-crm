-- Website analytics (visitors, locations, pages, campaigns) is gated by the per-user key analytics.view (src/lib/auth/permissions.ts).
-- Every existing login was already trusted with the whole CRM, so each one receives it; accounts created from now on start without it.
-- Revoke it for anyone who should not see visitor data: npm run users -- revoke --email x --permission analytics.view
-- Run `npm run db:migrate`.
UPDATE users SET permissions = array_append(permissions, 'analytics.view') WHERE NOT ('analytics.view' = ANY(permissions));
