// The one place that decides who may see or do what with a task (spec section 8).
// Pure on purpose: no database, no `server-only`, so it is unit-testable and the services just ask it.
import type { CurrentUser } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import type { TaskRow } from "./queries";

/** The fields of a task the policy needs; ownerActive comes from joining the owner's user row. */
export interface TaskAccess {
  ownerId: string | null;
  ownerActive: boolean;
  createdBy: string | null;
}

/** The owner, or null when the task is unassigned or its owner has been deactivated. */
export const effectiveOwner = (t: TaskAccess): string | null => (t.ownerActive ? t.ownerId : null);

/** tasks.view_all (tasks.edit_all implies it): see everyone's tasks and the unassigned ones. */
export const canViewAll = (u: CurrentUser): boolean => hasPermission(u.permissions, "tasks.view_all");

const ownsOrCreated = (u: CurrentUser, t: TaskAccess): boolean =>
  effectiveOwner(t) === u.id || t.createdBy === u.id;

export const canViewTask = (u: CurrentUser, t: TaskAccess): boolean => canViewAll(u) || ownsOrCreated(u, t);

/** Editing, completing, following up and noting all follow this one rule. */
export const canEditTask = (u: CurrentUser, t: TaskAccess): boolean =>
  hasPermission(u.permissions, "tasks.edit_all") || ownsOrCreated(u, t);

/**
 * `canEditTask` for a task as the screens hold it. TASK_SELECT already reads a deactivated owner as no owner
 * (`owner_id` is null), so an inactive owner counts as unassigned here without being asked: the rule lives in this one place.
 */
export const canEditRow = (u: CurrentUser, row: Pick<TaskRow, "owner_id" | "created_by">): boolean =>
  canEditTask(u, { ownerId: row.owner_id, ownerActive: row.owner_id !== null, createdBy: row.created_by });

/** Give a task to someone else, or take an unassigned one. */
export const canAssign = (u: CurrentUser): boolean => hasPermission(u.permissions, "tasks.assign");

/** Add, rename, recolour, reorder and hide categories and priorities. */
export const canManageTaskSettings = (u: CurrentUser): boolean =>
  hasPermission(u.permissions, "tasks.manage_settings");

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * SQL predicate limiting a task list to what `u` may see, for splicing into a WHERE clause.
 * `alias` is spliced as text, so it must be a literal chosen by the caller, never user input;
 * the user id always travels as the parameter `$startParam` in `values`.
 */
export function scopeSql(u: CurrentUser, alias: string, startParam: number): { sql: string; values: unknown[] } {
  if (!IDENTIFIER.test(alias)) throw new Error(`scopeSql: alias must be a plain identifier, got "${alias}"`);
  if (!Number.isInteger(startParam) || startParam < 1) {
    throw new Error(`scopeSql: startParam must be a positive integer, got ${startParam}`);
  }
  if (canViewAll(u)) return { sql: "TRUE", values: [] };
  const n = `$${startParam}`;
  return { sql: `(${alias}.owner_id = ${n} OR ${alias}.created_by = ${n})`, values: [u.id] };
}
