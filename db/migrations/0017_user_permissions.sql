-- Accounts now carry per-user permission keys (users.permissions, see src/lib/auth/permissions.ts). Every existing login was
-- already trusted with the whole CRM, so each one receives all four task-desk keys; accounts created from now on start with none.
-- Run `npm run db:sync` first (it adds users.permissions), then `npm run db:migrate`.
UPDATE users SET permissions = ARRAY['tasks.view_all', 'tasks.edit_all', 'tasks.assign', 'tasks.manage_settings'];
