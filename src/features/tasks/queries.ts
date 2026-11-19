// The one shape a task is read in, shared by the task service and the Desk. No `server-only`: the UI imports the type.
import type { TaskStatus } from "./schema";

/** A task as the screens see it. Dates are `YYYY-MM-DD`; every time is an ISO 8601 string in UTC ending in Z. */
export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  category_id: string;
  category_name: string;
  category_colour: string;
  priority_id: string;
  priority_name: string;
  priority_colour: string;
  /** 1 = most urgent. */
  priority_rank: number;
  status: TaskStatus;
  /** Null when the task is unassigned or its owner has been deactivated (spec section 5). */
  owner_id: string | null;
  owner_name: string | null;
  /** Null for a task the system raised. */
  created_by: string | null;
  created_by_name: string | null;
  client_id: string | null;
  client_name: string | null;
  origin: "manual" | "auto";
  source_type: string | null;
  source_id: string | null;
  due_date: string | null;
  follow_up_at: string | null;
  follow_up_every_days: number | null;
  follow_up_count: number;
  last_followed_up_at: string | null;
  waiting_on: string | null;
  completed_at: string | null;
  /** Null with completed_at set = closed by the system. */
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A timestamptz as `2026-11-20T04:30:00.000Z`, the same text `Date.prototype.toISOString` gives. It always carries the Z,
 * so `Date.parse` (and `sectionOf`) read the instant the database holds, whatever the server's time zone.
 */
export const isoTime = (column: string) => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * Every column of `TaskRow`, from `tasks t` joined to its category `c`, priority `p`, owner `o`, creator `cb` and client `cl`.
 * Append a WHERE clause on those aliases. A deactivated owner reads as no owner, so the task shows as Unassigned.
 */
export const TASK_SELECT = `
  SELECT t.id, t.title, t.description,
         t.category_id, c.name AS category_name, c.colour AS category_colour,
         t.priority_id, p.name AS priority_name, p.colour AS priority_colour, p.rank AS priority_rank,
         t.status,
         CASE WHEN o.is_active THEN t.owner_id END AS owner_id,
         CASE WHEN o.is_active THEN o.name END AS owner_name,
         t.created_by, cb.name AS created_by_name,
         t.client_id, cl.display_name AS client_name,
         t.origin, t.source_type, t.source_id,
         to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
         ${isoTime("t.follow_up_at")} AS follow_up_at,
         t.follow_up_every_days, t.follow_up_count,
         ${isoTime("t.last_followed_up_at")} AS last_followed_up_at,
         t.waiting_on,
         ${isoTime("t.completed_at")} AS completed_at, t.completed_by,
         ${isoTime("t.created_at")} AS created_at, ${isoTime("t.updated_at")} AS updated_at
  FROM tasks t
  JOIN task_categories c ON c.id = t.category_id
  JOIN task_priorities p ON p.id = t.priority_id
  LEFT JOIN users o ON o.id = t.owner_id
  LEFT JOIN users cb ON cb.id = t.created_by
  LEFT JOIN clients cl ON cl.id = t.client_id`;
