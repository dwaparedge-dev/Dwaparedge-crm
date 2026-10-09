import "server-only";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/auth/errors";
import { likePattern } from "@/lib/validation";
import type { ProductInput } from "./schema";
import type { z } from "zod";
import type { listProductsSchema } from "./schema";

export interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  type: string;
  description: string | null;
  hsn_sac: string | null;
  default_price: string;
  currency: string;
  gst_rate: string;
  is_tax_exempt: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listProducts(p: z.infer<typeof listProductsSchema>) {
  const where: string[] = [];
  const values: unknown[] = [];
  const add = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  if (p.type) where.push(`type = ${add(p.type)}`);
  if (p.active) where.push(`is_active = ${add(p.active === "true")}`);
  if (p.search) {
    const s = add(likePattern(p.search));
    where.push(`(name ILIKE ${s} OR sku ILIKE ${s} OR description ILIKE ${s})`);
  }
  const limit = add(p.pageSize);
  const offset = add((p.page - 1) * p.pageSize);
  const rows = await db.query<ProductRow & { total: string }>(
    `SELECT *, count(*) OVER() AS total FROM products
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY is_active DESC, name LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  return {
    items: rows.map((r) => {
      const { total, ...rest } = r;
      void total;
      return rest;
    }),
    total: Number(rows[0]?.total ?? 0),
    page: p.page,
    pageSize: p.pageSize,
  };
}

export async function getProduct(id: string) {
  const row = await db.queryOne<ProductRow>("SELECT * FROM products WHERE id = $1", [id]);
  if (!row) throw new AppError("Product not found", 404, "NOT_FOUND");
  return row;
}

const params = (i: ProductInput) => [i.name, i.sku, i.type, i.description, i.hsnSac, i.defaultPrice, i.currency, i.gstRate, i.isTaxExempt, i.isActive];

function mapSkuConflict(e: unknown): never {
  if ((e as { code?: string }).code === "23505") throw new AppError("Another product already uses this SKU", 409, "DUPLICATE_SKU");
  throw e;
}

export async function createProduct(input: ProductInput, actorId: string) {
  try {
    return await db.transaction(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO products (name, sku, type, description, hsn_sac, default_price, currency, gst_rate, is_tax_exempt, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        params(input),
      );
      const id = rows[0]!.id;
      await logActivity({ entityType: "product", entityId: id, action: "created", summary: `Product "${input.name}" created`, actorId }, tx);
      return id;
    });
  } catch (e) {
    return mapSkuConflict(e);
  }
}

/** Editing the catalog never touches existing sales/invoices: those hold their own snapshots. */
export async function updateProduct(id: string, input: ProductInput, actorId: string) {
  try {
    await db.transaction(async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE products SET name=$1, sku=$2, type=$3, description=$4, hsn_sac=$5, default_price=$6, currency=$7,
           gst_rate=$8, is_tax_exempt=$9, is_active=$10, updated_at=now() WHERE id=$11`,
        [...params(input), id],
      );
      if (!rowCount) throw new AppError("Product not found", 404, "NOT_FOUND");
      await logActivity({ entityType: "product", entityId: id, action: "updated", summary: `Product "${input.name}" updated`, actorId }, tx);
    });
  } catch (e) {
    mapSkuConflict(e);
  }
}
