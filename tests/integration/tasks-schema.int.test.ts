import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, makeUser, uniq, type TestDb } from "./helpers";

let tdb: TestDb;
let categoryId: string;
let priorityId: string;

beforeAll(async () => {
  tdb = await createTestDb();
  const { db } = await import("@/lib/db");
  categoryId = (await db.queryOne<{ id: string }>("SELECT id FROM task_categories WHERE key = 'collections'"))!.id;
  priorityId = (await db.queryOne<{ id: string }>("SELECT id FROM task_priorities WHERE key = 'normal'"))!.id;
});
afterAll(async () => tdb?.drop());

type Cols = Record<string, unknown>;

/** Inserts a task with the given columns on top of a valid manual one, and returns its id. */
async function insertTask(over: Cols = {}): Promise<string> {
  const { db } = await import("@/lib/db");
  const row: Cols = { title: uniq("Task"), category_id: categoryId, priority_id: priorityId, ...over };
  const names = Object.keys(row);
  const created = await db.queryOne<{ id: string }>(
    `INSERT INTO tasks (${names.join(", ")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
    names.map((n) => row[n]),
  );
  return created!.id;
}

/** The pg error code and constraint a failing insert reports. */
async function violation(over: Cols): Promise<{ code?: string; constraint?: string }> {
  try {
    await insertTask(over);
  } catch (e) {
    const { code, constraint } = e as { code?: string; constraint?: string };
    return { code, constraint };
  }
  throw new Error("expected the insert to be refused, but it succeeded");
}

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

describe("tasks table", () => {
  it("accepts a plain manual task, with the defaults the Desk relies on", async () => {
    const { db } = await import("@/lib/db");
    const id = await insertTask();
    expect(await db.queryOne("SELECT status, origin, follow_up_count, follow_up_at, completed_at FROM tasks WHERE id = $1", [id])).toEqual({
      status: "open", origin: "manual", follow_up_count: 0, follow_up_at: null, completed_at: null,
    });
  });

  it("refuses a waiting task with no follow-up time, and accepts one that has it", async () => {
    expect(await violation({ status: "waiting" })).toEqual({ code: "23514", constraint: "tasks_waiting_needs_follow_up" });
    await expect(insertTask({ status: "waiting", follow_up_at: inAnHour(), waiting_on: "the client's accountant" })).resolves.toBeTruthy();
  });

  it("refuses a done task with no completed_at, and accepts one that has it", async () => {
    expect(await violation({ status: "done" })).toEqual({ code: "23514", constraint: "tasks_done_needs_completed_at" });
    // No completed_by: a task the system closed.
    await expect(insertTask({ status: "done", completed_at: new Date().toISOString() })).resolves.toBeTruthy();
  });

  it("requires source_type and source_id to be set together", async () => {
    const { db } = await import("@/lib/db");
    expect(await violation({ source_type: "invoice" })).toEqual({ code: "23514", constraint: "tasks_source_pair" });
    expect(await violation({ source_id: "6c0c6c0c-6c0c-4c0c-8c0c-6c0c6c0c6c0c" })).toEqual({ code: "23514", constraint: "tasks_source_pair" });
    const id = await insertTask({ source_type: "invoice", source_id: "6c0c6c0c-6c0c-4c0c-8c0c-6c0c6c0c6c0c" });
    expect(await db.queryOne("SELECT source_type FROM tasks WHERE id = $1", [id])).toEqual({ source_type: "invoice" });
  });

  it("only allows the known source types, statuses and origins", async () => {
    const id = "6c0c6c0c-6c0c-4c0c-8c0c-6c0c6c0c6c0c";
    expect((await violation({ source_type: "payment", source_id: id })).code).toBe("23514");
    expect((await violation({ status: "snoozed" })).code).toBe("23514");
    expect((await violation({ origin: "robot", dedupe_key: uniq("k") })).code).toBe("23514");
    for (const source_type of ["demo_request", "invoice", "license", "sale_milestone"]) {
      await expect(insertTask({ source_type, source_id: id })).resolves.toBeTruthy();
    }
  });

  it("requires an auto task to carry a dedupe_key", async () => {
    expect(await violation({ origin: "auto" })).toEqual({ code: "23514", constraint: "tasks_auto_needs_key" });
    await expect(insertTask({ origin: "auto", dedupe_key: uniq("invoice_overdue") })).resolves.toBeTruthy();
  });

  it("keeps dedupe_key unique, while any number of tasks without one are allowed", async () => {
    const key = uniq("milestone");
    await insertTask({ origin: "auto", dedupe_key: key });
    expect(await violation({ origin: "auto", dedupe_key: key })).toEqual({ code: "23505", constraint: "tasks_dedupe_key" });
    // Manual tasks have no key, and NULLs do not collide.
    await insertTask();
    await insertTask();

    const { db } = await import("@/lib/db");
    const idx = await db.queryOne<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'tasks_dedupe_key'");
    expect(idx?.indexdef).toMatch(/CREATE UNIQUE INDEX/);
    expect(idx?.indexdef).toMatch(/WHERE \(dedupe_key IS NOT NULL\)/);
  });

  it("limits the title and description, and the follow-up numbers", async () => {
    expect((await violation({ title: "" })).code).toBe("23514");
    expect((await violation({ title: "x".repeat(201) })).code).toBe("23514");
    expect((await violation({ description: "x".repeat(5001) })).code).toBe("23514");
    expect((await violation({ follow_up_every_days: 0 })).code).toBe("23514");
    expect((await violation({ follow_up_count: -1 })).code).toBe("23514");
    await expect(insertTask({ title: "x".repeat(200), description: "x".repeat(5000), follow_up_every_days: 3 })).resolves.toBeTruthy();
  });

  it("refuses to delete a category or priority that tasks use, and keeps the task if its client or people go away", async () => {
    const { db } = await import("@/lib/db");
    const category = (await db.queryOne<{ id: string }>("INSERT INTO task_categories (key, name, colour, sort_order) VALUES ($1, 'Temp', '#123456', 900) RETURNING id", [uniq("tmp")]))!.id;
    const owner = await makeUser("Task Owner");
    const client = (await db.queryOne<{ id: string }>("INSERT INTO clients (legal_name, display_name) VALUES ($1, $1) RETURNING id", [uniq("Client")]))!.id;
    const id = await insertTask({ category_id: category, owner_id: owner.id, created_by: owner.id, client_id: client });

    await expect(db.query("DELETE FROM task_categories WHERE id = $1", [category])).rejects.toMatchObject({ code: "23503" });
    await expect(db.query("DELETE FROM task_priorities WHERE id = $1", [priorityId])).rejects.toMatchObject({ code: "23503" });

    await db.query("DELETE FROM clients WHERE id = $1", [client]);
    await db.query("DELETE FROM users WHERE id = $1", [owner.id]);
    expect(await db.queryOne("SELECT client_id, owner_id, created_by FROM tasks WHERE id = $1", [id])).toEqual({ client_id: null, owner_id: null, created_by: null });

    // Leave the seeded lists exactly as seeded for the tests below.
    await db.query("DELETE FROM tasks WHERE id = $1", [id]);
    await db.query("DELETE FROM task_categories WHERE id = $1", [category]);
  });

  it("indexes the lookups the Desk makes", async () => {
    const { db } = await import("@/lib/db");
    const rows = await db.query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'tasks'");
    expect(rows.map((r) => r.indexname)).toEqual(expect.arrayContaining([
      "tasks_owner_status_due_idx", "tasks_follow_up_idx", "tasks_category_idx", "tasks_client_idx", "tasks_source_idx", "tasks_dedupe_key",
    ]));
  });
});

describe("task categories and priorities", () => {
  it("seeds the eight starter categories and four priorities", async () => {
    const { db } = await import("@/lib/db");
    const categories = await db.query<{ key: string; is_system: boolean; default_follow_up_days: number | null; is_active: boolean }>(
      "SELECT key, is_system, default_follow_up_days, is_active FROM task_categories ORDER BY sort_order",
    );
    expect(categories.map((c) => c.key)).toEqual(["sales_leads", "collections", "billing", "licences", "clients_support", "delivery", "finance_compliance", "admin_hiring"]);
    // Every starter row is protected: a deleted one would come back the next time the seeds are applied.
    expect(categories.every((c) => c.is_system)).toBe(true);
    expect(Object.fromEntries(categories.filter((c) => c.default_follow_up_days !== null).map((c) => [c.key, c.default_follow_up_days]))).toEqual({ collections: 3, sales_leads: 2, licences: 7 });
    expect(categories.every((c) => c.is_active)).toBe(true);

    const priorities = await db.query<{ key: string; rank: number; is_system: boolean }>("SELECT key, rank, is_system FROM task_priorities ORDER BY rank");
    expect(priorities).toEqual([
      { key: "critical", rank: 1, is_system: true },
      { key: "high", rank: 2, is_system: true },
      { key: "normal", rank: 3, is_system: true },
      { key: "low", rank: 4, is_system: true },
    ]);
  });

  it("gives every seeded row a name and a #rrggbb colour", async () => {
    const { db } = await import("@/lib/db");
    for (const table of ["task_categories", "task_priorities"]) {
      const rows = await db.query<{ name: string; colour: string }>(`SELECT name, colour FROM ${table}`);
      for (const r of rows) {
        expect(r.name.trim().length).toBeGreaterThan(0);
        expect(r.colour).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("re-running the seeds keeps an edited row and adds nothing", async () => {
    const { db } = await import("@/lib/db");
    await db.query("UPDATE task_categories SET name = 'Chasing money', is_active = false WHERE key = 'collections'");
    await db.query("UPDATE task_priorities SET name = 'Drop everything' WHERE key = 'critical'");

    await db.query(await readFile(join(process.cwd(), "db", "seeds", "defaults.sql"), "utf8"));

    expect(await db.queryOne("SELECT name, is_active FROM task_categories WHERE key = 'collections'")).toEqual({ name: "Chasing money", is_active: false });
    expect((await db.queryOne<{ name: string }>("SELECT name FROM task_priorities WHERE key = 'critical'"))!.name).toBe("Drop everything");
    expect((await db.queryOne<{ n: number }>("SELECT count(*)::int AS n FROM task_categories"))!.n).toBe(8);
    expect((await db.queryOne<{ n: number }>("SELECT count(*)::int AS n FROM task_priorities"))!.n).toBe(4);
  });

  it("keeps keys unique and the numbers sensible", async () => {
    const { db } = await import("@/lib/db");
    await expect(db.query("INSERT INTO task_categories (key, name, colour, sort_order) VALUES ('collections', 'Again', '#000000', 1)")).rejects.toMatchObject({ code: "23505" });
    await expect(db.query("INSERT INTO task_priorities (key, name, colour, rank, sort_order) VALUES ('critical', 'Again', '#000000', 9, 1)")).rejects.toMatchObject({ code: "23505" });
    await expect(db.query("INSERT INTO task_categories (key, name, colour, default_follow_up_days, sort_order) VALUES ($1, 'Zero', '#000000', 0, 1)", [uniq("z")])).rejects.toMatchObject({ code: "23514" });
    await expect(db.query("INSERT INTO task_priorities (key, name, colour, rank, sort_order) VALUES ($1, 'Rank zero', '#000000', 0, 1)", [uniq("z")])).rejects.toMatchObject({ code: "23514" });
  });
});
