import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listPermissions, parsePermissionList, setPermission } from "../../scripts/users-permissions";
import { createTestDb, makeUser, type TestDb } from "./helpers";

let tdb: TestDb;
let pool: pg.Pool;
beforeAll(async () => {
  tdb = await createTestDb();
  // The command line talks to the database through its own pool; here it is pointed at the throwaway schema.
  const url = process.env.DATABASE_URL!;
  const local = url.includes("localhost") || url.includes("127.0.0.1");
  pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, options: `-c search_path=${tdb.schema}` });
});
afterAll(async () => {
  await pool?.end();
  await tdb?.drop();
});

const stored = async (id: string) => (await pool.query<{ permissions: string[] }>("SELECT permissions FROM users WHERE id = $1", [id])).rows[0].permissions;
const logged = async (id: string) =>
  (await pool.query<{ action: string; summary: string; client_id: string | null; actor_id: string | null; metadata: Record<string, unknown> | null }>(
    "SELECT action, summary, client_id, actor_id, metadata FROM activity_log WHERE entity_type = 'user' AND entity_id = $1 ORDER BY id", [id],
  )).rows;

describe("setPermission", () => {
  it("grants a key once; granting it again changes nothing", async () => {
    const u = await makeUser("Grant Twice");
    expect(await setPermission(pool, u.email, "tasks.view_all", true)).toBe("changed");
    expect(await stored(u.id)).toEqual(["tasks.view_all"]);

    expect(await setPermission(pool, u.email, "tasks.view_all", true)).toBe("unchanged");
    expect(await stored(u.id)).toEqual(["tasks.view_all"]);
  });

  it("keeps the keys already held when another is granted", async () => {
    const u = await makeUser("Several");
    await setPermission(pool, u.email, "tasks.assign", true);
    await setPermission(pool, u.email, "tasks.view_all", true);
    expect([...(await stored(u.id))].sort()).toEqual(["tasks.assign", "tasks.view_all"]);
  });

  it("revokes a key; revoking one that is not held changes nothing", async () => {
    const u = await makeUser("Revoke");
    await setPermission(pool, u.email, "tasks.assign", true);
    await setPermission(pool, u.email, "tasks.view_all", true);

    expect(await setPermission(pool, u.email, "tasks.assign", false)).toBe("changed");
    expect(await stored(u.id)).toEqual(["tasks.view_all"]);

    expect(await setPermission(pool, u.email, "tasks.assign", false)).toBe("unchanged");
    expect(await stored(u.id)).toEqual(["tasks.view_all"]);
  });

  it("only touches the user named, and matches the email regardless of case", async () => {
    const a = await makeUser("Target");
    const b = await makeUser("Bystander");
    expect(await setPermission(pool, a.email.toUpperCase(), "tasks.edit_all", true)).toBe("changed");
    expect(await stored(a.id)).toEqual(["tasks.edit_all"]);
    expect(await stored(b.id)).toEqual([]);
    expect(await logged(b.id)).toEqual([]);
  });

  it("rejects an unknown key, naming the valid ones, and changes nothing", async () => {
    const u = await makeUser("Unknown Key");
    await setPermission(pool, u.email, "tasks.assign", true);
    const rowsBefore = await logged(u.id);

    for (const on of [true, false]) {
      await expect(setPermission(pool, u.email, "tasks.fly", on)).rejects.toThrow(/Unknown permission "tasks\.fly".*valid: tasks\.view_all, tasks\.edit_all, tasks\.assign, tasks\.manage_settings/);
    }
    expect(await stored(u.id)).toEqual(["tasks.assign"]);
    expect(await logged(u.id)).toEqual(rowsBefore);
  });

  it("answers no_user for an unknown email and writes nothing", async () => {
    const before = (await pool.query("SELECT count(*)::int AS n FROM activity_log WHERE entity_type = 'user'")).rows[0].n;
    expect(await setPermission(pool, "nobody@test.example", "tasks.view_all", true)).toBe("no_user");
    expect(await setPermission(pool, "nobody@test.example", "tasks.view_all", false)).toBe("no_user");
    expect((await pool.query("SELECT count(*)::int AS n FROM activity_log WHERE entity_type = 'user'")).rows[0].n).toBe(before);
  });

  it("logs each change once, as a command-line change with no actor, and logs nothing when nothing changed", async () => {
    const u = await makeUser("Audited");

    await setPermission(pool, u.email, "tasks.manage_settings", true);
    await setPermission(pool, u.email, "tasks.manage_settings", true); // unchanged: no row
    await setPermission(pool, u.email, "tasks.manage_settings", false);
    await setPermission(pool, u.email, "tasks.manage_settings", false); // unchanged: no row

    const rows = await logged(u.id);
    expect(rows.map((r) => r.action)).toEqual(["permission_granted", "permission_revoked"]);
    for (const r of rows) {
      expect(r.actor_id).toBeNull();
      expect(r.client_id).toBeNull();
      expect(r.metadata).toEqual({ permission: "tasks.manage_settings", via: "command line" });
      expect(r.summary).toContain("tasks.manage_settings");
      expect(r.summary).toContain(u.email);
    }
  });
});

describe("listPermissions", () => {
  it("lists the keys held in the canonical order, an empty list for a new account, and null for an unknown email", async () => {
    const u = await makeUser("Listed");
    expect(await listPermissions(pool, u.email)).toEqual([]);

    await setPermission(pool, u.email, "tasks.manage_settings", true);
    await setPermission(pool, u.email, "tasks.view_all", true);
    expect(await listPermissions(pool, u.email.toUpperCase())).toEqual(["tasks.view_all", "tasks.manage_settings"]);

    expect(await listPermissions(pool, "nobody@test.example")).toBeNull();
  });
});

describe("parsePermissionList", () => {
  it("splits a comma list, ignoring spaces and repeats", () => {
    expect(parsePermissionList("tasks.assign, tasks.view_all,tasks.assign")).toEqual(["tasks.assign", "tasks.view_all"]);
    expect(parsePermissionList(PERMISSIONS.join(","))).toEqual([...PERMISSIONS]);
  });

  it("rejects an unknown key or an empty list", () => {
    expect(() => parsePermissionList("tasks.assign,tasks.fly")).toThrow(/Unknown permission "tasks\.fly"/);
    expect(() => parsePermissionList("")).toThrow(/at least one permission/);
    expect(() => parsePermissionList(" , ")).toThrow(/at least one permission/);
  });
});
