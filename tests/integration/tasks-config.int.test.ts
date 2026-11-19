import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import type { ConfigKind } from "@/features/tasks/config-service";
import { createTestDb, expectAppError, makeUser, uniq, type TestDb } from "./helpers";

// A minimal stand-in for the request's cookie jar (next/headers only works inside a real request).
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
}));

const ORIGIN = "http://localhost:3000";
const hdrs = (extra: Record<string, string> = {}) => ({ origin: ORIGIN, host: "localhost:3000", "content-type": "application/json", ...extra });
const req = (path: string, method = "GET", body?: unknown, headers = hdrs()) =>
  new NextRequest(`${ORIGIN}${path}`, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
const MISSING = "6b1a9d5e-8c43-4f5b-9d39-0f3f3b0f2f11";

let tdb: TestDb;
/** Holds all four task permissions, as both founders do. */
let founder: CurrentUser;
/** Holds no permission at all, as a new account does. */
let nobody: CurrentUser;
/** Holds every task permission except the one that matters here. */
let almost: CurrentUser;

async function actor(name: string, permissions: CurrentUser["permissions"]): Promise<CurrentUser> {
  const u = await makeUser(name);
  return { id: u.id, name, email: u.email, permissions };
}

beforeAll(async () => {
  tdb = await createTestDb();
  founder = await actor("Founder One", [...PERMISSIONS]);
  nobody = await actor("New Account", []);
  almost = await actor("Almost Admin", PERMISSIONS.filter((p) => p !== "tasks.manage_settings"));
});
afterAll(async () => tdb?.drop());

const KINDS: Record<ConfigKind, { noun: string; entity: string; table: string; seeded: string[] }> = {
  categories: {
    noun: "category", entity: "task_category", table: "task_categories",
    seeded: ["sales_leads", "collections", "billing", "licences", "clients_support", "delivery", "finance_compliance", "admin_hiring"],
  },
  priorities: { noun: "priority", entity: "task_priority", table: "task_priorities", seeded: ["critical", "high", "normal", "low"] },
};

/** Creates a row the way the route does: the body goes through the kind's schema first. */
async function create(kind: ConfigKind, body: Record<string, unknown>, by = founder): Promise<string> {
  const { createConfig } = await import("@/features/tasks/config-service");
  const { createCategorySchema, createPrioritySchema } = await import("@/features/tasks/config-schema");
  const input = kind === "categories" ? createCategorySchema.parse({ colour: "#123abc", ...body }) : createPrioritySchema.parse({ colour: "#123abc", rank: 5, ...body });
  return (await createConfig(kind, input, by)).id;
}

async function update(kind: ConfigKind, id: string, body: Record<string, unknown>, by = founder) {
  const { updateConfig } = await import("@/features/tasks/config-service");
  const { updateCategorySchema, updatePrioritySchema } = await import("@/features/tasks/config-schema");
  return updateConfig(kind, id, kind === "categories" ? updateCategorySchema.parse(body) : updatePrioritySchema.parse(body), by);
}

const remove = async (kind: ConfigKind, id: string, by = founder) => (await import("@/features/tasks/config-service")).deleteConfig(kind, id, by);
const all = async (kind: ConfigKind) => (await import("@/features/tasks/config-service")).listConfig(kind, { includeInactive: true });
const visible = async (kind: ConfigKind) => (await import("@/features/tasks/config-service")).listConfig(kind, { includeInactive: false });
const find = async (kind: ConfigKind, id: string) => (await all(kind)).find((r) => r.id === id);

const history = async (kind: ConfigKind, id: string) => {
  const { db } = await import("@/lib/db");
  return db.query<{ action: string; summary: string; actor_id: string | null; client_id: string | null; metadata: { changes?: Record<string, { from: unknown; to: unknown }> } | null }>(
    "SELECT action, summary, actor_id, client_id, metadata FROM activity_log WHERE entity_type = $1 AND entity_id = $2 ORDER BY id", [KINDS[kind].entity, id],
  );
};

/** One custom row per kind for a task's other column, so no starter row is ever used by these tests. */
const pads = new Map<ConfigKind, string>();
async function pad(kind: ConfigKind) {
  if (!pads.has(kind)) pads.set(kind, await create(kind, { name: "Task pad" }));
  return pads.get(kind)!;
}

/** A task that points at the given row, so the row is in use. */
async function useInATask(kind: ConfigKind, id: string) {
  const { db } = await import("@/lib/db");
  const [categoryId, priorityId] = kind === "categories" ? [id, await pad("priorities")] : [await pad("categories"), id];
  await db.query("INSERT INTO tasks (title, category_id, priority_id) VALUES ($1, $2, $3)", [uniq("Task"), categoryId, priorityId]);
}

describe.each(["categories", "priorities"] as const)("task %s", (kind) => {
  const { noun, seeded } = KINDS[kind];

  it("lists the starter rows for anyone, in picker order, none of them in use yet, each with the fields of its kind", async () => {
    // Rows other tests add are custom; only the starter rows are checked here.
    const rows = (await all(kind)).filter((r) => r.is_system);
    expect(rows.map((r) => r.key)).toEqual(seeded);
    expect((await visible(kind)).filter((r) => r.is_system).map((r) => r.key)).toEqual(seeded);
    expect(rows.every((r) => r.is_active && !r.in_use && /^#[0-9a-f]{6}$/.test(r.colour))).toBe(true);
    expect(rows.map((r) => r.sort_order)).toEqual([...rows.map((r) => r.sort_order)].sort((a, b) => a - b));
    if (kind === "categories") {
      expect(rows.find((r) => r.key === "collections")).toMatchObject({ name: "Collections", default_follow_up_days: 3 });
      expect(rows.find((r) => r.key === "billing")).toMatchObject({ default_follow_up_days: null });
    } else {
      expect(rows.map((r) => [r.key, (r as { rank: number }).rank])).toEqual([["critical", 1], ["high", 2], ["normal", 3], ["low", 4]]);
    }
  });

  it("turns away a user who lacks tasks.manage_settings, on every write, and changes nothing", async () => {
    const before = await all(kind);
    const target = before[0]!.id;
    for (const who of [nobody, almost]) {
      await expectAppError(create(kind, { name: uniq("Nope") }, who), 403, "FORBIDDEN");
      await expectAppError(update(kind, target, { name: "Renamed" }, who), 403, "FORBIDDEN");
      await expectAppError(update(kind, target, { isActive: false }, who), 403, "FORBIDDEN");
      await expectAppError(remove(kind, target, who), 403, "FORBIDDEN");
    }
    // The permission is checked first, so a missing id reveals nothing to a user who may not write.
    await expectAppError(update(kind, MISSING, { name: "x" }, nobody), 403, "FORBIDDEN");
    await expectAppError(remove(kind, MISSING, nobody), 403, "FORBIDDEN");
    expect(await all(kind)).toEqual(before);
  });

  it("adds a row: cleaned name, lower-case colour, slug key, after the last row or where it is asked to go", async () => {
    const lastOrder = Math.max(...(await all(kind)).map((r) => r.sort_order));
    const a = await create(kind, { name: "  Fast \u0000 Track ", colour: "#ABCDEF" });
    const b = await create(kind, { name: "Fast-Track", sortOrder: 5 }); // the same slug: the key gets a numeric suffix
    const c = await create(kind, { name: "★★★" }); // no letters or digits to make a slug from
    const rows = await all(kind);
    expect(rows.find((r) => r.id === a)).toMatchObject({
      key: "fast_track", name: "Fast Track", colour: "#abcdef", sort_order: lastOrder + 10, is_active: true, is_system: false, in_use: false,
    });
    expect(rows.find((r) => r.id === b)).toMatchObject({ key: "fast_track_2", name: "Fast-Track", sort_order: 5 });
    expect(rows.find((r) => r.id === c)).toMatchObject({ key: noun });

    const [entry, ...rest] = await history(kind, a);
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({ action: "created", actor_id: founder.id, client_id: null, metadata: { key: "fast_track" } });
    expect(entry!.summary).toBe(`Added task ${noun} "Fast Track"`);
  });

  it("keeps a row's key when it is renamed, so a new row with the old name gets a new key", async () => {
    const id = await create(kind, { name: "Old Name" });
    await update(kind, id, { name: "New Name" });
    const again = await create(kind, { name: "Old Name" });
    const rows = await all(kind);
    expect(rows.find((r) => r.id === id)).toMatchObject({ key: "old_name", name: "New Name" });
    expect(rows.find((r) => r.id === again)).toMatchObject({ key: "old_name_2", name: "Old Name" });
    expect((await history(kind, id))[1]).toMatchObject({ action: "updated", summary: `Renamed task ${noun} "Old Name" to "New Name"` });
  });

  it("keeps names unique whatever the case or spacing, hidden rows included (409 DUPLICATE)", async () => {
    const a = await create(kind, { name: "Billing Desk" });
    const other = await create(kind, { name: "Other Desk" });
    const starter = (await all(kind)).find((r) => r.key === seeded[0])!;
    const before = (await all(kind)).length;

    await expectAppError(create(kind, { name: "billing   DESK" }), 409, "DUPLICATE");
    await expectAppError(create(kind, { name: starter.name.toUpperCase() }), 409, "DUPLICATE");
    await update(kind, a, { isActive: false });
    await expectAppError(create(kind, { name: "billing desk" }), 409, "DUPLICATE", /hidden/);
    await expectAppError(update(kind, other, { name: "BILLING desk" }), 409, "DUPLICATE");
    await update(kind, a, { name: "BILLING DESK" }); // a row may change the case of its own name

    const rows = await all(kind);
    expect(rows).toHaveLength(before);
    expect(rows.find((r) => r.id === a)!.name).toBe("BILLING DESK");
    expect(rows.find((r) => r.id === other)!.name).toBe("Other Desk");
  });

  it("renames, recolours, reorders, hides and shows a row, and writes each change to the history", async () => {
    const id = await create(kind, { name: "Audit Me", colour: "#111111", sortOrder: 500 });

    await update(kind, id, { name: "Audited", colour: "#FF00AA", sortOrder: 0 });
    expect(await find(kind, id)).toMatchObject({ key: "audit_me", name: "Audited", colour: "#ff00aa", sort_order: 0 });
    expect((await visible(kind))[0]!.id).toBe(id); // reordered to the front

    // A hidden row is left out of the pickers, not deleted.
    await update(kind, id, { isActive: false });
    expect((await visible(kind)).map((r) => r.id)).not.toContain(id);
    expect(await find(kind, id)).toMatchObject({ is_active: false });
    await update(kind, id, { isActive: true });
    expect((await visible(kind)).map((r) => r.id)).toContain(id);

    const log = await history(kind, id);
    expect(log.map((h) => h.action)).toEqual(["created", "updated", "updated", "updated"]);
    expect(log.every((h) => h.actor_id === founder.id)).toBe(true);
    expect(log[1]).toMatchObject({
      summary: `Updated task ${noun} "Audited" (name, colour, order)`,
      metadata: { changes: { name: { from: "Audit Me", to: "Audited" }, colour: { from: "#111111", to: "#ff00aa" }, sortOrder: { from: 500, to: 0 } } },
    });
    expect(log[2]!.summary).toBe(`Hid task ${noun} "Audited"`);
    expect(log[3]!.summary).toBe(`Showed task ${noun} "Audited"`);

    // Sending the values it already has changes nothing and writes nothing.
    const { db } = await import("@/lib/db");
    const stamp = await db.queryOne(`SELECT updated_at FROM ${KINDS[kind].table} WHERE id = $1`, [id]);
    await update(kind, id, { name: "Audited", colour: "#ff00aa", isActive: true });
    expect(await history(kind, id)).toHaveLength(4);
    expect(await db.queryOne(`SELECT updated_at FROM ${KINDS[kind].table} WHERE id = $1`, [id])).toEqual(stamp);
  });

  it("lets a starter row be renamed, recoloured and hidden, but never deleted, so the seeds cannot bring one back", async () => {
    const starter = (await all(kind)).find((r) => r.key === seeded[1])!;
    await update(kind, starter.id, { name: "Renamed Starter", colour: "#000000", isActive: false });
    expect(await find(kind, starter.id)).toMatchObject({ key: seeded[1], name: "Renamed Starter", colour: "#000000", is_active: false, is_system: true });
    expect((await visible(kind)).map((r) => r.id)).not.toContain(starter.id);
    await update(kind, starter.id, { name: starter.name, colour: starter.colour, isActive: true });

    // Every starter row is protected, including the ones the auto-tasks do not use.
    for (const key of [seeded[1], seeded.at(-1)!]) {
      const id = (await all(kind)).find((r) => r.key === key)!.id;
      await expectAppError(remove(kind, id), 409, "PROTECTED", /hidden but not deleted/);
    }
    expect((await all(kind)).map((r) => r.key)).toEqual(expect.arrayContaining(seeded));
  });

  it("refuses to delete a row a task uses, but still lets it be hidden", async () => {
    const id = await create(kind, { name: "Busy Row" });
    expect(await find(kind, id)).toMatchObject({ in_use: false });
    await useInATask(kind, id);
    expect(await find(kind, id)).toMatchObject({ in_use: true });

    await update(kind, id, { isActive: false });
    expect(await find(kind, id)).toMatchObject({ is_active: false, in_use: true });
    await expectAppError(remove(kind, id), 409, "IN_USE", /Hide it/);
    expect(await find(kind, id)).toBeTruthy();
  });

  it("deletes a custom row nothing uses, writes it to the history and frees the name", async () => {
    const id = await create(kind, { name: "Throwaway" });
    await update(kind, id, { isActive: false });
    await remove(kind, id);

    expect(await find(kind, id)).toBeUndefined();
    const log = await history(kind, id);
    expect(log.map((h) => h.action)).toEqual(["created", "updated", "deleted"]);
    expect(log[2]).toMatchObject({ actor_id: founder.id, summary: `Deleted task ${noun} "Throwaway"`, metadata: { key: "throwaway" } });
    await expect(create(kind, { name: "Throwaway" })).resolves.toBeTruthy();

    await expectAppError(update(kind, MISSING, { name: "x" }), 404, "NOT_FOUND");
    await expectAppError(remove(kind, MISSING), 404, "NOT_FOUND");
  });

  it("makes one row when the same name arrives at once, and distinct keys for different names that slug alike", async () => {
    const before = (await all(kind)).length;
    const same = await Promise.allSettled(Array.from({ length: 3 }, () => create(kind, { name: "Race Condition" })));
    expect(same.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of same.filter((x) => x.status === "rejected")) expect(r.reason).toMatchObject({ status: 409, code: "DUPLICATE" });

    const alike = await Promise.all(["Slug A", "Slug-A", "Slug.A"].map((name) => create(kind, { name })));
    const rows = await all(kind);
    expect(rows).toHaveLength(before + 1 + 3);
    expect(rows.filter((r) => alike.includes(r.id)).map((r) => r.key).sort()).toEqual(["slug_a", "slug_a_2", "slug_a_3"]);
  });
});

describe("a category's default follow-up", () => {
  it("is none when left out, then set, changed and cleared with null", async () => {
    const id = await create("categories", { name: "Cadence" });
    expect(await find("categories", id)).toMatchObject({ default_follow_up_days: null });
    await update("categories", id, { defaultFollowUpDays: 10 });
    expect(await find("categories", id)).toMatchObject({ default_follow_up_days: 10 });
    await update("categories", id, { defaultFollowUpDays: null });
    expect(await find("categories", id)).toMatchObject({ default_follow_up_days: null });
    expect((await history("categories", id)).at(-1)!.metadata).toEqual({ changes: { defaultFollowUpDays: { from: 10, to: null } } });

    const given = await create("categories", { name: "Cadence Given", defaultFollowUpDays: 5 });
    expect(await find("categories", given)).toMatchObject({ default_follow_up_days: 5 });
  });
});

describe("a priority's rank", () => {
  it("is set when added and changed, and is separate from the picker order", async () => {
    const id = await create("priorities", { name: "Escalated", rank: 1, sortOrder: 999 });
    expect(await find("priorities", id)).toMatchObject({ rank: 1, sort_order: 999 });
    await update("priorities", id, { rank: 7 });
    expect(await find("priorities", id)).toMatchObject({ rank: 7, sort_order: 999 });
    expect((await history("priorities", id)).at(-1)!.metadata).toEqual({ changes: { rank: { from: 1, to: 7 } } });
  });
});

describe("the routes", () => {
  const ROUTES = {
    categories: {
      path: "/api/task-categories",
      list: () => import("@/app/api/task-categories/route"),
      one: () => import("@/app/api/task-categories/[id]/route"),
      body: (name: string) => ({ name, colour: "#336699", defaultFollowUpDays: 4 }),
    },
    priorities: {
      path: "/api/task-priorities",
      list: () => import("@/app/api/task-priorities/route"),
      one: () => import("@/app/api/task-priorities/[id]/route"),
      body: (name: string) => ({ name, colour: "#336699", rank: 2 }),
    },
  } as const;

  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  async function login(user: CurrentUser) {
    const { db } = await import("@/lib/db");
    await db.query("UPDATE users SET permissions = $2 WHERE id = $1", [user.id, user.permissions]);
    // makeUser gave every account the same password.
    jar.clear();
    const { POST } = await import("@/app/api/auth/login/route");
    expect((await POST(req("/api/auth/login", "POST", { email: user.email, password: "a-very-long-password" }))).status).toBe(200);
  }

  describe.each(["categories", "priorities"] as const)("/api/task-%s", (kind) => {
    const r = ROUTES[kind];

    it("turn an anonymous caller away on every method", async () => {
      jar.clear();
      const keep = (await all(kind))[0]!;
      const { GET, POST } = await r.list();
      const { PATCH, DELETE } = await r.one();
      expect((await GET(req(r.path))).status).toBe(401);
      expect((await POST(req(r.path, "POST", r.body(uniq("Anon"))))).status).toBe(401);
      expect((await PATCH(req(`${r.path}/${keep.id}`, "PATCH", { name: "x" }), params(keep.id))).status).toBe(401);
      expect((await DELETE(req(`${r.path}/${keep.id}`, "DELETE"), params(keep.id))).status).toBe(401);
      expect((await find(kind, keep.id))!.name).toBe(keep.name);
    });

    it("check the origin and the content type before anything else, on every write", async () => {
      await login(founder);
      const before = await all(kind);
      const keep = before[0]!.id;
      const { POST } = await r.list();
      const { PATCH, DELETE } = await r.one();
      const evil = hdrs({ origin: "http://evil.example" });
      const text = hdrs({ "content-type": "text/plain" });

      expect((await POST(req(r.path, "POST", r.body(uniq("Evil")), evil))).status).toBe(403);
      expect((await PATCH(req(`${r.path}/${keep}`, "PATCH", { name: "evil" }, evil), params(keep))).status).toBe(403);
      expect((await DELETE(req(`${r.path}/${keep}`, "DELETE", {}, evil), params(keep))).status).toBe(403);
      expect((await POST(req(r.path, "POST", r.body(uniq("Text")), text))).status).toBe(415);
      expect((await PATCH(req(`${r.path}/${keep}`, "PATCH", { name: "text" }, text), params(keep))).status).toBe(415);
      expect((await DELETE(req(`${r.path}/${keep}`, "DELETE", {}, text), params(keep))).status).toBe(415);

      // Refused before the session is even looked at.
      jar.clear();
      expect((await POST(req(r.path, "POST", r.body(uniq("Evil")), evil))).status).toBe(403);
      expect(await all(kind)).toEqual(before);
    });

    it("let any signed-in user read the list, and refuse a user without tasks.manage_settings every write with FORBIDDEN", async () => {
      await login(nobody);
      const keep = (await all(kind))[0]!;
      const { GET, POST } = await r.list();
      const { PATCH, DELETE } = await r.one();

      const listed = await GET(req(r.path));
      expect(listed.status).toBe(200);
      expect((await listed.json()).items.map((x: { id: string }) => x.id)).toContain(keep.id);

      for (const res of [
        await POST(req(r.path, "POST", r.body(uniq("Denied")))),
        await PATCH(req(`${r.path}/${keep.id}`, "PATCH", { name: "Denied" }), params(keep.id)),
        await DELETE(req(`${r.path}/${keep.id}`, "DELETE"), params(keep.id)),
      ]) {
        expect(res.status).toBe(403);
        expect((await res.json()).error.code).toBe("FORBIDDEN");
      }
      expect((await find(kind, keep.id))!.name).toBe(keep.name);
    });

    it("let a user with tasks.manage_settings add, list, change and delete, and answer errors with the right status", async () => {
      await login(founder);
      const { GET, POST } = await r.list();
      const { PATCH, DELETE } = await r.one();
      const name = uniq("Managed");

      const created = await POST(req(r.path, "POST", r.body(name)));
      expect(created.status).toBe(201);
      const { id } = await created.json();
      expect(await find(kind, id)).toMatchObject({ name, key: expect.stringMatching(/^managed/), is_system: false });

      expect((await PATCH(req(`${r.path}/${id}`, "PATCH", { name: `${name} v2`, colour: "#ABCDEF" }), params(id))).status).toBe(200);
      expect(await find(kind, id)).toMatchObject({ name: `${name} v2`, colour: "#abcdef" });

      // Hidden rows come back only with all=true.
      expect((await PATCH(req(`${r.path}/${id}`, "PATCH", { isActive: false }), params(id))).status).toBe(200);
      const defaults = await (await GET(req(r.path))).json();
      const everything = await (await GET(req(`${r.path}?all=true`))).json();
      expect(defaults.items.map((x: { id: string }) => x.id)).not.toContain(id);
      expect(everything.items.map((x: { id: string }) => x.id)).toContain(id);
      expect(everything.items[0]).toEqual(expect.objectContaining({ in_use: expect.any(Boolean), is_system: expect.any(Boolean) }));

      // Input the schemas refuse never reaches the database.
      expect((await GET(req(`${r.path}?all=maybe`))).status).toBe(422);
      expect((await POST(req(r.path, "POST", { ...r.body(uniq("x")), colour: "blue" }))).status).toBe(422);
      expect((await POST(req(r.path, "POST", { colour: "#336699" }))).status).toBe(422);
      expect((await POST(req(r.path, "POST", r.body("x".repeat(61))))).status).toBe(422);
      expect((await PATCH(req(`${r.path}/${id}`, "PATCH", {}), params(id))).status).toBe(422);
      expect((await PATCH(req(`${r.path}/nope`, "PATCH", { name: "x" }), params("nope"))).status).toBe(422);
      expect((await DELETE(req(`${r.path}/nope`, "DELETE"), params("nope"))).status).toBe(422);

      // Conflicts and missing rows.
      expect((await PATCH(req(`${r.path}/${MISSING}`, "PATCH", { name: "x" }), params(MISSING))).status).toBe(404);
      expect((await DELETE(req(`${r.path}/${MISSING}`, "DELETE"), params(MISSING))).status).toBe(404);
      const dup = await POST(req(r.path, "POST", r.body(`${name.toUpperCase()} V2`)));
      expect(dup.status).toBe(409);
      expect((await dup.json()).error.code).toBe("DUPLICATE");
      const starter = (await all(kind)).find((x) => x.is_system)!;
      const protectedRow = await DELETE(req(`${r.path}/${starter.id}`, "DELETE"), params(starter.id));
      expect(protectedRow.status).toBe(409);
      expect((await protectedRow.json()).error.code).toBe("PROTECTED");
      const busy = await create(kind, { name: uniq("Busy") });
      await useInATask(kind, busy);
      const inUse = await DELETE(req(`${r.path}/${busy}`, "DELETE"), params(busy));
      expect(inUse.status).toBe(409);
      expect((await inUse.json()).error.code).toBe("IN_USE");

      // An unused custom row goes.
      expect((await DELETE(req(`${r.path}/${id}`, "DELETE"), params(id))).status).toBe(200);
      expect(await find(kind, id)).toBeUndefined();
    });
  });
});
