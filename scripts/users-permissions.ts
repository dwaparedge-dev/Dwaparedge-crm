/**
 * Per-user permission changes for `scripts/users.ts`. Kept apart so tests can run them against a throwaway schema:
 * every function takes the database handle (a pg Pool or Client) as its first argument and never opens a connection itself.
 */
import type { QueryResult, QueryResultRow } from "pg";
import { cleanPermissions, isPermission, PERMISSIONS, type Permission } from "../src/lib/auth/permissions";

/** What a pg Pool, Client or PoolClient all offer. */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

const unknownPermission = (key: string) => new Error(`Unknown permission "${key}" (valid: ${PERMISSIONS.join(", ")})`);

/** Reads `--grant a,b`: trims, drops repeats, and refuses unknown keys or an empty list. */
export function parsePermissionList(value: string): Permission[] {
  const keys = [...new Set(value.split(",").map((k) => k.trim()).filter(Boolean))];
  if (keys.length === 0) throw new Error(`Give at least one permission (valid: ${PERMISSIONS.join(", ")})`);
  return keys.map((k) => {
    if (!isPermission(k)) throw unknownPermission(k);
    return k;
  });
}

// One statement each, so the change and its activity_log row succeed or fail together without a transaction.
// The WHERE clause is the idempotence guard: a key already held (or already absent) matches no row, so nothing is written.
// The command line has no signed-in actor: actor_id stays NULL and the metadata says where the change came from.
const GRANT = `
  WITH changed AS (
    UPDATE users SET permissions = array_append(permissions, $2::text), updated_at = now()
    WHERE lower(email) = lower($1) AND NOT (permissions @> ARRAY[$2::text])
    RETURNING id, email
  )
  INSERT INTO activity_log (entity_type, entity_id, action, summary, actor_id, metadata)
  SELECT 'user', id, 'permission_granted', format('Granted %s to %s', $2::text, email), NULL, $3::jsonb FROM changed
  RETURNING entity_id`;

const REVOKE = `
  WITH changed AS (
    UPDATE users SET permissions = array_remove(permissions, $2::text), updated_at = now()
    WHERE lower(email) = lower($1) AND permissions @> ARRAY[$2::text]
    RETURNING id, email
  )
  INSERT INTO activity_log (entity_type, entity_id, action, summary, actor_id, metadata)
  SELECT 'user', id, 'permission_revoked', format('Revoked %s from %s', $2::text, email), NULL, $3::jsonb FROM changed
  RETURNING entity_id`;

/**
 * Grants (`on`) or revokes one permission for the user with this email, and records it in activity_log.
 * "unchanged" means the user already was in that state; "no_user" means no account has that email.
 */
export async function setPermission(db: Queryable, email: string, permission: string, on: boolean): Promise<"changed" | "unchanged" | "no_user"> {
  if (!isPermission(permission)) throw unknownPermission(permission);
  const metadata = JSON.stringify({ permission, via: "command line" });
  const r = await db.query(on ? GRANT : REVOKE, [email, permission, metadata]);
  if (r.rowCount) return "changed";
  const exists = await db.query("SELECT 1 FROM users WHERE lower(email) = lower($1)", [email]);
  return exists.rowCount ? "unchanged" : "no_user";
}

/** The permissions held by the user with this email, in the canonical order; null when no account has that email. */
export async function listPermissions(db: Queryable, email: string): Promise<Permission[] | null> {
  const r = await db.query<{ permissions: string[] }>("SELECT permissions FROM users WHERE lower(email) = lower($1)", [email]);
  return r.rows[0] ? cleanPermissions(r.rows[0].permissions) : null;
}
