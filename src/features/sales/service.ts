import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { resolveOption } from "@/features/options/service";
import { AppError } from "@/lib/auth/errors";
import { milestoneTaxable } from "@/lib/billing";
import { computeLine, formatScaled, parseScaled, sumAmounts } from "@/lib/money";
import { nextSequence } from "@/lib/sequences";
import { likePattern } from "@/lib/validation";
import type { MilestoneInput, SaleInput, listSalesSchema } from "./schema";

export interface SaleRow {
  id: string;
  sale_number: string;
  client_id: string;
  client_name: string;
  client_state_code: string | null;
  type: string;
  title: string;
  status: "draft" | "confirmed" | "completed" | "cancelled";
  owner_id: string | null;
  owner_name: string | null;
  sale_date: string;
  expected_close: string | null;
  currency: string;
  subtotal: string;
  tax_total: string;
  total: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Derived from invoices, allocations and tagged payments (see the sale_billing view).
  billed_total: string;        // issued invoices, incl. GST
  paid_on_invoices: string;    // allocated to those invoices
  advance: string;             // received for this sale, not yet allocated
  paid_total: string;          // paid_on_invoices + advance
  unbilled_estimate: string;   // what is left to invoice, incl. GST at the sale's rates (estimate)
  balance_remaining: string;   // (billed + unbilled) - paid, never negative
  overpaid: string;
  due_on_invoices: string;     // issued invoices' balance
  to_bill_taxable: string;     // free to put on a new invoice (before GST)
  billing_status: "not_billed" | "partly_billed" | "fully_billed";
  payment_status: "unpaid" | "partial" | "paid";
}
export interface SaleItemRow {
  id: string;
  position: number;
  product_id: string | null;
  description: string;
  hsn_sac: string | null;
  quantity: string;
  unit_price: string;
  discount_percent: string;
  tax_rate: string;
  taxable_amount: string;
  tax_amount: string;
  line_total: string;
  issued_taxable: string;
  draft_taxable: string;
  remaining_taxable: string;
}
export interface MilestoneRow {
  id: string;
  position: number;
  title: string;
  basis: "percent" | "amount";
  percent: string | null;
  amount: string | null;
  due_date: string | null;
  taxable: string;               // what the milestone stands for, before GST
  invoice_id: string | null;     // only set while that invoice is live (draft or issued)
  invoice_number: string | null;
  invoice_status: string | null;
  invoice_total: string | null;
  invoice_paid: string | null;
}

const SELECT = `
  SELECT s.id, s.sale_number, s.client_id, c.display_name AS client_name, c.state_code AS client_state_code,
         s.type, s.title, s.status, s.owner_id, u.name AS owner_name,
         to_char(s.sale_date, 'YYYY-MM-DD') AS sale_date, to_char(s.expected_close, 'YYYY-MM-DD') AS expected_close,
         s.currency, s.subtotal, s.tax_total, s.total, s.notes, s.created_at, s.updated_at,
         sb.billed_total, sb.paid_on_invoices, sb.advance, (sb.paid_on_invoices + sb.advance) AS paid_total, sb.unbilled_estimate,
         GREATEST(sb.billed_total + sb.unbilled_estimate - sb.paid_on_invoices - sb.advance, 0.00) AS balance_remaining,
         GREATEST(sb.paid_on_invoices + sb.advance - sb.billed_total - sb.unbilled_estimate, 0.00) AS overpaid,
         (sb.billed_total - sb.paid_on_invoices) AS due_on_invoices, sb.to_bill_taxable,
         CASE WHEN sb.issued_taxable + sb.draft_taxable = 0 THEN 'not_billed' WHEN sb.to_bill_taxable <= 0 THEN 'fully_billed' ELSE 'partly_billed' END AS billing_status,
         CASE WHEN sb.paid_on_invoices + sb.advance <= 0 THEN 'unpaid'
              WHEN sb.paid_on_invoices + sb.advance >= sb.billed_total + sb.unbilled_estimate THEN 'paid' ELSE 'partial' END AS payment_status
  FROM sales s JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.owner_id JOIN sale_billing sb ON sb.sale_id = s.id`;

export async function listSales(p: z.infer<typeof listSalesSchema>) {
  const where: string[] = [];
  const values: unknown[] = [];
  const add = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  if (p.clientId) where.push(`s.client_id = ${add(p.clientId)}`);
  if (p.status) where.push(`s.status = ${add(p.status)}`);
  if (p.type) where.push(`s.type = ${add(p.type)}`);
  if (p.from) where.push(`s.sale_date >= ${add(p.from)}`);
  if (p.to) where.push(`s.sale_date <= ${add(p.to)}`);
  if (p.search) {
    const s = add(likePattern(p.search));
    where.push(`(s.title ILIKE ${s} OR s.sale_number ILIKE ${s} OR c.display_name ILIKE ${s})`);
  }
  const limit = add(p.pageSize);
  const offset = add((p.page - 1) * p.pageSize);
  const rows = await db.query<SaleRow & { total_rows: string }>(
    `${SELECT.replace("SELECT s.id", "SELECT count(*) OVER() AS total_rows, s.id")}
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY s.created_at DESC, s.id LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  // Summary over everything the filters match (ignoring paging); status counts ignore the status filter so the tabs can show them.
  const filterValues = values.slice(0, values.length - 2);
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const sum = await db.queryOne<{ order_value: string | null; billed: string | null; paid: string | null; balance: string | null }>(
    `SELECT sum(s.total) AS order_value, sum(sb.billed_total) AS billed, sum(sb.paid_on_invoices + sb.advance) AS paid,
            sum(CASE WHEN s.status = 'cancelled' THEN 0 ELSE GREATEST(sb.billed_total + sb.unbilled_estimate - sb.paid_on_invoices - sb.advance, 0.00) END) AS balance
     FROM sales s JOIN clients c ON c.id = s.client_id JOIN sale_billing sb ON sb.sale_id = s.id ${whereSql}`,
    filterValues,
  );
  const statusIdx = p.status ? where.findIndex((w) => w.startsWith("s.status =")) : -1;
  const countWhere = where.filter((_, i) => i !== statusIdx);
  const countValues = filterValues.filter((_, i) => i !== statusIdx);
  // Re-number placeholders after removing the status parameter.
  const renumbered = statusIdx < 0 ? countWhere : countWhere.map((w) => w.replace(/\$(\d+)/g, (_m, n) => `$${Number(n) > statusIdx + 1 ? Number(n) - 1 : Number(n)}`));
  const counts = await db.query<{ status: string; n: string }>(
    `SELECT s.status, count(*) AS n FROM sales s JOIN clients c ON c.id = s.client_id ${renumbered.length ? "WHERE " + renumbered.join(" AND ") : ""} GROUP BY s.status`,
    countValues,
  );
  return {
    items: rows.map((r) => {
      const { total_rows, ...rest } = r;
      void total_rows;
      return rest;
    }),
    total: Number(rows[0]?.total_rows ?? 0),
    summary: {
      orderValue: sum?.order_value ?? "0.00", billed: sum?.billed ?? "0.00", paid: sum?.paid ?? "0.00", balance: sum?.balance ?? "0.00",
      statusCounts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Record<string, number>,
    },
    page: p.page,
    pageSize: p.pageSize,
  };
}

export async function getSaleRow(id: string, runner?: PoolClient) {
  const sale = await db.queryOne<SaleRow>(`${SELECT} WHERE s.id = $1`, [id], runner);
  if (!sale) throw new AppError("Sale not found", 404, "NOT_FOUND");
  return sale;
}

const ITEMS_SQL = `
  SELECT si.*, b.issued_taxable, b.draft_taxable, (si.taxable_amount - b.issued_taxable - b.draft_taxable) AS remaining_taxable
  FROM sale_items si JOIN sale_item_billing b ON b.sale_item_id = si.id`;

export const getSaleItems = (saleId: string, runner?: PoolClient) =>
  db.query<SaleItemRow>(`${ITEMS_SQL} WHERE si.sale_id = $1 ORDER BY si.position`, [saleId], runner);

export async function getMilestones(saleId: string, saleTaxable: string, runner?: PoolClient): Promise<MilestoneRow[]> {
  const rows = await db.query<Omit<MilestoneRow, "taxable">>(
    `SELECT m.id, m.position, m.title, m.basis, m.percent, m.amount, to_char(m.due_date,'YYYY-MM-DD') AS due_date,
            CASE WHEN i.status IN ('draft','issued') THEN m.invoice_id END AS invoice_id,
            CASE WHEN i.status IN ('draft','issued') THEN i.invoice_number END AS invoice_number,
            CASE WHEN i.status IN ('draft','issued') THEN i.status END AS invoice_status,
            CASE WHEN i.status IN ('draft','issued') THEN i.total END AS invoice_total,
            CASE WHEN i.status = 'issued' THEN COALESCE((SELECT sum(a.amount) FROM payment_allocations a WHERE a.invoice_id = i.id AND a.reversed_at IS NULL), 0) END AS invoice_paid
     FROM sale_milestones m LEFT JOIN invoices i ON i.id = m.invoice_id WHERE m.sale_id = $1 ORDER BY m.position`,
    [saleId],
    runner,
  );
  return rows.map((m) => ({ ...m, taxable: formatScaled(milestoneTaxable(m, saleTaxable), 2) }));
}

export async function getSale(id: string) {
  const sale = await getSaleRow(id);
  const [items, milestones] = await Promise.all([getSaleItems(id), getMilestones(id, sale.subtotal)]);
  return { ...sale, items, milestones };
}

/** Totals are always recomputed here; the browser's numbers are only a preview. */
function priceItems(items: SaleInput["items"]) {
  const lines = items.map((i) => {
    try {
      return computeLine(i);
    } catch (e) {
      throw new AppError((e as Error).message, 422, "VALIDATION_ERROR");
    }
  });
  return {
    lines,
    subtotal: sumAmounts(lines.map((l) => l.taxable)),
    taxTotal: sumAmounts(lines.map((l) => l.tax)),
    total: sumAmounts(lines.map((l) => l.total)),
  };
}

type Priced = ReturnType<typeof priceItems>["lines"][number];
const itemParams = (saleId: string, position: number, it: SaleInput["items"][number], l: Priced) => [
  saleId, position, it.productId, it.description, it.hsnSac, it.quantity, it.unitPrice, it.discountPercent, it.taxRate, l.taxable, l.tax, l.total,
];
const INSERT_ITEM = `INSERT INTO sale_items (sale_id, position, product_id, description, hsn_sac, quantity, unit_price, discount_percent, tax_rate, taxable_amount, tax_amount, line_total)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`;

async function assertProductsExist(tx: PoolClient, items: SaleInput["items"]) {
  const ids = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  if (!ids.length) return;
  const { rowCount } = await tx.query("SELECT 1 FROM products WHERE id = ANY($1::uuid[])", [ids]);
  if (rowCount !== ids.length) throw new AppError("One of the selected products no longer exists", 422, "VALIDATION_ERROR");
}

export async function createSale(input: SaleInput, actorId: string) {
  const priced = priceItems(input.items);
  return db.transaction(async (tx) => {
    input = { ...input, type: await resolveOption("sales", "type", input.type, tx) };
    const client = await tx.query<{ archived_at: string | null }>("SELECT archived_at FROM clients WHERE id = $1", [input.clientId]);
    if (!client.rowCount) throw new AppError("Client not found", 404, "NOT_FOUND");
    if (client.rows[0]!.archived_at) throw new AppError("Cannot create a sale for an archived client", 422, "CLIENT_ARCHIVED");
    await assertProductsExist(tx, input.items);

    const number = `SL-${String(await nextSequence("sale", "", tx)).padStart(4, "0")}`;
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO sales (sale_number, client_id, type, title, owner_id, sale_date, expected_close, subtotal, tax_total, total, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [number, input.clientId, input.type, input.title, input.ownerId, input.saleDate, input.expectedClose,
        priced.subtotal, priced.taxTotal, priced.total, input.notes, actorId],
    );
    const id = rows[0]!.id;
    for (const [idx, it] of input.items.entries()) await tx.query(INSERT_ITEM, itemParams(id, idx + 1, it, priced.lines[idx]!));
    await logActivity({ entityType: "sale", entityId: id, clientId: input.clientId, action: "created", summary: `Sale ${number} "${input.title}" created (total ${priced.total})`, actorId }, tx);
    return id;
  });
}

/**
 * Edits keep each item's identity so invoice lines keep pointing at it. Items that have been invoiced
 * cannot be removed or reduced below what is billed (the database enforces this as well).
 */
export async function updateSale(id: string, input: SaleInput, actorId: string) {
  const priced = priceItems(input.items);
  await db.transaction(async (tx) => {
    input = { ...input, type: await resolveOption("sales", "type", input.type, tx, { allowInactive: true }) };
    const cur = await tx.query<{ status: string; client_id: string; sale_number: string }>(
      "SELECT status, client_id, sale_number FROM sales WHERE id = $1 FOR UPDATE",
      [id],
    );
    const sale = cur.rows[0];
    if (!sale) throw new AppError("Sale not found", 404, "NOT_FOUND");
    if (sale.status === "completed" || sale.status === "cancelled") throw new AppError(`A ${sale.status} sale can no longer be edited`, 409, "SALE_LOCKED");
    if (input.clientId !== sale.client_id) throw new AppError("The client of an existing sale cannot be changed", 422, "VALIDATION_ERROR");
    await assertProductsExist(tx, input.items);

    // Lock the items first so a concurrent invoice cannot bill against a value we are about to lower.
    const existing = (await tx.query<{ id: string; description: string; taxable_amount: string; used: string; ever_invoiced: boolean }>(
      `SELECT si.id, si.description, si.taxable_amount,
              COALESCE((SELECT sum(ii.taxable_amount) FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE ii.sale_item_id = si.id AND i.status IN ('draft','issued')), 0) AS used,
              EXISTS (SELECT 1 FROM invoice_items ii WHERE ii.sale_item_id = si.id) AS ever_invoiced
       FROM sale_items si WHERE si.sale_id = $1 ORDER BY si.id FOR UPDATE OF si`,
      [id],
    )).rows;
    const byId = new Map(existing.map((e) => [e.id, e]));
    const keep = new Set<string>();
    for (const [idx, it] of input.items.entries()) {
      if (!it.itemId) continue;
      const e = byId.get(it.itemId);
      if (!e) throw new AppError("An item in this edit does not belong to the sale", 422, "VALIDATION_ERROR");
      keep.add(it.itemId);
      if (parseScaled(priced.lines[idx]!.taxable, 2) < parseScaled(e.used, 2)) {
        throw new AppError(`"${e.description}" has ${e.used} (before GST) invoiced already, so it cannot be reduced below that`, 409, "ITEM_BILLED");
      }
    }
    for (const e of existing) {
      if (!keep.has(e.id) && e.ever_invoiced) throw new AppError(`"${e.description}" has been invoiced and cannot be removed from the sale`, 409, "ITEM_BILLED");
    }

    // Park positions out of the way (positions are unique per sale), then write the final order.
    await tx.query("UPDATE sale_items SET position = position + 10000 WHERE sale_id = $1", [id]);
    for (const e of existing) if (!keep.has(e.id)) await tx.query("DELETE FROM sale_items WHERE id = $1", [e.id]);
    for (const [idx, it] of input.items.entries()) {
      const l = priced.lines[idx]!;
      if (it.itemId) {
        await tx.query(
          `UPDATE sale_items SET position=$1, product_id=$2, description=$3, hsn_sac=$4, quantity=$5, unit_price=$6, discount_percent=$7, tax_rate=$8,
             taxable_amount=$9, tax_amount=$10, line_total=$11 WHERE id=$12`,
          [idx + 1, it.productId, it.description, it.hsnSac, it.quantity, it.unitPrice, it.discountPercent, it.taxRate, l.taxable, l.tax, l.total, it.itemId],
        );
      } else {
        await tx.query(INSERT_ITEM, itemParams(id, idx + 1, it, l));
      }
    }
    await tx.query(
      `UPDATE sales SET type=$1, title=$2, owner_id=$3, sale_date=$4, expected_close=$5, subtotal=$6, tax_total=$7, total=$8, notes=$9, updated_at=now() WHERE id=$10`,
      [input.type, input.title, input.ownerId, input.saleDate, input.expectedClose, priced.subtotal, priced.taxTotal, priced.total, input.notes, id],
    );
    await logActivity({ entityType: "sale", entityId: id, clientId: sale.client_id, action: "updated", summary: `Sale ${sale.sale_number} updated (total ${priced.total})`, actorId }, tx);
  });
}

const TRANSITIONS: Record<string, string[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export async function setSaleStatus(id: string, status: "confirmed" | "completed" | "cancelled", actorId: string) {
  await db.transaction(async (tx) => {
    const cur = await tx.query<{ status: string; client_id: string; sale_number: string }>(
      "SELECT status, client_id, sale_number FROM sales WHERE id = $1 FOR UPDATE",
      [id],
    );
    const sale = cur.rows[0];
    if (!sale) throw new AppError("Sale not found", 404, "NOT_FOUND");
    if (!TRANSITIONS[sale.status]!.includes(status)) {
      throw new AppError(`A ${sale.status} sale cannot be marked ${status}`, 409, "INVALID_TRANSITION");
    }
    const b = (await tx.query<{ to_bill: string; live: string; advance: string }>(
      `SELECT to_bill_taxable AS to_bill, (SELECT count(*) FROM invoices WHERE sale_id = $1 AND status IN ('draft','issued')) AS live, advance
       FROM sale_billing WHERE sale_id = $1`,
      [id],
    )).rows[0]!;
    if (status === "completed" && parseScaled(b.to_bill, 2) > 0n) {
      throw new AppError(`This sale still has ${b.to_bill} (before GST) left to bill. Invoice it, or reduce the sale's items, before completing it.`, 409, "NOT_FULLY_BILLED");
    }
    if (status === "completed" && Number(b.live) > 0) {
      const drafts = await tx.query("SELECT 1 FROM invoices WHERE sale_id = $1 AND status = 'draft' LIMIT 1", [id]);
      if (drafts.rowCount) throw new AppError("Issue or delete the draft invoices of this sale first", 409, "HAS_DRAFTS");
    }
    if (status === "cancelled") {
      if (Number(b.live) > 0) throw new AppError("This sale has invoices. Delete the drafts and cancel the issued invoices first.", 409, "HAS_INVOICES");
      if (parseScaled(b.advance, 2) > 0n) throw new AppError(`${b.advance} was received for this sale and is not allocated. Void that payment (or record it against another sale) first.`, 409, "HAS_ADVANCE");
    }
    await tx.query("UPDATE sales SET status = $1, updated_at = now() WHERE id = $2", [status, id]);
    await logActivity({ entityType: "sale", entityId: id, clientId: sale.client_id, action: status, summary: `Sale ${sale.sale_number} marked ${status}`, actorId }, tx);
  });
}

/** Replaces the billing plan. Milestones that already have a live invoice are fixed and must be kept. */
export async function replaceMilestones(saleId: string, input: MilestoneInput[], actorId: string) {
  await db.transaction(async (tx) => {
    const sale = (await tx.query<{ status: string; client_id: string; sale_number: string; subtotal: string }>(
      "SELECT status, client_id, sale_number, subtotal FROM sales WHERE id = $1 FOR UPDATE", [saleId],
    )).rows[0];
    if (!sale) throw new AppError("Sale not found", 404, "NOT_FOUND");
    if (sale.status === "completed" || sale.status === "cancelled") throw new AppError(`A ${sale.status} sale's billing plan can no longer be changed`, 409, "SALE_LOCKED");

    const existing = (await tx.query<{ id: string; title: string; live: boolean }>(
      `SELECT m.id, m.title, (i.status IN ('draft','issued')) AS live
       FROM sale_milestones m LEFT JOIN invoices i ON i.id = m.invoice_id WHERE m.sale_id = $1 FOR UPDATE OF m`, [saleId],
    )).rows;
    const byId = new Map(existing.map((e) => [e.id, e]));
    const kept = new Set(input.map((m) => m.id).filter(Boolean));
    for (const e of existing) {
      if (e.live && !kept.has(e.id)) throw new AppError(`"${e.title}" already has an invoice and cannot be removed`, 409, "MILESTONE_BILLED");
    }
    for (const m of input) if (m.id && !byId.has(m.id)) throw new AppError("A milestone in this plan does not belong to the sale", 422, "VALIDATION_ERROR");

    const planned = input.reduce((a, m) => a + milestoneTaxable(m, sale.subtotal), 0n);
    if (planned > parseScaled(sale.subtotal, 2)) {
      throw new AppError(`The plan adds up to ${formatScaled(planned, 2)} (before GST), more than the sale's ${sale.subtotal}`, 422, "PLAN_TOO_LARGE");
    }

    await tx.query("UPDATE sale_milestones SET position = position + 10000 WHERE sale_id = $1", [saleId]);
    for (const e of existing) if (!kept.has(e.id)) await tx.query("DELETE FROM sale_milestones WHERE id = $1", [e.id]);
    for (const [idx, m] of input.entries()) {
      if (m.id && byId.get(m.id)!.live) {
        // Billed instalments keep their terms; only the order can change.
        await tx.query("UPDATE sale_milestones SET position = $1, updated_at = now() WHERE id = $2", [idx + 1, m.id]);
      } else if (m.id) {
        await tx.query("UPDATE sale_milestones SET position=$1, title=$2, basis=$3, percent=$4, amount=$5, due_date=$6, updated_at=now() WHERE id=$7", [idx + 1, m.title, m.basis, m.percent, m.amount, m.dueDate, m.id]);
      } else {
        await tx.query("INSERT INTO sale_milestones (sale_id, position, title, basis, percent, amount, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7)", [saleId, idx + 1, m.title, m.basis, m.percent, m.amount, m.dueDate]);
      }
    }
    await logActivity({ entityType: "sale", entityId: saleId, clientId: sale.client_id, action: "plan_updated", summary: `Billing plan of ${sale.sale_number} updated (${input.length} instalment${input.length === 1 ? "" : "s"})`, actorId }, tx);
  });
}
