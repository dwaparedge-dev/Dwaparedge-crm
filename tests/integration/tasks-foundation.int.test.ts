import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createTestDb, makeUser, type TestDb } from "./helpers";

// A minimal stand-in for the request's cookie jar (next/headers only works inside a real request).
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
}));

let tdb: TestDb;
beforeAll(async () => {
  tdb = await createTestDb();
});
afterAll(async () => tdb?.drop());

const permissionsOf = async (id: string) => {
  const { db } = await import("@/lib/db");
  return (await db.queryOne<{ permissions: string[] }>("SELECT permissions FROM users WHERE id = $1", [id]))!.permissions;
};

describe("users.permissions", () => {
  it("starts empty for a new account, and the migration gives every existing account all four keys", async () => {
    const { db } = await import("@/lib/db");
    const before = await makeUser("Existing Account");
    expect(await permissionsOf(before.id)).toEqual([]);

    // What `npm run db:migrate` does for an existing database: run the file against rows that already exist.
    await db.query(await readFile(join(process.cwd(), "db", "migrations", "0017_user_permissions.sql"), "utf8"));
    expect(await permissionsOf(before.id)).toEqual([...PERMISSIONS]);

    // An account created after the migration is not granted anything.
    const after = await makeUser("New Account");
    expect(await permissionsOf(after.id)).toEqual([]);
  });

  it("is carried on the signed-in user, re-read on every request, with unknown keys dropped", async () => {
    const { db } = await import("@/lib/db");
    const { getCurrentUser } = await import("@/lib/auth/current-user");
    const { POST } = await import("@/app/api/auth/login/route");
    const u = await makeUser("Signed In");

    jar.clear();
    const origin = "http://localhost:3000";
    const login = new NextRequest(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { origin, host: "localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ email: u.email, password: u.password }),
    });
    expect((await POST(login)).status).toBe(200);
    expect(await getCurrentUser()).toMatchObject({ id: u.id, permissions: [] });

    // Granted after the session started: the very next request sees it. Duplicates and unknown keys are ignored.
    await db.query("UPDATE users SET permissions = $2 WHERE id = $1", [u.id, ["tasks.assign", "tasks.view_all", "tasks.assign", "tasks.fly"]]);
    expect((await getCurrentUser())!.permissions).toEqual(["tasks.view_all", "tasks.assign"]);
  });
});
