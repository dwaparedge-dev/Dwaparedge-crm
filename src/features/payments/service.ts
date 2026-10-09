import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/auth/errors";
import { todayIST } from "@/lib/dates";
import { financialYear } from "@/lib/gst";
import { nextSequence } from "@/lib/sequences";
import { likePattern } from "@/lib/validation";
import { getSettings } from "@/features/settings/service";
import { validateAllocationPlan, type InvoiceState } from "./allocation";
import type { AllocationInput, PaymentInput, listPaymentsSchema } from "./schema";

export interface PaymentRow {
  id: string;
  receipt_number: string;
  client_id: string;
  client_name: string;
  payment_date: string;
  amount: string;
  currency: string;
  method: string;
  reference: string | null;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  recorded_by_name: string | null;
  created_at: string;
  allocated: string;
  unallocated: string;
}
export interface AllocationRow {
  id: string; invoice_id: string; invoice_number: string; amount: string; created_at: string;
  reversed_at: string | null; reverse_reason: string | null; created_by_name: string | null;
}

const ALLOCATED = `COALESCE((SELECT sum(a.amount) FROM payment_allocations a WHERE a.payment_id = p.id AND a.reversed_at IS NULL), 0)`;
const SELECT = `
  SELECT p.id, p.receipt_number, p.client_id, c.display_name AS client_name, to_char(p.payment_date,'YYYY-MM-DD') AS payment_date, p.amount, p.currency,
         p.method, p.reference, p.notes, p.voided_at, p.void_reason, u.name AS recorded_by_name, p.created_at,
         ${ALLOCATED} AS allocated,
         CASE WHEN p.voided_at IS NULL THEN p.amount - ${ALLOCATED} ELSE 0 END AS unallocated
  FROM payments p JOIN clients c ON c.id = p.client_id LEFT JOIN users u ON u.id = p.recorded_by`;

export async function listPayments(p: z.infer<typeof listPaymentsSchema>) {
  const where: string[] = [];
  const values: unknown[] = [];
  const add = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  if (p.clientId) where.push(`p.client_id = ${add(p.clientId)}`);
  if (p.method) where.push(`p.method = ${add(p.method)}`);
  if (p.from) where.push(`p.payment_date >= ${add(p.from)}`);
  if (p.to) where.push(`p.payment_date <= ${add(p.to)}`);
  if (p.includeVoided !== "true") where.push("p.voided_at IS NULL");
  if (p.search) {
    const s = add(likePattern(p.search));
    where.push(`(p.receipt_number ILIKE ${s} OR p.reference ILIKE ${s} OR c.display_name ILIKE ${s})`);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const filterValues = [...values];
  const limit = add(p.pageSize);
  const offset = add((p.page - 1) * p.pageSize);
  const rows = await db.query<PaymentRow & { total_rows: string }>(
    `${SELECT.replace("SELECT p.id", "SELECT count(*) OVER() AS total_rows, p.id")} ${whereSql} ORDER BY p.payment_date DESC, p.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  // "Collected" = payments received and not voided, regardless of how much is allocated to invoices yet.
  const agg = await db.queryOne<{ collected: string | null; unallocated: string | null }>(
    `SELECT sum(p.amount) FILTER (WHERE p.voided_at IS NULL) AS collected,
            sum(p.amount - ${ALLOCATED}) FILTER (WHERE p.voided_at IS NULL) AS unallocated
     FROM payments p JOIN clients c ON c.id = p.client_id ${whereSql}`,
    filterValues,
  );
  return {
    items: rows.map((r) => {
      const { total_rows, ...rest } = r;
      void total_rows;
      return rest;
    }),
    total: Number(rows[0]?.total_rows ?? 0),
    totals: { collected: agg?.collected ?? "0.00", unallocated: agg?.unallocated ?? "0.00" },
    page: p.page,
    pageSize: p.pageSize,
  };
}

export async function getPayment(id: string, runner?: PoolClient) {
  const row = await db.queryOne<PaymentRow>(`${SELECT} WHERE p.id = $1`, [id], runner);
  if (!row) throw new AppError("Payment not found", 404, "NOT_FOUND");
  const allocations = await db.query<AllocationRow>(
    `SELECT a.id, a.invoice_id, i.invoice_number, a.amount, a.created_at, a.reversed_at, a.reverse_reason, u.name AS created_by_name
     FROM payment_allocations a JOIN invoices i ON i.id = a.invoice_id LEFT JOIN users u ON u.id = a.created_by
     WHERE a.payment_id = $1 ORDER BY a.created_at`,
    [id],
    runner,
  );
  return { ...row, allocations };
}

/** Locks the payment, checks every rule in one place, then inserts. Must run inside a transaction. */
async function allocateInTx(tx: PoolClient, paymentId: string, requests: AllocationInput[], actorId: string) {
  const pay = (await tx.query<{ client_id: string; amount: string; voided_at: string | null; receipt_number: string }>(
    "SELECT client_id, amount, voided_at, receipt_number FROM payments WHERE id = $1 FOR UPDATE", [paymentId],
  )).rows[0];
  if (!pay) throw new AppError("Payment not found", 404, "NOT_FOUND");

  // Lock invoices in a stable order so two concurrent allocations cannot deadlock. The lock is taken in its
  // own statement: read-committed does not re-evaluate subqueries after waiting on a lock, so the
  // allocated sums must be read AFTER the lock is held to see what a concurrent transaction committed.
  const ids = [...new Set(requests.map((r) => r.invoiceId))].sort();
  await tx.query("SELECT id FROM invoices WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", [ids]);
  const inv = await tx.query<{ id: string; invoice_number: string | null; client_id: string; status: string; total: string; allocated: string }>(
    `SELECT i.id, i.invoice_number, i.client_id, i.status, i.total,
            COALESCE((SELECT sum(a.amount) FROM payment_allocations a WHERE a.invoice_id = i.id AND a.reversed_at IS NULL), 0) AS allocated
     FROM invoices i WHERE i.id = ANY($1::uuid[])`,
    [ids],
  );
  const invoices = new Map<string, InvoiceState>(inv.rows.map((r) => [r.id, { number: r.invoice_number, clientId: r.client_id, status: r.status, total: r.total, allocated: r.allocated }]));
  const used = (await tx.query<{ s: string }>("SELECT COALESCE(sum(amount),0) AS s FROM payment_allocations WHERE payment_id = $1 AND reversed_at IS NULL", [paymentId])).rows[0]!.s;
  const unallocated = (await tx.query<{ v: string }>("SELECT ($1::numeric - $2::numeric) AS v", [pay.amount, used])).rows[0]!.v;

  validateAllocationPlan({ paymentClientId: pay.client_id, paymentVoided: pay.voided_at !== null, paymentUnallocated: unallocated, requests, invoices });

  for (const r of requests) {
    await tx.query("INSERT INTO payment_allocations (payment_id, invoice_id, amount, created_by) VALUES ($1,$2,$3,$4)", [paymentId, r.invoiceId, r.amount, actorId]);
    await logActivity({
      entityType: "payment", entityId: paymentId, clientId: pay.client_id, action: "allocated",
      summary: `${r.amount} of ${pay.receipt_number} allocated to invoice ${invoices.get(r.invoiceId)!.number}`, actorId,
      metadata: { invoiceId: r.invoiceId, amount: r.amount },
    }, tx);
  }
}

export async function recordPayment(input: PaymentInput, actorId: string) {
  if (input.paymentDate > todayIST()) throw new AppError("The payment date cannot be in the future", 422, "VALIDATION_ERROR");
  return db.transaction(async (tx) => {
    const client = await tx.query<{ archived_at: string | null }>("SELECT archived_at FROM clients WHERE id = $1", [input.clientId]);
    if (!client.rowCount) throw new AppError("Client not found", 404, "NOT_FOUND");

    const settings = await getSettings(tx);
    const fy = financialYear(input.paymentDate);
    const receipt = `${settings.receipt_prefix}/${fy}/${String(await nextSequence("receipt", fy, tx)).padStart(4, "0")}`;
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO payments (receipt_number, client_id, payment_date, amount, method, reference, notes, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [receipt, input.clientId, input.paymentDate, input.amount, input.method, input.reference, input.notes, actorId],
    );
    const id = rows[0]!.id;
    await logActivity({ entityType: "payment", entityId: id, clientId: input.clientId, action: "recorded", summary: `Payment ${receipt} of ${input.amount} recorded`, actorId, metadata: { method: input.method } }, tx);
    if (input.allocations.length) await allocateInTx(tx, id, input.allocations, actorId);
    return { id, receiptNumber: receipt };
  });
}

export async function allocatePayment(paymentId: string, allocations: AllocationInput[], actorId: string) {
  await db.transaction((tx) => allocateInTx(tx, paymentId, allocations, actorId));
}

/** Reallocation = reverse the old allocation (kept for audit) and allocate again. */
export async function reverseAllocation(allocationId: string, reason: string, actorId: string) {
  await db.transaction(async (tx) => {
    const a = (await tx.query<{ payment_id: string; invoice_id: string; amount: string; reversed_at: string | null }>(
      "SELECT payment_id, invoice_id, amount, reversed_at FROM payment_allocations WHERE id = $1 FOR UPDATE", [allocationId],
    )).rows[0];
    if (!a) throw new AppError("Allocation not found", 404, "NOT_FOUND");
    if (a.reversed_at) throw new AppError("This allocation has already been reversed", 409, "INVALID_TRANSITION");
    const meta = (await tx.query<{ client_id: string; receipt_number: string; invoice_number: string | null }>(
      "SELECT p.client_id, p.receipt_number, i.invoice_number FROM payments p, invoices i WHERE p.id = $1 AND i.id = $2", [a.payment_id, a.invoice_id],
    )).rows[0]!;
    await tx.query("UPDATE payment_allocations SET reversed_at = now(), reversed_by = $1, reverse_reason = $2 WHERE id = $3", [actorId, reason, allocationId]);
    await logActivity({
      entityType: "payment", entityId: a.payment_id, clientId: meta.client_id, action: "allocation_reversed",
      summary: `Allocation of ${a.amount} from ${meta.receipt_number} to invoice ${meta.invoice_number} reversed: ${reason}`, actorId,
    }, tx);
  });
}

/** Corrections: void the wrong payment (all allocations must be reversed first) and record a new one. */
export async function voidPayment(paymentId: string, reason: string, actorId: string) {
  await db.transaction(async (tx) => {
    const p = (await tx.query<{ client_id: string; receipt_number: string; voided_at: string | null }>(
      "SELECT client_id, receipt_number, voided_at FROM payments WHERE id = $1 FOR UPDATE", [paymentId],
    )).rows[0];
    if (!p) throw new AppError("Payment not found", 404, "NOT_FOUND");
    if (p.voided_at) throw new AppError("This payment is already voided", 409, "INVALID_TRANSITION");
    const live = await tx.query("SELECT 1 FROM payment_allocations WHERE payment_id = $1 AND reversed_at IS NULL LIMIT 1", [paymentId]);
    if (live.rowCount) throw new AppError("This payment is allocated to invoices. Reverse those allocations first.", 409, "HAS_ALLOCATIONS");
    await tx.query("UPDATE payments SET voided_at = now(), voided_by = $1, void_reason = $2 WHERE id = $3", [actorId, reason, paymentId]);
    await logActivity({ entityType: "payment", entityId: paymentId, clientId: p.client_id, action: "voided", summary: `Payment ${p.receipt_number} voided: ${reason}`, actorId }, tx);
  });
}
