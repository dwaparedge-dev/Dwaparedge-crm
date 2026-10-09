-- Re-applied after every `npm run db:migrate` (idempotent).
--
-- On Supabase every table in the public schema is also reachable through its REST API with the public
-- "anon" key. This app never uses that API (it talks to Postgres directly as the owner role), so close it:
--  * row level security ON for every table, with no policies = deny for any role that does not bypass RLS
--    (the owner/pooler role the app connects as does bypass it, so the app is unaffected)
--  * no table, sequence or function privileges for the anon / authenticated API roles
-- On plain Postgres those roles do not exist and only the RLS part applies.
DO $$
DECLARE
  t record;
  r text;
  s text := current_schema();
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = s LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', s, t.tablename);
  END LOOP;

  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I', s, r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I', s, r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM %I', s, r);
      -- Objects created later by this role must not be handed to the API roles either.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM %I', s, r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM %I', s, r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON FUNCTIONS FROM %I', s, r);
    END IF;
  END LOOP;
END $$;
