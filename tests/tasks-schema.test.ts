import { describe, expect, it } from "vitest";
import { cleanText, optionalPlainText, plainText } from "@/lib/validation";
import {
  ACTIVE_STATUSES,
  SOURCE_TYPES,
  TASK_STATUSES,
  createTaskSchema,
  deskQuerySchema,
  followUpSchema,
  listTasksSchema,
  noteSchema,
  snoozeSchema,
  taskStatusSchema,
  updateTaskSchema,
} from "@/features/tasks/schema";

const CATEGORY = "6b1a9d5e-8c43-4f5b-9d39-0f3f3b0f2f11";
const PRIORITY = "0c9e3a52-2a64-4d0c-8a0e-5d7f9f3d6a10";
const OWNER = "a4b1f0c2-7d35-4e2a-9b8e-3c6d1e5f7a90";
const base = { title: "Call Raj", categoryId: CATEGORY, priorityId: PRIORITY };

/** The field names a failed parse complains about. */
const failedPaths = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.error?.issues.map((i) => i.path.join(".")) ?? [];

describe("shared text helpers", () => {
  it("cleanText turns control characters into spaces, collapses runs and trims", () => {
    expect(cleanText("  Call\u0000 Raj \n now ")).toBe("Call Raj now");
    expect(cleanText("a\u007fb\tc")).toBe("a b c");
  });

  it("plainText is required, cleaned and length-checked with its own label", () => {
    const name = plainText("Name", 6);
    expect(name.parse("  Ana\u0000Li ")).toBe("Ana Li");
    expect(name.safeParse("   ").error?.issues[0].message).toBe("Name is required");
    expect(name.safeParse(undefined).error?.issues[0].message).toBe("Name is required");
    expect(name.safeParse("abcdefg").error?.issues[0].message).toBe("Name can be at most 6 characters");
  });

  it("optionalPlainText turns blank into undefined and may be left out", () => {
    const note = optionalPlainText(5);
    expect(note.parse("  x\u0000y ")).toBe("x y");
    expect(note.parse("   ")).toBeUndefined();
    expect(note.parse(undefined)).toBeUndefined();
    expect(note.safeParse("abcdef").success).toBe(false);
  });
});

describe("task constants", () => {
  it("has exactly the five statuses, three of them active", () => {
    expect([...TASK_STATUSES]).toEqual(["open", "in_progress", "waiting", "done", "cancelled"]);
    expect([...ACTIVE_STATUSES]).toEqual(["open", "in_progress", "waiting"]);
  });

  it("names the four records an auto-task can come from", () => {
    expect([...SOURCE_TYPES]).toEqual(["demo_request", "invoice", "license", "sale_milestone"]);
  });
});

describe("create task", () => {
  it("accepts the minimum and leaves everything else out", () => {
    expect(createTaskSchema.parse(base)).toEqual(base);
  });

  it("cleans the title: control characters and NULs become spaces and collapse", () => {
    expect(createTaskSchema.parse({ ...base, title: "  Call\u0000 Raj \n now " }).title).toBe("Call Raj now");
  });

  it("rejects an empty, a 201-character and a 10,000-character title, naming title", () => {
    for (const title of ["", "   ", "x".repeat(201), "x".repeat(10_000)]) {
      const r = createTaskSchema.safeParse({ ...base, title });
      expect(r.success).toBe(false);
      expect(failedPaths(r)).toEqual(["title"]);
    }
    expect(createTaskSchema.safeParse({ ...base, title: "x".repeat(200) }).success).toBe(true);
    expect(failedPaths(createTaskSchema.safeParse({ categoryId: CATEGORY, priorityId: PRIORITY }))).toEqual(["title"]);
  });

  it("strips NULs from the description and keeps its line breaks", () => {
    expect(createTaskSchema.parse({ ...base, description: "line one\n\nline two\u0000" }).description).toBe("line one\n\nline two");
  });

  it("caps the description at 5000 and turns a blank one into null", () => {
    expect(createTaskSchema.safeParse({ ...base, description: "x".repeat(5000) }).success).toBe(true);
    expect(failedPaths(createTaskSchema.safeParse({ ...base, description: "x".repeat(5001) }))).toEqual(["description"]);
    expect(createTaskSchema.parse({ ...base, description: "  " }).description).toBeNull();
  });

  it("needs a real category and priority", () => {
    expect(failedPaths(createTaskSchema.safeParse({ title: "x" })).sort()).toEqual(["categoryId", "priorityId"]);
    expect(failedPaths(createTaskSchema.safeParse({ ...base, categoryId: "nope" }))).toEqual(["categoryId"]);
    expect(failedPaths(createTaskSchema.safeParse({ ...base, priorityId: null }))).toEqual(["priorityId"]);
  });

  it("takes an owner, a client, a due date, a follow-up time and a cadence; blank owner and client mean none", () => {
    const full = createTaskSchema.parse({
      ...base,
      ownerId: OWNER,
      clientId: CATEGORY,
      dueDate: "2026-12-01",
      followUpAt: "2026-11-25T10:00:00+05:30",
      followUpEveryDays: 3,
    });
    expect(full).toMatchObject({ ownerId: OWNER, clientId: CATEGORY, dueDate: "2026-12-01", followUpAt: "2026-11-25T10:00:00+05:30", followUpEveryDays: 3 });
    expect(createTaskSchema.parse({ ...base, ownerId: "", clientId: "", dueDate: "", followUpAt: "" })).toMatchObject({
      ownerId: null,
      clientId: null,
      dueDate: null,
      followUpAt: null,
    });
  });

  it("refuses a bad owner, client, due date, follow-up time or cadence", () => {
    const bad = (extra: Record<string, unknown>) => failedPaths(createTaskSchema.safeParse({ ...base, ...extra }));
    expect(bad({ ownerId: "someone" })).toEqual(["ownerId"]);
    expect(bad({ clientId: "acme" })).toEqual(["clientId"]);
    expect(bad({ dueDate: "01/12/2026" })).toEqual(["dueDate"]);
    expect(bad({ dueDate: "2026-13-45" })).toEqual(["dueDate"]);
    expect(bad({ followUpAt: "tomorrow-ish" })).toEqual(["followUpAt"]);
    expect(bad({ followUpEveryDays: 0 })).toEqual(["followUpEveryDays"]);
    expect(bad({ followUpEveryDays: 366 })).toEqual(["followUpEveryDays"]);
    expect(bad({ followUpEveryDays: 1.5 })).toEqual(["followUpEveryDays"]);
  });

  it("ignores fields it does not own, so status and origin cannot be set at creation", () => {
    const parsed = createTaskSchema.parse({ ...base, status: "done", origin: "auto", sourceType: "invoice", createdBy: OWNER });
    expect(parsed).toEqual(base);
  });
});

describe("update task", () => {
  it("changes only what is sent", () => {
    expect(updateTaskSchema.parse({ title: " New  title " })).toEqual({ title: "New title" });
    expect(updateTaskSchema.parse({ ownerId: OWNER })).toEqual({ ownerId: OWNER });
    expect(updateTaskSchema.parse({ priorityId: PRIORITY, dueDate: "2026-12-01" })).toEqual({ priorityId: PRIORITY, dueDate: "2026-12-01" });
  });

  it("clears the owner, client, due date, follow-up time and description with a blank or null", () => {
    expect(updateTaskSchema.parse({ ownerId: "", clientId: null, dueDate: "", followUpAt: null, description: "  ", followUpEveryDays: null })).toEqual({
      ownerId: null,
      clientId: null,
      dueDate: null,
      followUpAt: null,
      description: null,
      followUpEveryDays: null,
    });
  });

  it("refuses an empty change and fields that must keep a value", () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
    expect(updateTaskSchema.safeParse({ status: "done" }).success).toBe(false); // status moves only through its own endpoint
    expect(failedPaths(updateTaskSchema.safeParse({ title: "" }))).toEqual(["title"]);
    expect(failedPaths(updateTaskSchema.safeParse({ categoryId: null }))).toEqual(["categoryId"]);
    expect(failedPaths(updateTaskSchema.safeParse({ priorityId: "" }))).toEqual(["priorityId"]);
  });

  it("applies the same limits as create", () => {
    expect(failedPaths(updateTaskSchema.safeParse({ title: "x".repeat(201) }))).toEqual(["title"]);
    expect(updateTaskSchema.parse({ description: "a\nb\u0000" }).description).toBe("a\nb");
    expect(failedPaths(updateTaskSchema.safeParse({ followUpAt: "soon" }))).toEqual(["followUpAt"]);
  });
});

describe("task status", () => {
  it("takes each of the five statuses and refuses others", () => {
    for (const status of ["open", "in_progress", "done", "cancelled"]) expect(taskStatusSchema.parse({ status })).toEqual({ status });
    expect(taskStatusSchema.safeParse({ status: "closed" }).success).toBe(false);
    expect(taskStatusSchema.safeParse({}).success).toBe(false);
  });

  it("waiting needs a follow-up time, because the database will not park a task without one", () => {
    const r = taskStatusSchema.safeParse({ status: "waiting" });
    expect(r.success).toBe(false);
    expect(failedPaths(r)).toEqual(["followUpAt"]);
    expect(taskStatusSchema.safeParse({ status: "waiting", waitingOn: "Raj", followUpAt: "" }).success).toBe(false);
    expect(taskStatusSchema.safeParse({ status: "waiting", followUpAt: "not a time" }).success).toBe(false);
  });

  it("waiting with a time is fine; the 'waiting on' text is cleaned, capped at 200, and may be blank", () => {
    expect(taskStatusSchema.parse({ status: "waiting", waitingOn: " Raj \u0000 at Acme ", followUpAt: "2026-11-25T10:00:00Z" })).toEqual({
      status: "waiting",
      waitingOn: "Raj at Acme",
      followUpAt: "2026-11-25T10:00:00Z",
    });
    expect(taskStatusSchema.parse({ status: "waiting", waitingOn: "  ", followUpAt: "2026-11-25T10:00:00Z" }).waitingOn).toBeUndefined();
    expect(failedPaths(taskStatusSchema.safeParse({ status: "waiting", waitingOn: "x".repeat(201), followUpAt: "2026-11-25T10:00:00Z" }))).toEqual(["waitingOn"]);
  });
});

describe("follow-up", () => {
  const at = "2026-11-25T10:00:00Z";

  it("takes a note and one of four next steps", () => {
    expect(followUpSchema.parse({ note: "Called, no answer", next: { kind: "in_days", days: 3 } })).toEqual({ note: "Called, no answer", next: { kind: "in_days", days: 3 } });
    expect(followUpSchema.parse({ note: "x", next: { kind: "at", at } }).next).toEqual({ kind: "at", at });
    expect(followUpSchema.parse({ note: "x", next: { kind: "cadence" } }).next).toEqual({ kind: "cadence" });
    expect(followUpSchema.parse({ note: "x", next: { kind: "stop" } }).next).toEqual({ kind: "stop" });
  });

  it("rejects in_days of 0 and 366 and a fractional or missing count; 1 and 365 pass", () => {
    const days = (d: unknown) => followUpSchema.safeParse({ note: "x", next: { kind: "in_days", days: d } }).success;
    expect(days(0)).toBe(false);
    expect(days(366)).toBe(false);
    expect(days(-1)).toBe(false);
    expect(days(1.5)).toBe(false);
    expect(days(undefined)).toBe(false);
    expect(days(1)).toBe(true);
    expect(days(365)).toBe(true);
  });

  it("rejects an 'at' that is not a time", () => {
    const r = followUpSchema.safeParse({ note: "x", next: { kind: "at", at: "tomorrow-ish" } });
    expect(r.success).toBe(false);
    expect(failedPaths(r)).toEqual(["next.at"]);
    expect(followUpSchema.safeParse({ note: "x", next: { kind: "at" } }).success).toBe(false);
  });

  it("rejects an unknown or missing next step", () => {
    expect(followUpSchema.safeParse({ note: "x", next: { kind: "later" } }).success).toBe(false);
    expect(followUpSchema.safeParse({ note: "x" }).success).toBe(false);
  });

  it("needs a note of 1 to 2000 characters; line breaks stay and NULs go", () => {
    const next = { kind: "stop" };
    expect(followUpSchema.safeParse({ next }).success).toBe(false);
    expect(failedPaths(followUpSchema.safeParse({ note: "   ", next }))).toEqual(["note"]);
    expect(failedPaths(followUpSchema.safeParse({ note: "x".repeat(2001), next }))).toEqual(["note"]);
    expect(followUpSchema.safeParse({ note: "x".repeat(2000), next }).success).toBe(true);
    expect(followUpSchema.parse({ note: "spoke to Raj\nwill pay Friday\u0000", next }).note).toBe("spoke to Raj\nwill pay Friday");
  });
});

describe("snooze and note", () => {
  it("snooze takes a time and nothing else", () => {
    expect(snoozeSchema.parse({ until: "2026-11-25T10:00:00Z" })).toEqual({ until: "2026-11-25T10:00:00Z" });
    expect(snoozeSchema.safeParse({ until: "next week" }).success).toBe(false);
    expect(snoozeSchema.safeParse({}).success).toBe(false);
  });

  it("note is 1 to 2000 characters, keeps line breaks and drops NULs", () => {
    expect(noteSchema.parse({ note: "  a\nb\u0000 " })).toEqual({ note: "a\nb" });
    expect(noteSchema.safeParse({ note: "" }).success).toBe(false);
    expect(noteSchema.safeParse({ note: "x".repeat(2001) }).success).toBe(false);
    expect(noteSchema.safeParse({ note: "x".repeat(2000) }).success).toBe(true);
    expect(noteSchema.safeParse({}).success).toBe(false);
  });
});

describe("list tasks", () => {
  it("defaults to my active tasks, due date first, 20 to a page", () => {
    expect(listTasksSchema.parse({})).toMatchObject({ scope: "mine", status: "active", page: 1, pageSize: 20, sort: "due", dir: "asc" });
  });

  it("caps the page size at 100 and trims the search", () => {
    expect(listTasksSchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(listTasksSchema.parse({ pageSize: "100" }).pageSize).toBe(100);
    expect(listTasksSchema.parse({ search: "  raj  " }).search).toBe("raj");
  });

  it("filters by active, closed or any one status, and nothing else", () => {
    for (const status of ["active", "closed", ...TASK_STATUSES]) expect(listTasksSchema.parse({ status }).status).toBe(status);
    expect(listTasksSchema.safeParse({ status: "all" }).success).toBe(false);
  });

  it("filters by category, priority, owner (a user or 'unassigned'), client, origin and due range", () => {
    const parsed = listTasksSchema.parse({
      categoryId: CATEGORY,
      priorityId: PRIORITY,
      ownerId: OWNER,
      clientId: OWNER,
      origin: "auto",
      dueFrom: "2026-11-01",
      dueTo: "2026-11-30",
      scope: "all",
      sort: "priority",
      dir: "desc",
    });
    expect(parsed).toMatchObject({ categoryId: CATEGORY, priorityId: PRIORITY, ownerId: OWNER, clientId: OWNER, origin: "auto", dueFrom: "2026-11-01", dueTo: "2026-11-30", scope: "all", sort: "priority", dir: "desc" });
    expect(listTasksSchema.parse({ ownerId: "unassigned" }).ownerId).toBe("unassigned");
  });

  it("refuses values outside those lists", () => {
    for (const bad of [{ ownerId: "someone" }, { categoryId: "x" }, { origin: "robot" }, { scope: "team" }, { sort: "title" }, { dir: "up" }, { dueFrom: "yesterday" }, { page: 0 }]) {
      expect(listTasksSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    for (const sort of ["due", "priority", "created", "updated"]) expect(listTasksSchema.parse({ sort }).sort).toBe(sort);
  });
});

describe("desk query", () => {
  it("shows my tasks unless told otherwise", () => {
    expect(deskQuerySchema.parse({})).toEqual({ owner: "me" });
    expect(deskQuerySchema.parse({ owner: "all" })).toEqual({ owner: "all" });
    expect(deskQuerySchema.parse({ owner: "unassigned" })).toEqual({ owner: "unassigned" });
    expect(deskQuerySchema.parse({ owner: OWNER })).toEqual({ owner: OWNER });
  });

  it("refuses anything that is not me, all, unassigned or a user id", () => {
    expect(deskQuerySchema.safeParse({ owner: "everyone" }).success).toBe(false);
    expect(deskQuerySchema.safeParse({ owner: "" }).success).toBe(false);
  });
});
