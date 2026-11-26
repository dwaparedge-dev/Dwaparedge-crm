import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { expectAppError, createTestDb, makeUser, uniq, type TestDb } from "./helpers";

let tdb: TestDb;
let admin: CurrentUser;
let plain: CurrentUser;

beforeAll(async () => {
  process.env.TASKS_AUTO_FROM = "2000-01-01";
  tdb = await createTestDb();
  const a = await makeUser("Admin");
  const p = await makeUser("Plain");
  admin = { id: a.id, name: "Admin", email: a.email, permissions: ["demo_requests.delete"] };
  plain = { id: p.id, name: "Plain", email: p.email, permissions: ["tasks.view_all"] };
});
afterAll(async () => tdb?.drop());

async function lead() {
  const { createDemoRequest } = await import("@/features/demo-requests/service");
  const { demoRequestInputSchema } = await import("@/features/demo-requests/schema");
  const n = Math.floor(Math.random() * 90_000_000);
  const { id } = await createDemoRequest(demoRequestInputSchema.parse({ name: "Gone Person", company: uniq("Co"), mobile: String(6_000_000_000 + n), email: `${uniq("g")}@x.test` }));
  return id;
}

describe("deleting a demo request", () => {
  it("is refused without demo_requests.delete and changes nothing", async () => {
    const { deleteDemoRequest, getDemoRequest } = await import("@/features/demo-requests/service");
    const id = await lead();
    await expectAppError(deleteDemoRequest(id, plain), 403, "FORBIDDEN");
    await expect(getDemoRequest(id)).resolves.toMatchObject({ id });
  });

  it("removes the request for good, cancels its open task and keeps only a one-line record without contact details", async () => {
    const { db } = await import("@/lib/db");
    const { deleteDemoRequest } = await import("@/features/demo-requests/service");
    const { syncAutoTasks } = await import("@/features/tasks/sync");
    const id = await lead();
    await syncAutoTasks();
    expect(await db.queryOne("SELECT id FROM tasks WHERE source_id = $1 AND status = 'open'", [id])).not.toBeNull();

    await deleteDemoRequest(id, admin);

    expect(await db.queryOne("SELECT 1 FROM demo_requests WHERE id = $1", [id])).toBeNull();
    expect(await db.queryOne("SELECT status FROM tasks WHERE source_id = $1", [id])).toEqual({ status: "cancelled" });
    const log = await db.queryOne<{ summary: string; actor_id: string; metadata: unknown }>("SELECT summary, actor_id, metadata FROM activity_log WHERE entity_type = 'demo_request' AND entity_id = $1 AND action = 'deleted'", [id]);
    expect(log?.summary).toContain("Gone Person");
    expect(log?.actor_id).toBe(admin.id);
    expect(JSON.stringify(log?.metadata)).not.toMatch(/@x\.test|\d{10}/);

    // The sync does not bring the task back or raise another one for the deleted request.
    await syncAutoTasks();
    expect(await db.query("SELECT 1 FROM tasks WHERE source_id = $1 AND status <> 'cancelled'", [id])).toHaveLength(0);
  });

  it("answers 404 for a request that is already gone", async () => {
    const { deleteDemoRequest } = await import("@/features/demo-requests/service");
    const id = await lead();
    await deleteDemoRequest(id, admin);
    await expectAppError(deleteDemoRequest(id, admin), 404, "NOT_FOUND");
  });
});
