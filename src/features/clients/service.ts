import "server-only";
import type { PoolClient } from "pg";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/auth/errors";
import { likePattern } from "@/lib/validation";
import { SORT_COLUMNS, type ClientInput, type ListClientsParams } from "./schema";

export interface ClientRow {
  id: string;
  legal_name: string;
  display_name: string;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  city: string | null;
  state_code: string | null;
  postal_code: string | null;
  country: string;
  owner_id: string | null;
  owner_name: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT = `
  SELECT c.*, u.name AS owner_name
  FROM clients c LEFT JOIN users u ON u.id = c.owner_id`;

export async function listClients(p: ListClientsParams) {
  const where: string[] = [p.archived === "true" ? "c.archived_at IS NOT NULL" : "c.archived_at IS NULL"];
  const values: unknown[] = [];
  const add = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };

  if (p.ownerId) where.push(`c.owner_id = ${add(p.ownerId)}`);
  if (p.search) {
    const s = add(likePattern(p.search));
    where.push(`(c.legal_name ILIKE ${s} OR c.display_name ILIKE ${s} OR c.gstin ILIKE ${s} OR c.email ILIKE ${s} OR c.phone ILIKE ${s} OR c.city ILIKE ${s})`);
  }
  const order = `${SORT_COLUMNS[p.sort]} ${p.dir === "desc" ? "DESC" : "ASC"}, c.id`;
  const limit = add(p.pageSize);
  const offset = add((p.page - 1) * p.pageSize);

  const rows = await db.query<ClientRow & { total: string }>(
    `${SELECT.replace("SELECT c.*", "SELECT c.*, count(*) OVER() AS total")}
     WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  return {
    items: rows.map((r) => {
      const { total: _total, ...rest } = r;
      void _total;
      return rest;
    }),
    total: Number(rows[0]?.total ?? 0),
    page: p.page,
    pageSize: p.pageSize,
  };
}

export async function getClient(id: string): Promise<ClientRow> {
  const row = await db.queryOne<ClientRow>(`${SELECT} WHERE c.id = $1`, [id]);
  if (!row) throw new AppError("Client not found", 404, "NOT_FOUND");
  return row;
}

/** Hard conflict: same GSTIN. Soft: same legal name or email (caller may confirm). */
async function findDuplicates(input: ClientInput, excludeId: string | null, runner?: PoolClient) {
  const values: unknown[] = [excludeId];
  const checks: string[] = [];
  if (input.gstin) {
    values.push(input.gstin);
    checks.push(`c.gstin = $${values.length}`);
  }
  values.push(input.legalName);
  checks.push(`lower(c.legal_name) = lower($${values.length})`);
  if (input.email) {
    values.push(input.email);
    checks.push(`lower(c.email) = lower($${values.length})`);
  }

  return db.query<{ id: string; legal_name: string; gstin: string | null; email: string | null; archived_at: string | null }>(
    `SELECT c.id, c.legal_name, c.gstin, c.email, c.archived_at FROM clients c
     WHERE ($1::uuid IS NULL OR c.id <> $1) AND (${checks.join(" OR ")}) LIMIT 5`,
    values,
    runner,
  );
}

async function assertNoConflict(input: ClientInput, excludeId: string | null, confirmDuplicate: boolean, runner: PoolClient) {
  const dupes = await findDuplicates(input, excludeId, runner);
  const gstinHit = input.gstin ? dupes.find((d) => d.gstin === input.gstin) : undefined;
  if (gstinHit) {
    throw new AppError(
      `GSTIN ${input.gstin} already belongs to "${gstinHit.legal_name}"${gstinHit.archived_at ? " (archived)" : ""}`,
      409,
      "DUPLICATE_GSTIN",
    );
  }
  if (dupes.length > 0 && !confirmDuplicate) {
    throw Object.assign(new AppError("A similar client already exists", 409, "POSSIBLE_DUPLICATE"), {
      duplicates: dupes.map((d) => ({ id: d.id, legalName: d.legal_name, email: d.email, archived: d.archived_at !== null })),
    });
  }
}

const COLUMNS = [
  "legal_name", "display_name", "gstin", "pan", "email", "phone", "billing_address", "shipping_address",
  "city", "state_code", "postal_code", "country", "owner_id", "notes",
] as const;

const toParams = (i: ClientInput) => [
  i.legalName, i.displayName, i.gstin, i.pan, i.email, i.phone, i.billingAddress, i.shippingAddress,
  i.city, i.stateCode, i.postalCode, i.country, i.ownerId, i.notes,
];

export async function createClient(input: ClientInput, actorId: string, confirmDuplicate = false) {
  return db.transaction(async (tx) => {
    await assertNoConflict(input, null, confirmDuplicate, tx);
    const placeholders = COLUMNS.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO clients (${COLUMNS.join(", ")}, created_by) VALUES (${placeholders}, $${COLUMNS.length + 1}) RETURNING id`,
      [...toParams(input), actorId],
    );
    const id = rows[0]!.id;
    await logActivity({ entityType: "client", entityId: id, clientId: id, action: "created", summary: `Client "${input.displayName}" created`, actorId }, tx);
    return id;
  });
}

export async function updateClient(id: string, input: ClientInput, actorId: string, confirmDuplicate = false) {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<ClientRow>("SELECT * FROM clients WHERE id = $1 FOR UPDATE", [id]);
    const before = rows[0];
    if (!before) throw new AppError("Client not found", 404, "NOT_FOUND");
    await assertNoConflict(input, id, confirmDuplicate, tx);

    const sets = COLUMNS.map((c, i) => `${c} = $${i + 1}`).join(", ");
    await tx.query(`UPDATE clients SET ${sets}, updated_at = now() WHERE id = $${COLUMNS.length + 1}`, [...toParams(input), id]);

    const after = Object.fromEntries(COLUMNS.map((c, i) => [c, toParams(input)[i]]));
    const changed = COLUMNS.filter((c) => (before[c] ?? null) !== (after[c] ?? null));
    if (changed.length > 0) {
      await logActivity(
        { entityType: "client", entityId: id, clientId: id, action: "updated", summary: `Client updated (${changed.join(", ")})`, actorId, metadata: { changed } },
        tx,
      );
    }
  });
}

export async function setArchived(id: string, archived: boolean, actorId: string) {
  await db.transaction(async (tx) => {
    const { rowCount } = await tx.query(
      `UPDATE clients SET archived_at = ${archived ? "COALESCE(archived_at, now())" : "NULL"}, updated_at = now() WHERE id = $1`,
      [id],
    );
    if (!rowCount) throw new AppError("Client not found", 404, "NOT_FOUND");
    await logActivity(
      { entityType: "client", entityId: id, clientId: id, action: archived ? "archived" : "restored", summary: archived ? "Client archived" : "Client restored", actorId },
      tx,
    );
  });
}

export async function listClientActivity(clientId: string, limit = 100) {
  return db.query<{ id: string; action: string; summary: string; entity_type: string; actor_name: string | null; created_at: string }>(
    `SELECT a.id, a.action, a.summary, a.entity_type, u.name AS actor_name, a.created_at
     FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.client_id = $1 ORDER BY a.created_at DESC, a.id DESC LIMIT $2`,
    [clientId, limit],
  );
}
