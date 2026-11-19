import "server-only";
import { db, type Queryable } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/auth/errors";
import type { CurrentUser } from "@/lib/auth/current-user";
import { canManageTaskSettings } from "./policy";
import type { CreateCategoryInput, CreatePriorityInput, UpdateCategoryInput, UpdatePriorityInput } from "./config-schema";

// Task categories and priorities (spec section 6): two small tables managed from Settings. They behave the same way, so one
// module serves both and `kind` picks the table. Every table, column and field name below comes from the constants in this
// file, never from the request.

export type ConfigKind = "categories" | "priorities";

interface ConfigRow {
  id: string;
  key: string;
  name: string;
  colour: string;
  sort_order: number;
  is_active: boolean;
  /** Starter rows: renamed, recoloured or hidden, never deleted. */
  is_system: boolean;
  /** A task points at it, so it cannot be deleted (it can still be hidden). */
  in_use: boolean;
}
export interface CategoryRow extends ConfigRow {
  /** Cadence copied onto new tasks of this category; null = no repeat. */
  default_follow_up_days: number | null;
}
export interface PriorityRow extends ConfigRow {
  /** 1 = most urgent; orders tasks inside a Desk section. */
  rank: number;
}

type RowOf<K extends ConfigKind> = K extends "categories" ? CategoryRow : PriorityRow;
type CreateInput<K extends ConfigKind> = K extends "categories" ? CreateCategoryInput : CreatePriorityInput;
type UpdateInput<K extends ConfigKind> = K extends "categories" ? UpdateCategoryInput : UpdatePriorityInput;

/** The input fields every kind has, and the column each one writes. */
const COMMON_FIELDS = { name: "name", colour: "colour", sortOrder: "sort_order", isActive: "is_active" } as const;

const KINDS = {
  categories: {
    table: "task_categories",
    /** The column on `tasks` that points here. */
    taskColumn: "category_id",
    entityType: "task_category",
    noun: "category",
    plural: "categories",
    columns: ["id", "key", "name", "colour", "default_follow_up_days", "sort_order", "is_active", "is_system"],
    /** Input fields only this kind has, and their columns. */
    ownFields: { defaultFollowUpDays: "default_follow_up_days" },
  },
  priorities: {
    table: "task_priorities",
    taskColumn: "priority_id",
    entityType: "task_priority",
    noun: "priority",
    plural: "priorities",
    columns: ["id", "key", "name", "colour", "rank", "sort_order", "is_active", "is_system"],
    ownFields: { rank: "rank" },
  },
} as const satisfies Record<ConfigKind, unknown>;

const FIELD_LABEL: Record<string, string> = {
  name: "name", colour: "colour", sortOrder: "order", isActive: "visibility", defaultFollowUpDays: "default follow-up", rank: "rank",
};

/** Serialises writes that need a unique name or key (add, rename) on one table, so two people cannot race to the same one. */
const lockTable = (tx: Queryable, table: string) => tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${table}:write`]);

function requireSettingsAccess(actor: CurrentUser) {
  if (!canManageTaskSettings(actor)) {
    throw new AppError("You do not have permission to change task categories and priorities", 403, "FORBIDDEN");
  }
}

/** Letters and digits only, words joined with `_`, like the seeded keys; never empty. */
function slugify(name: string, fallback: string): string {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60).replace(/_+$/, "");
  return slug || fallback;
}

interface Existing {
  id: string;
  key: string;
  is_active: boolean;
  sort_order: number;
  /** Has the name being checked, whatever the case (compared by the database, so adds and renames agree). */
  same_name: boolean;
}

/** Every row of the table, which stays small: what an add or a rename needs to know about names, keys and order. */
async function existingRows(tx: Queryable, kind: ConfigKind, name: string): Promise<Existing[]> {
  const { rows } = await tx.query<Existing>(
    `SELECT id, key, is_active, sort_order, lower(btrim(name)) = lower($1) AS same_name FROM ${KINDS[kind].table}`,
    [name],
  );
  return rows;
}

/** Names are unique whatever the case. A hidden row still counts, so the message says where it went. */
function assertNameFree(kind: ConfigKind, name: string, rows: Existing[], exceptId: string | null) {
  const clash = rows.find((r) => r.same_name && r.id !== exceptId);
  if (clash) {
    throw new AppError(`A ${KINDS[kind].noun} named "${name}" already exists${clash.is_active ? "" : " (it is hidden; show it again instead)"}`, 409, "DUPLICATE");
  }
}

/** The list for the pickers and the Settings screens. Open to any signed-in user; the route checks the session. */
export async function listConfig<K extends ConfigKind>(kind: K, opts: { includeInactive: boolean }): Promise<RowOf<K>[]> {
  const { table, taskColumn, columns } = KINDS[kind];
  const rows = await db.query(
    `SELECT ${columns.map((c) => `c.${c}`).join(", ")}, EXISTS (SELECT 1 FROM tasks t WHERE t.${taskColumn} = c.id) AS in_use
     FROM ${table} c ${opts.includeInactive ? "" : "WHERE c.is_active"}
     ORDER BY c.sort_order, lower(c.name), c.id`,
  );
  return rows as unknown as RowOf<K>[];
}

export async function createConfig<K extends ConfigKind>(kind: K, input: CreateInput<K>, actor: CurrentUser): Promise<{ id: string }> {
  requireSettingsAccess(actor);
  const { table, entityType, noun, ownFields } = KINDS[kind];
  const body = input as Record<string, unknown>;
  const name = body.name as string;

  return db.transaction(async (tx) => {
    await lockTable(tx, table);
    const rows = await existingRows(tx, kind, name);
    assertNameFree(kind, name, rows, null);

    // The key is a slug of the name, made unique with a numeric suffix. It is fixed for life: a rename never changes it.
    const taken = new Set(rows.map((r) => r.key));
    const base = slugify(name, noun);
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;

    // A new row goes last unless the caller says where.
    const sortOrder = (body.sortOrder as number | undefined) ?? Math.max(0, ...rows.map((r) => r.sort_order)) + 10;

    const columns = ["key", "name", "colour", "sort_order"];
    const values: unknown[] = [key, name, body.colour, sortOrder];
    for (const [field, column] of Object.entries(ownFields)) {
      if (body[field] === undefined) continue;
      columns.push(column);
      values.push(body[field]);
    }
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
      values,
    );
    const id = inserted.rows[0]!.id;
    await logActivity({ entityType, entityId: id, action: "created", summary: `Added task ${noun} "${name}"`, actorId: actor.id, metadata: { key } }, tx);
    return { id };
  });
}

/** Renames, recolours, reorders, hides or shows a row. Only what is sent changes, and nothing is logged when nothing did. */
export async function updateConfig<K extends ConfigKind>(kind: K, id: string, input: UpdateInput<K>, actor: CurrentUser): Promise<void> {
  requireSettingsAccess(actor);
  const { table, entityType, noun, columns, ownFields } = KINDS[kind];
  const body = input as Record<string, unknown>;

  await db.transaction(async (tx) => {
    // Table lock before row lock, always in this order, so a rename and an add can never deadlock.
    if (body.name !== undefined) await lockTable(tx, table);
    const found = await tx.query<Record<string, unknown>>(`SELECT ${columns.join(", ")} FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
    const cur = found.rows[0];
    if (!cur) throw new AppError(`Task ${noun} not found`, 404, "NOT_FOUND");

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [field, column] of Object.entries({ ...COMMON_FIELDS, ...ownFields })) {
      if (body[field] === undefined || body[field] === cur[column]) continue;
      changes[field] = { from: cur[column], to: body[field] };
      values.push(body[field]);
      sets.push(`${column} = $${values.length}`);
    }
    const changed = Object.keys(changes);
    if (!changed.length) return;

    const name = (body.name as string | undefined) ?? (cur.name as string);
    if (changes.name) assertNameFree(kind, name, await existingRows(tx, kind, name), id);

    values.push(id);
    await tx.query(`UPDATE ${table} SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length}`, values);

    let summary = `Updated task ${noun} "${name}" (${changed.map((f) => FIELD_LABEL[f]).join(", ")})`;
    if (changed.length === 1 && changes.isActive) summary = `${changes.isActive.to ? "Showed" : "Hid"} task ${noun} "${name}"`;
    if (changed.length === 1 && changes.name) summary = `Renamed task ${noun} "${changes.name.from}" to "${name}"`;
    await logActivity({ entityType, entityId: id, action: "updated", summary, actorId: actor.id, metadata: { changes } }, tx);
  });
}

/** Starter rows and rows that tasks use cannot be deleted, only hidden. */
export async function deleteConfig(kind: ConfigKind, id: string, actor: CurrentUser): Promise<void> {
  requireSettingsAccess(actor);
  const { table, taskColumn, entityType, noun, plural } = KINDS[kind];

  await db.transaction(async (tx) => {
    // The row lock also makes a task being created for this row wait, so the in-use check below cannot go stale.
    const found = await tx.query<{ key: string; name: string; is_system: boolean }>(`SELECT key, name, is_system FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
    const cur = found.rows[0];
    if (!cur) throw new AppError(`Task ${noun} not found`, 404, "NOT_FOUND");
    if (cur.is_system) throw new AppError(`Starter ${plural} can be hidden but not deleted`, 409, "PROTECTED");
    const used = await tx.query(`SELECT 1 FROM tasks WHERE ${taskColumn} = $1 LIMIT 1`, [id]);
    if (used.rowCount) throw new AppError(`Tasks use this ${noun}. Hide it instead of deleting it.`, 409, "IN_USE");

    await tx.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    await logActivity({ entityType, entityId: id, action: "deleted", summary: `Deleted task ${noun} "${cur.name}"`, actorId: actor.id, metadata: { key: cur.key } }, tx);
  });
}
