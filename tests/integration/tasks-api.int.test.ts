import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { SECTION_ORDER } from "@/features/tasks/sections";
import { createTestDb, makeUser, uniq, type TestDb } from "./helpers";

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
const hdrs = (extra: Record<string, string> = {}): Record<string, string> => ({ origin: ORIGIN, host: "localhost:3000", "content-type": "application/json", ...extra });
const req = (path: string, method = "GET", body?: unknown, headers = hdrs()) =>
  new NextRequest(`${ORIGIN}${path}`, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
const evil = hdrs({ origin: "http://evil.example" });
const notJson = hdrs({ "content-type": "text/plain" });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const MISSING = "6b1a9d5e-8c43-4f5b-9d39-0f3f3b0f2f11";
const DAY_MS = 86_400_000;
/** A follow-up time a couple of days ahead, with the explicit offset the schema asks for. */
const inTwoDays = () => new Date(Date.now() + 2 * DAY_MS).toISOString();

interface Account {
  id: string;
  name: string;
  email: string;
  password: string;
}

let tdb: TestDb;
/** Holds every task permission. */
let founder: Account;
/** Holds none, as a new account does. */
let nobody: Account;
/** Another account with none. */
let other: Account;
let collections: string;
let normal: string;
let high: string;

async function account(name: string, permissions: readonly string[]): Promise<Account> {
  const { db } = await import("@/lib/db");
  const u = await makeUser(name);
  if (permissions.length) await db.query("UPDATE users SET permissions = $2 WHERE id = $1", [u.id, [...permissions]]);
  return { ...u, name };
}

beforeAll(async () => {
  tdb = await createTestDb();
  const { db } = await import("@/lib/db");
  const id = async (table: string, key: string) => (await db.queryOne<{ id: string }>(`SELECT id FROM ${table} WHERE key = $1`, [key]))!.id;
  collections = await id("task_categories", "collections");
  normal = await id("task_priorities", "normal");
  high = await id("task_priorities", "high");
  founder = await account("Founder One", PERMISSIONS);
  nobody = await account("New Account", []);
  other = await account("Other Staff", []);
});
afterAll(async () => tdb?.drop());

/** Signs in through the real login route, so the session cookie is the one production issues. */
async function login(u: Account) {
  jar.clear();
  const { POST } = await import("@/app/api/auth/login/route");
  expect((await POST(req("/api/auth/login", "POST", { email: u.email, password: u.password }))).status).toBe(200);
}

/** A task made through the service, to give the routes something to read and change. */
async function seedTask(owner: Account, over: Record<string, unknown> = {}): Promise<string> {
  const { createTask } = await import("@/features/tasks/service");
  const { createTaskSchema } = await import("@/features/tasks/schema");
  const input = createTaskSchema.parse({ title: uniq("Task"), categoryId: collections, priorityId: normal, ...over });
  return (await createTask(input, { ...owner, permissions: [...PERMISSIONS] })).id;
}

const row = async (id: string) => {
  const { db } = await import("@/lib/db");
  return (await db.queryOne<{ title: string; status: string; origin: string; created_by: string | null; owner_id: string | null; source_type: string | null }>(
    "SELECT title, status, origin, created_by, owner_id, source_type FROM tasks WHERE id = $1", [id],
  ))!;
};
const taskCount = async () => {
  const { db } = await import("@/lib/db");
  return Number((await db.queryOne<{ n: string }>("SELECT count(*) AS n FROM tasks"))!.n);
};
const eventCount = async (id: string) => {
  const { db } = await import("@/lib/db");
  return Number((await db.queryOne<{ n: string }>("SELECT count(*) AS n FROM activity_log WHERE entity_type = 'task' AND entity_id = $1", [id]))!.n);
};

describe("the task routes", () => {
  it("turn an anonymous caller away on every route", async () => {
    const id = await seedTask(nobody);
    const events = await eventCount(id);
    const count = await taskCount();
    jar.clear();
    const list = await import("@/app/api/tasks/route");
    const desk = await import("@/app/api/tasks/desk/route");
    const sync = await import("@/app/api/tasks/sync/route");
    const one = await import("@/app/api/tasks/[id]/route");
    const status = await import("@/app/api/tasks/[id]/status/route");
    const notes = await import("@/app/api/tasks/[id]/notes/route");

    expect((await list.GET(req("/api/tasks"))).status).toBe(401);
    expect((await list.POST(req("/api/tasks", "POST", { title: "x", categoryId: collections, priorityId: normal }))).status).toBe(401);
    expect((await desk.GET(req("/api/tasks/desk"))).status).toBe(401);
    expect((await sync.POST(req("/api/tasks/sync", "POST", {}))).status).toBe(401);
    expect((await one.GET(req(`/api/tasks/${id}`), params(id))).status).toBe(401);
    expect((await one.PATCH(req(`/api/tasks/${id}`, "PATCH", { title: "x" }), params(id))).status).toBe(401);
    expect((await status.POST(req(`/api/tasks/${id}/status`, "POST", { status: "done" }), params(id))).status).toBe(401);
    expect((await notes.POST(req(`/api/tasks/${id}/notes`, "POST", { note: "x" }), params(id))).status).toBe(401);

    expect(await taskCount()).toBe(count);
    expect(await eventCount(id)).toBe(events);
    expect((await row(id)).status).toBe("open");
  });

  it("refuse a cross-origin write (403 CSRF), a non-JSON body (415) and a malformed id (422), and change nothing", async () => {
    await login(nobody);
    const id = await seedTask(nobody, { title: "Guarded task" });
    const events = await eventCount(id);
    const count = await taskCount();
    const list = await import("@/app/api/tasks/route");
    const sync = await import("@/app/api/tasks/sync/route");
    const one = await import("@/app/api/tasks/[id]/route");
    const status = await import("@/app/api/tasks/[id]/status/route");
    const notes = await import("@/app/api/tasks/[id]/notes/route");

    const writes = (headers: Record<string, string>) => [
      list.POST(req("/api/tasks", "POST", { title: "Sneaky", categoryId: collections, priorityId: normal }, headers)),
      sync.POST(req("/api/tasks/sync", "POST", {}, headers)),
      one.PATCH(req(`/api/tasks/${id}`, "PATCH", { title: "Hijacked" }, headers), params(id)),
      status.POST(req(`/api/tasks/${id}/status`, "POST", { status: "done" }, headers), params(id)),
      notes.POST(req(`/api/tasks/${id}/notes`, "POST", { note: "evil" }, headers), params(id)),
    ];
    for (const res of await Promise.all(writes(evil))) {
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("CSRF");
    }
    for (const res of await Promise.all(writes(notJson))) {
      expect(res.status).toBe(415);
      expect((await res.json()).error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    }

    // A malformed id is refused before any task is looked up, on every method that takes one.
    for (const res of [
      await one.GET(req("/api/tasks/nope"), params("nope")),
      await one.PATCH(req("/api/tasks/nope", "PATCH", { title: "x" }), params("nope")),
      await status.POST(req("/api/tasks/nope/status", "POST", { status: "done" }), params("nope")),
      await notes.POST(req("/api/tasks/nope/notes", "POST", { note: "x" }), params("nope")),
    ]) {
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }

    // A well-formed id that is no task is a 404.
    expect((await one.GET(req(`/api/tasks/${MISSING}`), params(MISSING))).status).toBe(404);

    expect(await taskCount()).toBe(count);
    expect(await eventCount(id)).toBe(events);
    expect(await row(id)).toMatchObject({ title: "Guarded task", status: "open" });
  });

  it("create, read, edit, move and note a task, and ignore the fields a caller may not set", async () => {
    await login(nobody);
    const list = await import("@/app/api/tasks/route");
    const one = await import("@/app/api/tasks/[id]/route");
    const status = await import("@/app/api/tasks/[id]/status/route");
    const notes = await import("@/app/api/tasks/[id]/notes/route");

    // status, origin, source and creator are not the caller's to set: they are ignored, not stored and not refused.
    const created = await list.POST(req("/api/tasks", "POST", {
      title: "Chase the PO", description: "Line one\nline two", categoryId: collections, priorityId: normal, dueDate: "2030-01-15",
      status: "done", origin: "auto", sourceType: "invoice", createdBy: other.id, ownerId: nobody.id,
    }));
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body).toEqual({ id: expect.any(String) });
    const id: string = body.id;
    expect(await row(id)).toMatchObject({ title: "Chase the PO", status: "open", origin: "manual", source_type: null, created_by: nobody.id, owner_id: nobody.id });

    const read = await one.GET(req(`/api/tasks/${id}`), params(id));
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      id, title: "Chase the PO", description: "Line one\nline two", status: "open", origin: "manual", due_date: "2030-01-15",
      owner_id: nobody.id, owner_name: "New Account", category_name: "Collections", priority_name: "Normal",
      events: [{ action: "created", summary: 'Created task "Chase the PO"', actor_name: "New Account" }],
    });

    // Edit: only what is sent changes. A body of only unknown keys is "nothing to update", so status cannot be set this way.
    const edited = await one.PATCH(req(`/api/tasks/${id}`, "PATCH", { title: "Chase the purchase order", priorityId: high, dueDate: "" }), params(id));
    expect(edited.status).toBe(200);
    expect(await edited.json()).toEqual({ ok: true });
    expect((await one.PATCH(req(`/api/tasks/${id}`, "PATCH", { status: "done" }), params(id))).status).toBe(422);
    const afterEdit = await (await one.GET(req(`/api/tasks/${id}`), params(id))).json();
    expect(afterEdit).toMatchObject({
      title: "Chase the purchase order", description: "Line one\nline two", priority_name: "High", due_date: null, status: "open",
    });

    // Status: in progress, then waiting (which must say when to look again), then done.
    const inProgress = await status.POST(req(`/api/tasks/${id}/status`, "POST", { status: "in_progress" }), params(id));
    expect(inProgress.status).toBe(200);
    expect(await inProgress.json()).toEqual({ ok: true });
    expect((await status.POST(req(`/api/tasks/${id}/status`, "POST", { status: "waiting", waitingOn: "Accounts" }), params(id))).status).toBe(422);
    expect((await status.POST(req(`/api/tasks/${id}/status`, "POST", { status: "bogus" }), params(id))).status).toBe(422);
    expect((await status.POST(req(`/api/tasks/${id}/status`, "POST", { status: "in_progress" }), params(id))).status).toBe(409);
    const later = inTwoDays();
    expect((await status.POST(req(`/api/tasks/${id}/status`, "POST", { status: "waiting", waitingOn: "Accounts", followUpAt: later }), params(id))).status).toBe(200);
    const waiting = await (await one.GET(req(`/api/tasks/${id}`), params(id))).json();
    expect(waiting).toMatchObject({ status: "waiting", waiting_on: "Accounts", follow_up_at: later });
    expect((await status.POST(req(`/api/tasks/${id}/status`, "POST", { status: "done" }), params(id))).status).toBe(200);

    // Notes: required, up to 2000 characters, and added whatever the task's status.
    expect((await notes.POST(req(`/api/tasks/${id}/notes`, "POST", { note: "" }), params(id))).status).toBe(422);
    expect((await notes.POST(req(`/api/tasks/${id}/notes`, "POST", { note: "x".repeat(2001) }), params(id))).status).toBe(422);
    const noted = await notes.POST(req(`/api/tasks/${id}/notes`, "POST", { note: "Called, no answer" }), params(id));
    expect(noted.status).toBe(200);
    expect(await noted.json()).toEqual({ ok: true });

    const finalRead = await (await one.GET(req(`/api/tasks/${id}`), params(id))).json();
    expect(finalRead).toMatchObject({ status: "done", completed_by: nobody.id, waiting_on: null });
    expect(finalRead.completed_at).toEqual(expect.any(String));
    expect(finalRead.events.map((e: { action: string }) => e.action)).toEqual([
      "note_added", "status_changed", "status_changed", "status_changed", "edited", "created",
    ]);
    expect(finalRead.events[0]).toMatchObject({ summary: 'Note on "Chase the purchase order": Called, no answer', actor_name: "New Account" });
  });

  it("answer 404 to a user with no permission who asks for, or acts on, another person's task", async () => {
    const id = await seedTask(other, { title: "Not yours" });
    const events = await eventCount(id);
    await login(nobody);
    const one = await import("@/app/api/tasks/[id]/route");
    const status = await import("@/app/api/tasks/[id]/status/route");
    const notes = await import("@/app/api/tasks/[id]/notes/route");

    const got = await one.GET(req(`/api/tasks/${id}`), params(id));
    expect(got.status).toBe(404);
    expect((await got.json()).error.code).toBe("NOT_FOUND");
    expect((await one.PATCH(req(`/api/tasks/${id}`, "PATCH", { title: "Taken over" }), params(id))).status).toBe(404);
    expect((await status.POST(req(`/api/tasks/${id}/status`, "POST", { status: "done" }), params(id))).status).toBe(404);
    expect((await notes.POST(req(`/api/tasks/${id}/notes`, "POST", { note: "Peeking" }), params(id))).status).toBe(404);
    expect(await row(id)).toMatchObject({ title: "Not yours", status: "open" });
    expect(await eventCount(id)).toBe(events);

    // The task's owner, and a founder who may see everything, still read it.
    await login(other);
    expect((await one.GET(req(`/api/tasks/${id}`), params(id))).status).toBe(200);
    await login(founder);
    expect((await one.GET(req(`/api/tasks/${id}`), params(id))).status).toBe(200);
  });

  it("list the caller's own tasks, and refuse scope=all without tasks.view_all", async () => {
    const mine = await seedTask(nobody, { title: "Mine to list" });
    const theirs = await seedTask(other, { title: "Theirs to list" });
    const list = await import("@/app/api/tasks/route");

    await login(nobody);
    const own = await list.GET(req("/api/tasks?pageSize=100"));
    expect(own.status).toBe(200);
    const ownBody = await own.json();
    const ownIds = ownBody.items.map((t: { id: string }) => t.id);
    expect(ownIds).toContain(mine);
    expect(ownIds).not.toContain(theirs);
    expect(ownBody).toMatchObject({ total: ownIds.length, page: 1, pageSize: 100 });

    const denied = await list.GET(req("/api/tasks?scope=all"));
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.code).toBe("FORBIDDEN");
    expect((await list.GET(req("/api/tasks?status=bogus"))).status).toBe(422);
    expect((await list.GET(req("/api/tasks?pageSize=1000"))).status).toBe(422);

    await login(founder);
    const everyone = await list.GET(req("/api/tasks?scope=all&pageSize=100"));
    expect(everyone.status).toBe(200);
    const everyoneIds = (await everyone.json()).items.map((t: { id: string }) => t.id);
    expect(everyoneIds).toEqual(expect.arrayContaining([mine, theirs]));
  });

  it("refuse a task for someone else to a user without tasks.assign, and create nothing (403)", async () => {
    await login(nobody);
    const list = await import("@/app/api/tasks/route");
    const count = await taskCount();
    const res = await list.POST(req("/api/tasks", "POST", { title: "For Ravi", categoryId: collections, priorityId: normal, ownerId: other.id }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
    expect((await list.POST(req("/api/tasks", "POST", { categoryId: collections, priorityId: normal }))).status).toBe(422); // no title
    expect(await taskCount()).toBe(count);
  });

  it("serve the Desk with its sections and counts, and keep another person's view for tasks.view_all", async () => {
    const overdue = await seedTask(nobody, { title: "Long overdue", dueDate: "2020-01-01" });
    const desk = await import("@/app/api/tasks/desk/route");

    await login(nobody);
    const res = await desk.GET(req("/api/tasks/desk"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.sections)).toEqual(SECTION_ORDER);
    expect(Object.keys(body.counts).sort()).toEqual(["badge", "dueToday", "followUpsDue", "next7", "overdue", "parked", "parkedLate"]);
    expect(body.sections.overdue.map((t: { id: string }) => t.id)).toContain(overdue);
    expect(body.counts.overdue).toBe(body.sections.overdue.length);
    expect(body.counts.overdue).toBeGreaterThanOrEqual(1);
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    for (const owner of [other.id, "all", "unassigned"]) {
      const denied = await desk.GET(req(`/api/tasks/desk?owner=${owner}`));
      expect(denied.status, owner).toBe(403);
      expect((await denied.json()).error.code).toBe("FORBIDDEN");
    }
    expect((await desk.GET(req("/api/tasks/desk?owner=me"))).status).toBe(200);
    expect((await desk.GET(req("/api/tasks/desk?owner=bogus"))).status).toBe(422);

    await login(founder);
    const theirs = await desk.GET(req(`/api/tasks/desk?owner=${nobody.id}`));
    expect(theirs.status).toBe(200);
    expect((await theirs.json()).sections.overdue.map((t: { id: string }) => t.id)).toContain(overdue);
  });

  it("answer the badge poll with the Desk's counts", async () => {
    await seedTask(nobody, { title: "Also overdue", dueDate: "2020-02-02" });
    await login(nobody);
    const desk = await import("@/app/api/tasks/desk/route");
    const sync = await import("@/app/api/tasks/sync/route");
    const res = await sync.POST(req("/api/tasks/sync", "POST", {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["counts"]);
    expect(body.counts.overdue).toBeGreaterThanOrEqual(1);
    expect(body.counts).toEqual((await (await desk.GET(req("/api/tasks/desk"))).json()).counts);
  });
});
