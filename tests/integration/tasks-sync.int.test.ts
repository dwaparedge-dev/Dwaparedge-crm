import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createTestDb, expectAppError, makeUser, uniq, type TestDb } from "./helpers";

let tdb: TestDb;
let founder: CurrentUser;

beforeAll(async () => {
  process.env.TASKS_AUTO_FROM = "2000-01-01";
  tdb = await createTestDb();
  const u = await makeUser("Founder");
  founder = { id: u.id, name: "Founder", email: u.email, permissions: [...PERMISSIONS] };
});
afterAll(async () => tdb?.drop());

async function demo() {
  const { createDemoRequest } = await import("@/features/demo-requests/service");
  const { demoRequestInputSchema } = await import("@/features/demo-requests/schema");
  const n = Math.floor(Math.random() * 90_000_000);
  const { id } = await createDemoRequest(demoRequestInputSchema.parse({ name: "Lead", company: uniq("Co"), mobile: String(6_000_000_000 + n), email: `${uniq("l")}@x.test` }));
  return id;
}
async function taskFor(id: string) {
  const { db } = await import("@/lib/db");
  return (await db.queryOne<{ id: string; status: string; completed_by: string | null; origin: string }>("SELECT id, status, completed_by, origin FROM tasks WHERE source_id = $1", [id]))!;
}
async function setStatus(id: string, status: string) {
  const { db } = await import("@/lib/db");
  await db.query("UPDATE demo_requests SET status = $2 WHERE id = $1", [id, status]);
}

describe("auto-task sync", () => {
  it("raises one task per demo request, however often or concurrently it runs", async () => {
    const { syncAutoTasks } = await import("@/features/tasks/sync");
    const id = await demo();
    const runs = await Promise.all([syncAutoTasks(), syncAutoTasks(), syncAutoTasks()]);
    expect(runs.some((r) => r.status === "ran")).toBe(true);
    await syncAutoTasks();
    const { db } = await import("@/lib/db");
    const rows = await db.query("SELECT id FROM tasks WHERE source_id = $1", [id]);
    expect(rows).toHaveLength(1);
    expect((await taskFor(id)).origin).toBe("auto");
  });

  it("closes a task when its cause ends and reopens that same task if the cause returns", async () => {
    const { syncAutoTasks } = await import("@/features/tasks/sync");
    const id = await demo();
    await syncAutoTasks();
    const first = await taskFor(id);
    await setStatus(id, "contacted");
    await syncAutoTasks();
    expect(await taskFor(id)).toMatchObject({ id: first.id, status: "done", completed_by: null });
    await setStatus(id, "new");
    await syncAutoTasks();
    expect(await taskFor(id)).toMatchObject({ id: first.id, status: "open" });
  });

  it("never reopens a task a person closed", async () => {
    const { syncAutoTasks } = await import("@/features/tasks/sync");
    const { setTaskStatus } = await import("@/features/tasks/service");
    const id = await demo();
    await syncAutoTasks();
    const t = await taskFor(id);
    await setTaskStatus(t.id, { status: "cancelled" }, founder);
    await syncAutoTasks();
    expect((await taskFor(id)).status).toBe("cancelled");
  });

  it("marks the demo request contacted and closes the task together; plain Done is refused", async () => {
    const { syncAutoTasks } = await import("@/features/tasks/sync");
    const { setTaskStatus } = await import("@/features/tasks/service");
    const { markDemoRequestTaskContacted } = await import("@/features/tasks/demo-request-task");
    const { db } = await import("@/lib/db");
    const id = await demo();
    await syncAutoTasks();
    const t = await taskFor(id);
    await expectAppError(setTaskStatus(t.id, { status: "done" }, founder), 409);
    await markDemoRequestTaskContacted(t.id, founder);
    expect(await taskFor(id)).toMatchObject({ status: "done", completed_by: founder.id });
    const r = await db.queryOne<{ status: string; contacted_at: string | null }>("SELECT status, contacted_at FROM demo_requests WHERE id = $1", [id]);
    expect(r!.status).toBe("contacted");
    expect(r!.contacted_at).not.toBeNull();
  });
});
