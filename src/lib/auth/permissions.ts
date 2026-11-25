// Pure helpers, no `server-only`: command-line scripts import this file too.

/** Per-user permission keys stored in users.permissions, in canonical order. */
export const PERMISSIONS = ["tasks.view_all", "tasks.edit_all", "tasks.assign", "tasks.manage_settings"] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const isPermission = (v: unknown): v is Permission =>
  typeof v === "string" && (PERMISSIONS as readonly string[]).includes(v);

/** True when `held` grants `needed`. tasks.edit_all implies tasks.view_all; unknown keys grant nothing. */
export const hasPermission = (held: readonly string[], needed: Permission): boolean => {
  if (held.includes(needed)) return true;
  return needed === "tasks.view_all" && held.includes("tasks.edit_all");
};

/** Drops unknown keys and duplicates; returns the rest in PERMISSIONS order. */
export const cleanPermissions = (held: readonly string[]): Permission[] => PERMISSIONS.filter((p) => held.includes(p));
