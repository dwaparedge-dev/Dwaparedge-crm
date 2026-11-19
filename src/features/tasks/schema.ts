import { z } from "zod";
import { optionalPlainText, optionalText, pageParams, plainText, requiredText, uuid } from "@/lib/validation";

/** Fixed: code depends on these values and the database checks them. */
export const TASK_STATUSES = ["open", "in_progress", "waiting", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** A task in one of these is still on someone's plate; done and cancelled tasks are closed. */
export const ACTIVE_STATUSES = ["open", "in_progress", "waiting"] as const satisfies readonly TaskStatus[];

/** The records an auto-raised task can point back to. */
export const SOURCE_TYPES = ["demo_request", "invoice", "license", "sale_milestone"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

// ---- Building blocks ----

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** A day that exists: `Date.parse` alone lets 2026-02-30 through (it rolls over to March), and Postgres then refuses it. */
const isCalendarDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s && !s.startsWith("0000"); // Postgres has no year 0
};

/** `YYYY-MM-DD`, and a day that exists. */
const taskDate = z.string().refine((s) => DATE_RE.test(s) && isCalendarDate(s), "Use a valid date (YYYY-MM-DD)");

/**
 * An ISO 8601 date and time with an explicit offset or Z, so a time is never ambiguous (the server is not in India).
 * Whether it is in the future is the service's call, with its clock.
 */
const taskDateTime = z
  .string()
  .refine(
    (s) => DATE_TIME_RE.test(s) && isCalendarDate(s.slice(0, 10)) && Number.isFinite(Date.parse(s)),
    "Use a date and time with a time zone, like 2026-11-20T10:00:00+05:30",
  );

/** An empty form field means "nothing", for fields that can be cleared. */
const blankToNull = (v: unknown) => (v === "" ? null : v);

const optionalId = z.preprocess(blankToNull, uuid.nullable()).optional();

/** Free text that keeps its line breaks; only NUL bytes (which Postgres refuses in text) are removed. */
const stripNul = (v: unknown) => (typeof v === "string" ? v.replace(/\u0000/g, "") : v);

const noteText = z.preprocess(stripNul, requiredText("Note", 2000));

// ---- Create and edit ----

const taskFields = {
  title: plainText("Title", 200),
  description: z.preprocess(stripNul, optionalText(5000)).optional(),
  categoryId: uuid,
  priorityId: uuid,
  ownerId: optionalId,
  clientId: optionalId,
  dueDate: z.preprocess(blankToNull, taskDate.nullable()).optional(),
  followUpAt: z.preprocess(blankToNull, taskDateTime.nullable()).optional(),
  followUpEveryDays: z.preprocess(blankToNull, z.number().int().min(1).max(365).nullable()).optional(),
};

/** Fields not listed here (status, origin, source, creator) cannot be set by the caller: they are ignored. */
export const createTaskSchema = z.object(taskFields);
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Only the fields that are sent change; a blank owner, client, date, time or description clears it. */
export const updateTaskSchema = z
  .object(taskFields)
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update" });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// ---- Acting on a task ----

/** Waiting must say when to look again, or the task would be parked and forgotten (the database refuses it too). */
export const taskStatusSchema = z
  .object({
    status: z.enum(TASK_STATUSES),
    waitingOn: optionalPlainText(200),
    // A cleared time input arrives as "" and means "none"; the optional sits inside the preprocess so the undefined it makes is accepted.
    followUpAt: z.preprocess((v) => (v === "" ? undefined : v), taskDateTime.optional()),
  })
  .refine((v) => v.status !== "waiting" || v.followUpAt !== undefined, {
    message: "Say when to look at it again",
    path: ["followUpAt"],
  });
export type TaskStatusInput = z.infer<typeof taskStatusSchema>;

/** What happens after a follow-up is recorded: chase again in N days or at a time, keep the task's cadence, or stop chasing. */
export const followUpSchema = z.object({
  note: noteText,
  next: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("in_days"), days: z.number().int().min(1).max(365) }),
    z.object({ kind: z.literal("at"), at: taskDateTime }),
    z.object({ kind: z.literal("cadence") }),
    z.object({ kind: z.literal("stop") }),
  ]),
});
export type FollowUpInput = z.infer<typeof followUpSchema>;

/** Park the task until a time, without counting a follow-up. */
export const snoozeSchema = z.object({ until: taskDateTime });
export type SnoozeInput = z.infer<typeof snoozeSchema>;

export const noteSchema = z.object({ note: noteText });
export type NoteInput = z.infer<typeof noteSchema>;

// ---- Reading ----

/**
 * `status` also takes the groups: `active` (open, in progress, waiting) and `closed` (done, cancelled). `scope=all` needs `tasks.view_all`; the service checks.
 * `search` is cleaned like any other text (a NUL would make Postgres refuse the query); % and _ stay as typed and the service matches them literally.
 */
export const listTasksSchema = pageParams.extend({
  search: optionalPlainText(100),
  status: z.enum(["active", "closed", ...TASK_STATUSES]).default("active"),
  categoryId: uuid.optional(),
  priorityId: uuid.optional(),
  ownerId: z.union([z.literal("unassigned"), uuid]).optional(),
  clientId: uuid.optional(),
  origin: z.enum(["manual", "auto"]).optional(),
  dueFrom: taskDate.optional(),
  dueTo: taskDate.optional(),
  scope: z.enum(["mine", "all"]).default("mine"),
  sort: z.enum(["due", "priority", "created", "updated"]).default("due"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type ListTasksParams = z.infer<typeof listTasksSchema>;

/** Whose tasks the Desk shows: the viewer's own, everyone's, the unassigned ones, or one person's. */
export const deskQuerySchema = z.object({
  owner: z.union([z.enum(["me", "all", "unassigned"]), uuid]).default("me"),
});
export type DeskQuery = z.infer<typeof deskQuerySchema>;
