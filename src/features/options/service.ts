import "server-only";
import { db, query, type Queryable } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/auth/errors";
import { OPTION_FIELDS, optionField, type FieldOption, type OptionFieldKey } from "./registry";

function field(table: string, column: string): OptionFieldKey {
  const f = optionField(table, column);
  if (!f) throw new AppError("This field does not support custom options", 422, "VALIDATION_ERROR");
  return f;
}

const COLS = "id, option_key, option_value, sort_order, is_active, is_system";

export async function listOptions(table: string, column: string, includeInactive = false): Promise<FieldOption[]> {
  field(table, column);
  return db.query<FieldOption>(
    `SELECT ${COLS} FROM field_options WHERE table_name = $1 AND column_name = $2 ${includeInactive ? "" : "AND is_active"}
     ORDER BY sort_order, lower(option_value)`,
    [table, column],
  );
}

/** Every dropdown with usage counts, for the Settings page. */
export async function listAllWithUsage() {
  const out: { field: OptionFieldKey; title: string; options: FieldOption[] }[] = [];
  for (const key of Object.keys(OPTION_FIELDS) as OptionFieldKey[]) {
    const [table, column] = key.split(".") as [string, string];
    const options = await listOptions(table, column, true);
    // table/column come from the whitelist above, never from the request.
    const used = await db.query<{ k: string }>(`SELECT DISTINCT lower(${column}) AS k FROM ${table} WHERE ${column} IS NOT NULL`);
    const inUse = new Set(used.map((u) => u.k));
    out.push({ field: key, title: OPTION_FIELDS[key].title, options: options.map((o) => ({ ...o, in_use: inUse.has(o.option_key.toLowerCase()) })) });
  }
  return out;
}

export function slugify(label: string): string {
  return label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "option";
}

/** Adds an option, or returns the existing one with the same name. Safe to call concurrently. */
export async function addOption(table: string, column: string, label: string, actorId: string): Promise<FieldOption> {
  field(table, column);
  const name = label.trim().replace(/\s+/g, " ");
  return db.transaction(async (tx) => {
    // Serialise adds to one dropdown so two people adding the same name never race on key suffixes.
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`field_options:${table}.${column}`]);
    const existing = await tx.query<FieldOption>(
      `SELECT ${COLS} FROM field_options WHERE table_name=$1 AND column_name=$2 AND lower(btrim(option_value)) = lower($3)`,
      [table, column, name],
    );
    if (existing.rows[0]) {
      if (!existing.rows[0].is_active) {
        const r = await tx.query<FieldOption>(`UPDATE field_options SET is_active = true, updated_at = now() WHERE id=$1 RETURNING ${COLS}`, [existing.rows[0].id]);
        return r.rows[0]!;
      }
      return existing.rows[0];
    }
    const base = slugify(name);
    let key = base;
    for (let n = 2; ; n++) {
      const taken = await tx.query("SELECT 1 FROM field_options WHERE table_name=$1 AND column_name=$2 AND lower(option_key)=$3", [table, column, key]);
      if (!taken.rowCount) break;
      key = `${base}_${n}`;
    }
    const max = await tx.query<{ m: number | null }>("SELECT max(sort_order) AS m FROM field_options WHERE table_name=$1 AND column_name=$2", [table, column]);
    const { rows } = await tx.query<FieldOption>(
      `INSERT INTO field_options (table_name, column_name, option_key, option_value, sort_order, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${COLS}`,
      [table, column, key, name, (max.rows[0]?.m ?? 0) + 10, actorId],
    );
    await logActivity({ entityType: "option", entityId: rows[0]!.id, action: "created", summary: `Added "${name}" to ${OPTION_FIELDS[field(table, column)].title.toLowerCase()}`, actorId }, tx);
    return rows[0]!;
  });
}

export async function updateOption(id: string, patch: { label?: string; sortOrder?: number; isActive?: boolean }, actorId: string) {
  await db.transaction(async (tx) => {
    const cur = await tx.query<{ table_name: string; column_name: string }>("SELECT table_name, column_name FROM field_options WHERE id=$1 FOR UPDATE", [id]);
    if (!cur.rows[0]) throw new AppError("Option not found", 404, "NOT_FOUND");
    try {
      await tx.query(
        `UPDATE field_options SET option_value = COALESCE($1, option_value), sort_order = COALESCE($2, sort_order),
           is_active = COALESCE($3, is_active), updated_at = now() WHERE id = $4`,
        [patch.label?.trim().replace(/\s+/g, " ") ?? null, patch.sortOrder ?? null, patch.isActive ?? null, id],
      );
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new AppError("Another option already has this name", 409, "DUPLICATE_OPTION");
      throw e;
    }
    await logActivity({ entityType: "option", entityId: id, action: "updated", summary: "Dropdown option updated", actorId }, tx);
  });
}

export async function deleteOption(id: string, actorId: string) {
  await db.transaction(async (tx) => {
    const cur = await tx.query<{ table_name: string; column_name: string; option_key: string; is_system: boolean; option_value: string }>(
      "SELECT table_name, column_name, option_key, is_system, option_value FROM field_options WHERE id=$1 FOR UPDATE",
      [id],
    );
    const o = cur.rows[0];
    if (!o) throw new AppError("Option not found", 404, "NOT_FOUND");
    if (o.is_system) throw new AppError("Built-in options can be hidden but not deleted", 409, "OPTION_PROTECTED");
    const f = field(o.table_name, o.column_name); // whitelisted identifiers
    const [t, c] = f.split(".") as [string, string];
    const used = await tx.query(`SELECT 1 FROM ${t} WHERE lower(${c}) = lower($1) LIMIT 1`, [o.option_key]);
    if (used.rowCount) throw new AppError("This option is used by existing records. Hide it instead of deleting.", 409, "OPTION_IN_USE");
    await tx.query("DELETE FROM field_options WHERE id=$1", [id]);
    await logActivity({ entityType: "option", entityId: id, action: "deleted", summary: `Removed "${o.option_value}" from ${OPTION_FIELDS[f].title.toLowerCase()}`, actorId }, tx);
  });
}

/** Returns the canonical stored key for a submitted key, or throws a 422. Inactive keys are refused. */
export async function resolveOption(table: string, column: string, key: string, client?: Queryable, opts: { allowInactive?: boolean } = {}): Promise<string> {
  field(table, column);
  const rows = await query<{ option_key: string; is_active: boolean }>(
    "SELECT option_key, is_active FROM field_options WHERE table_name=$1 AND column_name=$2 AND lower(option_key)=lower($3)",
    [table, column, key],
    client,
  );
  const row = rows[0];
  if (!row || (!row.is_active && !opts.allowInactive)) {
    throw new AppError(`Choose a valid ${OPTION_FIELDS[field(table, column)].noun}`, 422, "VALIDATION_ERROR");
  }
  return row.option_key;
}

/** key -> label for server-rendered output (PDFs). */
export async function optionLabels(table: string, column: string): Promise<Record<string, string>> {
  const rows = await db.query<{ option_key: string; option_value: string }>(
    "SELECT option_key, option_value FROM field_options WHERE table_name=$1 AND column_name=$2",
    [table, column],
  );
  return Object.fromEntries(rows.map((r) => [r.option_key.toLowerCase(), r.option_value]));
}
