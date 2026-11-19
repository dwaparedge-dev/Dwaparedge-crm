import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import type { TaskStatus } from "@/features/tasks/schema";
import { compareTasks, SECTION_ORDER } from "@/features/tasks/sections";
import { createTestDb, expectAppError, makeUser, type TestDb } from "./helpers";

/**
 * The injected clock: 2026-11-19 11:30 in India, so "today" is 2026-11-19. Follow-up times in the data below are judged
 * against this, never against the machine's time.
 */
const NOW = new Date("2026-11-19T06:00:00.000Z");
/** Half an hour after midnight in India on the 20th, while it is still the 19th in UTC. */
const AFTER_IST_MIDNIGHT = new Date("2026-11-19T19:00:00.000Z");

let tdb: TestDb;
/** Holds all four task permissions, as both founders do. */
let founder: CurrentUser;
/** Holds no permission at all, as a new account does. */
let nobody: CurrentUser;
/** Another account with no permission. */
let other: CurrentUser;
/** Sees everyone's tasks but may not assign them. */
let viewer: CurrentUser;
/** An account that has been deactivated. */
let gone: CurrentUser;
let collections: { id: string; name: string; colour: string };
let billing: { id: string; name: string; colour: string };

async function actor(name: string, permissions: CurrentUser["permissions"]): Promise<CurrentUser> {
  const u = await makeUser(name);
  return { id: u.id, name, email: u.email, permissions };
}

interface Seed {
  owner: string | null;
  by: string | null;
  status?: TaskStatus;
  due?: string;
  followUp?: string;
  priority?: "critical" | "high" | "normal";
  category?: "collections" | "billing";
  createdAt?: string;
}

/** Task id by seed name. */
const id: Record<string, string> = {};

beforeAll(async () => {
  tdb = await createTestDb();
  const { db } = await import("@/lib/db");
  const lookup = async (table: string, key: string) => (await db.queryOne<{ id: string; name: string; colour: string }>(`SELECT id, name, colour FROM ${table} WHERE key = $1`, [key]))!;
  collections = await lookup("task_categories", "collections");
  billing = await lookup("task_categories", "billing");
  founder = await actor("Founder One", [...PERMISSIONS]);
  nobody = await actor("New Account", []);
  other = await actor("Other Staff", []);
  viewer = await actor("Read Only", ["tasks.view_all"]);
  gone = await actor("Gone Staff", []);
  await db.query("UPDATE users SET is_active = false WHERE id = $1", [gone.id]);
});
afterAll(async () => tdb?.drop());

// The data is written once and never changed, so every test reads the same Desk. Each task is named after what it is for.
// Rows are inserted directly (the service cannot make a task due in the past); created_at is set by position so that ties
// in the ordering are decided the same way every run.
beforeAll(async () => {
  const { db } = await import("@/lib/db");
  const priorities: Record<string, string> = {};
  for (const key of ["critical", "high", "normal"]) priorities[key] = (await db.queryOne<{ id: string }>("SELECT id FROM task_priorities WHERE key = $1", [key]))!.id;
  const categories = { collections: collections.id, billing: billing.id };
  const F = founder.id;

  const seeds: Record<string, Seed> = {
    // The founder's own tasks, one or more per section.
    fOverdueHigh: { owner: F, by: F, due: "2026-11-10", priority: "high" },
    fOverdueNormal: { owner: F, by: F, due: "2026-11-12" },
    fOverdueReturned: { owner: F, by: F, due: "2026-11-01", followUp: "2026-11-16T04:30:00.000Z", category: "billing" }, // came back from parked, still overdue
    fFollowUpDue: { owner: F, by: F, followUp: "2026-11-17T04:30:00.000Z" },
    fFollowUpDueDated: { owner: F, by: F, due: "2026-11-25", followUp: "2026-11-18T04:30:00.000Z" },
    fToday: { owner: F, by: F, due: "2026-11-19", priority: "high", category: "billing" },
    fNext7: { owner: F, by: F, due: "2026-11-26" }, // today + 7, the last day of the section
    fLater8: { owner: F, by: F, due: "2026-11-27" }, // today + 8
    fNoDateNew: { owner: F, by: F, createdAt: "2026-11-05T00:00:00.000Z" },
    fNoDateOld: { owner: F, by: F, createdAt: "2026-11-01T00:00:00.000Z" },
    fParkedLate: { owner: F, by: F, due: "2026-11-12", followUp: "2026-11-25T04:30:00.000Z" },
    fParkedNoDate: { owner: F, by: F, followUp: "2026-12-01T04:30:00.000Z", category: "billing" },
    fParkedFuture: { owner: F, by: F, due: "2026-12-05", followUp: "2026-11-30T04:30:00.000Z" },
    fWaiting: { owner: F, by: F, status: "waiting", due: "2026-11-18", followUp: "2026-11-22T04:30:00.000Z" },
    fDone: { owner: F, by: F, status: "done", due: "2026-11-05" },
    fCancelled: { owner: F, by: F, status: "cancelled", due: "2026-11-05", category: "billing" },
    // Raised by someone without permissions for the founder.
    cOverdue: { owner: F, by: nobody.id, due: "2026-11-13" },
    // Nobody's: raised by the system, or by an account without permissions and never handed to anyone.
    uToday: { owner: null, by: null, due: "2026-11-19", category: "billing" },
    uOverdue: { owner: null, by: null, due: "2026-11-15", priority: "critical", category: "billing" },
    nUnassigned: { owner: null, by: nobody.id, due: "2026-11-16" },
    // Owned by an account that has since been deactivated.
    gOverdue: { owner: gone.id, by: F, due: "2026-11-14", priority: "high" },
    // Other people's tasks.
    oOverdue: { owner: other.id, by: other.id, due: "2026-11-11" },
    oToday: { owner: other.id, by: other.id, due: "2026-11-19", category: "billing" },
    nOverdue: { owner: nobody.id, by: nobody.id, due: "2026-11-12", priority: "high" },
    nLater: { owner: nobody.id, by: nobody.id, category: "billing" },
    nDone: { owner: nobody.id, by: nobody.id, status: "done", due: "2026-11-05" },
    nParked: { owner: nobody.id, by: nobody.id, due: "2026-11-10", followUp: "2026-11-24T04:30:00.000Z" },
    nFromFounder: { owner: nobody.id, by: F, due: "2026-11-19", category: "billing" },
  };

  await Promise.all(
    Object.entries(seeds).map(async ([title, s], i) => {
      const row = await db.queryOne<{ id: string }>(
        `INSERT INTO tasks (title, category_id, priority_id, status, owner_id, created_by, due_date, follow_up_at, completed_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          title, categories[s.category ?? "collections"], priorities[s.priority ?? "normal"], s.status ?? "open", s.owner, s.by,
          s.due ?? null, s.followUp ?? null, s.status === "done" ? "2026-11-06T00:00:00.000Z" : null,
          s.createdAt ?? `2026-11-10T00:${String(i).padStart(2, "0")}:00.000Z`,
        ],
      );
      id[title] = row!.id;
    }),
  );
});

// Every call goes through the schema first, as the route does.

async function desk(by: CurrentUser, query: Record<string, unknown> = {}, now: Date = NOW) {
  const { getDesk } = await import("@/features/tasks/desk");
  const { deskQuerySchema } = await import("@/features/tasks/schema");
  return getDesk(by, deskQuerySchema.parse(query), now);
}

const counts = async (by: CurrentUser, now: Date = NOW) => (await import("@/features/tasks/desk")).getDeskCounts(by, now);

type Desk = Awaited<ReturnType<typeof desk>>;

/** The task titles in each section, in the order shown. */
const titles = (d: Desk) => Object.fromEntries(SECTION_ORDER.map((s) => [s, d.sections[s].map((t) => t.title)]));
const total = (d: Desk) => SECTION_ORDER.reduce((n, s) => n + d.sections[s].length, 0);
const allTitles = (d: Desk) => SECTION_ORDER.flatMap((s) => d.sections[s].map((t) => t.title)).sort();

describe("the default Desk (mine, and unassigned for someone who may see all)", () => {
  it("gives a founder their own tasks and the unassigned ones in six sections, each ordered by priority, due date, then age", async () => {
    const d = await desk(founder);
    expect(d.today).toBe("2026-11-19");
    expect(titles(d)).toEqual({
      // critical first, then high by due date, then normal by due date (a deactivated owner's task is one of the unassigned)
      overdue: ["uOverdue", "fOverdueHigh", "gOverdue", "fOverdueReturned", "fOverdueNormal", "cOverdue", "nUnassigned"],
      // the one with a due date before the one without
      followups_due: ["fFollowUpDueDated", "fFollowUpDue"],
      today: ["fToday", "uToday"],
      next7: ["fNext7"],
      // a dated task before the undated ones, which go oldest first
      later: ["fLater8", "fNoDateOld", "fNoDateNew"],
      // by due date: a waiting task is parked too
      parked: ["fParkedLate", "fWaiting", "fParkedFuture", "fParkedNoDate"],
    });
    expect(total(d)).toBe(19);
    // The two people's own tasks are not in it, and neither is anything someone else owns.
    expect(allTitles(d)).not.toContain("oOverdue");
    expect(allTitles(d)).not.toContain("nFromFounder");
  });

  it("returns the whole task row, as TASK_SELECT reads it", async () => {
    const d = await desk(founder);
    const row = d.sections.overdue.find((t) => t.title === "fOverdueReturned")!;
    expect(row).toMatchObject({
      id: id.fOverdueReturned, status: "open", owner_id: founder.id, owner_name: "Founder One", created_by: founder.id,
      category_id: billing.id, category_name: billing.name, category_colour: billing.colour,
      priority_name: "Normal", priority_rank: 3, due_date: "2026-11-01", follow_up_at: "2026-11-16T04:30:00.000Z",
    });
    expect(d.sections.parked.find((t) => t.title === "fWaiting")).toMatchObject({ status: "waiting", due_date: "2026-11-18" });
  });

  it("orders every section by compareTasks", async () => {
    for (const d of [await desk(founder), await desk(founder, { owner: "all" })]) {
      for (const section of SECTION_ORDER) {
        const rows = d.sections[section].map((t) => ({ priorityRank: t.priority_rank, dueDate: t.due_date, createdAt: t.created_at }));
        for (let i = 1; i < rows.length; i++) expect(compareTasks(rows[i - 1]!, rows[i]!)).toBeLessThanOrEqual(0);
      }
    }
  });

  it("counts overdue, follow-ups due, due today, the next 7 days and parked (with how many of those are late)", async () => {
    const d = await desk(founder);
    expect(d.counts).toEqual({ overdue: 7, followUpsDue: 2, dueToday: 2, next7: 1, parked: 4, parkedLate: 2, badge: 9 });
  });

  it("makes the badge overdue plus follow-ups due, so parked tasks past their deadline are shown but not counted in it", async () => {
    const d = await desk(founder);
    expect(d.counts.badge).toBe(d.counts.overdue + d.counts.followUpsDue);
    // Past their due date, but parked: in the Parked section and in parkedLate, not in Overdue.
    expect(titles(d).parked).toEqual(expect.arrayContaining(["fParkedLate", "fWaiting"]));
    expect(titles(d).overdue).not.toContain("fParkedLate");
    expect(titles(d).overdue).not.toContain("fWaiting");
    expect(d.counts.parkedLate).toBe(2);
  });

  it("counts the tasks per category, most first, and they add up to the tasks shown", async () => {
    const d = await desk(founder);
    expect(d.categories).toEqual([
      { id: collections.id, name: collections.name, colour: collections.colour, count: 14 },
      { id: billing.id, name: billing.name, colour: billing.colour, count: 5 },
    ]);
    expect(d.categories.reduce((n, c) => n + c.count, 0)).toBe(total(d));
  });

  it("never shows done or cancelled tasks", async () => {
    for (const d of [await desk(founder), await desk(founder, { owner: "all" }), await desk(founder, { owner: nobody.id })]) {
      const shown = allTitles(d);
      for (const closed of ["fDone", "fCancelled", "nDone"]) expect(shown).not.toContain(closed);
    }
    const all = await desk(founder, { owner: "all" });
    expect(total(all)).toBe(25); // 28 tasks seeded, 3 of them closed
    expect(all.categories.reduce((n, c) => n + c.count, 0)).toBe(25);
  });

  it("shows a task whose owner was deactivated as unassigned, and counts it", async () => {
    const d = await desk(founder);
    const row = d.sections.overdue.find((t) => t.title === "gOverdue")!;
    expect(row).toMatchObject({ id: id.gOverdue, owner_id: null, owner_name: null, created_by: founder.id });
    // uToday, uOverdue, nUnassigned and gOverdue
    expect(d.unassigned).toBe(4);

    expect(titles(await desk(founder, { owner: "unassigned" })).overdue).toContain("gOverdue");
    // It is no one's any more, not even the person who was deactivated.
    expect(total(await desk(founder, { owner: gone.id }))).toBe(0);
    // A user with no permissions never sees it: it is not theirs.
    expect(allTitles(await desk(nobody))).not.toContain("gOverdue");
  });

  it("counts the unassigned tasks in view", async () => {
    expect((await desk(founder, { owner: "all" })).unassigned).toBe(4);
    expect((await desk(founder, { owner: "unassigned" })).unassigned).toBe(4);
    expect((await desk(founder, { owner: other.id })).unassigned).toBe(0);
  });
});

describe("whose tasks the Desk shows", () => {
  it("shows a user with no permissions only the tasks they own, with no unassigned ones", async () => {
    const d = await desk(nobody);
    expect(titles(d)).toEqual({
      overdue: ["nOverdue"], followups_due: [], today: ["nFromFounder"], next7: [], later: ["nLater"], parked: ["nParked"],
    });
    // cOverdue (theirs by creator, the founder's by owner) and nUnassigned (theirs by creator, no owner) are not on it.
    expect(d.unassigned).toBe(0);
    expect(d.counts).toEqual({ overdue: 1, followUpsDue: 0, dueToday: 1, next7: 0, parked: 1, parkedLate: 1, badge: 1 });
    expect(d.categories).toEqual([
      { id: billing.id, name: billing.name, colour: billing.colour, count: 2 },
      { id: collections.id, name: collections.name, colour: collections.colour, count: 2 },
    ]);
  });

  it("answers 403 FORBIDDEN to a user without tasks.view_all who asks for everyone, the unassigned, or another person", async () => {
    await expectAppError(desk(nobody, { owner: "all" }), 403, "FORBIDDEN");
    await expectAppError(desk(nobody, { owner: "unassigned" }), 403, "FORBIDDEN");
    await expectAppError(desk(nobody, { owner: other.id }), 403, "FORBIDDEN");
    await expectAppError(desk(nobody, { owner: founder.id }), 403, "FORBIDDEN");
  });

  it("gives a user who may see all, but holds no other permission, their own tasks and the unassigned ones", async () => {
    // The viewer owns nothing, so it is exactly the unassigned tasks.
    const d = await desk(viewer);
    expect(titles(d)).toEqual({
      overdue: ["uOverdue", "gOverdue", "nUnassigned"], followups_due: [], today: ["uToday"], next7: [], later: [], parked: [],
    });
    expect(d.unassigned).toBe(4);
  });

  it("shows everyone's tasks for owner=all", async () => {
    const d = await desk(founder, { owner: "all" });
    expect(titles(d)).toEqual({
      overdue: ["uOverdue", "fOverdueHigh", "nOverdue", "gOverdue", "fOverdueReturned", "oOverdue", "fOverdueNormal", "cOverdue", "nUnassigned"],
      followups_due: ["fFollowUpDueDated", "fFollowUpDue"],
      today: ["fToday", "uToday", "oToday", "nFromFounder"],
      next7: ["fNext7"],
      later: ["fLater8", "fNoDateOld", "fNoDateNew", "nLater"],
      parked: ["nParked", "fParkedLate", "fWaiting", "fParkedFuture", "fParkedNoDate"],
    });
    expect(d.counts).toEqual({ overdue: 9, followUpsDue: 2, dueToday: 4, next7: 1, parked: 5, parkedLate: 3, badge: 11 });
    expect(d.categories).toEqual([
      { id: collections.id, name: collections.name, colour: collections.colour, count: 17 },
      { id: billing.id, name: billing.name, colour: billing.colour, count: 8 },
    ]);
  });

  it("shows only the unassigned tasks for owner=unassigned, deactivated owners included", async () => {
    const d = await desk(founder, { owner: "unassigned" });
    expect(titles(d)).toEqual({
      overdue: ["uOverdue", "gOverdue", "nUnassigned"], followups_due: [], today: ["uToday"], next7: [], later: [], parked: [],
    });
    expect(d.counts).toEqual({ overdue: 3, followUpsDue: 0, dueToday: 1, next7: 0, parked: 0, parkedLate: 0, badge: 3 });
  });

  it("shows only one person's tasks for owner=<their id>, whoever created them, to a user who may see all", async () => {
    expect(titles(await desk(founder, { owner: other.id }))).toEqual({
      overdue: ["oOverdue"], followups_due: [], today: ["oToday"], next7: [], later: [], parked: [],
    });
    // nFromFounder was created by the founder, but it is nobody's to do.
    expect(titles(await desk(founder, { owner: nobody.id }))).toEqual({
      overdue: ["nOverdue"], followups_due: [], today: ["nFromFounder"], next7: [], later: ["nLater"], parked: ["nParked"],
    });
    // Another viewer with no assign right may use the filter too.
    expect(allTitles(await desk(viewer, { owner: other.id }))).toEqual(["oOverdue", "oToday"]);
  });
});

describe("the sidebar badge counts", () => {
  it("equal the Desk's counts for the same user and moment", async () => {
    for (const who of [founder, nobody, viewer]) {
      for (const now of [NOW, AFTER_IST_MIDNIGHT]) {
        expect(await counts(who, now)).toEqual((await desk(who, {}, now)).counts);
      }
    }
    expect(await counts(founder)).toEqual({ overdue: 7, followUpsDue: 2, dueToday: 2, next7: 1, parked: 4, parkedLate: 2, badge: 9 });
    expect(await counts(nobody)).toEqual({ overdue: 1, followUpsDue: 0, dueToday: 1, next7: 0, parked: 1, parkedLate: 1, badge: 1 });
  });

  it("use today's date in India, not in UTC", async () => {
    // 19:00 UTC is already the 20th in India: what was due today is now overdue, and the 27th is a week away.
    const d = await desk(founder, {}, AFTER_IST_MIDNIGHT);
    expect(d.today).toBe("2026-11-20");
    expect(d.counts).toEqual({ overdue: 9, followUpsDue: 2, dueToday: 0, next7: 2, parked: 4, parkedLate: 2, badge: 11 });
    expect(titles(d).overdue).toEqual(expect.arrayContaining(["fToday", "uToday"]));
    expect(await counts(founder, AFTER_IST_MIDNIGHT)).toEqual(d.counts);
  });
});
