import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { PERMISSIONS } from "@/lib/auth/permissions";
import type { FollowUpInput, SnoozeInput } from "@/features/tasks/schema";
import { isFollowUpDue, isStuck, sectionOf, SECTION_ORDER } from "@/features/tasks/sections";
import { createTestDb, expectAppError, makeClient, makeUser, uniq, type TestDb } from "./helpers";

// A minimal stand-in for the request's cookie jar, for the route tests at the end (next/headers only works inside a real
// request). The service tests never touch it.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
}));

const MISSING = "6b1a9d5e-8c43-4f5b-9d39-0f3f3b0f2f11";
/** The injected clock: 2026-11-19 11:30 in India. Every time below is judged against it, never against the machine's. */
const NOW = new Date("2026-11-19T06:00:00.000Z");
const DAY_MS = 86_400_000;
/** `days` after NOW, as the ISO string the database gives back. */
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY_MS).toISOString();

type Actor = CurrentUser & { password: string };

let tdb: TestDb;
/** Holds all four task permissions, as both founders do. */
let founder: Actor;
/** Holds no permission at all, as a new account does. */
let nobody: Actor;
/** Another account with no permission. */
let other: Actor;
/** Sees everyone's tasks but may change only their own. */
let viewer: Actor;
let collections: string;
let billing: string;
let normal: string;

/** The permissions live on this object only: the service tests pass it in, so the database row keeps none. */
async function actor(name: string, permissions: CurrentUser["permissions"]): Promise<Actor> {
  const u = await makeUser(name);
  return { id: u.id, name, email: u.email, password: u.password, permissions };
}

beforeAll(async () => {
  tdb = await createTestDb();
  const { db } = await import("@/lib/db");
  const id = async (table: string, key: string) => (await db.queryOne<{ id: string }>(`SELECT id FROM ${table} WHERE key = $1`, [key]))!.id;
  collections = await id("task_categories", "collections");
  billing = await id("task_categories", "billing");
  normal = await id("task_priorities", "normal");
  founder = await actor("Founder One", [...PERMISSIONS]);
  nobody = await actor("New Account", []);
  other = await actor("Other Staff", []);
  viewer = await actor("Read Only", ["tasks.view_all"]);
});
afterAll(async () => tdb?.drop());

// Every call goes through the schema first, as the routes do, so the service sees exactly what it will see in production.

/** A Collections task (it repeats every 3 days) unless the body says otherwise. */
async function create(body: Record<string, unknown>, by: CurrentUser): Promise<string> {
  const { createTask } = await import("@/features/tasks/service");
  const { createTaskSchema } = await import("@/features/tasks/schema");
  return (await createTask(createTaskSchema.parse({ title: uniq("Task"), categoryId: collections, priorityId: normal, ...body }), by, NOW)).id;
}

async function followUp(id: string, body: Record<string, unknown>, by: CurrentUser, now: Date = NOW) {
  const { followUpSchema } = await import("@/features/tasks/schema");
  return followUpRaw(id, followUpSchema.parse(body), by, now);
}

/** Skips the schema, to reach the service's own checks. */
async function followUpRaw(id: string, input: FollowUpInput, by: CurrentUser, now: Date = NOW) {
  const { recordFollowUp } = await import("@/features/tasks/follow-ups");
  return recordFollowUp(id, input, by, now);
}

async function snooze(id: string, body: Record<string, unknown>, by: CurrentUser, now: Date = NOW) {
  const { snoozeSchema } = await import("@/features/tasks/schema");
  return snoozeRaw(id, snoozeSchema.parse(body), by, now);
}

async function snoozeRaw(id: string, input: SnoozeInput, by: CurrentUser, now: Date = NOW) {
  const { snoozeTask } = await import("@/features/tasks/follow-ups");
  return snoozeTask(id, input, by, now);
}

async function setStatus(id: string, body: Record<string, unknown>, by: CurrentUser, now: Date = NOW) {
  const { setTaskStatus } = await import("@/features/tasks/service");
  const { taskStatusSchema } = await import("@/features/tasks/schema");
  return setTaskStatus(id, taskStatusSchema.parse(body), by, now);
}

/** The task with its history, as the founder (who sees every task) reads it. */
const get = async (id: string) => (await import("@/features/tasks/service")).getTask(id, founder);

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

async function desk(by: CurrentUser, now: Date) {
  const { getDesk } = await import("@/features/tasks/desk");
  return getDesk(by, { owner: "me" }, now);
}

/** The task ids in each Desk section, in the order shown. */
const sectionIds = (d: Awaited<ReturnType<typeof desk>>) => Object.fromEntries(SECTION_ORDER.map((s) => [s, d.sections[s].map((t) => t.id)]));

describe("recording a follow-up", () => {
  it("in_days: 3 counts it, stamps when, parks the task until now plus 3 days, and logs the note and what is next", async () => {
    const clientId = await makeClient(founder.id);
    const id = await create({ title: "Collect from Acme", clientId }, founder);
    await followUp(id, { note: "Called, will pay Friday", next: { kind: "in_days", days: 3 } }, founder);

    expect(await get(id)).toMatchObject({
      status: "open", follow_up_at: "2026-11-22T06:00:00.000Z", follow_up_count: 1, last_followed_up_at: "2026-11-19T06:00:00.000Z",
      follow_up_every_days: 3, // the cadence is left as it was
    });
    expect((await history(id)).slice(1)).toEqual([{
      action: "followed_up", summary: 'Followed up on "Collect from Acme": Called, will pay Friday (next follow-up 22 Nov 2026, 11:30 am)',
      actor_id: founder.id, client_id: clientId, metadata: { note: "Called, will pay Friday", next: { kind: "in_days", days: 3 } },
    }]);
  });

  it("at: sets that time, stored and logged as the same instant in UTC", async () => {
    const id = await create({ title: "Chase the PO" }, founder);
    await followUp(id, { note: "Left a message", next: { kind: "at", at: "2026-11-25T10:00:00+05:30" } }, founder);

    expect(await get(id)).toMatchObject({ follow_up_at: "2026-11-25T04:30:00.000Z", follow_up_count: 1, last_followed_up_at: "2026-11-19T06:00:00.000Z" });
    expect((await history(id))[1]).toMatchObject({
      action: "followed_up", summary: 'Followed up on "Chase the PO": Left a message (next follow-up 25 Nov 2026, 10:00 am)',
      metadata: { note: "Left a message", next: { kind: "at", at: "2026-11-25T04:30:00.000Z" } },
    });
  });

  it("cadence: uses the task's own cadence, and is refused (422) on a task without one, which is left as it was", async () => {
    const id = await create({ title: "Every five days", followUpEveryDays: 5 }, founder);
    await followUp(id, { note: "Sent a reminder", next: { kind: "cadence" } }, founder);
    expect(await get(id)).toMatchObject({ follow_up_at: "2026-11-24T06:00:00.000Z", follow_up_every_days: 5, follow_up_count: 1 });
    expect((await history(id))[1]).toMatchObject({
      summary: 'Followed up on "Every five days": Sent a reminder (next follow-up 24 Nov 2026, 11:30 am)',
      metadata: { note: "Sent a reminder", next: { kind: "cadence" } },
    });

    // Billing has no default cadence, so the task has none.
    const none = await create({ categoryId: billing }, founder);
    const before = await get(none);
    expect(before.follow_up_every_days).toBeNull();
    await expectAppError(followUp(none, { note: "Sent a reminder", next: { kind: "cadence" } }, founder), 422, "VALIDATION_ERROR", /cadence/);
    expect(await get(none)).toEqual(before);
  });

  it("stop: clears the follow-up time and the cadence, and is refused (422) on a waiting task, which needs a return time", async () => {
    const id = await create({ title: "Stop chasing", followUpAt: "2026-11-21T09:00:00Z" }, founder);
    await followUp(id, { note: "They paid", next: { kind: "stop" } }, founder);
    expect(await get(id)).toMatchObject({
      status: "open", follow_up_at: null, follow_up_every_days: null, follow_up_count: 1, last_followed_up_at: "2026-11-19T06:00:00.000Z",
    });
    expect((await history(id))[1]).toMatchObject({
      summary: 'Followed up on "Stop chasing": They paid (follow-ups stopped)', metadata: { note: "They paid", next: { kind: "stop" } },
    });

    const waiting = await create({ title: "Waiting on the CA" }, founder);
    await setStatus(waiting, { status: "waiting", waitingOn: "the CA", followUpAt: "2026-11-21T09:00:00Z" }, founder);
    const before = await get(waiting);
    await expectAppError(followUp(waiting, { note: "No reply", next: { kind: "stop" } }, founder), 422, "VALIDATION_ERROR", /waiting/i);
    expect(await get(waiting)).toEqual(before);

    // Any other choice is fine: the task keeps waiting, with the new return time.
    await followUp(waiting, { note: "Still no reply", next: { kind: "in_days", days: 2 } }, founder);
    expect(await get(waiting)).toMatchObject({ status: "waiting", waiting_on: "the CA", follow_up_at: "2026-11-21T06:00:00.000Z", follow_up_count: 1 });
  });

  it("counts every follow-up and never a snooze; after 3 follow-ups the task is Stuck", async () => {
    const id = await create({ title: "Slow payer" }, founder);
    const count = async () => (await get(id)).follow_up_count;

    await followUp(id, { note: "First call", next: { kind: "in_days", days: 1 } }, founder);
    expect(await count()).toBe(1);
    await snooze(id, { until: "2026-11-28T10:00:00+05:30" }, founder);
    expect(await count()).toBe(1);
    await followUp(id, { note: "Second call", next: { kind: "cadence" } }, founder);
    expect(await count()).toBe(2);
    expect(isStuck(2)).toBe(false);
    await followUp(id, { note: "Third call", next: { kind: "in_days", days: 2 } }, founder);
    expect(await count()).toBe(3);
    expect(isStuck(await count())).toBe(true);

    expect((await history(id)).map((h) => h.action)).toEqual(["created", "followed_up", "snoozed", "followed_up", "followed_up"]);
  });
});

describe("snoozing", () => {
  it("only moves the follow-up time: the count, the last follow-up, the cadence and the status stay, and it is logged", async () => {
    const id = await create({ title: "Renewal call" }, founder);
    await followUp(id, { note: "Asked for the PO", next: { kind: "in_days", days: 1 } }, founder);
    // A day later, on another clock: the last follow-up still says when the follow-up was.
    await snooze(id, { until: "2026-11-30T09:00:00+05:30" }, founder, new Date("2026-11-20T06:00:00.000Z"));

    expect(await get(id)).toMatchObject({
      status: "open", follow_up_at: "2026-11-30T03:30:00.000Z", follow_up_count: 1, last_followed_up_at: "2026-11-19T06:00:00.000Z", follow_up_every_days: 3,
    });
    expect((await history(id))[2]).toEqual({
      action: "snoozed", summary: 'Snoozed "Renewal call" until 30 Nov 2026, 9:00 am', actor_id: founder.id, client_id: null,
      metadata: { until: "2026-11-30T03:30:00.000Z" },
    });
  });
});

describe("refusals", () => {
  it("refuses a past time, a time 400 days out and a malformed one (422) on both, and leaves the task as it was (Review Focus 3)", async () => {
    const { followUpSchema, snoozeSchema } = await import("@/features/tasks/schema");
    const id = await create({ title: "Guarded", followUpAt: "2026-11-25T09:00:00Z" }, founder);
    const before = await get(id);
    const note = "Tried";

    // In the past, and exactly now.
    for (const time of ["2026-11-19T05:59:59Z", "2026-11-19T11:30:00+05:30"]) {
      await expectAppError(followUp(id, { note, next: { kind: "at", at: time } }, founder), 422, "VALIDATION_ERROR", /future/);
      await expectAppError(snooze(id, { until: time }, founder), 422, "VALIDATION_ERROR", /future/);
    }
    // 400 days out, as a time or as a number of days (the schema stops the number; the service would too).
    await expectAppError(followUp(id, { note, next: { kind: "at", at: inDays(400) } }, founder), 422, "VALIDATION_ERROR", /365 days/);
    await expectAppError(snooze(id, { until: inDays(400) }, founder), 422, "VALIDATION_ERROR", /365 days/);
    expect(followUpSchema.safeParse({ note, next: { kind: "in_days", days: 400 } }).success).toBe(false);
    await expectAppError(followUpRaw(id, { note, next: { kind: "in_days", days: 400 } }, founder), 422, "VALIDATION_ERROR", /365 days/);
    // Malformed: not a time, a time without a time zone, a day that does not exist. The schema refuses each (a 422 at the
    // route); the service, reached directly, refuses text it cannot read.
    for (const bad of ["next friday", "2026-11-25T10:00:00", "2026-02-30T10:00:00Z"]) {
      expect(followUpSchema.safeParse({ note, next: { kind: "at", at: bad } }).success, bad).toBe(false);
      expect(snoozeSchema.safeParse({ until: bad }).success, bad).toBe(false);
    }
    await expectAppError(followUpRaw(id, { note, next: { kind: "at", at: "next friday" } }, founder), 422, "VALIDATION_ERROR");
    await expectAppError(snoozeRaw(id, { until: "next friday" }, founder), 422, "VALIDATION_ERROR");

    // No count, no time, no history row.
    expect(await get(id)).toEqual(before);

    // Exactly 365 days out is the last time allowed.
    await followUp(id, { note, next: { kind: "in_days", days: 365 } }, founder);
    expect((await get(id)).follow_up_at).toBe("2027-11-19T06:00:00.000Z");
  });

  it("refuses a done or cancelled task (409 INVALID_TRANSITION) and writes nothing", async () => {
    for (const status of ["done", "cancelled"] as const) {
      const id = await create({ title: `Closed as ${status}` }, founder);
      await setStatus(id, { status }, founder);
      const before = await get(id);
      await expectAppError(followUp(id, { note: "Too late", next: { kind: "in_days", days: 3 } }, founder), 409, "INVALID_TRANSITION", /Reopen/);
      await expectAppError(snooze(id, { until: inDays(2) }, founder), 409, "INVALID_TRANSITION", /Reopen/);
      expect(await get(id)).toEqual(before);
    }
  });
});

describe("who may follow up and snooze", () => {
  it("lets a user with no permissions act on their own task; another's is 404, and one a tasks.view_all user may only see is 403", async () => {
    const own = await create({ title: "My own" }, nobody);
    await followUp(own, { note: "Done my bit", next: { kind: "in_days", days: 2 } }, nobody);
    await snooze(own, { until: inDays(4) }, nobody);
    expect(await get(own)).toMatchObject({ follow_up_count: 1, follow_up_at: inDays(4) });

    const theirs = await create({ title: "Not yours", ownerId: other.id }, founder);
    const before = await get(theirs);
    const body = { note: "Peeking", next: { kind: "in_days", days: 2 } };
    await expectAppError(followUp(theirs, body, nobody), 404, "NOT_FOUND");
    await expectAppError(snooze(theirs, { until: inDays(2) }, nobody), 404, "NOT_FOUND");
    await expectAppError(followUp(theirs, body, viewer), 403, "FORBIDDEN");
    await expectAppError(snooze(theirs, { until: inDays(2) }, viewer), 403, "FORBIDDEN");
    expect(await get(theirs)).toEqual(before);

    // A task that does not exist answers the same as one out of sight.
    await expectAppError(followUp(MISSING, body, founder), 404, "NOT_FOUND");
    await expectAppError(snooze(MISSING, { until: inDays(2) }, founder), 404, "NOT_FOUND");

    // Its owner may, and so may someone with tasks.edit_all.
    await followUp(theirs, { note: "Owner's call", next: { kind: "in_days", days: 2 } }, other);
    await followUp(theirs, { note: "Founder's call", next: { kind: "in_days", days: 3 } }, founder);
    expect((await get(theirs)).follow_up_count).toBe(2);
  });
});

describe("two follow-ups at once (Review Focus 2)", () => {
  it("both count: the count is 2 and there are two history rows, and the time is the one written last", async () => {
    const id = await create({ title: "Busy task" }, nobody);
    const results = await Promise.allSettled([
      followUp(id, { note: "From the owner", next: { kind: "in_days", days: 2 } }, nobody),
      followUp(id, { note: "From the founder", next: { kind: "in_days", days: 3 } }, founder),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);

    const t = await get(id);
    expect(t.follow_up_count).toBe(2);
    const rows = (await history(id)).filter((h) => h.action === "followed_up");
    expect(rows.map((h) => h.metadata!.note).sort()).toEqual(["From the founder", "From the owner"]);
    // The row lock makes them run one after the other: the second one's time is the one kept.
    expect(t.follow_up_at).toBe(inDays((rows[1]!.metadata!.next as { days: number }).days));
  });
});

describe("the Desk after a follow-up (acceptance)", () => {
  it("parks an overdue task followed up for 3 days, counted as late, and brings it back when the time comes", async () => {
    const owner = await actor("Desk Owner", []);
    const late = await create({ title: "Overdue invoice", dueDate: "2026-11-12" }, owner);
    const ahead = await create({ title: "Quote to chase", dueDate: "2026-12-15" }, owner);
    expect(sectionIds(await desk(owner, NOW))).toEqual({ overdue: [late], followups_due: [], today: [], next7: [], later: [ahead], parked: [] });

    for (const id of [late, ahead]) await followUp(id, { note: "Chased", next: { kind: "in_days", days: 3 } }, owner);
    const parked = await desk(owner, NOW);
    // Parked wins over overdue: both have left the list until 22 Nov, and the overdue one is counted as late.
    expect(sectionIds(parked)).toEqual({ overdue: [], followups_due: [], today: [], next7: [], later: [], parked: [late, ahead] });
    expect(parked.counts).toEqual({ overdue: 0, followUpsDue: 0, dueToday: 0, next7: 0, parked: 2, parkedLate: 1, badge: 0 });

    const RETURNS = new Date("2026-11-22T06:00:00.000Z");
    expect(sectionIds(await desk(owner, new Date(RETURNS.getTime() - 1))).parked).toEqual([late, ahead]);

    // At the time chosen both are back. The overdue one lands in Overdue, not Follow-ups due: its deadline (12 Nov) is still
    // before today (22 Nov) and sectionOf checks Overdue first; it carries the follow-up-due tag there. The other one,
    // not yet due, is in Follow-ups due.
    const back = await desk(owner, RETURNS);
    expect(sectionIds(back)).toEqual({ overdue: [late], followups_due: [ahead], today: [], next7: [], later: [], parked: [] });
    expect(back.counts).toEqual({ overdue: 1, followUpsDue: 1, dueToday: 0, next7: 0, parked: 0, parkedLate: 0, badge: 2 });
    const row = back.sections.overdue[0]!;
    expect(isFollowUpDue({ status: row.status, dueDate: row.due_date, followUpAt: row.follow_up_at }, RETURNS)).toBe(true);
  });
});

describe("reopening a closed task (controller ruling)", () => {
  it("clears the follow-up time, so the task is back on the Desk, unless a new time comes with the move", async () => {
    // Closing keeps the time, moving between closed states keeps it, reopening drops it.
    const id = await create({ title: "Reopen me", followUpAt: "2026-11-25T09:00:00Z" }, founder);
    await setStatus(id, { status: "done" }, founder);
    await setStatus(id, { status: "cancelled" }, founder);
    expect((await get(id)).follow_up_at).toBe("2026-11-25T09:00:00.000Z");
    await setStatus(id, { status: "open" }, founder);
    const reopened = await get(id);
    expect(reopened).toMatchObject({ status: "open", follow_up_at: null });
    expect(sectionOf({ status: reopened.status, dueDate: reopened.due_date, followUpAt: reopened.follow_up_at }, NOW)).toBe("later");

    // Done after waiting, then back to in progress: the old return time goes too.
    const waited = await create({ title: "Done while waiting" }, founder);
    await setStatus(waited, { status: "waiting", followUpAt: "2026-11-25T09:00:00Z" }, founder);
    await setStatus(waited, { status: "done" }, founder);
    expect((await get(waited)).follow_up_at).toBe("2026-11-25T09:00:00.000Z");
    await setStatus(waited, { status: "in_progress" }, founder);
    expect(await get(waited)).toMatchObject({ status: "in_progress", follow_up_at: null, waiting_on: null });

    // A time sent with the reopen wins.
    const timed = await create({ title: "Reopen for later", followUpAt: "2026-11-25T09:00:00Z" }, founder);
    await setStatus(timed, { status: "done" }, founder);
    await setStatus(timed, { status: "open", followUpAt: "2026-11-28T10:00:00+05:30" }, founder);
    expect(await get(timed)).toMatchObject({ status: "open", follow_up_at: "2026-11-28T04:30:00.000Z" });
  });
});

// ---- The two routes ----

const ORIGIN = "http://localhost:3000";
const hdrs = (extra: Record<string, string> = {}): Record<string, string> => ({ origin: ORIGIN, host: "localhost:3000", "content-type": "application/json", ...extra });
const req = (path: string, body: unknown, headers = hdrs()) => new NextRequest(`${ORIGIN}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** Signs in through the real login route, so the session cookie (and the permissions read with it) are production's. */
async function login(u: Actor) {
  jar.clear();
  const { POST } = await import("@/app/api/auth/login/route");
  expect((await POST(req("/api/auth/login", { email: u.email, password: u.password }))).status).toBe(200);
}

describe("the follow-up and snooze routes", () => {
  it("turn away an anonymous caller (401), a cross-origin write (403), a malformed id or time (422) and another's task (404)", async () => {
    const follow = await import("@/app/api/tasks/[id]/follow-up/route");
    const snoozeRoute = await import("@/app/api/tasks/[id]/snooze/route");
    const id = await create({ title: "Route guarded" }, nobody);
    const theirs = await create({ title: "Route theirs", ownerId: other.id }, founder);
    const [mine, others] = [await get(id), await get(theirs)];
    const good = { note: "Rang", next: { kind: "in_days", days: 2 } };
    const until = { until: new Date(Date.now() + 2 * DAY_MS).toISOString() };

    jar.clear();
    expect((await follow.POST(req(`/api/tasks/${id}/follow-up`, good), params(id))).status).toBe(401);
    expect((await snoozeRoute.POST(req(`/api/tasks/${id}/snooze`, until), params(id))).status).toBe(401);

    await login(nobody);
    const evil = hdrs({ origin: "http://evil.example" });
    for (const res of [
      await follow.POST(req(`/api/tasks/${id}/follow-up`, good, evil), params(id)),
      await snoozeRoute.POST(req(`/api/tasks/${id}/snooze`, until, evil), params(id)),
    ]) {
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("CSRF");
    }
    for (const res of [
      await follow.POST(req("/api/tasks/nope/follow-up", good), params("nope")),
      await snoozeRoute.POST(req("/api/tasks/nope/snooze", until), params("nope")),
      await follow.POST(req(`/api/tasks/${id}/follow-up`, { note: "Rang", next: { kind: "at", at: "next friday" } }), params(id)),
      await snoozeRoute.POST(req(`/api/tasks/${id}/snooze`, { until: "2026-11-25T10:00:00" }), params(id)),
    ]) {
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    for (const res of [
      await follow.POST(req(`/api/tasks/${theirs}/follow-up`, good), params(theirs)),
      await snoozeRoute.POST(req(`/api/tasks/${theirs}/snooze`, until), params(theirs)),
    ]) {
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("NOT_FOUND");
    }

    expect(await get(id)).toEqual(mine);
    expect(await get(theirs)).toEqual(others);
  });

  it("record a follow-up and a snooze for the task's owner (200)", async () => {
    const follow = await import("@/app/api/tasks/[id]/follow-up/route");
    const snoozeRoute = await import("@/app/api/tasks/[id]/snooze/route");
    const id = await create({ title: "Route happy" }, nobody);
    await login(nobody);

    const followed = await follow.POST(req(`/api/tasks/${id}/follow-up`, { note: "Rang, no answer", next: { kind: "in_days", days: 2 } }), params(id));
    expect(followed.status).toBe(200);
    expect(await followed.json()).toEqual({ ok: true });
    const until = new Date(Date.now() + 5 * DAY_MS).toISOString();
    const snoozed = await snoozeRoute.POST(req(`/api/tasks/${id}/snooze`, { until }), params(id));
    expect(snoozed.status).toBe(200);
    expect(await snoozed.json()).toEqual({ ok: true });

    expect(await get(id)).toMatchObject({ follow_up_count: 1, follow_up_at: until });
    expect((await history(id)).map((h) => [h.action, h.actor_id])).toEqual([["created", nobody.id], ["followed_up", nobody.id], ["snoozed", nobody.id]]);
  });
});
