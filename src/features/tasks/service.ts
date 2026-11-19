import "server-only";
import { db, type Queryable } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/auth/errors";
import type { CurrentUser } from "@/lib/auth/current-user";
import { likePattern } from "@/lib/validation";
import { canAssign, canEditTask, canViewAll, canViewTask, effectiveOwner, scopeSql, type TaskAccess } from "./policy";
import { isoTime, TASK_SELECT, type TaskRow } from "./queries";
import { ACTIVE_STATUSES, type CreateTaskInput, type ListTasksParams, type NoteInput, type TaskStatus, type TaskStatusInput, type UpdateTaskInput } from "./schema";

// Create, read, edit, change status, add notes, list (spec sections 5, 8 and 10). Every function takes the acting user and
// asks the policy; every change is logged to activity_log in the same transaction. A task the actor may not see answers 404,
// as if it did not exist.

export interface TaskEventRow {
  id: string;
  action: string;
  summary: string;
  actor_name: string | null;
  created_at: string;
}

/** Follow-up times must be in the future and at most this many days out. */
const MAX_FOLLOW_UP_DAYS = 365;
export const DAY_MS = 86_400_000;

const CLOSED_STATUSES = ["done", "cancelled"] as const satisfies readonly TaskStatus[];

const STATUS_LABEL: Record<TaskStatus, string> = { open: "Open", in_progress: "In progress", waiting: "Waiting", done: "Done", cancelled: "Cancelled" };

const notFound = () => new AppError("Task not found", 404, "NOT_FOUND");
export const invalid = (message: string) => new AppError(message, 422, "VALIDATION_ERROR");

/**
 * A follow-up time someone chose, checked against `now`: in the future and at most 365 days out. Returns it as an ISO string
 * in UTC, which is what gets bound: never the caller's text, whose offset Postgres may read differently from JavaScript.
 */
export function followUpTime(value: string, now: Date): string {
  const at = new Date(value).getTime();
  if (!(at > now.getTime())) throw invalid("Choose a follow-up time in the future");
  if (at > now.getTime() + MAX_FOLLOW_UP_DAYS * DAY_MS) throw invalid(`Choose a follow-up time within the next ${MAX_FOLLOW_UP_DAYS} days`);
  return new Date(at).toISOString();
}

// ---- Checks on what a task points at ----
// FOR KEY SHARE: a category or priority being hidden or deleted at the same moment waits for this task (or this waits for it),
// so a task is never created against a row that has just been hidden or removed.

async function activeCategory(tx: Queryable, id: string): Promise<{ default_follow_up_days: number | null }> {
  const { rows } = await tx.query<{ default_follow_up_days: number | null }>(
    "SELECT default_follow_up_days FROM task_categories WHERE id = $1 AND is_active FOR KEY SHARE",
    [id],
  );
  if (!rows[0]) throw invalid("Choose a category from the list");
  return rows[0];
}

async function assertActivePriority(tx: Queryable, id: string): Promise<void> {
  const { rowCount } = await tx.query("SELECT 1 FROM task_priorities WHERE id = $1 AND is_active FOR KEY SHARE", [id]);
  if (!rowCount) throw invalid("Choose a priority from the list");
}

/** A task can only be given to someone who can sign in. Returns their name, for the history. */
async function activeUserName(tx: Queryable, id: string): Promise<string> {
  const { rows } = await tx.query<{ name: string }>("SELECT name FROM users WHERE id = $1 AND is_active", [id]);
  if (!rows[0]) throw invalid("Choose an active staff member");
  return rows[0].name;
}

async function assertClientExists(tx: Queryable, id: string): Promise<void> {
  const { rowCount } = await tx.query("SELECT 1 FROM clients WHERE id = $1", [id]);
  if (!rowCount) throw invalid("Choose a client that exists");
}

// ---- Locking a task for a change ----

/** The columns a change needs, read under the row lock. Times and dates are in the same text form `TaskRow` uses. */
type LockedTask = {
  title: string;
  description: string | null;
  category_id: string;
  priority_id: string;
  client_id: string | null;
  due_date: string | null;
  follow_up_at: string | null;
  follow_up_every_days: number | null;
  status: TaskStatus;
  /** The stored owner, even when deactivated: comparing against it tells whether an edit changes it. */
  owner_id: string | null;
  owner_active: boolean;
  created_by: string | null;
};

const accessOf = (t: LockedTask): TaskAccess => ({ ownerId: t.owner_id, ownerActive: t.owner_active, createdBy: t.created_by });

function assertCanEdit(actor: CurrentUser, t: LockedTask) {
  if (!canEditTask(actor, accessOf(t))) throw new AppError("You can only change tasks you own or created", 403, "FORBIDDEN");
}

/**
 * Locks the task for a change by `actor`. A task they may not see is 404, as if it did not exist. With `"edit"`, one they
 * may see but not change is 403; `"view"` leaves the rest to the caller (giving a task away needs view and assign, not edit).
 */
export async function lockForChange(tx: Queryable, id: string, actor: CurrentUser, need: "view" | "edit"): Promise<LockedTask> {
  const { rows } = await tx.query<LockedTask>(
    `SELECT t.title, t.description, t.category_id, t.priority_id, t.client_id, to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
            ${isoTime("t.follow_up_at")} AS follow_up_at, t.follow_up_every_days, t.status, t.owner_id,
            COALESCE(o.is_active, false) AS owner_active, t.created_by
     FROM tasks t LEFT JOIN users o ON o.id = t.owner_id
     WHERE t.id = $1
     FOR UPDATE OF t`,
    [id],
  );
  const cur = rows[0];
  if (!cur || !canViewTask(actor, accessOf(cur))) throw notFound();
  if (need === "edit") assertCanEdit(actor, cur);
  return cur;
}

// ---- Create and read ----

export async function createTask(input: CreateTaskInput, actor: CurrentUser, now: Date = new Date()): Promise<{ id: string }> {
  // Left out, the owner is the person creating it. Anyone else, or nobody (Unassigned), means giving the task away.
  const ownerId = input.ownerId === undefined ? actor.id : input.ownerId;
  if (ownerId !== actor.id && !canAssign(actor)) throw new AppError("You can only create tasks for yourself", 403, "FORBIDDEN");
  const followUpAt = input.followUpAt ? followUpTime(input.followUpAt, now) : null;

  return db.transaction(async (tx) => {
    const category = await activeCategory(tx, input.categoryId);
    await assertActivePriority(tx, input.priorityId);
    const ownerName = ownerId && ownerId !== actor.id ? await activeUserName(tx, ownerId) : null;
    if (input.clientId) await assertClientExists(tx, input.clientId);

    // The category's cadence is copied unless the caller chose one (null = no repeat). A follow-up time is never set by
    // default: a new task is parked only when someone picks a time, or every new Collections task would vanish at once.
    const everyDays = input.followUpEveryDays === undefined ? category.default_follow_up_days : input.followUpEveryDays;
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO tasks (title, description, category_id, priority_id, owner_id, created_by, client_id, due_date, follow_up_at, follow_up_every_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        input.title, input.description ?? null, input.categoryId, input.priorityId, ownerId, actor.id, input.clientId ?? null,
        input.dueDate ?? null, followUpAt, everyDays,
      ],
    );
    const id = rows[0]!.id;
    const forWhom = ownerId === actor.id ? "" : ownerName ? ` for ${ownerName}` : " (unassigned)";
    await logActivity(
      { entityType: "task", entityId: id, clientId: input.clientId ?? null, action: "created", summary: `Created task "${input.title}"${forWhom}`, actorId: actor.id },
      tx,
    );
    return { id };
  });
}

/** The task with its history, newest first. */
export async function getTask(id: string, actor: CurrentUser): Promise<TaskRow & { events: TaskEventRow[] }> {
  const row = await db.queryOne<TaskRow>(`${TASK_SELECT} WHERE t.id = $1`, [id]);
  // TASK_SELECT already reads a deactivated owner as no owner, which is the policy's effective owner.
  if (!row || !canViewTask(actor, { ownerId: row.owner_id, ownerActive: row.owner_id !== null, createdBy: row.created_by })) throw notFound();
  const events = await db.query<TaskEventRow>(
    `SELECT a.id::text AS id, a.action, a.summary, u.name AS actor_name, ${isoTime("a.created_at")} AS created_at
     FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.entity_type = 'task' AND a.entity_id = $1
     ORDER BY a.created_at DESC, a.id DESC`,
    [id],
  );
  return { ...row, events };
}

// ---- Change ----

/** What an edit can change besides the owner: the input field, the column it writes, and its name in the history. */
const EDIT_FIELDS = [
  ["title", "title", "title"],
  ["description", "description", "description"],
  ["categoryId", "category_id", "category"],
  ["priorityId", "priority_id", "priority"],
  ["clientId", "client_id", "client"],
  ["dueDate", "due_date", "due date"],
  ["followUpAt", "follow_up_at", "follow-up time"],
  ["followUpEveryDays", "follow_up_every_days", "follow-up cadence"],
] as const;

/**
 * Only what is sent changes, and only what actually changes is checked and logged: a form that sends back a hidden category
 * or a follow-up time that has since passed is fine as long as it is unchanged. Nothing changed, nothing written.
 * Changing the owner needs tasks.assign and sight of the task ("Take it" on an unassigned one); changing anything else needs
 * the edit right. An edit that does both needs both, and is refused whole if either is missing.
 */
export async function updateTask(id: string, input: UpdateTaskInput, actor: CurrentUser, now: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const cur = await lockForChange(tx, id, actor, "view");
    const before: Record<string, unknown> = cur;
    // Times are compared as instants, so the same moment written with another offset is not a change.
    const after: Record<string, unknown> = { ...input, followUpAt: input.followUpAt ? new Date(input.followUpAt).toISOString() : input.followUpAt };

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const labels: string[] = [];
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [field, column, label] of EDIT_FIELDS) {
      if (after[field] === undefined || after[field] === before[column]) continue;
      changes[field] = { from: before[column], to: after[field] };
      labels.push(label);
      values.push(after[field]);
      sets.push(`${column} = $${values.length}`);
    }
    // Compared with the owner the screens show: a deactivated owner reads as none, so a form saved unchanged is not a reassignment.
    const ownerChanged = input.ownerId !== undefined && input.ownerId !== effectiveOwner(accessOf(cur));
    if (!sets.length && !ownerChanged) return;

    // Both rights are checked before anything is written.
    if (sets.length) assertCanEdit(actor, cur);
    if (ownerChanged && !canAssign(actor)) throw new AppError("You do not have permission to give tasks to other people", 403, "FORBIDDEN");
    const ownerName = ownerChanged && input.ownerId ? await activeUserName(tx, input.ownerId) : null;
    if (changes.categoryId) await activeCategory(tx, input.categoryId!);
    if (changes.priorityId) await assertActivePriority(tx, input.priorityId!);
    if (input.clientId && changes.clientId) await assertClientExists(tx, input.clientId);
    if (changes.followUpAt) {
      if (input.followUpAt) followUpTime(input.followUpAt, now);
      else if (cur.status === "waiting") throw invalid("A waiting task needs a follow-up time. Move it out of Waiting first.");
    }
    if (ownerChanged) {
      values.push(input.ownerId);
      sets.push(`owner_id = $${values.length}`);
    }
    values.push(id);
    await tx.query(`UPDATE tasks SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length}`, values);

    const title = input.title ?? cur.title;
    // Unlinking a client still shows in that client's history.
    const clientId = input.clientId ?? cur.client_id;
    if (ownerChanged) {
      await logActivity(
        {
          entityType: "task", entityId: id, clientId, action: "reassigned",
          summary: ownerName ? `Reassigned "${title}" to ${ownerName}` : `Unassigned "${title}"`,
          actorId: actor.id, metadata: { from: cur.owner_id, to: input.ownerId },
        },
        tx,
      );
    }
    if (labels.length) {
      await logActivity(
        { entityType: "task", entityId: id, clientId, action: "edited", summary: `Edited "${title}" (${labels.join(", ")})`, actorId: actor.id, metadata: { changes } },
        tx,
      );
    }
  });
}

/**
 * Moves a task to another status. The row lock makes two people pressing Done at once give one change and one history row;
 * the second is told the task is already done. Done records who and when; any other status clears both.
 */
export async function setTaskStatus(id: string, input: TaskStatusInput, actor: CurrentUser, now: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const cur = await lockForChange(tx, id, actor, "edit");
    if (cur.status === input.status) throw new AppError(`This task is already marked ${STATUS_LABEL[input.status]}`, 409, "INVALID_TRANSITION");

    const newFollowUpAt = input.followUpAt ? followUpTime(input.followUpAt, now) : null;
    // Waiting must say when to look again (the database insists too); a time already set will do while it is still ahead.
    if (input.status === "waiting" && !newFollowUpAt) {
      if (!cur.follow_up_at) throw invalid("Say when to look at it again");
      if (Date.parse(cur.follow_up_at) <= now.getTime()) throw invalid("Its follow-up time has passed. Say when to look at it again.");
    }
    // Who it is waiting on only means something while it is waiting.
    const waitingOn = input.status === "waiting" ? (input.waitingOn ?? null) : null;
    // The return time belongs to the wait: when work resumes (the reply came) it goes, so the task is back on the list at
    // once. Reopening a done or cancelled task drops it too: that schedule belongs to the task's earlier life, and kept, it
    // could bring the task back parked and off the Desk. A time given with the move wins; a time on an open or in-progress
    // task, or on one being closed, stays as it was.
    const toWork = input.status === "open" || input.status === "in_progress";
    const workResumes = toWork && (cur.status === "waiting" || cur.status === "done" || cur.status === "cancelled");

    await tx.query(
      `UPDATE tasks SET status = $1, waiting_on = $3,
              follow_up_at = CASE WHEN $2::timestamptz IS NOT NULL THEN $2::timestamptz WHEN $6::boolean THEN NULL ELSE follow_up_at END,
              completed_at = CASE WHEN $1 = 'done' THEN now() END,
              completed_by = CASE WHEN $1 = 'done' THEN $4::uuid END,
              updated_at = now()
       WHERE id = $5`,
      [input.status, newFollowUpAt, waitingOn, actor.id, id, workResumes],
    );
    await logActivity(
      {
        entityType: "task", entityId: id, clientId: cur.client_id, action: "status_changed",
        summary: `Moved "${cur.title}" from ${STATUS_LABEL[cur.status]} to ${STATUS_LABEL[input.status]}${waitingOn ? ` (waiting on ${waitingOn})` : ""}`,
        actorId: actor.id, metadata: { from: cur.status, to: input.status },
      },
      tx,
    );
  });
}

/** A note on the task's timeline. Anyone who may change the task may add one, whatever its status. */
export async function addTaskNote(id: string, input: NoteInput, actor: CurrentUser): Promise<void> {
  await db.transaction(async (tx) => {
    const cur = await lockForChange(tx, id, actor, "edit");
    await logActivity(
      {
        entityType: "task", entityId: id, clientId: cur.client_id, action: "note_added",
        summary: `Note on "${cur.title}": ${input.note}`, actorId: actor.id, metadata: { note: input.note },
      },
      tx,
    );
  });
}

// ---- List ----

const SORTS = { due: "t.due_date", priority: "p.rank", created: "t.created_at", updated: "t.updated_at" } as const;

/** Status lists are spliced as literals (they are constants), so the partial indexes on active tasks can be used. */
const inList = (statuses: readonly TaskStatus[]) => statuses.map((s) => `'${s}'`).join(", ");

export async function listTasks(
  p: ListTasksParams,
  actor: CurrentUser,
): Promise<{ items: TaskRow[]; total: number; page: number; pageSize: number }> {
  if (p.scope === "all" && !canViewAll(actor)) throw new AppError("You do not have permission to see everyone's tasks", 403, "FORBIDDEN");

  const where: string[] = [];
  const values: unknown[] = [];
  const add = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };

  // "mine" is what a user without tasks.view_all may see: the tasks they own or created. "all" is everything the actor may see.
  const scope = scopeSql(p.scope === "all" ? actor : { ...actor, permissions: [] }, "t", values.length + 1);
  values.push(...scope.values);
  where.push(scope.sql);

  if (p.status === "active") where.push(`t.status IN (${inList(ACTIVE_STATUSES)})`);
  else if (p.status === "closed") where.push(`t.status IN (${inList(CLOSED_STATUSES)})`);
  else where.push(`t.status = ${add(p.status)}`);
  if (p.categoryId) where.push(`t.category_id = ${add(p.categoryId)}`);
  if (p.priorityId) where.push(`t.priority_id = ${add(p.priorityId)}`);
  if (p.clientId) where.push(`t.client_id = ${add(p.clientId)}`);
  if (p.origin) where.push(`t.origin = ${add(p.origin)}`);
  // Owners are read as everywhere else: a deactivated owner counts as nobody.
  if (p.ownerId === "unassigned") where.push("o.is_active IS NOT TRUE");
  else if (p.ownerId) where.push(`(t.owner_id = ${add(p.ownerId)} AND o.is_active)`);
  if (p.dueFrom) where.push(`t.due_date >= ${add(p.dueFrom)}`);
  if (p.dueTo) where.push(`t.due_date <= ${add(p.dueTo)}`);
  if (p.search) {
    // likePattern escapes % and _, so they match themselves.
    const s = add(likePattern(p.search));
    where.push(`(t.title ILIKE ${s} OR t.description ILIKE ${s})`);
  }

  const filter = where.join(" AND ");
  const filterValues = [...values];
  // Ties go to the most urgent, then the earliest deadline, then the oldest, so a page never reshuffles between requests.
  const order = `${SORTS[p.sort]} ${p.dir === "desc" ? "DESC" : "ASC"} NULLS LAST, p.rank, t.due_date NULLS LAST, t.created_at, t.id`;
  const limit = add(p.pageSize);
  const offset = add((p.page - 1) * p.pageSize);

  const rows = await db.query<TaskRow & { total_rows: string }>(
    `${TASK_SELECT.replace("SELECT t.id", "SELECT count(*) OVER() AS total_rows, t.id")} WHERE ${filter} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  let total = Number(rows[0]?.total_rows ?? 0);
  // Past the last page no row carries the count, so it is asked for on its own.
  if (!rows.length && p.page > 1) {
    total = Number((await db.queryOne<{ n: string }>(`SELECT count(*) AS n FROM (${TASK_SELECT} WHERE ${filter}) x`, filterValues))!.n);
  }
  return {
    items: rows.map((r) => {
      const { total_rows, ...rest } = r;
      void total_rows;
      return rest;
    }),
    total,
    page: p.page,
    pageSize: p.pageSize,
  };
}
