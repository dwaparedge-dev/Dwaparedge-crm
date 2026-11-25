import { describe, expect, it } from "vitest";
import {
  canAssign,
  canEditRow,
  canEditTask,
  canManageTaskSettings,
  canViewAll,
  canViewTask,
  effectiveOwner,
  scopeSql,
  type TaskAccess,
} from "@/features/tasks/policy";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/current-user";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const THIRD = "33333333-3333-4333-8333-333333333333";

const userWith = (...permissions: Permission[]): CurrentUser => ({
  id: ME,
  name: "Me",
  email: "me@example.com",
  permissions,
});

const owned: TaskAccess = { ownerId: ME, ownerActive: true, createdBy: OTHER };
const createdByMe: TaskAccess = { ownerId: OTHER, ownerActive: true, createdBy: ME };
const othersTask: TaskAccess = { ownerId: OTHER, ownerActive: true, createdBy: THIRD };
const unassigned: TaskAccess = { ownerId: null, ownerActive: false, createdBy: OTHER };
const orphanedByInactiveOwner: TaskAccess = { ownerId: OTHER, ownerActive: false, createdBy: THIRD };
const orphanedButCreatedByMe: TaskAccess = { ownerId: OTHER, ownerActive: false, createdBy: ME };
const noCreator: TaskAccess = { ownerId: OTHER, ownerActive: true, createdBy: null };

describe("effectiveOwner", () => {
  it("is the owner while the owner is active", () => {
    expect(effectiveOwner(owned)).toBe(ME);
  });

  it("is null when the task has no owner", () => {
    expect(effectiveOwner(unassigned)).toBeNull();
  });

  it("is null when the owner is inactive", () => {
    expect(effectiveOwner(orphanedByInactiveOwner)).toBeNull();
  });
});

describe("a user holding no permissions", () => {
  const u = userWith();

  it("sees a task they own", () => {
    expect(canViewTask(u, owned)).toBe(true);
  });

  it("sees a task they created for someone else", () => {
    expect(canViewTask(u, createdByMe)).toBe(true);
  });

  it("does not see someone else's task", () => {
    expect(canViewTask(u, othersTask)).toBe(false);
  });

  it("does not see an unassigned task they did not create", () => {
    expect(canViewTask(u, unassigned)).toBe(false);
  });

  it("does not see a task with no recorded creator that belongs to someone else", () => {
    expect(canViewTask(u, noCreator)).toBe(false);
  });

  it("still sees a task whose owner went inactive when they created it", () => {
    expect(canViewTask(u, orphanedButCreatedByMe)).toBe(true);
  });

  it("does not see a task whose owner went inactive when they did not create it", () => {
    expect(canViewTask(u, orphanedByInactiveOwner)).toBe(false);
  });

  it("edits a task they own", () => {
    expect(canEditTask(u, owned)).toBe(true);
  });

  it("edits a task they created for someone else", () => {
    expect(canEditTask(u, createdByMe)).toBe(true);
  });

  it("does not edit someone else's task", () => {
    expect(canEditTask(u, othersTask)).toBe(false);
  });

  it("does not edit an unassigned task they did not create", () => {
    expect(canEditTask(u, unassigned)).toBe(false);
  });

  it("cannot view everyone's tasks, assign, or manage settings", () => {
    expect(canViewAll(u)).toBe(false);
    expect(canAssign(u)).toBe(false);
    expect(canManageTaskSettings(u)).toBe(false);
  });
});

describe("tasks.view_all", () => {
  const u = userWith("tasks.view_all");

  it("sees owned, created, other people's, unassigned and orphaned tasks", () => {
    for (const t of [owned, createdByMe, othersTask, unassigned, orphanedByInactiveOwner, noCreator]) {
      expect(canViewTask(u, t)).toBe(true);
    }
  });

  it("can view everyone's tasks", () => {
    expect(canViewAll(u)).toBe(true);
  });

  it("does not edit another person's task", () => {
    expect(canEditTask(u, othersTask)).toBe(false);
    expect(canEditTask(u, unassigned)).toBe(false);
  });

  it("still edits what they own or created", () => {
    expect(canEditTask(u, owned)).toBe(true);
    expect(canEditTask(u, createdByMe)).toBe(true);
  });
});

describe("tasks.edit_all", () => {
  const u = userWith("tasks.edit_all");

  it("edits another person's task, an unassigned one and an orphaned one", () => {
    for (const t of [othersTask, unassigned, orphanedByInactiveOwner, noCreator]) {
      expect(canEditTask(u, t)).toBe(true);
    }
  });

  it("implies view_all", () => {
    expect(canViewAll(u)).toBe(true);
    expect(canViewTask(u, othersTask)).toBe(true);
    expect(canViewTask(u, unassigned)).toBe(true);
  });

  it("does not by itself assign or manage settings", () => {
    expect(canAssign(u)).toBe(false);
    expect(canManageTaskSettings(u)).toBe(false);
  });
});

describe("tasks.assign", () => {
  it("lets the user assign", () => {
    expect(canAssign(userWith("tasks.assign"))).toBe(true);
  });

  it("does not widen what the user sees or edits", () => {
    const u = userWith("tasks.assign");
    expect(canViewAll(u)).toBe(false);
    expect(canViewTask(u, othersTask)).toBe(false);
    expect(canEditTask(u, othersTask)).toBe(false);
    expect(canManageTaskSettings(u)).toBe(false);
  });
});

describe("tasks.manage_settings", () => {
  it("lets the user manage categories and priorities", () => {
    expect(canManageTaskSettings(userWith("tasks.manage_settings"))).toBe(true);
  });

  it("does not widen what the user sees, edits or assigns", () => {
    const u = userWith("tasks.manage_settings");
    expect(canViewAll(u)).toBe(false);
    expect(canViewTask(u, othersTask)).toBe(false);
    expect(canEditTask(u, othersTask)).toBe(false);
    expect(canAssign(u)).toBe(false);
  });
});

describe("every combination of the four permissions", () => {
  const combinations: Permission[][] = [];
  for (let mask = 0; mask < 1 << PERMISSIONS.length; mask++) {
    combinations.push(PERMISSIONS.filter((_, i) => mask & (1 << i)));
  }

  it("covers all 16 combinations", () => {
    expect(combinations).toHaveLength(16);
  });

  it.each(combinations.map((held) => [held.join(", ") || "(none)", held] as const))(
    "answers each question from its own permission: %s",
    (_label, held) => {
      const u = userWith(...held);
      const viewAll = held.includes("tasks.view_all") || held.includes("tasks.edit_all");

      expect(canViewAll(u)).toBe(viewAll);
      expect(canViewTask(u, owned)).toBe(true);
      expect(canViewTask(u, createdByMe)).toBe(true);
      expect(canViewTask(u, othersTask)).toBe(viewAll);
      expect(canViewTask(u, unassigned)).toBe(viewAll);
      expect(canViewTask(u, orphanedByInactiveOwner)).toBe(viewAll);

      const editAll = held.includes("tasks.edit_all");
      expect(canEditTask(u, owned)).toBe(true);
      expect(canEditTask(u, createdByMe)).toBe(true);
      expect(canEditTask(u, othersTask)).toBe(editAll);
      expect(canEditTask(u, unassigned)).toBe(editAll);

      expect(canAssign(u)).toBe(held.includes("tasks.assign"));
      expect(canManageTaskSettings(u)).toBe(held.includes("tasks.manage_settings"));
    },
  );
});

describe("scopeSql", () => {
  it("is TRUE with no values for a user who can view everything", () => {
    expect(scopeSql(userWith("tasks.view_all"), "t", 1)).toEqual({ sql: "TRUE", values: [] });
  });

  it("is TRUE with no values for a user holding edit_all, which implies view_all", () => {
    expect(scopeSql(userWith("tasks.edit_all"), "t", 3)).toEqual({ sql: "TRUE", values: [] });
  });

  it("limits a user with no permissions to tasks they own or created", () => {
    expect(scopeSql(userWith(), "t", 1)).toEqual({
      sql: "(t.owner_id = $1 OR t.created_by = $1)",
      values: [ME],
    });
  });

  it("is not widened by permissions that do not grant view_all", () => {
    expect(scopeSql(userWith("tasks.assign", "tasks.manage_settings"), "t", 1)).toEqual({
      sql: "(t.owner_id = $1 OR t.created_by = $1)",
      values: [ME],
    });
  });

  it("shifts the placeholder to startParam and uses the given alias", () => {
    expect(scopeSql(userWith(), "task", 4)).toEqual({
      sql: "(task.owner_id = $4 OR task.created_by = $4)",
      values: [ME],
    });
  });

  it("never splices the user id into the SQL text", () => {
    const { sql } = scopeSql(userWith(), "t", 2);
    expect(sql).not.toContain(ME);
  });

  it("rejects an alias that is not a plain identifier", () => {
    expect(() => scopeSql(userWith(), "t; DROP TABLE tasks", 1)).toThrow("alias");
    expect(() => scopeSql(userWith(), "", 1)).toThrow("alias");
  });

  it("rejects a startParam that is not a positive integer", () => {
    expect(() => scopeSql(userWith(), "t", 0)).toThrow("startParam");
    expect(() => scopeSql(userWith(), "t", 1.5)).toThrow("startParam");
  });
});

describe("canEditRow", () => {
  // A TaskRow from TASK_SELECT already reads a deactivated owner as no owner, so owner_id null covers that case too.
  const row = (ownerId: string | null, createdBy: string | null) => ({ owner_id: ownerId, created_by: createdBy });

  it("lets the owner edit", () => {
    expect(canEditRow(userWith(), row(ME, OTHER))).toBe(true);
  });

  it("lets the creator edit a task they gave to someone else", () => {
    expect(canEditRow(userWith(), row(OTHER, ME))).toBe(true);
  });

  it("lets a holder of tasks.edit_all edit anyone's task", () => {
    expect(canEditRow(userWith("tasks.edit_all"), row(OTHER, THIRD))).toBe(true);
  });

  it("does not let a user with no permissions edit someone else's task", () => {
    expect(canEditRow(userWith(), row(OTHER, THIRD))).toBe(false);
  });

  it("does not let tasks.view_all, tasks.assign or tasks.manage_settings edit someone else's task", () => {
    expect(canEditRow(userWith("tasks.view_all", "tasks.assign", "tasks.manage_settings"), row(OTHER, THIRD))).toBe(false);
  });

  it("reads a null owner as unassigned: only the creator or tasks.edit_all may edit", () => {
    expect(canEditRow(userWith(), row(null, OTHER))).toBe(false);
    expect(canEditRow(userWith(), row(null, ME))).toBe(true);
    expect(canEditRow(userWith(), row(null, null))).toBe(false);
    expect(canEditRow(userWith("tasks.edit_all"), row(null, OTHER))).toBe(true);
  });

  it("agrees with canEditTask for the same task", () => {
    for (const held of [[], ["tasks.edit_all"]] as Permission[][]) {
      const u = userWith(...held);
      for (const [ownerId, createdBy] of [[ME, OTHER], [OTHER, ME], [OTHER, THIRD], [null, OTHER], [null, ME], [OTHER, null]] as const) {
        expect(canEditRow(u, row(ownerId, createdBy))).toBe(canEditTask(u, { ownerId, ownerActive: ownerId !== null, createdBy }));
      }
    }
  });
});
