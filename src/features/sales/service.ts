import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/auth/errors";
import { computeLine, sumAmounts } from "@/lib/money";
import { nextSequence } from "@/lib/sequences";
import { likePattern } from "@/lib/validation";
import type { SaleInput, listSalesSchema } from "./schema";

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
}

const SELECT = `
  SELECT s.id, s.sale_number, s.client_id, c.display_name AS client_name, c.state_code AS client_state_code,
         s.type, s.title, s.status, s.owner_id, u.name AS owner_name,
         to_char(s.sale_date, 'YYYY-MM-DD') AS sale_date, to_char(s.expected_close, 'YYYY-MM-DD') AS expected_close,
         s.currency, s.subtotal, s.tax_total, s.total, s.notes, s.created_at, s.updated_at
  FROM sales s JOIN clients c ON c.id = s.client_id LEFT JOIN users u ON u.id = s.owner_id`;

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
  return {
    items: rows.map((r) => {
      const { total_rows, ...rest } = r;
      void total_rows;
      return rest;
    }),
    total: Number(rows[0]?.total_rows ?? 0),
    page: p.page,
    pageSize: p.pageSize,
  };
}

export async function getSale(id: string) {
  const sale = await db.queryOne<SaleRow>(`${SELECT} WHERE s.id = $1`, [id]);
  if (!sale) throw new AppError("Sale not found", 404, "NOT_FOUND");
  const items = await db.query<SaleItemRow>("SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY position", [id]);
  return { ...sale, items };
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

async function writeItems(tx: PoolClient, saleId: string, items: SaleInput["items"], lines: ReturnType<typeof priceItems>["lines"]) {
  await tx.query("DELETE FROM sale_items WHERE sale_id = $1", [saleId]);
  for (const [idx, item] of items.entries()) {
    const l = lines[idx]!;
    await tx.query(
      `INSERT INTO sale_items (sale_id, position, product_id, description, hsn_sac, quantity, unit_price,
         discount_percent, tax_rate, taxable_amount, tax_amount, line_total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [saleId, idx + 1, item.productId, item.description, item.hsnSac, item.quantity, item.unitPrice,
        item.discountPercent, item.taxRate, l.taxable, l.tax, l.total],
    );
  }
}

async function assertProductsExist(tx: PoolClient, items: SaleInput["items"]) {
  const ids = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  if (!ids.length) return;
  const { rowCount } = await tx.query("SELECT 1 FROM products WHERE id = ANY($1::uuid[])", [ids]);
  if (rowCount !== ids.length) throw new AppError("One of the selected products no longer exists", 422, "VALIDATION_ERROR");
}

export async function createSale(input: SaleInput, actorId: string) {
  const priced = priceItems(input.items);
  return db.transaction(async (tx) => {
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
    await writeItems(tx, id, input.items, priced.lines);
    await logActivity({ entityType: "sale", entityId: id, clientId: input.clientId, action: "created", summary: `Sale ${number} "${input.title}" created (total ${priced.total})`, actorId }, tx);
    return id;
  });
}

export async function updateSale(id: string, input: SaleInput, actorId: string) {
  const priced = priceItems(input.items);
  await db.transaction(async (tx) => {
    const cur = await tx.query<{ status: string; client_id: string; sale_number: string }>(
      "SELECT status, client_id, sale_number FROM sales WHERE id = $1 FOR UPDATE",
      [id],
    );
    const sale = cur.rows[0];
    if (!sale) throw new AppError("Sale not found", 404, "NOT_FOUND");
    if (sale.status === "completed" || sale.status === "cancelled") {
      throw new AppError(`A ${sale.status} sale can no longer be edited`, 409, "SALE_LOCKED");
    }
    if (input.clientId !== sale.client_id) throw new AppError("The client of an existing sale cannot be changed", 422, "VALIDATION_ERROR");
    await assertProductsExist(tx, input.items);

    await tx.query(
      `UPDATE sales SET type=$1, title=$2, owner_id=$3, sale_date=$4, expected_close=$5, subtotal=$6, tax_total=$7, total=$8,
         notes=$9, updated_at=now() WHERE id=$10`,
      [input.type, input.title, input.ownerId, input.saleDate, input.expectedClose, priced.subtotal, priced.taxTotal, priced.total, input.notes, id],
    );
    await writeItems(tx, id, input.items, priced.lines);
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
    await tx.query("UPDATE sales SET status = $1, updated_at = now() WHERE id = $2", [status, id]);
    await logActivity({ entityType: "sale", entityId: id, clientId: sale.client_id, action: status, summary: `Sale ${sale.sale_number} marked ${status}`, actorId }, tx);
  });
}
