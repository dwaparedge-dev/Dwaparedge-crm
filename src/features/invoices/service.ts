import "server-only";
import type { PoolClient } from "pg";
import type { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/auth/errors";
import { addDays, format, parseISO } from "date-fns";
import { financialYear, computeInvoiceLine, summarizeInvoice, supplyType, type InvoiceLineAmounts } from "@/lib/gst";
import { todayIST } from "@/lib/dates";
import { nextSequence } from "@/lib/sequences";
import { planShares, type BillMode } from "@/lib/billing";
import { formatScaled, parseScaled } from "@/lib/money";
import { likePattern } from "@/lib/validation";
import { stateNameByCode } from "@/lib/india";
import { getSettings, type CompanySettings } from "@/features/settings/service";
import { getMilestones, getSaleItems, getSaleRow } from "@/features/sales/service";
import type { BillSaleInput } from "@/features/sales/schema";
import type { InvoiceInput, listInvoicesSchema } from "./schema";

export type PaymentStatus = "unpaid" | "partial" | "paid";
export interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  status: "draft" | "issued" | "cancelled";
  client_id: string;
  client_name: string;
  sale_id: string;
  sale_number: string;
  issue_date: string;
  due_date: string;
  currency: string;
  place_of_supply_state_code: string | null;
  supply_type: "intra" | "inter" | null;
  subtotal: string; cgst_total: string; sgst_total: string; igst_total: string; tax_total: string; round_off: string; total: string;
  payment_terms: string | null;
  notes: string | null;
  client_snapshot: ClientSnapshot | null;
  company_snapshot: CompanySnapshot | null;
  issued_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  amount_paid: string;
  balance_due: string;
  payment_status: PaymentStatus;
  is_overdue: boolean;
}
export interface InvoiceItemRow {
  id: string; position: number; sale_item_id: string; product_id: string | null; description: string; hsn_sac: string | null; quantity: string; unit_price: string;
  discount_percent: string; tax_rate: string; taxable_amount: string; cgst_amount: string; sgst_amount: string; igst_amount: string; tax_amount: string; line_total: string;
}
export interface ClientSnapshot { name: string; legalName: string; gstin: string | null; pan: string | null; billingAddress: string | null; shippingAddress: string | null; city: string | null; state: string | null; stateCode: string | null; postalCode: string | null; country: string; email: string | null; phone: string | null }
export type CompanySnapshot = Pick<CompanySettings, "legal_name" | "trade_name" | "address" | "city" | "state_code" | "postal_code" | "gstin" | "pan" | "email" | "phone" | "website" | "bank_account_name" | "bank_name" | "bank_account_number" | "bank_ifsc" | "bank_branch" | "upi_id" | "signatory_name"> & { state: string | null };

const TODAY = "(now() AT TIME ZONE 'Asia/Kolkata')::date";
const PAID = `COALESCE((SELECT sum(a.amount) FROM payment_allocations a WHERE a.invoice_id = i.id AND a.reversed_at IS NULL), 0)`;

const SELECT = `
  SELECT i.id, i.invoice_number, i.status, i.client_id, c.display_name AS client_name, i.sale_id, s.sale_number,
         to_char(i.issue_date,'YYYY-MM-DD') AS issue_date, to_char(i.due_date,'YYYY-MM-DD') AS due_date, i.currency,
         i.place_of_supply_state_code, i.supply_type, i.subtotal, i.cgst_total, i.sgst_total, i.igst_total, i.tax_total, i.round_off, i.total,
         i.payment_terms, i.notes, i.client_snapshot, i.company_snapshot, i.issued_at, i.cancelled_at, i.cancel_reason, i.created_at, i.updated_at,
         ${PAID} AS amount_paid,
         CASE WHEN i.status = 'issued' THEN i.total - ${PAID} ELSE 0 END AS balance_due,
         CASE WHEN ${PAID} >= i.total THEN 'paid' WHEN ${PAID} > 0 THEN 'partial' ELSE 'unpaid' END AS payment_status,
         (i.status = 'issued' AND i.total - ${PAID} > 0 AND i.due_date < ${TODAY}) AS is_overdue
  FROM invoices i JOIN clients c ON c.id = i.client_id JOIN sales s ON s.id = i.sale_id`;

export async function listInvoices(p: z.infer<typeof listInvoicesSchema>) {
  const where: string[] = [];
  const values: unknown[] = [];
  const add = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  if (p.clientId) where.push(`i.client_id = ${add(p.clientId)}`);
  if (p.saleId) where.push(`i.sale_id = ${add(p.saleId)}`);
  if (p.status) where.push(`i.status = ${add(p.status)}`);
  if (p.openOnly) where.push(`i.status = 'issued' AND i.total - ${PAID} > 0`);
  if (p.from) where.push(`i.issue_date >= ${add(p.from)}`);
  if (p.to) where.push(`i.issue_date <= ${add(p.to)}`);
  if (p.paymentStatus === "overdue") where.push(`i.status = 'issued' AND i.total - ${PAID} > 0 AND i.due_date < ${TODAY}`);
  else if (p.paymentStatus === "paid") where.push(`i.status = 'issued' AND ${PAID} >= i.total`);
  else if (p.paymentStatus === "partial") where.push(`i.status = 'issued' AND ${PAID} > 0 AND ${PAID} < i.total`);
  else if (p.paymentStatus === "unpaid") where.push(`i.status = 'issued' AND ${PAID} = 0 AND i.total > 0`);
  if (p.search) {
    const s = add(likePattern(p.search));
    where.push(`(i.invoice_number ILIKE ${s} OR c.display_name ILIKE ${s} OR s.sale_number ILIKE ${s})`);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const filterValues = [...values];
  const limit = add(p.pageSize);
  const offset = add((p.page - 1) * p.pageSize);
  const order = p.openOnly ? "i.due_date, i.issue_date" : "i.issue_date DESC, i.created_at DESC";

  const rows = await db.query<InvoiceRow & { total_rows: string }>(
    `${SELECT.replace("SELECT i.id", "SELECT count(*) OVER() AS total_rows, i.id")} ${whereSql} ORDER BY ${order}, i.id LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  // Aggregates over the whole filtered set. Only issued invoices count as invoiced/outstanding.
  const agg = await db.queryOne<{ invoiced: string | null; outstanding: string | null }>(
    `SELECT sum(i.total) FILTER (WHERE i.status = 'issued') AS invoiced,
            sum(i.total - ${PAID}) FILTER (WHERE i.status = 'issued') AS outstanding
     FROM invoices i JOIN clients c ON c.id = i.client_id JOIN sales s ON s.id = i.sale_id ${whereSql}`,
    filterValues,
  );
  return {
    items: rows.map((r) => {
      const { total_rows, ...rest } = r;
      void total_rows;
      return rest;
    }),
    total: Number(rows[0]?.total_rows ?? 0),
    totals: { invoiced: agg?.invoiced ?? "0.00", outstanding: agg?.outstanding ?? "0.00" },
    page: p.page,
    pageSize: p.pageSize,
  };
}

export async function getInvoice(id: string, runner?: PoolClient) {
  const inv = await db.queryOne<InvoiceRow>(`${SELECT} WHERE i.id = $1`, [id], runner);
  if (!inv) throw new AppError("Invoice not found", 404, "NOT_FOUND");
  const items = await db.query<InvoiceItemRow>("SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY position", [id], runner);
  const allocations = await db.query<{ id: string; payment_id: string; receipt_number: string; payment_date: string; method: string; amount: string; reversed_at: string | null; created_at: string }>(
    `SELECT a.id, a.payment_id, p.receipt_number, to_char(p.payment_date,'YYYY-MM-DD') AS payment_date, p.method, a.amount, a.reversed_at, a.created_at
     FROM payment_allocations a JOIN payments p ON p.id = a.payment_id WHERE a.invoice_id = $1 ORDER BY a.created_at`,
    [id],
    runner,
  );
  return { ...inv, items, allocations };
}

/** Prices the lines with the right GST split and totals. Everything the DB stores comes from here. */
function price(items: InvoiceInput["items"], supply: "intra" | "inter", roundOff: boolean) {
  const lines: InvoiceLineAmounts[] = items.map((i) => {
    try {
      return computeInvoiceLine(i, supply);
    } catch (e) {
      throw new AppError((e as Error).message, 422, "VALIDATION_ERROR");
    }
  });
  return { lines, totals: summarizeInvoice(lines, roundOff) };
}

async function loadClient(tx: PoolClient, clientId: string) {
  const r = await tx.query<{ id: string; legal_name: string; display_name: string; gstin: string | null; pan: string | null; billing_address: string | null; shipping_address: string | null; city: string | null; state_code: string | null; postal_code: string | null; country: string; email: string | null; phone: string | null; archived_at: string | null }>(
    "SELECT * FROM clients WHERE id = $1",
    [clientId],
  );
  if (!r.rowCount) throw new AppError("Client not found", 404, "NOT_FOUND");
  return r.rows[0]!;
}

function resolveSupply(settings: CompanySettings, placeOfSupply: string | null, clientState: string | null) {
  const pos = placeOfSupply ?? clientState;
  try {
    return { pos: pos!, supply: supplyType(settings.state_code, pos) };
  } catch (e) {
    throw new AppError(`${(e as Error).message}. ${!pos ? "Set the client's state or choose a place of supply." : ""}`.trim(), 422, "TAX_CONTEXT_MISSING");
  }
}

async function writeItems(tx: PoolClient, invoiceId: string, items: InvoiceInput["items"], lines: InvoiceLineAmounts[]) {
  await tx.query("DELETE FROM invoice_items WHERE invoice_id = $1", [invoiceId]);
  for (const [idx, it] of items.entries()) {
    const l = lines[idx]!;
    await tx.query(
      `INSERT INTO invoice_items (invoice_id, position, sale_item_id, product_id, description, hsn_sac, quantity, unit_price, discount_percent, tax_rate,
         taxable_amount, cgst_amount, sgst_amount, igst_amount, tax_amount, line_total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [invoiceId, idx + 1, it.saleItemId, it.productId, it.description, it.hsnSac, it.quantity, it.unitPrice, it.discountPercent, it.taxRate, l.taxable, l.cgst, l.sgst, l.igst, l.tax, l.total],
    );
  }
}

async function assertProducts(tx: PoolClient, items: InvoiceInput["items"]) {
  const ids = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  if (ids.length && (await tx.query("SELECT 1 FROM products WHERE id = ANY($1::uuid[])", [ids])).rowCount !== ids.length) {
    throw new AppError("One of the selected products no longer exists", 422, "VALIDATION_ERROR");
  }
}

async function loadSale(tx: PoolClient, saleId: string) {
  const sale = (await tx.query<{ id: string; client_id: string; status: string; sale_number: string; type: string }>(
    "SELECT id, client_id, status, sale_number, type FROM sales WHERE id = $1", [saleId],
  )).rows[0];
  if (!sale) throw new AppError("Sale not found", 404, "NOT_FOUND");
  return sale;
}

/**
 * Every line must bill a line of this sale, and never more than is left of it. The item rows are locked
 * (in a fixed order) so two invoices drawn up at the same moment cannot both take the same remainder.
 * Amounts are compared on the taxable (pre-GST) value, which is exact.
 */
async function assertWithinSale(tx: PoolClient, saleId: string, invoiceId: string | null, items: InvoiceInput["items"], lines: InvoiceLineAmounts[]) {
  const ids = [...new Set(items.map((i) => i.saleItemId))].sort();
  const rows = (await tx.query<{ id: string; description: string; taxable_amount: string }>(
    "SELECT id, description, taxable_amount FROM sale_items WHERE sale_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE", [saleId, ids],
  )).rows;
  if (rows.length !== ids.length) throw new AppError("An invoice line does not belong to this sale", 422, "VALIDATION_ERROR");
  const used = new Map((await tx.query<{ sale_item_id: string; used: string }>(
    `SELECT ii.sale_item_id, sum(ii.taxable_amount) AS used
       FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
      WHERE ii.sale_item_id = ANY($1::uuid[]) AND i.status IN ('draft','issued') AND ($2::uuid IS NULL OR ii.invoice_id <> $2)
      GROUP BY ii.sale_item_id`, [ids, invoiceId],
  )).rows.map((r) => [r.sale_item_id, parseScaled(r.used, 2)]));
  const asking = new Map<string, bigint>();
  items.forEach((it, i) => asking.set(it.saleItemId, (asking.get(it.saleItemId) ?? 0n) + parseScaled(lines[i]!.taxable, 2)));
  for (const r of rows) {
    const left = parseScaled(r.taxable_amount, 2) - (used.get(r.id) ?? 0n);
    const want = asking.get(r.id) ?? 0n;
    if (want > left) {
      throw new AppError(`"${r.description}": only ${formatScaled(left, 2)} (before GST) is left to bill on the sale, but this invoice bills ${formatScaled(want, 2)}`, 422, "OVER_BILLED");
    }
  }
}

async function saveDraft(tx: PoolClient, id: string | null, input: InvoiceInput, actorId: string) {
  const settings = await getSettings(tx);
  const sale = await loadSale(tx, input.saleId);
  if (sale.status !== "confirmed") throw new AppError(`Invoices can only be raised against a confirmed sale (${sale.sale_number} is ${sale.status})`, 409, "SALE_NOT_CONFIRMED");
  const client = await loadClient(tx, sale.client_id);
  if (client.archived_at) throw new AppError("Cannot invoice an archived client", 422, "CLIENT_ARCHIVED");
  await assertProducts(tx, input.items);
  const { pos, supply } = resolveSupply(settings, input.placeOfSupplyStateCode, client.state_code);
  const { lines, totals } = price(input.items, supply, settings.round_off_total);
  await assertWithinSale(tx, sale.id, id, input.items, lines);

  const params = [input.issueDate, input.dueDate, pos, supply, totals.subtotal, totals.cgst, totals.sgst, totals.igst, totals.tax, totals.roundOff, totals.total, input.paymentTerms, input.notes];
  if (id) {
    await tx.query(
      `UPDATE invoices SET issue_date=$1, due_date=$2, place_of_supply_state_code=$3, supply_type=$4, subtotal=$5, cgst_total=$6, sgst_total=$7,
         igst_total=$8, tax_total=$9, round_off=$10, total=$11, payment_terms=$12, notes=$13, updated_at=now() WHERE id=$14`,
      [...params, id],
    );
  } else {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO invoices (issue_date, due_date, place_of_supply_state_code, supply_type, subtotal, cgst_total, sgst_total, igst_total, tax_total,
         round_off, total, payment_terms, notes, client_id, sale_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [...params, sale.client_id, sale.id, actorId],
    );
    id = rows[0]!.id;
  }
  await writeItems(tx, id, input.items, lines);
  return { id, clientId: sale.client_id, saleNumber: sale.sale_number };
}

export async function createDraft(input: InvoiceInput, actorId: string) {
  return db.transaction(async (tx) => {
    const d = await saveDraft(tx, null, input, actorId);
    await logActivity({ entityType: "invoice", entityId: d.id, clientId: d.clientId, action: "created", summary: `Draft invoice created for sale ${d.saleNumber}`, actorId }, tx);
    return d.id;
  });
}

async function lockInvoice(tx: PoolClient, id: string) {
  const r = await tx.query<{ status: string; client_id: string; sale_id: string; invoice_number: string | null }>("SELECT status, client_id, sale_id, invoice_number FROM invoices WHERE id = $1 FOR UPDATE", [id]);
  if (!r.rowCount) throw new AppError("Invoice not found", 404, "NOT_FOUND");
  return r.rows[0]!;
}

export async function updateDraft(id: string, input: InvoiceInput, actorId: string) {
  await db.transaction(async (tx) => {
    const cur = await lockInvoice(tx, id);
    if (cur.status !== "draft") throw new AppError("Only draft invoices can be edited. Issued invoices are permanent records.", 409, "INVOICE_LOCKED");
    if (input.saleId !== cur.sale_id) throw new AppError("An invoice cannot be moved to another sale", 422, "VALIDATION_ERROR");
    await saveDraft(tx, id, input, actorId);
    await logActivity({ entityType: "invoice", entityId: id, clientId: cur.client_id, action: "updated", summary: "Draft invoice updated", actorId }, tx);
  });
}

export async function deleteDraft(id: string, actorId: string) {
  await db.transaction(async (tx) => {
    const cur = await lockInvoice(tx, id);
    if (cur.status !== "draft") throw new AppError("Only drafts can be deleted. Cancel an issued invoice instead.", 409, "INVOICE_LOCKED");
    await tx.query("DELETE FROM invoices WHERE id = $1", [id]); // frees the billed amount; a linked milestone returns to "planned"
    await logActivity({ entityType: "invoice", entityId: id, clientId: cur.client_id, action: "deleted", summary: "Draft invoice deleted", actorId }, tx);
  });
}

/**
 * Issue: recompute everything from the stored lines with today's settings/client details, allocate the
 * number, freeze party details, flip to issued. One transaction: a failure leaves the draft untouched
 * and releases the number.
 */
export async function issueInvoice(id: string, actorId: string) {
  return db.transaction(async (tx) => {
    const cur = await lockInvoice(tx, id);
    if (cur.status !== "draft") throw new AppError(`This invoice is already ${cur.status}`, 409, "INVALID_TRANSITION");

    const settings = await getSettings(tx);
    const missing = [!settings.legal_name && "company name", !settings.address && "company address", !settings.state_code && "company state"].filter(Boolean);
    if (missing.length) throw new AppError(`Complete your company details in Settings first (${missing.join(", ")})`, 422, "SETTINGS_INCOMPLETE");

    const inv = (await tx.query<{ client_id: string; issue_date: string; due_date: string; place_of_supply_state_code: string | null; payment_terms: string | null; notes: string | null }>(
      "SELECT client_id, to_char(issue_date,'YYYY-MM-DD') AS issue_date, to_char(due_date,'YYYY-MM-DD') AS due_date, place_of_supply_state_code, payment_terms, notes FROM invoices WHERE id = $1", [id],
    )).rows[0]!;
    const sale = await loadSale(tx, cur.sale_id);
    if (sale.status !== "confirmed") throw new AppError(`Sale ${sale.sale_number} is ${sale.status}. Only a confirmed sale can be invoiced.`, 409, "SALE_NOT_CONFIRMED");
    const client = await loadClient(tx, inv.client_id);
    if (client.archived_at) throw new AppError("Cannot issue an invoice to an archived client", 422, "CLIENT_ARCHIVED");
    if (!client.billing_address) throw new AppError("Add the client's billing address before issuing an invoice", 422, "CLIENT_INCOMPLETE");

    const itemRows = (await tx.query<{ sale_item_id: string; product_id: string | null; description: string; hsn_sac: string | null; quantity: string; unit_price: string; discount_percent: string; tax_rate: string }>(
      "SELECT sale_item_id, product_id, description, hsn_sac, quantity, unit_price, discount_percent, tax_rate FROM invoice_items WHERE invoice_id = $1 ORDER BY position", [id],
    )).rows;
    const items = itemRows.map((r) => ({ saleItemId: r.sale_item_id, productId: r.product_id, description: r.description, hsnSac: r.hsn_sac, quantity: r.quantity, unitPrice: r.unit_price, discountPercent: r.discount_percent, taxRate: r.tax_rate }));
    const { pos, supply } = resolveSupply(settings, inv.place_of_supply_state_code, client.state_code);
    const { lines, totals } = price(items, supply, settings.round_off_total);
    if (Number(totals.total) <= 0) throw new AppError("An invoice must have a total greater than zero", 422, "VALIDATION_ERROR");
    await assertWithinSale(tx, sale.id, id, items, lines);

    await writeItems(tx, id, items, lines);

    const number = `${settings.invoice_prefix}/${financialYear(inv.issue_date)}/${String(await nextSequence("invoice", financialYear(inv.issue_date), tx)).padStart(4, "0")}`;
    const clientSnapshot: ClientSnapshot = {
      name: client.display_name, legalName: client.legal_name, gstin: client.gstin, pan: client.pan, billingAddress: client.billing_address, shippingAddress: client.shipping_address,
      city: client.city, state: stateNameByCode(client.state_code), stateCode: client.state_code, postalCode: client.postal_code, country: client.country, email: client.email, phone: client.phone,
    };
    const companySnapshot: CompanySnapshot = {
      legal_name: settings.legal_name, trade_name: settings.trade_name, address: settings.address, city: settings.city, state_code: settings.state_code, state: stateNameByCode(settings.state_code),
      postal_code: settings.postal_code, gstin: settings.gstin, pan: settings.pan, email: settings.email, phone: settings.phone, website: settings.website,
      bank_account_name: settings.bank_account_name, bank_name: settings.bank_name, bank_account_number: settings.bank_account_number, bank_ifsc: settings.bank_ifsc,
      bank_branch: settings.bank_branch, upi_id: settings.upi_id, signatory_name: settings.signatory_name,
    };
    await tx.query(
      `UPDATE invoices SET status='issued', invoice_number=$1, place_of_supply_state_code=$2, supply_type=$3, subtotal=$4, cgst_total=$5, sgst_total=$6, igst_total=$7,
         tax_total=$8, round_off=$9, total=$10, client_snapshot=$11, company_snapshot=$12, issued_at=now(), issued_by=$13, updated_at=now() WHERE id=$14`,
      [number, pos, supply, totals.subtotal, totals.cgst, totals.sgst, totals.igst, totals.tax, totals.roundOff, totals.total, JSON.stringify(clientSnapshot), JSON.stringify(companySnapshot), actorId, id],
    );
    await logActivity({ entityType: "invoice", entityId: id, clientId: inv.client_id, action: "issued", summary: `Invoice ${number} issued against ${sale.sale_number} (total ${totals.total})`, actorId, metadata: { number, total: totals.total, saleId: sale.id } }, tx);
    return number;
  });
}

/** Issued invoices are never deleted. Cancelling keeps the number and frees the billed amount on the sale. */
export async function cancelInvoice(id: string, reason: string, actorId: string) {
  await db.transaction(async (tx) => {
    const cur = await lockInvoice(tx, id);
    if (cur.status !== "issued") throw new AppError(`Only an issued invoice can be cancelled (this one is ${cur.status})`, 409, "INVALID_TRANSITION");
    const alloc = await tx.query("SELECT 1 FROM payment_allocations WHERE invoice_id = $1 AND reversed_at IS NULL LIMIT 1", [id]);
    if (alloc.rowCount) throw new AppError("This invoice has payments allocated to it. Reverse those allocations first.", 409, "HAS_PAYMENTS");
    await tx.query("UPDATE invoices SET status='cancelled', cancelled_at=now(), cancelled_by=$1, cancel_reason=$2, updated_at=now() WHERE id=$3", [actorId, reason, id]);
    await logActivity({ entityType: "invoice", entityId: id, clientId: cur.client_id, action: "cancelled", summary: `Invoice ${cur.invoice_number} cancelled: ${reason}`, actorId }, tx);
  });
}

/**
 * Starts a draft against a sale: everything left, a percentage of the order, an amount (before GST), or a
 * planned milestone. Lines point at the sale items they bill; amounts are exact to the paisa.
 */
export async function createDraftForSale(saleId: string, request: BillSaleInput, actorId: string) {
  return db.transaction(async (tx) => {
    const sale = await getSaleRow(saleId, tx);
    if (sale.status !== "confirmed") throw new AppError(`Confirm sale ${sale.sale_number} before invoicing it (it is ${sale.status})`, 409, "SALE_NOT_CONFIRMED");
    await tx.query("SELECT id FROM sale_items WHERE sale_id = $1 ORDER BY id FOR UPDATE", [saleId]); // serialise with other invoices
    const items = await getSaleItems(saleId, tx);
    const milestones = await getMilestones(saleId, sale.subtotal, tx);

    let mode: BillMode;
    let label: string | null = null;
    let dueDate: string | null = null;
    let milestoneId: string | null = null;
    if (request.mode === "rest") {
      mode = { kind: "rest" };
      label = items.some((i) => parseScaled(i.issued_taxable, 2) + parseScaled(i.draft_taxable, 2) > 0n) ? "Balance" : null;
    } else if (request.mode === "percent") {
      mode = { kind: "percent", percent: request.percent };
      label = `${Number(request.percent)}%`;
    } else if (request.mode === "amount") {
      mode = { kind: "amount", amount: request.amount };
      label = "Part payment";
    } else {
      const m = milestones.find((x) => x.id === request.milestoneId);
      if (!m) throw new AppError("That instalment is not part of this sale's billing plan", 404, "NOT_FOUND");
      if (m.invoice_id) throw new AppError(`"${m.title}" has already been invoiced (${m.invoice_number ?? "draft"})`, 409, "MILESTONE_BILLED");
      label = m.title;
      dueDate = m.due_date;
      milestoneId = m.id;
      // The last open instalment of a plan that covers the whole sale takes the exact remainder, so rounding never leaves paise behind.
      const open = milestones.filter((x) => !x.invoice_id);
      const planned = milestones.reduce((a, x) => a + parseScaled(x.taxable, 2), 0n);
      mode = open.length === 1 && planned === parseScaled(sale.subtotal, 2)
        ? { kind: "rest" }
        : m.basis === "percent" ? { kind: "percent", percent: m.percent! } : { kind: "amount", amount: m.amount! };
    }

    let shares;
    try {
      shares = planShares(items.map((i) => ({ id: i.id, taxable: i.taxable_amount, remaining: i.remaining_taxable })), mode);
    } catch (e) {
      throw new AppError((e as Error).message, 422, "NOTHING_TO_BILL");
    }
    const byId = new Map(items.map((i) => [i.id, i]));
    const lines: InvoiceInput["items"] = shares.map((sh) => {
      const it = byId.get(sh.itemId)!;
      const whole = sh.taxable === it.taxable_amount && it.remaining_taxable === it.taxable_amount; // the untouched item in full
      return whole
        ? { saleItemId: it.id, productId: it.product_id, description: it.description, hsnSac: it.hsn_sac, quantity: String(Number(it.quantity)), unitPrice: it.unit_price, discountPercent: String(Number(it.discount_percent)), taxRate: String(Number(it.tax_rate)) }
        : { saleItemId: it.id, productId: it.product_id, description: label ? `${it.description} (${label})` : it.description, hsnSac: it.hsn_sac, quantity: "1", unitPrice: sh.taxable, discountPercent: "0", taxRate: String(Number(it.tax_rate)) };
    });

    const settings = await getSettings(tx);
    const today = todayIST();
    const defaultDue = format(addDays(parseISO(today), settings.default_due_days), "yyyy-MM-dd");
    const input: InvoiceInput = {
      saleId, issueDate: today, dueDate: dueDate && dueDate >= today ? dueDate : defaultDue,
      placeOfSupplyStateCode: null, paymentTerms: settings.default_payment_terms, notes: settings.default_invoice_notes, items: lines,
    };
    const d = await saveDraft(tx, null, input, actorId);
    if (milestoneId) await tx.query("UPDATE sale_milestones SET invoice_id = $1, updated_at = now() WHERE id = $2", [d.id, milestoneId]);
    await logActivity({ entityType: "invoice", entityId: d.id, clientId: d.clientId, action: "created", summary: `Draft invoice created for sale ${d.saleNumber}${label ? ` (${label})` : ""}`, actorId }, tx);
    return d.id;
  });
}
