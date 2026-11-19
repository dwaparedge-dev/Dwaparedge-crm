import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import type { TaskStatusInput } from "@/features/tasks/schema";
import { createTestDb, expectAppError, makeClient, makeUser, uniq, type TestDb } from "./helpers";

const MISSING = "6b1a9d5e-8c43-4f5b-9d39-0f3f3b0f2f11";
/** The injected clock: follow-up times are judged against this, never against the machine's time. */
const NOW = new Date("2026-11-19T06:00:00.000Z");
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let tdb: TestDb;
/** Holds all four task permissions, as both founders do. */
let founder: CurrentUser;
/** Holds no permission at all, as a new account does. */
let nobody: CurrentUser;
/** Another account with no permission. */
let other: CurrentUser;
/** Sees everyone's tasks but may change only their own. */
let viewer: CurrentUser;
let collections: string;
let billing: string;
let normal: string;
let high: string;

async function actor(name: string, permissions: CurrentUser["permissions"]): Promise<CurrentUser> {
  const u = await makeUser(name);
  return { id: u.id, name, email: u.email, permissions };
}

async function deactivate(u: CurrentUser) {
  const { db } = await import("@/lib/db");
  await db.query("UPDATE users SET is_active = false WHERE id = $1", [u.id]);
}

beforeAll(async () => {
  tdb = await createTestDb();
  const { db } = await import("@/lib/db");
  const id = async (table: string, key: string) => (await db.queryOne<{ id: string }>(`SELECT id FROM ${table} WHERE key = $1`, [key]))!.id;
  collections = await id("task_categories", "collections");
  billing = await id("task_categories", "billing");
  normal = await id("task_priorities", "normal");
  high = await id("task_priorities", "high");
  founder = await actor("Founder One", [...PERMISSIONS]);
  nobody = await actor("New Account", []);
  other = await actor("Other Staff", []);
  viewer = await actor("Read Only", ["tasks.view_all"]);
});
afterAll(async () => tdb?.drop());

// Every call goes through the schema first, as the routes do, so the service sees exactly what it will see in production.

async function create(body: Record<string, unknown>, by: CurrentUser, now?: Date): Promise<string> {
  const { createTask } = await import("@/features/tasks/service");
  const { createTaskSchema } = await import("@/features/tasks/schema");
  const input = createTaskSchema.parse({ title: uniq("Task"), categoryId: collections, priorityId: normal, ...body });
  return (await createTask(input, by, now)).id;
}

async function update(id: string, body: Record<string, unknown>, by: CurrentUser, now?: Date) {
  const { updateTask } = await import("@/features/tasks/service");
  const { updateTaskSchema } = await import("@/features/tasks/schema");
  return updateTask(id, updateTaskSchema.parse(body), by, now);
}

async function setStatus(id: string, body: Record<string, unknown>, by: CurrentUser, now?: Date) {
  const { taskStatusSchema } = await import("@/features/tasks/schema");
  return setStatusRaw(id, taskStatusSchema.parse(body), by, now);
}

/** Skips the schema, to reach the service's own checks (the schema already refuses waiting without a time). */
async function setStatusRaw(id: string, input: TaskStatusInput, by: CurrentUser, now?: Date) {
  const { setTaskStatus } = await import("@/features/tasks/service");
  return setTaskStatus(id, input, by, now);
}

async function note(id: string, text: string, by: CurrentUser) {
  const { addTaskNote } = await import("@/features/tasks/service");
  const { noteSchema } = await import("@/features/tasks/schema");
  return addTaskNote(id, noteSchema.parse({ note: text }), by);
}

const get = async (id: string, by: CurrentUser) => (await import("@/features/tasks/service")).getTask(id, by);

async function list(params: Record<string, unknown>, by: CurrentUser) {
  const { listTasks } = await import("@/features/tasks/service");
  const { listTasksSchema } = await import("@/features/tasks/schema");
  return listTasks(listTasksSchema.parse(params), by);
}

const ids = async (params: Record<string, unknown>, by: CurrentUser) => (await list(params, by)).items.map((t) => t.id);

/** Every task id the user is shown with this scope, open and closed, across all pages, sorted. */
async function everyListedId(by: CurrentUser, scope: "mine" | "all"): Promise<string[]> {
  const found: string[] = [];
  for (const status of ["active", "closed"]) {
    for (let page = 1; ; page++) {
      const { items } = await list({ scope, status, page, pageSize: 100 }, by);
      found.push(...items.map((t) => t.id));
      if (items.length < 100) break;
    }
  }
  return found.sort();
}

interface HistoryRow {
  action: string;
  summary: string;
  actor_id: string | null;
  client_id: string | null;
  metadata: Record<string, unknown> | null;
}

const history = async (id: string) => {
  const { db } = await import("@/lib/db");
  return db.query<HistoryRow>(
    "SELECT action, summary, actor_id, client_id, metadata FROM activity_log WHERE entity_type = 'task' AND entity_id = $1 ORDER BY id",
    [id],
  );
};

const countTasks = async () => {
  const { db } = await import("@/lib/db");
  return Number((await db.queryOne<{ n: string }>("SELECT count(*) AS n FROM tasks"))!.n);
};

const TASK_ROW_KEYS = [
  "id", "title", "description", "category_id", "category_name", "category_colour", "priority_id", "priority_name", "priority_colour",
  "priority_rank", "status", "owner_id", "owner_name", "created_by", "created_by_name", "client_id", "client_name", "origin",
  "source_type", "source_id", "due_date", "follow_up_at", "follow_up_every_days", "follow_up_count", "last_followed_up_at",
  "waiting_on", "completed_at", "completed_by", "created_at", "updated_at",
];

describe("creating a task", () => {
  it("lets a user with no permissions create one for themselves, with the category's cadence and no follow-up time", async () => {
    const id = await create({ title: "Chase the PO", description: "Line one\nline two" }, nobody);
    const t = await get(id, nobody);
    expect(Object.keys(t).sort()).toEqual([...TASK_ROW_KEYS, "events"].sort());
    expect(t).toMatchObject({
      id, title: "Chase the PO", description: "Line one\nline two",
      category_id: collections, category_name: "Collections", priority_id: normal, priority_name: "Normal", priority_rank: 3,
      status: "open", owner_id: nobody.id, owner_name: "New Account", created_by: nobody.id, created_by_name: "New Account",
      client_id: null, client_name: null, origin: "manual", source_type: null, source_id: null, due_date: null,
      // Collections repeats every 3 days, but a follow-up time is never set by itself: the task is not parked.
      follow_up_at: null, follow_up_every_days: 3, follow_up_count: 0, last_followed_up_at: null,
      waiting_on: null, completed_at: null, completed_by: null,
    });
    expect(t.category_colour).toMatch(/^#[0-9a-f]{6}$/);
    expect(t.priority_colour).toMatch(/^#[0-9a-f]{6}$/);
    expect(t.created_at).toMatch(ISO);
    expect(t.updated_at).toMatch(ISO);
    expect(t.events).toEqual([{ id: expect.any(String), action: "created", summary: 'Created task "Chase the PO"', actor_name: "New Account", created_at: expect.stringMatching(ISO) }]);
    expect(await history(id)).toEqual([{ action: "created", summary: 'Created task "Chase the PO"', actor_id: nobody.id, client_id: null, metadata: null }]);

    // Naming themselves as the owner is the same thing.
    expect((await get(await create({ ownerId: nobody.id }, nobody), nobody)).owner_id).toBe(nobody.id);
  });

  it("copies the category's cadence only when none is given: a number wins, null means none", async () => {
    expect((await get(await create({ categoryId: billing }, nobody), nobody)).follow_up_every_days).toBeNull();
    expect((await get(await create({ followUpEveryDays: 7 }, nobody), nobody)).follow_up_every_days).toBe(7);
    expect((await get(await create({ followUpEveryDays: null }, nobody), nobody)).follow_up_every_days).toBeNull();
  });

  it("refuses a user without tasks.assign a task for someone else or for nobody (403), and creates nothing", async () => {
    const before = await countTasks();
    await expectAppError(create({ ownerId: other.id }, nobody), 403, "FORBIDDEN");
    await expectAppError(create({ ownerId: null }, nobody), 403, "FORBIDDEN");
    await expectAppError(create({ ownerId: founder.id }, viewer), 403, "FORBIDDEN");
    expect(await countTasks()).toBe(before);
  });

  it("refuses an owner who is not an active user, and a client that does not exist (422)", async () => {
    const gone = await actor("Gone Before", []);
    await deactivate(gone);
    const before = await countTasks();
    await expectAppError(create({ ownerId: gone.id }, founder), 422, "VALIDATION_ERROR", /active/);
    await expectAppError(create({ ownerId: MISSING }, founder), 422, "VALIDATION_ERROR", /active/);
    await expectAppError(create({ clientId: MISSING }, founder), 422, "VALIDATION_ERROR", /client/);
    expect(await countTasks()).toBe(before);
  });

  it("takes a follow-up time only in the future and at most 365 days out, by the injected clock (422), stored as an instant", async () => {
    const before = await countTasks();
    await expectAppError(create({ followUpAt: "2026-11-19T05:59:59Z" }, founder, NOW), 422, "VALIDATION_ERROR", /future/);
    await expectAppError(create({ followUpAt: "2026-11-19T11:30:00+05:30" }, founder, NOW), 422, "VALIDATION_ERROR", /future/); // exactly now
    await expectAppError(create({ followUpAt: "2027-11-19T06:00:01Z" }, founder, NOW), 422, "VALIDATION_ERROR", /365 days/);
    expect(await countTasks()).toBe(before);

    // Exactly 365 days out is allowed; an offset is turned into the same instant in UTC.
    const edge = await create({ followUpAt: "2027-11-19T11:30:00+05:30" }, founder, NOW);
    expect((await get(edge, founder)).follow_up_at).toBe("2027-11-19T06:00:00.000Z");
  });
});

describe("who may see and change a task", () => {
  it("answers 404 to a user who may not see the task, on every call, and changes nothing", async () => {
    const id = await create({ title: "Not yours", ownerId: other.id }, founder);
    const calls = [
      () => get(id, nobody),
      () => update(id, { title: "Mine now" }, nobody),
      () => setStatus(id, { status: "done" }, nobody),
      () => note(id, "Sneaky", nobody),
    ];
    for (const call of calls) await expectAppError(call(), 404, "NOT_FOUND");
    expect(await get(id, founder)).toMatchObject({ title: "Not yours", status: "open", owner_id: other.id });
    expect((await history(id)).map((h) => h.action)).toEqual(["created"]);

    // A task that does not exist answers the same.
    await expectAppError(get(MISSING, founder), 404, "NOT_FOUND");
    await expectAppError(update(MISSING, { title: "x" }, founder), 404, "NOT_FOUND");
    await expectAppError(setStatus(MISSING, { status: "done" }, founder), 404, "NOT_FOUND");
    await expectAppError(note(MISSING, "x", founder), 404, "NOT_FOUND");
  });

  it("lets a tasks.view_all user see another's task but not change it (403)", async () => {
    const id = await create({ title: "Look only", ownerId: other.id }, founder);
    expect(await get(id, viewer)).toMatchObject({ title: "Look only" });
    await expectAppError(update(id, { title: "Changed" }, viewer), 403, "FORBIDDEN");
    await expectAppError(setStatus(id, { status: "done" }, viewer), 403, "FORBIDDEN");
    await expectAppError(note(id, "Hello", viewer), 403, "FORBIDDEN");
    expect(await get(id, founder)).toMatchObject({ title: "Look only", status: "open" });
    expect((await history(id)).map((h) => h.action)).toEqual(["created"]);
  });

  it("lets a user with all four permissions create for anyone, then edit, reassign, complete and note on it", async () => {
    const { db } = await import("@/lib/db");
    const clientId = await makeClient(founder.id);
    const clientName = (await db.queryOne<{ display_name: string }>("SELECT display_name FROM clients WHERE id = $1", [clientId]))!.display_name;
    const id = await create(
      { title: "Collect from client", ownerId: other.id, clientId, dueDate: "2026-12-01", followUpAt: "2026-12-01T10:00:00+05:30", followUpEveryDays: 5 },
      founder,
      NOW,
    );
    // The owner sees it too.
    expect(await get(id, other)).toMatchObject({
      owner_id: other.id, owner_name: "Other Staff", created_by: founder.id, created_by_name: "Founder One", client_id: clientId, client_name: clientName,
      due_date: "2026-12-01", follow_up_at: "2026-12-01T04:30:00.000Z", follow_up_every_days: 5,
    });

    await update(id, { title: "Collect the balance" }, founder, NOW);
    await update(id, { ownerId: founder.id }, founder, NOW);
    await setStatus(id, { status: "done" }, founder, NOW);
    await note(id, "Paid by NEFT", founder);

    const t = await get(id, founder);
    expect(t).toMatchObject({ title: "Collect the balance", owner_id: founder.id, status: "done", completed_by: founder.id });
    expect(t.completed_at).toMatch(ISO);
    expect(t.events.map((e) => e.action)).toEqual(["note_added", "status_changed", "reassigned", "edited", "created"]);
    expect(t.events.every((e) => e.actor_name === "Founder One")).toBe(true);

    const log = await history(id);
    expect(log.every((h) => h.actor_id === founder.id && h.client_id === clientId)).toBe(true);
    expect(log.map((h) => [h.action, h.summary, h.metadata])).toEqual([
      ["created", 'Created task "Collect from client" for Other Staff', null],
      ["edited", 'Edited "Collect the balance" (title)', { changes: { title: { from: "Collect from client", to: "Collect the balance" } } }],
      ["reassigned", 'Reassigned "Collect the balance" to Founder One', { from: other.id, to: founder.id }],
      ["status_changed", 'Moved "Collect the balance" from Open to Done', { from: "open", to: "done" }],
      ["note_added", 'Note on "Collect the balance": Paid by NEFT', { note: "Paid by NEFT" }],
    ]);

    // An unassigned task is the founder's to create too.
    expect((await get(await create({ ownerId: null }, founder), founder)).owner_id).toBeNull();
  });

  it("needs tasks.assign to change the owner, even of one's own task, and an active user to give it to", async () => {
    const id = await create({ title: "Hand me over" }, nobody);
    await expectAppError(update(id, { ownerId: other.id }, nobody), 403, "FORBIDDEN");
    await expectAppError(update(id, { ownerId: null }, nobody), 403, "FORBIDDEN");
    // Sending the owner it already has is not a change, so it needs no permission.
    await update(id, { ownerId: nobody.id, title: "Hand me over now" }, nobody);

    const gone = await actor("Gone Since", []);
    await deactivate(gone);
    await expectAppError(update(id, { ownerId: gone.id }, founder), 422, "VALIDATION_ERROR", /active/);
    await expectAppError(update(id, { ownerId: MISSING }, founder), 422, "VALIDATION_ERROR", /active/);
    await update(id, { ownerId: other.id }, founder);
    await update(id, { ownerId: null }, founder);

    expect((await history(id)).map((h) => [h.action, h.summary, h.actor_id, h.metadata])).toEqual([
      ["created", 'Created task "Hand me over"', nobody.id, null],
      ["edited", 'Edited "Hand me over now" (title)', nobody.id, { changes: { title: { from: "Hand me over", to: "Hand me over now" } } }],
      ["reassigned", 'Reassigned "Hand me over now" to Other Staff', founder.id, { from: nobody.id, to: other.id }],
      ["reassigned", 'Unassigned "Hand me over now"', founder.id, { from: other.id, to: null }],
    ]);
    // The creator still sees the task after giving it away.
    expect((await get(id, nobody)).owner_id).toBeNull();
  });

  it("treats a deactivated owner as Unassigned: owner_id null, still seen by a tasks.view_all user, listed as unassigned", async () => {
    const leaver = await actor("Leaver", []);
    const title = uniq("Leaver task");
    const id = await create({ title, ownerId: leaver.id }, founder);
    expect(await get(id, viewer)).toMatchObject({ owner_id: leaver.id, owner_name: "Leaver" });
    await deactivate(leaver);

    expect(await get(id, viewer)).toMatchObject({ owner_id: null, owner_name: null, created_by: founder.id });
    expect(await ids({ scope: "all", ownerId: "unassigned", search: title }, viewer)).toEqual([id]);
    expect(await ids({ scope: "all", ownerId: leaver.id }, viewer)).toEqual([]);
  });
});

describe("editing a task", () => {
  it("logs only what changed, and nothing at all, not even updated_at, when nothing did", async () => {
    const id = await create({ title: "Same", description: "Keep", dueDate: "2026-12-05", followUpAt: "2026-12-10T09:00:00Z" }, founder, NOW);
    const before = await get(id, founder);
    // A form sends every field back; the same instant written with another offset is not a change either.
    await update(
      id,
      {
        title: "Same", description: "Keep", categoryId: collections, priorityId: normal, ownerId: founder.id, clientId: null,
        dueDate: "2026-12-05", followUpAt: "2026-12-10T14:30:00+05:30", followUpEveryDays: 3,
      },
      founder,
      NOW,
    );
    expect(await get(id, founder)).toEqual(before);
    expect(await history(id)).toHaveLength(1);

    await update(id, { title: "Changed", priorityId: high, dueDate: null, description: "" }, founder, NOW);
    expect(await get(id, founder)).toMatchObject({ title: "Changed", priority_id: high, priority_name: "High", due_date: null, description: null });
    expect((await history(id))[1]).toMatchObject({
      action: "edited",
      summary: 'Edited "Changed" (title, description, priority, due date)',
      metadata: { changes: { title: { from: "Same", to: "Changed" }, description: { from: "Keep", to: null }, priorityId: { from: normal, to: high }, dueDate: { from: "2026-12-05", to: null } } },
    });
  });

  it("checks a changed follow-up time against the clock, but lets an unchanged one that has passed stay", async () => {
    const id = await create({ followUpAt: "2026-11-25T09:00:00Z" }, founder, NOW);
    await expectAppError(update(id, { followUpAt: "2026-11-18T00:00:00Z" }, founder, NOW), 422, "VALIDATION_ERROR", /future/);
    await expectAppError(update(id, { followUpAt: "2027-12-01T00:00:00Z" }, founder, NOW), 422, "VALIDATION_ERROR", /365 days/);

    // A week later the time has passed; editing the title with the form's copy of that time is still fine.
    const later = new Date("2026-11-26T00:00:00Z");
    await update(id, { title: "Edited after it came due", followUpAt: "2026-11-25T14:30:00+05:30" }, founder, later);
    await update(id, { followUpAt: "2026-11-30T09:00:00Z" }, founder, later);
    expect(await get(id, founder)).toMatchObject({ title: "Edited after it came due", follow_up_at: "2026-11-30T09:00:00.000Z" });
    expect((await history(id)).map((h) => h.summary)).toEqual([
      expect.stringMatching(/^Created task/), 'Edited "Edited after it came due" (title)', 'Edited "Edited after it came due" (follow-up time)',
    ]);
  });
});

describe("hidden categories and priorities (Review Focus 4)", () => {
  it("keeps tasks of a hidden category or priority listed and editable, and refuses new tasks with them (422)", async () => {
    const { createConfig, updateConfig } = await import("@/features/tasks/config-service");
    const { createCategorySchema, createPrioritySchema, updateCategorySchema, updatePrioritySchema } = await import("@/features/tasks/config-schema");
    const catName = uniq("Soon hidden");
    const priName = uniq("Soon hidden");
    const cat = (await createConfig("categories", createCategorySchema.parse({ name: catName, colour: "#112233" }), founder)).id;
    const pri = (await createConfig("priorities", createPrioritySchema.parse({ name: priName, colour: "#445566", rank: 9 }), founder)).id;
    const id = await create({ title: "Uses hidden rows", categoryId: cat, priorityId: pri }, founder);
    await updateConfig("categories", cat, updateCategorySchema.parse({ isActive: false }), founder);
    await updateConfig("priorities", pri, updatePrioritySchema.parse({ isActive: false }), founder);

    const listed = await list({ scope: "all", categoryId: cat }, founder);
    expect(listed.items.map((t) => [t.id, t.category_name, t.priority_name, t.priority_rank])).toEqual([[id, catName, priName, 9]]);

    // A form sends the hidden category back unchanged: that is not a change, so the edit goes through.
    await update(id, { title: "Edited while hidden", categoryId: cat, priorityId: pri, dueDate: "2026-12-24" }, founder);
    expect(await get(id, founder)).toMatchObject({ title: "Edited while hidden", category_id: cat, priority_id: pri, due_date: "2026-12-24" });

    const before = await countTasks();
    await expectAppError(create({ categoryId: cat }, founder), 422, "VALIDATION_ERROR", /category/);
    await expectAppError(create({ priorityId: pri }, founder), 422, "VALIDATION_ERROR", /priority/);
    await expectAppError(create({ categoryId: MISSING }, founder), 422, "VALIDATION_ERROR", /category/);
    await expectAppError(create({ priorityId: MISSING }, founder), 422, "VALIDATION_ERROR", /priority/);
    expect(await countTasks()).toBe(before);

    // Moving another task onto a hidden row is refused the same way.
    const plain = await create({}, founder);
    await expectAppError(update(plain, { categoryId: cat }, founder), 422, "VALIDATION_ERROR", /category/);
    await expectAppError(update(plain, { priorityId: pri }, founder), 422, "VALIDATION_ERROR", /priority/);
    expect(await get(plain, founder)).toMatchObject({ category_id: collections, priority_id: normal });
  });
});

describe("changing the status", () => {
  it("stamps done with who and when, clears both on reopen and on cancel, and refuses the status a task already has (409)", async () => {
    const id = await create({ title: "Round trip" }, nobody);
    await expectAppError(setStatus(id, { status: "open" }, nobody), 409, "INVALID_TRANSITION");

    await setStatus(id, { status: "done" }, nobody);
    const done = await get(id, nobody);
    expect(done).toMatchObject({ status: "done", completed_by: nobody.id });
    expect(done.completed_at).toMatch(ISO);
    await expectAppError(setStatus(id, { status: "done" }, nobody), 409, "INVALID_TRANSITION");

    await setStatus(id, { status: "open" }, nobody);
    expect(await get(id, nobody)).toMatchObject({ status: "open", completed_at: null, completed_by: null });
    await setStatus(id, { status: "done" }, nobody);
    await setStatus(id, { status: "cancelled" }, nobody);
    expect(await get(id, nobody)).toMatchObject({ status: "cancelled", completed_at: null, completed_by: null });
    await setStatus(id, { status: "in_progress" }, nobody);

    const moves = (await history(id)).filter((h) => h.action === "status_changed");
    expect(moves.map((h) => h.metadata)).toEqual([
      { from: "open", to: "done" }, { from: "done", to: "open" }, { from: "open", to: "done" }, { from: "done", to: "cancelled" }, { from: "cancelled", to: "in_progress" },
    ]);
    expect(moves.map((h) => h.summary)).toEqual([
      'Moved "Round trip" from Open to Done', 'Moved "Round trip" from Done to Open', 'Moved "Round trip" from Open to Done',
      'Moved "Round trip" from Done to Cancelled', 'Moved "Round trip" from Cancelled to In progress',
    ]);
  });

  it("lets only one of two simultaneous Done clicks through: one success, one 409, one history row (Review Focus 2)", async () => {
    const id = await create({ ownerId: other.id }, founder);
    const who = [founder, other];
    const results = await Promise.allSettled(who.map((u) => setStatus(id, { status: "done" }, u)));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ status: 409, code: "INVALID_TRANSITION" });

    const winner = who[results.findIndex((r) => r.status === "fulfilled")]!;
    expect(await get(id, founder)).toMatchObject({ status: "done", completed_by: winner.id });
    expect((await history(id)).filter((h) => h.action === "status_changed")).toHaveLength(1);
  });

  it("puts a task in waiting only with a future follow-up time, given or already set (422 otherwise)", async () => {
    const id = await create({ title: "Wait for CA" }, nobody, NOW);
    await expectAppError(setStatusRaw(id, { status: "waiting" }, nobody, NOW), 422, "VALIDATION_ERROR", /look at it again/);
    await expectAppError(setStatus(id, { status: "waiting", followUpAt: "2026-11-19T05:00:00Z" }, nobody, NOW), 422, "VALIDATION_ERROR", /future/);
    await expectAppError(setStatus(id, { status: "waiting", followUpAt: "2028-01-01T00:00:00Z" }, nobody, NOW), 422, "VALIDATION_ERROR", /365 days/);
    expect(await get(id, nobody)).toMatchObject({ status: "open", follow_up_at: null, waiting_on: null });
    expect(await history(id)).toHaveLength(1);

    await setStatus(id, { status: "waiting", waitingOn: "  the client's\u0000 CA ", followUpAt: "2026-11-25T10:00:00+05:30" }, nobody, NOW);
    expect(await get(id, nobody)).toMatchObject({ status: "waiting", waiting_on: "the client's CA", follow_up_at: "2026-11-25T04:30:00.000Z" });
    expect((await history(id))[1]).toMatchObject({
      action: "status_changed", summary: 'Moved "Wait for CA" from Open to Waiting (waiting on the client\'s CA)', metadata: { from: "open", to: "waiting" },
    });

    // A waiting task cannot lose its time; leaving waiting forgets who it was waiting on and keeps the time.
    await expectAppError(update(id, { followUpAt: null }, nobody, NOW), 422, "VALIDATION_ERROR", /waiting/i);
    await setStatus(id, { status: "in_progress" }, nobody, NOW);
    expect(await get(id, nobody)).toMatchObject({ status: "in_progress", waiting_on: null, follow_up_at: "2026-11-25T04:30:00.000Z" });

    // The time already set is enough while it is still ahead...
    await setStatusRaw(id, { status: "waiting" }, nobody, NOW);
    expect(await get(id, nobody)).toMatchObject({ status: "waiting", follow_up_at: "2026-11-25T04:30:00.000Z" });
    // ...but not once it has passed.
    await setStatus(id, { status: "open" }, nobody, NOW);
    await expectAppError(setStatusRaw(id, { status: "waiting" }, nobody, new Date("2026-11-26T00:00:00Z")), 422, "VALIDATION_ERROR", /look at it again/);
    expect((await get(id, nobody)).status).toBe("open");
  });
});

describe("notes and hostile text (Review Focus 5)", () => {
  it("stores hostile text cleaned, and a 10,000-character title never reaches the database", async () => {
    const id = await create({ title: "  Call\u0000 Raj \u0007\n now ", description: "Line\u0000 one\nLine two" }, nobody);
    expect(await get(id, nobody)).toMatchObject({ title: "Call Raj now", description: "Line one\nLine two" });

    await note(id, "Spoke\u0000 to him", nobody);
    expect((await history(id))[1]).toEqual({
      action: "note_added", summary: 'Note on "Call Raj now": Spoke to him', actor_id: nobody.id, client_id: null, metadata: { note: "Spoke to him" },
    });

    const { createTaskSchema } = await import("@/features/tasks/schema");
    const huge = createTaskSchema.safeParse({ title: "x".repeat(10_000), categoryId: collections, priorityId: normal });
    expect(huge.success).toBe(false);
    expect(huge.error?.issues.map((i) => i.path.join("."))).toEqual(["title"]);

    // A NUL or a control character in the search is cleaned by the schema, so the query still runs.
    expect(await ids({ search: "Call\u0000 Raj\u0007now" }, nobody)).toEqual([id]);
  });

  it("matches % and _ typed into the search literally, in titles and descriptions", async () => {
    const searcher = await actor("Searcher", []);
    const hit = await create({ title: "Raise 100%_ advance" }, searcher);
    // Each of these would match an unescaped "100%_".
    await create({ title: "Raise 1000 advance" }, searcher);
    await create({ title: "Raise 100% advance" }, searcher);
    await create({ title: "Raise 100x_ advance" }, searcher);
    const inDescription = await create({ title: "Something else", description: "Advance of 100%_ agreed" }, searcher);

    const found = await list({ search: "100%_" }, searcher);
    expect(found.items.map((t) => t.id).sort()).toEqual([hit, inDescription].sort());
    expect(found.total).toBe(2);
    expect(await ids({ search: "raise 100%_" }, searcher)).toEqual([hit]); // and whatever the case
  });
});

describe("listing tasks", () => {
  it("lists my tasks (owned or created) by default, and everyone's with scope all only for tasks.view_all (403 otherwise)", async () => {
    const a = await actor("Scope A", []);
    const b = await actor("Scope B", []);
    const own = await create({}, a);
    const given = await create({ ownerId: a.id }, founder);
    const madeForB = await create({ ownerId: b.id }, founder);

    await expectAppError(list({ scope: "all" }, a), 403, "FORBIDDEN");
    expect((await ids({}, a)).sort()).toEqual([own, given].sort());
    expect(await ids({}, b)).toEqual([madeForB]);

    // "mine" means the same for a user who may see everything; "all" shows the rest.
    const watcher = await actor("Scope Watcher", ["tasks.view_all"]);
    expect(await ids({ scope: "mine" }, watcher)).toEqual([]);
    expect(await everyListedId(watcher, "all")).toEqual(expect.arrayContaining([own, given, madeForB]));
  });

  it("lists exactly the tasks the policy lets a user see, for a user with no permissions and one with tasks.view_all", async () => {
    const { db } = await import("@/lib/db");
    const { canViewTask } = await import("@/features/tasks/policy");
    const plain = await actor("Policy Plain", []);
    const watcher = await actor("Policy Watcher", ["tasks.view_all"]);
    const someone = await actor("Policy Someone", []);
    const leaver = await actor("Policy Leaver", []);

    // Every combination of owner and creator, written straight to the table so system-raised and closed ones are there too.
    const combos: [owner: CurrentUser | null, creator: CurrentUser | null, status: string][] = [
      [plain, plain, "open"], [plain, founder, "in_progress"], [someone, plain, "open"], [someone, founder, "open"],
      [null, plain, "open"], [null, null, "open"], [leaver, plain, "open"], [leaver, founder, "open"],
      [plain, null, "done"], [someone, someone, "cancelled"], [null, founder, "waiting"],
    ];
    for (const [owner, creator, status] of combos) {
      await db.query(
        `INSERT INTO tasks (title, category_id, priority_id, owner_id, created_by, status, completed_at, follow_up_at)
         VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 = 'done' THEN now() END, CASE WHEN $6 = 'waiting' THEN now() + interval '1 day' END)`,
        [uniq("Policy"), collections, normal, owner?.id ?? null, creator?.id ?? null, status],
      );
    }
    await deactivate(leaver);

    const rows = await db.query<{ id: string; owner_id: string | null; owner_active: boolean; created_by: string | null }>(
      "SELECT t.id, t.owner_id, COALESCE(u.is_active, false) AS owner_active, t.created_by FROM tasks t LEFT JOIN users u ON u.id = t.owner_id",
    );
    const allowed = (u: CurrentUser) =>
      rows.filter((r) => canViewTask(u, { ownerId: r.owner_id, ownerActive: r.owner_active, createdBy: r.created_by })).map((r) => r.id).sort();

    expect(allowed(plain)).toHaveLength(6); // plain owns or created six of the combinations (a deactivated owner does not hide it from its creator)
    expect(await everyListedId(plain, "mine")).toEqual(allowed(plain));
    expect(allowed(watcher)).toHaveLength(rows.length);
    expect(await everyListedId(watcher, "all")).toEqual(allowed(watcher));
  });

  it("filters by status group, category, priority, owner, client, origin and due range, and sorts undated tasks last", async () => {
    const f = await actor("Filterer", []);
    const clientId = await makeClient(founder.id);
    const early = await create({ title: "Early", dueDate: "2026-12-01", clientId }, f);
    const late = await create({ title: "Late", dueDate: "2026-12-10", categoryId: billing, priorityId: high }, f);
    const undated = await create({ title: "Undated" }, f);
    const done = await create({ title: "Done one" }, f);
    const cancelled = await create({ title: "Cancelled one" }, f);
    await setStatus(done, { status: "done" }, f);
    await setStatus(cancelled, { status: "cancelled" }, f);

    expect(await ids({}, f)).toEqual([early, late, undated]);
    expect(await ids({ dir: "desc" }, f)).toEqual([late, early, undated]);
    expect(await ids({ sort: "priority" }, f)).toEqual([late, early, undated]);
    expect(await ids({ sort: "created" }, f)).toEqual([early, late, undated]);
    expect((await ids({ status: "closed" }, f)).sort()).toEqual([done, cancelled].sort());
    expect(await ids({ status: "done" }, f)).toEqual([done]);
    expect(await ids({ categoryId: billing }, f)).toEqual([late]);
    expect(await ids({ priorityId: high }, f)).toEqual([late]);
    expect(await ids({ clientId }, f)).toEqual([early]);
    expect(await ids({ ownerId: f.id }, f)).toEqual([early, late, undated]);
    expect(await ids({ ownerId: "unassigned" }, f)).toEqual([]);
    expect(await ids({ origin: "manual" }, f)).toEqual([early, late, undated]);
    expect(await ids({ origin: "auto" }, f)).toEqual([]);
    expect(await ids({ dueFrom: "2026-12-05" }, f)).toEqual([late]);
    expect(await ids({ dueTo: "2026-12-05" }, f)).toEqual([early]);
    expect(await ids({ dueFrom: "2026-12-01", dueTo: "2026-12-10" }, f)).toEqual([early, late]);
  });

  it("pages the list, and a page past the end is empty but keeps the total", async () => {
    const pager = await actor("Pager", []);
    const first = await create({ dueDate: "2026-12-01" }, pager);
    const second = await create({ dueDate: "2026-12-02" }, pager);
    const third = await create({ dueDate: "2026-12-03" }, pager);

    const one = await list({ pageSize: 2 }, pager);
    expect(one.items.map((t) => t.id)).toEqual([first, second]);
    expect(one).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(one.items.every((t) => Object.keys(t).sort().join() === [...TASK_ROW_KEYS].sort().join())).toBe(true);
    expect(await list({ pageSize: 2, page: 2 }, pager)).toMatchObject({ items: [expect.objectContaining({ id: third })], total: 3, page: 2 });
    expect(await list({ pageSize: 2, page: 9 }, pager)).toEqual({ items: [], total: 3, page: 9, pageSize: 2 });
  });

  it("indexes tasks by priority, for the priority filter and the check before a priority is deleted", async () => {
    const { db } = await import("@/lib/db");
    const idx = await db.queryOne<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'tasks_priority_idx'");
    expect(idx?.indexdef).toMatch(/ON \S*tasks USING btree \(priority_id\)$/);
  });
});
