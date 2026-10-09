import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { config } from "dotenv";
import { syncSchema } from "../../db/sync";

config({ path: ".env.local" });
config();

export interface TestDb {
  schema: string;
  drop: () => Promise<void>;
}

/**
 * Creates schema vt_<random>, syncs the schema (db/tables, db/logic, db/seeds) and applies any migrations inside it and points the app's pool at it
 * (DB_SEARCH_PATH). Must be called before anything imports the app's db module.
 */
export async function createTestDb(): Promise<TestDb> {
  const url = process.env.DIRECT_URL?.includes("HOST") ? process.env.DATABASE_URL : process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for integration tests");
  const schema = `vt_${randomBytes(6).toString("hex")}`;
  const local = url.includes("localhost") || url.includes("127.0.0.1");
  const admin = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema}`);
    await syncSchema(admin);
    const dir = join(process.cwd(), "db", "migrations");
    for (const f of (await readdir(dir)).filter((x) => x.endsWith(".sql")).sort()) {
      await admin.query(await readFile(join(dir, f), "utf8"));
    }
  } catch (e) {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
    await admin.end();
    throw e;
  }
  await admin.end();

  process.env.DATABASE_URL = url;
  process.env.DB_SEARCH_PATH = schema;
  process.env.JWT_SECRET ||= "integration-test-secret-integration-test-secret";
  process.env.BCRYPT_SALT_ROUNDS = "10";

  return {
    schema,
    async drop() {
      const { closePool } = await import("@/lib/db");
      await closePool();
      const c = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
      await c.connect();
      try {
        if (!/^vt_[a-z0-9]+$/.test(schema)) throw new Error("refusing to drop a non-test schema");
        await c.query(`DROP SCHEMA ${schema} CASCADE`);
      } finally {
        await c.end();
      }
    },
  };
}

let counter = 0;
export const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${++counter}`;

export async function makeUser(name = "Tester") {
  const { db } = await import("@/lib/db");
  const { hashPassword } = await import("@/lib/auth/password");
  const email = `${uniq("u")}@test.example`;
  const row = await db.queryOne<{ id: string }>("INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id", [name, email, await hashPassword("a-very-long-password")]);
  return { id: row!.id, email, password: "a-very-long-password" };
}

export async function configureCompany(actorId: string, stateCode = "24") {
  const { updateSettings } = await import("@/features/settings/service");
  const { settingsSchema } = await import("@/features/settings/schema");
  await updateSettings(
    settingsSchema.parse({
      legalName: "Test Company Pvt Ltd", address: "1 Test Road", stateCode, invoicePrefix: "DE", receiptPrefix: "RCT", defaultDueDays: 15, roundOffTotal: true,
    }),
    actorId,
  );
}

export async function makeClient(actorId: string, over: Record<string, unknown> = {}) {
  const { createClient } = await import("@/features/clients/service");
  const { clientInputSchema } = await import("@/features/clients/schema");
  return createClient(clientInputSchema.parse({ legalName: uniq("Client"), billingAddress: "12 Market Road", stateCode: "24", ...over }), actorId);
}

export async function makeProduct(over: Record<string, unknown> = {}) {
  const { createProduct } = await import("@/features/products/service");
  const { productInputSchema } = await import("@/features/products/schema");
  return createProduct(productInputSchema.parse({ name: uniq("Product"), type: "software_license", defaultPrice: "1000", ...over }), (await makeUser()).id);
}

export const LINE = (price = "1000", rate = "18", qty = "1") => ({ description: "Work", quantity: qty, unitPrice: price, taxRate: rate });

/** A confirmed sale with the given lines (default: one line of 1000 at 18%). */
export async function confirmedSale(actorId: string, clientId: string, items: Record<string, unknown>[] = [LINE()], over: Record<string, unknown> = {}) {
  const { createSale, setSaleStatus } = await import("@/features/sales/service");
  const { saleInputSchema } = await import("@/features/sales/schema");
  const id = await createSale(saleInputSchema.parse({ clientId, type: "service", title: uniq("Sale"), saleDate: "2026-10-05", items, ...over }), actorId);
  await setSaleStatus(id, "confirmed", actorId);
  return id;
}

export const bill = async (actorId: string, saleId: string, request: Record<string, unknown> = { mode: "rest" }) => {
  const { createDraftForSale } = await import("@/features/invoices/service");
  const { billSaleSchema } = await import("@/features/sales/schema");
  return createDraftForSale(saleId, billSaleSchema.parse(request), actorId);
};

/** Re-saves a draft with changed dates / place of supply / lines. */
export async function patchDraft(actorId: string, invoiceId: string, patch: Record<string, unknown>) {
  const { getInvoice, updateDraft } = await import("@/features/invoices/service");
  const { invoiceInputSchema } = await import("@/features/invoices/schema");
  const inv = await getInvoice(invoiceId);
  const base = {
    saleId: inv.sale_id, issueDate: inv.issue_date, dueDate: inv.due_date, placeOfSupplyStateCode: inv.place_of_supply_state_code ?? "",
    paymentTerms: inv.payment_terms ?? "", notes: inv.notes ?? "",
    items: inv.items.map((i) => ({ saleItemId: i.sale_item_id, productId: i.product_id ?? "", description: i.description, hsnSac: i.hsn_sac ?? "", quantity: i.quantity, unitPrice: i.unit_price, discountPercent: i.discount_percent, taxRate: i.tax_rate })),
  };
  await updateDraft(invoiceId, invoiceInputSchema.parse({ ...base, ...patch }), actorId);
}

/** Creates a sale, bills all of it, optionally redates the draft, and issues it. */
export async function issuedInvoice(actorId: string, clientId: string, price = "1000", rate = "18", issueDate = "2026-10-05", dueDate = "2026-10-20") {
  const { issueInvoice } = await import("@/features/invoices/service");
  const saleId = await confirmedSale(actorId, clientId, [LINE(price, rate)]);
  const id = await bill(actorId, saleId);
  await patchDraft(actorId, id, { issueDate, dueDate });
  const number = await issueInvoice(id, actorId);
  return { id, number, saleId };
}

export async function expectAppError(p: Promise<unknown>, status: number, code?: string, message?: RegExp) {
  try {
    await p;
  } catch (e) {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status !== status) throw new Error(`expected status ${status}, got ${err.status}: ${err.message}`);
    if (code && err.code !== code) throw new Error(`expected code ${code}, got ${err.code}: ${err.message}`);
    if (message && !message.test(err.message ?? "")) throw new Error(`message "${err.message}" did not match ${message}`);
    return;
  }
  throw new Error(`expected an AppError with status ${status}, but the call succeeded`);
}
