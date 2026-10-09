import "server-only";
import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import type { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/auth/errors";
import { likePattern } from "@/lib/validation";
import { todayIST } from "@/lib/dates";
import { EFFECTIVE_STATUS_SQL, TODAY_SQL, type EffectiveStatus, type StoredStatus } from "./status";
import type { LicenseAction, LicenseInput, listLicensesSchema } from "./schema";

export interface LicenseRow {
  id: string;
  license_identifier: string;
  client_id: string;
  client_name: string;
  product_id: string;
  product_name: string;
  plan: string;
  start_date: string;
  expiry_date: string;
  days_remaining: number;
  seat_limit: number | null;
  renewal_price: string | null;
  renewal_terms: string | null;
  stored_status: StoredStatus;
  status: EffectiveStatus;
  notes: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface LicenseEventRow {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  details: Record<string, unknown> | null;
  note: string | null;
  actor_name: string | null;
  created_at: string;
}

const SELECT = `
  SELECT l.id, l.license_identifier, l.client_id, c.display_name AS client_name, l.product_id, p.name AS product_name,
         l.plan, to_char(l.start_date, 'YYYY-MM-DD') AS start_date, to_char(l.expiry_date, 'YYYY-MM-DD') AS expiry_date,
         (l.expiry_date - ${TODAY_SQL}) AS days_remaining,
         l.seat_limit, l.renewal_price, l.renewal_terms, l.status AS stored_status, ${EFFECTIVE_STATUS_SQL} AS status,
         l.notes, l.activated_at, l.created_at, l.updated_at
  FROM licenses l JOIN clients c ON c.id = l.client_id JOIN products p ON p.id = l.product_id`;

const SORTS = { expiry: "l.expiry_date", client: "c.display_name", created: "l.created_at" } as const;

export async function listLicenses(p: z.infer<typeof listLicensesSchema>) {
  const where: string[] = [];
  const values: unknown[] = [];
  const add = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  if (p.clientId) where.push(`l.client_id = ${add(p.clientId)}`);
  if (p.productId) where.push(`l.product_id = ${add(p.productId)}`);
  if (p.status) where.push(`${EFFECTIVE_STATUS_SQL} = ${add(p.status)}`);
  if (p.expiringWithin !== undefined) {
    // Renewal window: not revoked/pending/suspended, expiring soon or already past.
    where.push(`l.status = 'active' AND l.expiry_date <= ${TODAY_SQL} + ${add(p.expiringWithin)}::int`);
  }
  if (p.search) {
    const s = add(likePattern(p.search));
    where.push(`(l.license_identifier ILIKE ${s} OR c.display_name ILIKE ${s} OR p.name ILIKE ${s} OR l.plan ILIKE ${s})`);
  }
  const order = `${SORTS[p.sort]} ${p.dir === "desc" ? "DESC" : "ASC"}, l.id`;
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const limit = add(p.pageSize);
  const offset = add((p.page - 1) * p.pageSize);

  const rows = await db.query<LicenseRow & { total_rows: string }>(
    `${SELECT.replace("SELECT l.id", "SELECT count(*) OVER() AS total_rows, l.id")} ${whereSql} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  // Expected renewal value across the whole filtered set (not just this page).
  const sumValues = values.slice(0, values.length - 2);
  const sum = await db.queryOne<{ value: string | null }>(
    `SELECT sum(l.renewal_price) AS value FROM licenses l JOIN clients c ON c.id = l.client_id JOIN products p ON p.id = l.product_id ${whereSql}`,
    sumValues,
  );
  return {
    items: rows.map((r) => {
      const { total_rows, ...rest } = r;
      void total_rows;
      return { ...rest, days_remaining: Number(rest.days_remaining) };
    }),
    total: Number(rows[0]?.total_rows ?? 0),
    renewalValue: sum?.value ?? "0.00",
    page: p.page,
    pageSize: p.pageSize,
  };
}

export async function getLicense(id: string) {
  const row = await db.queryOne<LicenseRow>(`${SELECT} WHERE l.id = $1`, [id]);
  if (!row) throw new AppError("License not found", 404, "NOT_FOUND");
  const events = await db.query<LicenseEventRow>(
    `SELECT e.id, e.event_type, e.from_status, e.to_status, e.details, e.note, u.name AS actor_name, e.created_at
     FROM license_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.license_id = $1 ORDER BY e.created_at DESC, e.id DESC`,
    [id],
  );
  return { ...row, days_remaining: Number(row.days_remaining), events };
}

// No 0/O/1/I so identifiers can be read out over the phone.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateIdentifier(): string {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `DE-${group()}-${group()}-${group()}`;
}

async function addEvent(
  tx: PoolClient,
  e: { licenseId: string; clientId: string; type: string; from?: string | null; to?: string | null; details?: Record<string, unknown>; note?: string | null; actorId: string; summary: string },
) {
  await tx.query(
    `INSERT INTO license_events (license_id, event_type, from_status, to_status, details, note, actor_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [e.licenseId, e.type, e.from ?? null, e.to ?? null, e.details ? JSON.stringify(e.details) : null, e.note ?? null, e.actorId],
  );
  await logActivity({ entityType: "license", entityId: e.licenseId, clientId: e.clientId, action: e.type, summary: e.summary, actorId: e.actorId, metadata: e.details }, tx);
}

async function assertClientAndProduct(tx: PoolClient, input: LicenseInput) {
  const client = await tx.query<{ archived_at: string | null }>("SELECT archived_at FROM clients WHERE id = $1", [input.clientId]);
  if (!client.rowCount) throw new AppError("Client not found", 404, "NOT_FOUND");
  if (client.rows[0]!.archived_at) throw new AppError("Cannot issue a license to an archived client", 422, "CLIENT_ARCHIVED");
  const product = await tx.query("SELECT 1 FROM products WHERE id = $1", [input.productId]);
  if (!product.rowCount) throw new AppError("Product not found", 422, "VALIDATION_ERROR");
}

export async function createLicense(input: LicenseInput, actorId: string) {
  return db.transaction(async (tx) => {
    await assertClientAndProduct(tx, input);
    for (let attempt = 0; attempt < 5; attempt++) {
      const identifier = generateIdentifier();
      // SAVEPOINT so a (very unlikely) identifier collision doesn't abort the whole transaction.
      await tx.query("SAVEPOINT ins");
      try {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO licenses (license_identifier, client_id, product_id, plan, start_date, expiry_date, seat_limit, renewal_price, renewal_terms, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [identifier, input.clientId, input.productId, input.plan, input.startDate, input.expiryDate, input.seatLimit, input.renewalPrice, input.renewalTerms, input.notes, actorId],
        );
        const id = rows[0]!.id;
        await tx.query("RELEASE SAVEPOINT ins");
        await addEvent(tx, { licenseId: id, clientId: input.clientId, type: "issued", to: "pending", actorId, details: { expiryDate: input.expiryDate, plan: input.plan }, summary: `License ${identifier} issued (pending activation)` });
        return id;
      } catch (e) {
        await tx.query("ROLLBACK TO SAVEPOINT ins");
        if ((e as { code?: string }).code !== "23505") throw e;
      }
    }
    throw new AppError("Could not generate a unique license identifier. Please retry.", 500, "INTERNAL");
  });
}

/** Edits descriptive fields. Client and product are fixed once issued; dates change through renew. */
export async function updateLicense(id: string, input: LicenseInput, actorId: string) {
  await db.transaction(async (tx) => {
    const cur = await tx.query<{ status: string; client_id: string; product_id: string; license_identifier: string; start_date: string; expiry_date: string }>(
      `SELECT status, client_id, product_id, license_identifier, to_char(start_date,'YYYY-MM-DD') AS start_date, to_char(expiry_date,'YYYY-MM-DD') AS expiry_date
       FROM licenses WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const l = cur.rows[0];
    if (!l) throw new AppError("License not found", 404, "NOT_FOUND");
    if (l.status === "revoked") throw new AppError("A revoked license cannot be edited", 409, "LICENSE_LOCKED");
    if (input.clientId !== l.client_id || input.productId !== l.product_id) {
      throw new AppError("Client and product cannot be changed after issue", 422, "VALIDATION_ERROR");
    }
    // Dates may only be corrected while pending; afterwards use Renew so the history stays truthful.
    if (l.status !== "pending" && (input.startDate !== l.start_date || input.expiryDate !== l.expiry_date)) {
      throw new AppError("Dates of an issued license change through Renew", 422, "VALIDATION_ERROR");
    }
    await tx.query(
      `UPDATE licenses SET plan=$1, start_date=$2, expiry_date=$3, seat_limit=$4, renewal_price=$5, renewal_terms=$6, notes=$7, updated_at=now() WHERE id=$8`,
      [input.plan, input.startDate, input.expiryDate, input.seatLimit, input.renewalPrice, input.renewalTerms, input.notes, id],
    );
    await addEvent(tx, { licenseId: id, clientId: l.client_id, type: "updated", actorId, summary: `License ${l.license_identifier} details updated` });
  });
}

export async function performAction(id: string, action: LicenseAction, actorId: string) {
  await db.transaction(async (tx) => {
    const cur = await tx.query<{ status: StoredStatus; client_id: string; license_identifier: string; expiry_date: string; renewal_price: string | null }>(
      `SELECT status, client_id, license_identifier, to_char(expiry_date,'YYYY-MM-DD') AS expiry_date, renewal_price FROM licenses WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const l = cur.rows[0];
    if (!l) throw new AppError("License not found", 404, "NOT_FOUND");
    const today = todayIST();
    const bad = (msg: string) => new AppError(msg, 409, "INVALID_TRANSITION");
    const common = { licenseId: id, clientId: l.client_id, actorId, from: l.status as string, note: action.note ?? null };
    const label = l.license_identifier;

    switch (action.action) {
      case "activate": {
        if (l.status !== "pending") throw bad(`Only a pending license can be activated (this one is ${l.status})`);
        if (l.expiry_date < today) throw bad("This license is already past its expiry date. Adjust the dates before activating.");
        await tx.query("UPDATE licenses SET status='active', activated_at=now(), updated_at=now() WHERE id=$1", [id]);
        await addEvent(tx, { ...common, type: "activated", to: "active", summary: `License ${label} activated` });
        break;
      }
      case "renew": {
        if (l.status !== "active") throw bad(`Only an active or expired license can be renewed (this one is ${l.status})`);
        if (action.newExpiry <= l.expiry_date) throw bad(`The new expiry must be after the current expiry (${l.expiry_date})`);
        const price = action.renewalPrice ?? l.renewal_price;
        await tx.query("UPDATE licenses SET expiry_date=$1, renewal_price=$2, updated_at=now() WHERE id=$3", [action.newExpiry, price, id]);
        await addEvent(tx, {
          ...common, type: "renewed", to: "active",
          details: { oldExpiry: l.expiry_date, newExpiry: action.newExpiry, renewalPrice: price },
          summary: `License ${label} renewed until ${action.newExpiry}`,
        });
        break;
      }
      case "suspend": {
        if (l.status !== "active") throw bad(`Only an active license can be suspended (this one is ${l.status})`);
        await tx.query("UPDATE licenses SET status='suspended', updated_at=now() WHERE id=$1", [id]);
        await addEvent(tx, { ...common, type: "suspended", to: "suspended", summary: `License ${label} suspended` });
        break;
      }
      case "reinstate": {
        if (l.status !== "suspended") throw bad(`Only a suspended license can be reinstated (this one is ${l.status})`);
        await tx.query("UPDATE licenses SET status='active', updated_at=now() WHERE id=$1", [id]);
        await addEvent(tx, { ...common, type: "reinstated", to: "active", summary: `License ${label} reinstated` });
        break;
      }
      case "revoke": {
        if (l.status === "revoked") throw bad("This license is already revoked");
        await tx.query("UPDATE licenses SET status='revoked', updated_at=now() WHERE id=$1", [id]);
        await addEvent(tx, { ...common, type: "revoked", to: "revoked", summary: `License ${label} revoked` });
        break;
      }
    }
  });
}
