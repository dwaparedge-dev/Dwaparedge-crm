import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createTestDb, makeUser, uniq, type TestDb } from "./helpers";

let tdb: TestDb;
let founder: CurrentUser;

beforeAll(async () => {
  process.env.TASKS_AUTO_FROM = "2000-01-01";
  tdb = await createTestDb();
  const u = await makeUser("Founder");
  founder = { id: u.id, name: "Founder", email: u.email, permissions: [...PERMISSIONS] };
});
afterAll(async () => tdb?.drop());

describe("starting from an empty list of categories and priorities", () => {
  it("lets every starter row be deleted, and the seeds do not put it back", async () => {
    const { db } = await import("@/lib/db");
    const { deleteConfig, listConfig } = await import("@/features/tasks/config-service");

    for (const kind of ["categories", "priorities"] as const) {
      for (const row of await listConfig(kind, { includeInactive: true })) await deleteConfig(kind, row.id, founder);
      expect(await listConfig(kind, { includeInactive: true })).toEqual([]);
    }

    // The seed file runs on every `npm run db:sync`: the second time on, it must leave the lists as the user made them.
    await db.query(readFileSync("db/seeds/defaults.sql", "utf8"));
    expect(await listConfig("categories", { includeInactive: true })).toEqual([]);
    expect(await listConfig("priorities", { includeInactive: true })).toEqual([]);
  });

  it("raises no auto-task while there is nothing to file it under, then raises it once there is", async () => {
    const { db } = await import("@/lib/db");
    const { createConfig } = await import("@/features/tasks/config-service");
    const { syncAutoTasks } = await import("@/features/tasks/sync");
    const { createDemoRequest } = await import("@/features/demo-requests/service");
    const { demoRequestInputSchema } = await import("@/features/demo-requests/schema");

    const n = Math.floor(Math.random() * 90_000_000);
    const { id } = await createDemoRequest(demoRequestInputSchema.parse({ name: "Lead", company: uniq("Co"), mobile: String(6_000_000_000 + n), email: `${uniq("l")}@x.test` }));

    await expect(syncAutoTasks()).resolves.toMatchObject({ status: "ran" });
    expect(await db.query("SELECT 1 FROM tasks WHERE source_id = $1", [id])).toHaveLength(0);

    const category = await createConfig("categories", { name: "Calls", colour: "#336699" }, founder);
    const priority = await createConfig("priorities", { name: "Soon", colour: "#cc3300", rank: 1 }, founder);
    await syncAutoTasks();
    const task = await db.queryOne<{ category_id: string; priority_id: string }>("SELECT category_id, priority_id FROM tasks WHERE source_id = $1", [id]);
    expect(task).toEqual({ category_id: category.id, priority_id: priority.id });
  });
});
