-- Licenses are revoked, never deleted.
CREATE OR REPLACE FUNCTION guard_license_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Licenses cannot be deleted; revoke them instead' USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS licenses_guard_delete ON licenses;
CREATE TRIGGER licenses_guard_delete BEFORE DELETE ON licenses FOR EACH ROW EXECUTE FUNCTION guard_license_delete();
