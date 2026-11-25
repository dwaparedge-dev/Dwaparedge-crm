import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/auth/errors";
import type { CurrentUser } from "@/lib/auth/current-user";
import { todayIST } from "@/lib/dates";
import { canViewAll, scopeSql } from "./policy";
import { isoTime, TASK_SELECT, type TaskRow } from "./queries";
import { ACTIVE_STATUSES, type DeskQuery } from "./schema";
import { compareTasks, countSections, sectionOf, SECTION_ORDER, type DeskCounts, type Section, type SectionInput } from "./sections";

// The Desk: the active tasks in the viewer's scope, split into urgency sections (spec sections 4, 5 and 8). The SQL only picks
// the tasks; which section a task is in, and how many are overdue, is decided by sections.ts and nowhere else.

export interface Desk {
  /** Today in India, `YYYY-MM-DD`: the date the sections were worked out for. */
  today: string;
  counts: DeskCounts;
  /** Every section is present, empty or not, each ordered by priority, then due date, then age. */
  sections: Record<Section, TaskRow[]>;
  /** The categories of the tasks in view, the one with most tasks first. */
  categories: { id: string; name: string; colour: string; count: number }[];
  /** Tasks in view that have no owner, or whose owner has been deactivated. */
  unassigned: number;
}

/** A Desk is a day's list, not an archive: past this many active tasks in view the rest is left off. */
const MAX_TASKS = 2000;

const ACTIVE = ACTIVE_STATUSES.map((s) => `'${s}'`).join(", ");

/** The owner is read as everywhere else: `o` is the owner's user row, and a deactivated owner counts as nobody. */
const NO_OWNER = "o.is_active IS NOT TRUE";

/**
 * WHERE clause (on `tasks t` and its owner `o`) for the active tasks `actor` may see and asked for. The actor's own scope is
 * always part of it, and the owner filter only narrows it, so no owner value can show a task the policy hides. Everything but
 * "me" is a view of other people's tasks and needs tasks.view_all.
 */
function deskWhere(actor: CurrentUser, owner: DeskQuery["owner"]): { sql: string; values: unknown[] } {
  const viewAll = canViewAll(actor);
  if (owner !== "me" && !viewAll) throw new AppError("You do not have permission to see everyone's tasks", 403, "FORBIDDEN");

  const scope = scopeSql(actor, "t", 1);
  const values = [...scope.values];
  const add = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };

  let ownerFilter: string;
  if (owner === "all") ownerFilter = "TRUE";
  else if (owner === "unassigned") ownerFilter = NO_OWNER;
  else if (owner === "me") {
    // Mine, and (for someone who may see them) the ones nobody owns: auto-raised tasks start unassigned.
    const me = add(actor.id);
    ownerFilter = viewAll ? `((t.owner_id = ${me} AND o.is_active) OR ${NO_OWNER})` : `(t.owner_id = ${me} AND o.is_active)`;
  } else ownerFilter = `(t.owner_id = ${add(owner)} AND o.is_active)`;

  return { sql: `${scope.sql} AND ${ownerFilter} AND t.status IN (${ACTIVE})`, values };
}

const sectionInput = (t: Pick<TaskRow, "status" | "due_date" | "follow_up_at">): SectionInput => ({
  status: t.status,
  dueDate: t.due_date,
  followUpAt: t.follow_up_at,
});

const byUrgency = (a: TaskRow, b: TaskRow) =>
  compareTasks(
    { priorityRank: a.priority_rank, dueDate: a.due_date, createdAt: a.created_at },
    { priorityRank: b.priority_rank, dueDate: b.due_date, createdAt: b.created_at },
  );

export async function getDesk(actor: CurrentUser, q: DeskQuery, now: Date = new Date()): Promise<Desk> {
  const where = deskWhere(actor, q.owner);
  // Oldest first, so the same tasks are left off every time past the cap and ties in the sections below come out the same.
  const rows = await db.query<TaskRow>(
    `${TASK_SELECT} WHERE ${where.sql} ORDER BY t.created_at, t.id LIMIT $${where.values.length + 1}`,
    [...where.values, MAX_TASKS],
  );

  const sections = Object.fromEntries(SECTION_ORDER.map((s) => [s, [] as TaskRow[]])) as Record<Section, TaskRow[]>;
  const categories = new Map<string, Desk["categories"][number]>();
  let unassigned = 0;
  for (const t of rows) {
    const section = sectionOf(sectionInput(t), now);
    if (section) sections[section].push(t); // always set: the query only returns active tasks
    if (t.owner_id === null) unassigned++;
    const c = categories.get(t.category_id);
    if (c) c.count++;
    else categories.set(t.category_id, { id: t.category_id, name: t.category_name, colour: t.category_colour, count: 1 });
  }
  for (const section of SECTION_ORDER) sections[section].sort(byUrgency);

  return {
    today: todayIST(now),
    counts: countSections(rows.map(sectionInput), now),
    sections,
    categories: [...categories.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    unassigned,
  };
}

/**
 * The sidebar badge's numbers: the same counts as `getDesk` gives for the default scope, from three columns and no cap
 * (a badge that left tasks off would undercount). It runs every minute, so it reads nothing it does not need.
 */
export async function getDeskCounts(actor: CurrentUser, now: Date = new Date()): Promise<DeskCounts> {
  const where = deskWhere(actor, "me");
  const rows = await db.query<Pick<TaskRow, "status" | "due_date" | "follow_up_at">>(
    `SELECT t.status, to_char(t.due_date, 'YYYY-MM-DD') AS due_date, ${isoTime("t.follow_up_at")} AS follow_up_at
     FROM tasks t LEFT JOIN users o ON o.id = t.owner_id
     WHERE ${where.sql}`,
    where.values,
  );
  return countSections(rows.map(sectionInput), now);
}
